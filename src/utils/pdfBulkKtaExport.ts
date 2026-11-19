import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { AnggotaFullDetail, RefDesa, RefKecamatan } from '../types/ppdi';
import { getPhotoUrl } from './fileHelpers';
import { generateKtaShortUrl } from './qrCrypto';

export type BulkKtaPageFormat = 'a4' | 'cr80';
export type BulkKtaCardSide = 'both' | 'front' | 'back';

export interface BulkKtaExportOptions {
  members: AnggotaFullDetail[];
  format: BulkKtaPageFormat;
  cardSide: BulkKtaCardSide;
  appName?: string;
  appLogo?: string;
  watermarkLogo?: string;
  watermarkOpacity?: number;
  watermarkOpacityFront?: number;
  watermarkOpacityBack?: number;
  kecamatanList?: RefKecamatan[];
  desaList?: RefDesa[];
  onProgress?: (current: number, total: number) => void;
}

const CARD_W_MM = 85.6;
const CARD_H_MM = 54.0;

const cleanWilayahId = (id?: string | null) =>
  id ? String(id).replace(/\./g, '').trim() : '';

function resolveWilayahNames(
  member: AnggotaFullDetail,
  kecamatanList: RefKecamatan[] = [],
  desaList: RefDesa[] = []
): { desaName: string; kecName: string } {
  const cleanDesaId = cleanWilayahId(member.desa?.id_desa || member.jabatanTerkini?.id_desa);
  const matchedDesa = member.desa?.nama_desa
    ? member.desa
    : desaList.find((d) => cleanWilayahId(d.id_desa) === cleanDesaId);

  const cleanKecId = cleanWilayahId(
    member.kecamatan?.id_kecamatan ||
      matchedDesa?.id_kecamatan ||
      (cleanDesaId.length >= 6 ? cleanDesaId.slice(0, 6) : '')
  );
  const matchedKec = member.kecamatan?.nama_kecamatan
    ? member.kecamatan
    : kecamatanList.find((k) => cleanWilayahId(k.id_kecamatan) === cleanKecId);

  return {
    desaName: matchedDesa?.nama_desa || '-',
    kecName: matchedKec?.nama_kecamatan || '-',
  };
}

/**
 * Loads an image URL/dataURI safely into a PNG data URL for jsPDF without failing on CORS.
 */
async function loadSafeImageDataUrl(
  rawUrl: string | undefined | null,
  cache: Map<string, string | null>
): Promise<string | null> {
  if (!rawUrl || !rawUrl.trim()) return null;
  const key = rawUrl.trim();
  if (cache.has(key)) return cache.get(key) ?? null;

  if (key.startsWith('data:image/png') || key.startsWith('data:image/jpeg')) {
    cache.set(key, key);
    return key;
  }

  const resolved = await new Promise<string | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => resolve(null), 3500);

    img.onload = () => {
      window.clearTimeout(timer);
      try {
        const maxDim = 420;
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const w = Math.max(1, Math.round((img.naturalWidth || 100) * scale));
        const h = Math.max(1, Math.round((img.naturalHeight || 100) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl);
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };

    img.src = key;
  });

  cache.set(key, resolved);
  return resolved;
}

/**
 * Loads a member photo and renders it into an exact inner-frame canvas (proportional to 18.4 x 24.7 mm)
 * using aspect-preserving `object-contain` centering so jsPDF never stretches portrait, square, or landscape photos.
 */
async function loadContainFramedPhotoDataUrl(
  rawUrl: string | undefined | null,
  cache: Map<string, string | null>
): Promise<string | null> {
  if (!rawUrl || !rawUrl.trim()) return null;
  const trimmed = rawUrl.trim();
  const cacheKey = `__framed_contain__:${trimmed}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  const targetW = 368;
  const targetH = 494;

  const resolved = await new Promise<string | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => resolve(null), 3500);

    img.onload = () => {
      window.clearTimeout(timer);
      try {
        const natW = Math.max(1, img.naturalWidth || 100);
        const natH = Math.max(1, img.naturalHeight || 100);
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        // Match bg-neutral-900 (#111827) frame background cleanly behind contained photo
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, targetW, targetH);

        const ratio = Math.min(targetW / natW, targetH / natH);
        const drawW = natW * ratio;
        const drawH = natH * ratio;
        const dx = (targetW - drawW) / 2;
        const dy = (targetH - drawH) / 2;

        ctx.drawImage(img, dx, dy, drawW, drawH);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };

    img.src = trimmed;
  });

  if (resolved) {
    cache.set(cacheKey, resolved);
    return resolved;
  }

  return loadSafeImageDataUrl(trimmed, cache);
}

/**
 * Generates a grayscale, brightened, semi-transparent PNG data URL matching EKTAView's
 * Organization Logo Watermark (`filter grayscale brightness-200` + subtle opacity).
 */
async function buildWatermarkDataUrl(
  logoDataUrl: string | null,
  opacity: number
): Promise<string | null> {
  if (!logoDataUrl) return null;

  return await new Promise<string | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => resolve(null), 3000);

    img.onload = () => {
      window.clearTimeout(timer);
      try {
        const size = 360;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        const iw = img.naturalWidth || size;
        const ih = img.naturalHeight || size;
        const ratio = Math.min(size / iw, size / ih);
        const dw = iw * ratio;
        const dh = ih * ratio;
        const dx = (size - dw) / 2;
        const dy = (size - dh) / 2;

        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(img, dx, dy, dw, dh);

        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a === 0) continue;
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const bright = Math.min(255, Math.round(lum * 2));
          data[i] = bright;
          data[i + 1] = bright;
          data[i + 2] = bright;
          data[i + 3] = Math.round(a * opacity);
        }
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };

    img.src = logoDataUrl;
  });
}

/**
 * Merender background kartu E-KTA beresolusi tinggi (~300 DPI) via Canvas agar gradasi
 * diagonal emerald (`135deg` depan / `315deg` belakang), ambient radial glow, dan
 * dot-matrix emas tampil identik 1:1 dengan pratinjau tanpa garis patah antarblok.
 */
function buildCardBackgroundDataUrl(side: 'front' | 'back', rounded = true): string | null {
  try {
    const width = 1028;
    const height = 648;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, width, height);

    if (rounded) {
      const r = Math.round((2.5 / CARD_W_MM) * width); // ~30px matches 2.5mm radius
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(width - r, 0);
      ctx.quadraticCurveTo(width, 0, width, r);
      ctx.lineTo(width, height - r);
      ctx.quadraticCurveTo(width, height, width - r, height);
      ctx.lineTo(r, height);
      ctx.quadraticCurveTo(0, height, 0, height - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath();
      ctx.clip();
    }

    // 1. Diagonal Emerald Gradient matching CSS linear-gradient(135deg / 315deg)
    const grad =
      side === 'front'
        ? ctx.createLinearGradient(0, 0, width, height) // 135deg
        : ctx.createLinearGradient(width, height, 0, 0); // 315deg

    if (side === 'front') {
      grad.addColorStop(0, '#064e3b');
      grad.addColorStop(0.5, '#065f46');
      grad.addColorStop(1, '#042f2e');
    } else {
      grad.addColorStop(0, '#022c22');
      grad.addColorStop(0.5, '#064e3b');
      grad.addColorStop(1, '#065f46');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // 2. Ambient Soft Glow matching EKTAView radial flare
    if (side === 'front') {
      const glow = ctx.createRadialGradient(
        width * 0.92,
        height * 0.08,
        0,
        width * 0.92,
        height * 0.08,
        width * 0.42
      );
      glow.addColorStop(0, 'rgba(251, 191, 36, 0.14)');
      glow.addColorStop(0.6, 'rgba(251, 191, 36, 0.04)');
      glow.addColorStop(1, 'rgba(251, 191, 36, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
    } else {
      const glow = ctx.createRadialGradient(
        width * 0.08,
        height * 0.92,
        0,
        width * 0.08,
        height * 0.92,
        width * 0.45
      );
      glow.addColorStop(0, 'rgba(16, 185, 129, 0.22)');
      glow.addColorStop(0.6, 'rgba(5, 150, 105, 0.07)');
      glow.addColorStop(1, 'rgba(5, 150, 105, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
    }

    // 3. Subtle Guilloche Gold Dot Matrix matching radial-gradient(#fde047 1px) at 10% opacity
    const step = side === 'front' ? 38 : 34;
    const dotRadius = side === 'front' ? 2.1 : 1.9;
    ctx.fillStyle = 'rgba(253, 224, 71, 0.105)';
    for (let gx = Math.round(step / 2); gx < width; gx += step) {
      for (let gy = Math.round(step / 2); gy < height; gy += step) {
        ctx.beginPath();
        ctx.arc(gx, gy, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

export interface PdfWatermarkOptions {
  cardX: number;
  cardY: number;
  cardW: number;
  cardH: number;
  side?: 'front' | 'back';
  opacity?: number;
  watermarkDataUrl?: string | null;
  logoDataUrl?: string | null;
}

/**
 * Menyisipkan Organization Logo Watermark ke dalam PDF (jsPDF) agar posisi, proporsi,
 * dan transparansi konsisten dengan EKTAView (`right-4 top-1/2 -translate-y-1/2 w-48 h-48`,
 * opacity 0.09 pada sisi depan & 0.07 pada sisi belakang).
 */
export function addWatermarkToPdf(doc: jsPDF, options: PdfWatermarkOptions): void {
  const {
    cardX,
    cardY,
    cardW,
    cardH,
    side = 'front',
    opacity = side === 'back' ? 0.07 : 0.09,
    watermarkDataUrl,
    logoDataUrl,
  } = options;

  const s = cardW / CARD_W_MM;
  const wmSize = 35.5 * s;
  const wmX = cardX + cardW - 3.0 * s - wmSize;
  const wmY = cardY + (cardH - wmSize) / 2;

  if (watermarkDataUrl) {
    doc.addImage(watermarkDataUrl, 'PNG', wmX, wmY, wmSize, wmSize);
    return;
  }

  if (!logoDataUrl) return;

  const jsPdfAny = doc as any;
  if (typeof jsPdfAny.GState === 'function' && typeof jsPdfAny.setGState === 'function') {
    if (typeof jsPdfAny.saveGraphicsState === 'function') {
      jsPdfAny.saveGraphicsState();
    }
    jsPdfAny.setGState(new jsPdfAny.GState({ opacity }));
    doc.addImage(logoDataUrl, 'PNG', wmX, wmY, wmSize, wmSize);
    if (typeof jsPdfAny.restoreGraphicsState === 'function') {
      jsPdfAny.restoreGraphicsState();
    } else {
      jsPdfAny.setGState(new jsPdfAny.GState({ opacity: 1 }));
    }
  }
}

function getInitials(name: string): string {
  const parts = (name || 'PD').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'PD';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function drawKtaFrontCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  member: AnggotaFullDetail,
  opts: {
    appName: string;
    logoDataUrl: string | null;
    frontBgDataUrl: string | null;
    watermarkLogoDataUrl: string | null;
    frontWatermarkDataUrl: string | null;
    frontOpacity: number;
    photoDataUrl: string | null;
    desaName: string;
    kecName: string;
  }
) {
  const s = w / CARD_W_MM;

  // Card Base Gradient + Radial Glow + Dot Matrix matching Preview 1:1
  if (opts.frontBgDataUrl) {
    doc.addImage(opts.frontBgDataUrl, 'PNG', x, y, w, h);
  } else {
    doc.setFillColor(6, 78, 59); // #064e3b fallback
    doc.roundedRect(x, y, w, h, 2.5 * s, 2.5 * s, 'F');
    doc.setFillColor(16, 110, 82);
    for (let gx = 4 * s; gx < w - 3 * s; gx += 4.5 * s) {
      for (let gy = 12 * s; gy < h - 7 * s; gy += 4.5 * s) {
        doc.circle(x + gx, y + gy, 0.16 * s, 'F');
      }
    }
  }

  // Organization Logo Watermark (matching EKTAView front card)
  if (opts.frontOpacity > 0) {
    addWatermarkToPdf(doc, {
      cardX: x,
      cardY: y,
      cardW: w,
      cardH: h,
      side: 'front',
      opacity: opts.frontOpacity,
      watermarkDataUrl: opts.frontWatermarkDataUrl,
      logoDataUrl: opts.watermarkLogoDataUrl,
    });
  }

  // Outer card gold trim border
  doc.setDrawColor(217, 169, 45);
  doc.setLineWidth(0.32 * s);
  doc.roundedRect(x, y, w, h, 2.5 * s, 2.5 * s, 'S');

  // ================= HEADER =================
  const headerH = 10.6 * s;
  const logoR = 3.7 * s;
  const logoCx = x + 6.5 * s;
  const logoCy = y + 5.3 * s;

  // Gold outer ring + white badge for org logo
  doc.setFillColor(251, 191, 36);
  doc.circle(logoCx, logoCy, logoR, 'F');
  doc.setFillColor(255, 255, 255);
  doc.circle(logoCx, logoCy, logoR - 0.35 * s, 'F');

  if (opts.logoDataUrl) {
    const imgPad = 0.65 * s;
    const imgSize = (logoR - imgPad) * 2;
    doc.addImage(opts.logoDataUrl, 'PNG', logoCx - imgSize / 2, logoCy - imgSize / 2, imgSize, imgSize);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5 * s);
    doc.setTextColor(6, 78, 59);
    doc.text('PPDI', logoCx, logoCy + 0.7 * s, { align: 'center' });
  }

  // Header Organization Text
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2 * s);
  doc.setTextColor(253, 224, 71);
  const titleText = opts.appName.toUpperCase();
  const fittedTitle = doc.splitTextToSize(titleText, 48 * s)[0] || titleText;
  doc.text(fittedTitle, x + 11.4 * s, y + 4.7 * s);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.6 * s);
  doc.setTextColor(209, 250, 229);
  doc.text('PENGURUS DAERAH KAB. BANDUNG', x + 11.4 * s, y + 7.4 * s);

  // Header Right Tag
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.6 * s);
  doc.setTextColor(253, 224, 71);
  doc.text('E-KTA DIGITAL', x + w - 3.2 * s, y + 4.7 * s, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.5 * s);
  doc.setTextColor(167, 243, 208);
  doc.text('JAWA BARAT', x + w - 3.2 * s, y + 7.4 * s, { align: 'right' });

  // Gold header divider line
  doc.setDrawColor(217, 169, 45);
  doc.setLineWidth(0.25 * s);
  doc.line(x + 3 * s, y + headerH, x + w - 3 * s, y + headerH);

  // ================= BODY: PHOTO & MEMBER INFO =================
  const photoX = x + 3.8 * s;
  const photoY = y + 13.0 * s;
  const photoW = 19.0 * s;
  const photoH = 25.3 * s; // 3:4 portrait

  doc.setFillColor(17, 24, 39);
  doc.roundedRect(photoX, photoY, photoW, photoH, 1.5 * s, 1.5 * s, 'F');

  if (opts.photoDataUrl) {
    doc.addImage(opts.photoDataUrl, 'PNG', photoX + 0.3 * s, photoY + 0.3 * s, photoW - 0.6 * s, photoH - 0.6 * s);
  } else {
    doc.setFillColor(6, 95, 70);
    doc.roundedRect(photoX + 0.3 * s, photoY + 0.3 * s, photoW - 0.6 * s, photoH - 0.6 * s, 1.2 * s, 1.2 * s, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12 * s);
    doc.setTextColor(253, 224, 71);
    doc.text(getInitials(member.anggota.nama_lengkap), photoX + photoW / 2, photoY + photoH / 2 + 1.5 * s, {
      align: 'center',
    });
  }

  // Gold border around photo
  doc.setDrawColor(252, 211, 77);
  doc.setLineWidth(0.45 * s);
  doc.roundedRect(photoX, photoY, photoW, photoH, 1.5 * s, 1.5 * s, 'S');

  // Member Details Column
  const textX = photoX + photoW + 3.2 * s;
  const textMaxW = x + w - 3.2 * s - textX;
  let cursorY = y + 14.3 * s;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.4 * s);
  doc.setTextColor(167, 243, 208);
  doc.text('NAMA PERANGKAT DESA', textX, cursorY);
  cursorY += 3.2 * s;

  const fullName = [
    member.anggota.gelar_depan,
    member.anggota.nama_lengkap,
    member.anggota.gelar_belakang ? `, ${member.anggota.gelar_belakang}` : '',
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+,/g, ',')
    .trim()
    .toUpperCase();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2 * s);
  doc.setTextColor(253, 224, 71);
  const nameLines = doc.splitTextToSize(fullName || '-', textMaxW).slice(0, 2);
  doc.text(nameLines, textX, cursorY);
  cursorY += nameLines.length * 3.1 * s + 1.1 * s;

  // NIPD & Jabatan row
  const nipdVal = (member.anggota.nipd || '').trim();
  const jabatanVal = member.jabatanRef?.nama_jabatan || 'Perangkat Desa';

  if (nipdVal) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(4.2 * s);
    doc.setTextColor(167, 243, 208);
    doc.text('NIPD', textX, cursorY);

    doc.setFont('courier', 'bold');
    doc.setFontSize(5.5 * s);
    doc.setTextColor(255, 255, 255);
    const fittedNipd = doc.splitTextToSize(nipdVal, textMaxW)[0] || nipdVal;
    doc.text(fittedNipd, textX, cursorY + 2.3 * s);
    cursorY += 4.6 * s;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.2 * s);
  doc.setTextColor(167, 243, 208);
  doc.text('JABATAN SOTK', textX, cursorY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2 * s);
  doc.setTextColor(255, 255, 255);
  const fittedJabatan = doc.splitTextToSize(jabatanVal, textMaxW)[0] || jabatanVal;
  doc.text(fittedJabatan, textX, cursorY + 2.4 * s);
  cursorY += 4.8 * s;

  // Wilayah Tugas
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.2 * s);
  doc.setTextColor(167, 243, 208);
  doc.text('WILAYAH TUGAS', textX, cursorY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8 * s);
  doc.setTextColor(209, 250, 229);
  const wilayahStr = `Desa ${opts.desaName}, Kec. ${opts.kecName}`;
  const fittedWilayah = doc.splitTextToSize(wilayahStr, textMaxW)[0] || wilayahStr;
  doc.text(fittedWilayah, textX, cursorY + 2.3 * s);

  // Prominent KTA Box
  const ktaBoxY = y + 37.5 * s;
  const ktaBoxH = 8.0 * s;
  doc.setFillColor(2, 44, 34); // #022c22
  doc.roundedRect(textX, ktaBoxY, textMaxW, ktaBoxH, 1.4 * s, 1.4 * s, 'F');
  doc.setDrawColor(251, 191, 36);
  doc.setLineWidth(0.35 * s);
  doc.roundedRect(textX, ktaBoxY, textMaxW, ktaBoxH, 1.4 * s, 1.4 * s, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.2 * s);
  doc.setTextColor(253, 230, 138);
  doc.text('NOMOR KTA DIGITAL PPDI', textX + 2.2 * s, ktaBoxY + 2.6 * s);

  doc.setFont('courier', 'bold');
  doc.setFontSize(8.2 * s);
  doc.setTextColor(253, 224, 71);
  doc.text(member.keanggotaan?.no_kta || 'BELUM TERBIT', textX + 2.2 * s, ktaBoxY + 6.3 * s);

  // ================= FOOTER BAR =================
  const footerLineY = y + h - 6.0 * s;
  doc.setDrawColor(217, 169, 45);
  doc.setLineWidth(0.2 * s);
  doc.line(x + 3 * s, footerLineY, x + w - 3 * s, footerLineY);

  const statusText = (member.keanggotaan?.status_kta || 'Pending').toUpperCase();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.8 * s);
  doc.setTextColor(167, 243, 208);
  doc.text('Status:', x + 3.5 * s, y + h - 2.4 * s);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(253, 224, 71);
  doc.text(statusText, x + 9.8 * s, y + h - 2.4 * s);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.6 * s);
  doc.setTextColor(167, 243, 208);
  doc.text('Masa Berlaku: Selama Menjabat (Batas Usia 60 Thn)', x + w - 3.5 * s, y + h - 2.4 * s, {
    align: 'right',
  });
}

function drawKtaBackCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  qrDataUrl: string | null,
  opts: {
    logoDataUrl: string | null;
    backBgDataUrl: string | null;
    watermarkLogoDataUrl: string | null;
    backWatermarkDataUrl: string | null;
    backOpacity: number;
  }
) {
  const s = w / CARD_W_MM;

  // Card Base Gradient + Radial Glow + Dot Matrix matching Preview 1:1
  if (opts.backBgDataUrl) {
    doc.addImage(opts.backBgDataUrl, 'PNG', x, y, w, h);
  } else {
    doc.setFillColor(6, 78, 59); // #064e3b fallback
    doc.roundedRect(x, y, w, h, 2.5 * s, 2.5 * s, 'F');
    doc.setFillColor(16, 110, 82);
    for (let gx = 4 * s; gx < w - 3 * s; gx += 4.2 * s) {
      for (let gy = 10.5 * s; gy < h - 12 * s; gy += 4.2 * s) {
        doc.circle(x + gx, y + gy, 0.14 * s, 'F');
      }
    }
  }

  // Organization Logo Watermark (matching EKTAView back card)
  if (opts.backOpacity > 0) {
    addWatermarkToPdf(doc, {
      cardX: x,
      cardY: y,
      cardW: w,
      cardH: h,
      side: 'back',
      opacity: opts.backOpacity,
      watermarkDataUrl: opts.backWatermarkDataUrl,
      logoDataUrl: opts.watermarkLogoDataUrl,
    });
  }

  // Outer card gold trim border
  doc.setDrawColor(217, 169, 45);
  doc.setLineWidth(0.32 * s);
  doc.roundedRect(x, y, w, h, 2.5 * s, 2.5 * s, 'S');

  // ================= HEADER =================
  const headerH = 9.0 * s;
  const smLogoCx = x + 5.6 * s;
  const smLogoCy = y + 4.5 * s;
  const smLogoR = 2.4 * s;

  doc.setFillColor(255, 255, 255);
  doc.circle(smLogoCx, smLogoCy, smLogoR, 'F');
  doc.setDrawColor(252, 211, 77);
  doc.setLineWidth(0.25 * s);
  doc.circle(smLogoCx, smLogoCy, smLogoR, 'S');

  if (opts.logoDataUrl) {
    const imgSize = (smLogoR - 0.35 * s) * 2;
    doc.addImage(opts.logoDataUrl, 'PNG', smLogoCx - imgSize / 2, smLogoCy - imgSize / 2, imgSize, imgSize);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8 * s);
  doc.setTextColor(253, 224, 71);
  doc.text('KETENTUAN KARTU ANGGOTA PPDI', x + 9.2 * s, y + 5.2 * s);

  // VERIFIED Pill
  const badgeW = 14.5 * s;
  const badgeH = 4.2 * s;
  const badgeX = x + w - badgeW - 3.2 * s;
  const badgeY = y + 2.4 * s;
  doc.setFillColor(2, 44, 34);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 2.1 * s, 2.1 * s, 'F');
  doc.setDrawColor(52, 211, 153);
  doc.setLineWidth(0.2 * s);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 2.1 * s, 2.1 * s, 'S');

  doc.setFont('courier', 'bold');
  doc.setFontSize(4.6 * s);
  doc.setTextColor(167, 243, 208);
  doc.text('VERIFIED', badgeX + badgeW / 2, badgeY + 2.9 * s, { align: 'center' });

  // Header divider
  doc.setDrawColor(217, 169, 45);
  doc.setLineWidth(0.25 * s);
  doc.line(x + 3 * s, y + headerH, x + w - 3 * s, y + headerH);

  // ================= BODY: TERMS & QR =================
  const termsX = x + 3.6 * s;
  const termsMaxW = 50.0 * s;
  let termY = y + 12.6 * s;

  const terms = [
    {
      num: '1.',
      text: 'Kartu ini merupakan tanda pengenal resmi anggota Persatuan Perangkat Desa Indonesia (PPDI) Kab. Bandung.',
    },
    {
      num: '2.',
      text: 'Berlaku sebagai bukti sah hak bantuan advokasi kelembagaan, kepesertaan organisasi, & jaringan kerja perangkat desa.',
    },
    {
      num: '3.',
      text: 'Apabila perangkat desa purna tugas atau diberhentikan, keanggotaan dan keabsahan kartu ini otomatis berakhir.',
    },
  ];

  terms.forEach((item) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.0 * s);
    doc.setTextColor(253, 224, 71);
    doc.text(item.num, termsX, termY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.0 * s);
    doc.setTextColor(209, 250, 229);
    const lines = doc.splitTextToSize(item.text, termsMaxW - 3.2 * s);
    doc.text(lines, termsX + 3.0 * s, termY);
    termY += lines.length * 2.2 * s + 1.2 * s;
  });

  // Secretariat line
  const sekLineY = y + 36.6 * s;
  doc.setDrawColor(6, 95, 70);
  doc.setLineWidth(0.2 * s);
  doc.line(termsX, sekLineY - 1.8 * s, termsX + termsMaxW, sekLineY - 1.8 * s);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.4 * s);
  doc.setTextColor(167, 243, 208);
  doc.text('Sekretariat:', termsX, sekLineY);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(253, 230, 138);
  const addrLines = doc.splitTextToSize(
    'Jl. Parungserab No. 54, Soreang, Kab. Bandung 40911',
    termsMaxW - 12.5 * s
  );
  doc.text(addrLines[0] || '', termsX + 12.5 * s, sekLineY);

  // QR Container on Right
  const qrBoxSize = 23.0 * s;
  const qrBoxX = x + w - qrBoxSize - 4.2 * s;
  const qrBoxY = y + 12.2 * s;

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 1.8 * s, 1.8 * s, 'F');
  doc.setDrawColor(251, 191, 36);
  doc.setLineWidth(0.35 * s);
  doc.roundedRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 1.8 * s, 1.8 * s, 'S');

  if (qrDataUrl) {
    const pad = 1.3 * s;
    doc.addImage(qrDataUrl, 'PNG', qrBoxX + pad, qrBoxY + pad, qrBoxSize - pad * 2, qrBoxSize - pad * 2);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.1 * s);
  doc.setTextColor(253, 230, 138);
  doc.text('SCAN VERIFIKASI KTA', qrBoxX + qrBoxSize / 2, qrBoxY + qrBoxSize + 2.8 * s, {
    align: 'center',
  });

  // ================= FOOTER SIGNATURE =================
  const footerLineY = y + h - 11.2 * s;
  doc.setDrawColor(217, 169, 45);
  doc.setLineWidth(0.22 * s);
  doc.line(x + 3 * s, footerLineY, x + w - 3 * s, footerLineY);

  const fLogoCx = x + 6.0 * s;
  const fLogoCy = y + h - 5.6 * s;
  const fLogoR = 2.6 * s;
  doc.setFillColor(255, 255, 255);
  doc.circle(fLogoCx, fLogoCy, fLogoR, 'F');
  doc.setDrawColor(252, 211, 77);
  doc.setLineWidth(0.2 * s);
  doc.circle(fLogoCx, fLogoCy, fLogoR, 'S');
  if (opts.logoDataUrl) {
    const imgSize = (fLogoR - 0.35 * s) * 2;
    doc.addImage(opts.logoDataUrl, 'PNG', fLogoCx - imgSize / 2, fLogoCy - imgSize / 2, imgSize, imgSize);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.4 * s);
  doc.setTextColor(167, 243, 208);
  doc.text('DITERBITKAN OLEH:', x + 9.8 * s, y + h - 6.8 * s);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.0 * s);
  doc.setTextColor(255, 255, 255);
  doc.text('Pengurus Daerah PPDI Kab. Bandung', x + 9.8 * s, y + h - 4.0 * s);

  // Right Signatory
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.4 * s);
  doc.setTextColor(167, 243, 208);
  doc.text('Ketua Pengurus Daerah', x + w - 3.5 * s, y + h - 8.0 * s, { align: 'right' });

  doc.setFont('courier', 'bold');
  doc.setFontSize(4.2 * s);
  doc.setTextColor(253, 224, 71);
  doc.text('[TTD & CAP RESMI]', x + w - 3.5 * s, y + h - 5.4 * s, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.6 * s);
  doc.setTextColor(253, 224, 71);
  doc.text('DADANG IYAS, S.Ip.', x + w - 3.5 * s, y + h - 2.4 * s, { align: 'right' });
}

function drawCutGuideBorder(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.2);
  if (typeof (doc as any).setLineDashPattern === 'function') {
    (doc as any).setLineDashPattern([1.5, 1.5], 0);
  }
  doc.rect(x - 1.2, y - 1.2, w + 2.4, h + 2.4, 'S');
  if (typeof (doc as any).setLineDashPattern === 'function') {
    (doc as any).setLineDashPattern([], 0);
  }
}

/**
 * Generates and downloads a bulk PDF containing E-KTA cards for all selected members.
 */
export async function exportBulkKtaToPDF({
  members,
  format,
  cardSide,
  appName = 'PERSATUAN PERANGKAT DESA INDONESIA',
  appLogo,
  watermarkLogo,
  watermarkOpacity,
  watermarkOpacityFront,
  watermarkOpacityBack,
  kecamatanList = [],
  desaList = [],
  onProgress,
}: BulkKtaExportOptions): Promise<void> {
  if (!members || members.length === 0) return;

  const clampOpacity = (val: number | undefined, fallback: number) => {
    if (typeof val !== 'number' || Number.isNaN(val)) return fallback;
    return Math.min(1, Math.max(0, val));
  };

  const hasGlobalOpacity = typeof watermarkOpacity === 'number' && !Number.isNaN(watermarkOpacity);
  const effectiveFrontOpacity = hasGlobalOpacity
    ? clampOpacity(watermarkOpacity, 0.09)
    : clampOpacity(watermarkOpacityFront, 0.09);
  const effectiveBackOpacity = hasGlobalOpacity
    ? clampOpacity(watermarkOpacity, 0.07)
    : clampOpacity(watermarkOpacityBack, 0.07);

  const imageCache = new Map<string, string | null>();
  const defaultLogoUrl = (appLogo || '').trim() || '/logo_kabupaten_bandung.svg';
  const effectiveWatermarkUrl = (watermarkLogo || '').trim() || defaultLogoUrl;

  const logoDataUrl = await loadSafeImageDataUrl(defaultLogoUrl, imageCache);
  const watermarkLogoDataUrl =
    effectiveWatermarkUrl === defaultLogoUrl
      ? logoDataUrl
      : await loadSafeImageDataUrl(effectiveWatermarkUrl, imageCache);

  const isRoundedBg = format === 'a4';
  const frontBgDataUrl =
    cardSide === 'both' || cardSide === 'front'
      ? buildCardBackgroundDataUrl('front', isRoundedBg)
      : null;
  const backBgDataUrl =
    cardSide === 'both' || cardSide === 'back'
      ? buildCardBackgroundDataUrl('back', isRoundedBg)
      : null;

  const [frontWatermarkDataUrl, backWatermarkDataUrl] = await Promise.all([
    (cardSide === 'both' || cardSide === 'front') && effectiveFrontOpacity > 0
      ? buildWatermarkDataUrl(watermarkLogoDataUrl, effectiveFrontOpacity)
      : Promise.resolve(null),
    (cardSide === 'both' || cardSide === 'back') && effectiveBackOpacity > 0
      ? buildWatermarkDataUrl(watermarkLogoDataUrl, effectiveBackOpacity)
      : Promise.resolve(null),
  ]);

  // Pre-build member assets (QR & photo) with progress feedback
  const prepared: Array<{
    member: AnggotaFullDetail;
    qrDataUrl: string | null;
    photoDataUrl: string | null;
    desaName: string;
    kecName: string;
  }> = [];

  for (let i = 0; i < members.length; i++) {
    const member = members[i];
    onProgress?.(i + 1, members.length);

    let qrDataUrl: string | null = null;
    if (cardSide === 'both' || cardSide === 'back') {
      const ktaVal =
        (member.keanggotaan?.no_kta || '').trim() ||
        (member.anggota.nipd || '').trim() ||
        `PPDI-${member.anggota.id_anggota}`;
      const nikVal = (member.anggota.nik || '').trim() || `ID${member.anggota.id_anggota}`;

      const { url } = generateKtaShortUrl({
        no_kta: ktaVal,
        nik: nikVal,
        id_anggota: member.anggota.id_anggota,
      });

      try {
        qrDataUrl = await QRCode.toDataURL(url, {
          width: 240,
          margin: 1,
          color: {
            dark: '#064e3b',
            light: '#ffffff',
          },
          errorCorrectionLevel: 'M',
        });
      } catch {
        qrDataUrl = null;
      }
    }

    let photoDataUrl: string | null = null;
    if (cardSide === 'both' || cardSide === 'front') {
      const photoUrl = getPhotoUrl(member.anggota.foto, member.anggota.jenis_kelamin);
      photoDataUrl = await loadContainFramedPhotoDataUrl(photoUrl, imageCache);
    }

    const { desaName, kecName } = resolveWilayahNames(member, kecamatanList, desaList);

    prepared.push({
      member,
      qrDataUrl,
      photoDataUrl,
      desaName,
      kecName,
    });
  }

  if (format === 'cr80') {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [CARD_W_MM, CARD_H_MM],
      compress: true,
    });

    let pageCount = 0;

    prepared.forEach((item) => {
      if (cardSide === 'both' || cardSide === 'front') {
        if (pageCount > 0) doc.addPage([CARD_W_MM, CARD_H_MM], 'landscape');
        drawKtaFrontCard(doc, 0, 0, CARD_W_MM, CARD_H_MM, item.member, {
          appName,
          logoDataUrl,
          frontBgDataUrl,
          watermarkLogoDataUrl,
          frontWatermarkDataUrl,
          frontOpacity: effectiveFrontOpacity,
          photoDataUrl: item.photoDataUrl,
          desaName: item.desaName,
          kecName: item.kecName,
        });
        pageCount++;
      }

      if (cardSide === 'both' || cardSide === 'back') {
        if (pageCount > 0) doc.addPage([CARD_W_MM, CARD_H_MM], 'landscape');
        drawKtaBackCard(doc, 0, 0, CARD_W_MM, CARD_H_MM, item.qrDataUrl, {
          logoDataUrl,
          backBgDataUrl,
          watermarkLogoDataUrl,
          backWatermarkDataUrl,
          backOpacity: effectiveBackOpacity,
        });
        pageCount++;
      }
    });

    const dateSlug = new Date().toISOString().slice(0, 10);
    doc.save(`E-KTA_Massal_CR80_${members.length}_Anggota_${dateSlug}.pdf`);
    return;
  }

  // FORMAT A4 PORTRAIT SHEET (85.6 x 54.0 mm exact size cards with dashed cut guides)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const gapX = 8;
  const gapY = 8;
  const cols = 2;
  const rows = 4;
  const totalGridW = cols * CARD_W_MM + gapX; // 179.2mm
  const marginX = (pageWidth - totalGridW) / 2; // ~15.4mm
  const startY = 20;

  const printDateStr = new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  // Build ordered slots:
  // - 'both': 1 member per row (left = Front, right = Back) -> 4 members per A4 page
  // - 'front' / 'back': 2 cards per row -> 8 cards per A4 page
  type CardSlot = {
    side: 'front' | 'back';
    item: (typeof prepared)[number];
  };
  const slots: CardSlot[] = [];

  if (cardSide === 'both') {
    prepared.forEach((item) => {
      slots.push({ side: 'front', item });
      slots.push({ side: 'back', item });
    });
  } else {
    prepared.forEach((item) => {
      slots.push({ side: cardSide, item });
    });
  }

  const perPage = cols * rows; // 8 cards per A4 page
  const totalPages = Math.max(1, Math.ceil(slots.length / perPage));

  const drawA4Chrome = (pageIdx: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(6, 78, 59);
    doc.text(`${appName.toUpperCase()} — CETAK MASSAL E-KTA ANGGOTA`, marginX, 10.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Terpilih: ${members.length} Anggota (${cardSide === 'both' ? 'Depan & Belakang' : cardSide === 'front' ? 'Tampak Depan' : 'Tampak Belakang'}) · Dicetak: ${printDateStr}`,
      pageWidth - marginX,
      10.5,
      { align: 'right' }
    );

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.line(marginX, 13.5, pageWidth - marginX, 13.5);

    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Ukuran Standar KTP / ID-1 (8,56 cm x 5,4 cm) · Garis putus-putus sebagai panduan potong · Halaman ${pageIdx + 1} dari ${totalPages}`,
      pageWidth / 2,
      pageHeight - 6,
      { align: 'center' }
    );
  };

  drawA4Chrome(0);

  slots.forEach((slot, idx) => {
    const pageIdx = Math.floor(idx / perPage);
    const idxOnPage = idx % perPage;

    if (idx > 0 && idxOnPage === 0) {
      doc.addPage('a4', 'portrait');
      drawA4Chrome(pageIdx);
    }

    const col = idxOnPage % cols;
    const row = Math.floor(idxOnPage / cols);
    const cardX = marginX + col * (CARD_W_MM + gapX);
    const cardY = startY + row * (CARD_H_MM + gapY);

    drawCutGuideBorder(doc, cardX, cardY, CARD_W_MM, CARD_H_MM);

    if (slot.side === 'front') {
      drawKtaFrontCard(doc, cardX, cardY, CARD_W_MM, CARD_H_MM, slot.item.member, {
        appName,
        logoDataUrl,
        frontBgDataUrl,
        watermarkLogoDataUrl,
        frontWatermarkDataUrl,
        frontOpacity: effectiveFrontOpacity,
        photoDataUrl: slot.item.photoDataUrl,
        desaName: slot.item.desaName,
        kecName: slot.item.kecName,
      });
    } else {
      drawKtaBackCard(doc, cardX, cardY, CARD_W_MM, CARD_H_MM, slot.item.qrDataUrl, {
        logoDataUrl,
        backBgDataUrl,
        watermarkLogoDataUrl,
        backWatermarkDataUrl,
        backOpacity: effectiveBackOpacity,
      });
    }
  });

  const dateSlug = new Date().toISOString().slice(0, 10);
  doc.save(`E-KTA_Massal_A4_${members.length}_Anggota_${dateSlug}.pdf`);
}
