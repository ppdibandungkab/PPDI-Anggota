import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { AnggotaFullDetail, RefDesa, RefKecamatan } from '../types/ppdi';
import { generateKtaShortUrl } from './qrCrypto';

export type QrLabelSizePreset = 'compact' | 'medium' | 'large';

export interface QrLabelItemData {
  member: AnggotaFullDetail;
  qrDataUrl: string;
  shortUrl: string;
  shortToken: string;
  uniqueSerial: string;
  desaLabel: string;
  kecamatanLabel: string;
  barcodeBars: number[]; // Array of bar widths (in units 1..3), alternating dark/light starting dark
}

const cleanWilayahId = (id?: string | null) =>
  id ? String(id).replace(/\./g, '').trim() : '';

export function formatDesaLabel(raw?: string | null): string {
  if (!raw || !raw.trim()) return '';
  const stripped = raw.trim().replace(/^(ds\.?|desa)\s+/i, '').trim();
  return stripped ? `Ds. ${stripped}` : '';
}

export function formatKecamatanLabel(raw?: string | null): string {
  if (!raw || !raw.trim()) return '';
  const stripped = raw.trim().replace(/^(kec\.?|kecamatan)\s+/i, '').trim();
  return stripped ? `Kec. ${stripped}` : '';
}

export function resolveMemberWilayahLabels(
  member: AnggotaFullDetail,
  kecamatanList: RefKecamatan[] = [],
  desaList: RefDesa[] = []
): { desaLabel: string; kecamatanLabel: string } {
  const memberDesaClean = cleanWilayahId(member.desa?.id_desa || member.jabatanTerkini?.id_desa);
  const matchedDesa =
    member.desa?.nama_desa
      ? member.desa
      : desaList.find((d) => cleanWilayahId(d.id_desa) === memberDesaClean);

  const memberKecClean = cleanWilayahId(
    member.kecamatan?.id_kecamatan ||
      matchedDesa?.id_kecamatan ||
      (memberDesaClean.length >= 6 ? memberDesaClean.slice(0, 6) : '')
  );
  const matchedKec =
    member.kecamatan?.nama_kecamatan
      ? member.kecamatan
      : kecamatanList.find((k) => cleanWilayahId(k.id_kecamatan) === memberKecClean);

  return {
    desaLabel: formatDesaLabel(matchedDesa?.nama_desa),
    kecamatanLabel: formatKecamatanLabel(matchedKec?.nama_kecamatan),
  };
}

/**
 * Generates a deterministic Code-128-style visual bar sequence from a string
 * so every member gets a crisp, distinct 1D barcode strip alongside their QR code.
 */
export function buildDeterministicBarcodePattern(seedText: string): number[] {
  const input = (seedText || 'PPDI3204').trim();
  const bars: number[] = [2, 1, 1, 2, 1, 2]; // Start guard

  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    // 4 alternating bars/spaces per character, guaranteed widths 1..3
    bars.push(((code >> 0) & 1) + 1);
    bars.push(((code >> 1) & 1) + 1);
    bars.push(((code >> 2) & 2) + 1);
    bars.push(((code >> 4) & 1) + 1);
  }

  // Stop guard
  bars.push(2, 1, 1, 1, 2, 2);
  return bars;
}

/**
 * Resolves unique verification identifier & builds QR + 1D barcode payload for a member.
 */
export async function buildMemberQrLabelData(
  member: AnggotaFullDetail,
  kecamatanList: RefKecamatan[] = [],
  desaList: RefDesa[] = []
): Promise<QrLabelItemData> {
  const cleanNik = (member.anggota.nik || '').trim() || `ID${member.anggota.id_anggota}`;
  const cleanKta =
    (member.keanggotaan?.no_kta || '').trim() ||
    (member.anggota.nipd || '').trim() ||
    `PPDI-${member.anggota.id_anggota}`;

  const { url, token } = generateKtaShortUrl({
    no_kta: cleanKta,
    nik: cleanNik,
    id_anggota: member.anggota.id_anggota,
  });

  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 300,
    margin: 1,
    color: {
      dark: '#064E3B',
      light: '#FFFFFF',
    },
    errorCorrectionLevel: 'M',
  });

  const { desaLabel, kecamatanLabel } = resolveMemberWilayahLabels(
    member,
    kecamatanList,
    desaList
  );

  const uniqueSerial = cleanKta;
  const barcodeBars = buildDeterministicBarcodePattern(`${cleanNik}-${cleanKta}`);

  return {
    member,
    qrDataUrl,
    shortUrl: url,
    shortToken: token,
    uniqueSerial,
    desaLabel,
    kecamatanLabel,
    barcodeBars,
  };
}

interface PresetLayout {
  cols: number;
  rows: number;
  gapX: number;
  gapY: number;
  marginX: number;
  marginTop: number;
  qrSize: number;
  headerH: number;
  nameFontSize: number;
  metaFontSize: number;
  codeFontSize: number;
  lineStep: number;
  barcodeHeight: number;
}

const PRESET_LAYOUTS: Record<QrLabelSizePreset, PresetLayout> = {
  compact: {
    cols: 3,
    rows: 8,
    gapX: 3.5,
    gapY: 2.8,
    marginX: 9,
    marginTop: 13.5,
    qrSize: 17.5,
    headerH: 3.8,
    nameFontSize: 6.8,
    metaFontSize: 5.2,
    codeFontSize: 5.0,
    lineStep: 2.25,
    barcodeHeight: 2.6,
  },
  medium: {
    cols: 3,
    rows: 6,
    gapX: 4.5,
    gapY: 4,
    marginX: 9,
    marginTop: 14.5,
    qrSize: 20,
    headerH: 4.6,
    nameFontSize: 8.2,
    metaFontSize: 6.0,
    codeFontSize: 5.6,
    lineStep: 2.8,
    barcodeHeight: 3.6,
  },
  large: {
    cols: 2,
    rows: 5,
    gapX: 7,
    gapY: 5,
    marginX: 11,
    marginTop: 15.5,
    qrSize: 29,
    headerH: 5.6,
    nameFontSize: 10.2,
    metaFontSize: 7.4,
    codeFontSize: 7.0,
    lineStep: 3.4,
    barcodeHeight: 4.8,
  },
};

export interface ExportQrLabelsPdfOptions {
  items: QrLabelItemData[];
  sizePreset: QrLabelSizePreset;
  appName?: string;
  show1DBarcode?: boolean;
  kecamatanList?: RefKecamatan[];
  desaList?: RefDesa[];
}

/**
 * Generates an A4 print-ready PDF containing grid sheets of unique member QR & barcode labels.
 */
export function exportQrLabelsToPDF({
  items,
  sizePreset,
  appName = 'PPDI KAB. BANDUNG',
  show1DBarcode = true,
  kecamatanList = [],
  desaList = [],
}: ExportQrLabelsPdfOptions): void {
  if (!items || items.length === 0) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const layout = PRESET_LAYOUTS[sizePreset];
  const perPage = layout.cols * layout.rows;

  const usableWidth = pageWidth - layout.marginX * 2 - layout.gapX * (layout.cols - 1);
  const labelW = usableWidth / layout.cols;

  const footerSpace = 9.5;
  const usableHeight = pageHeight - layout.marginTop - footerSpace - layout.gapY * (layout.rows - 1);
  const labelH = usableHeight / layout.rows;

  const totalPages = Math.ceil(items.length / perPage);
  const printDateStr = new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const drawPageChrome = (pageIdx: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(6, 78, 59);
    doc.text(`${appName.toUpperCase()} — LEMBAR CETAK LABEL QR BARCODE ANGGOTA`, layout.marginX, 9);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Total: ${items.length} Label | Dicetak: ${printDateStr}`,
      pageWidth - layout.marginX,
      9,
      { align: 'right' }
    );

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.line(layout.marginX, 11, pageWidth - layout.marginX, 11);

    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Gunakan pemindai QR kamera HP/scanner lapangan untuk verifikasi keabsahan KTA otomatis · Halaman ${pageIdx + 1} dari ${totalPages}`,
      pageWidth / 2,
      pageHeight - 4.5,
      { align: 'center' }
    );
  };

  drawPageChrome(0);

  items.forEach((item, index) => {
    const pageIdx = Math.floor(index / perPage);
    const indexOnPage = index % perPage;

    if (index > 0 && indexOnPage === 0) {
      doc.addPage();
      drawPageChrome(pageIdx);
    }

    const col = indexOnPage % layout.cols;
    const row = Math.floor(indexOnPage / layout.cols);

    const x = layout.marginX + col * (labelW + layout.gapX);
    const y = layout.marginTop + row * (labelH + layout.gapY);

    // Outer dashed cut guide border
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.25);
    if (typeof (doc as any).setLineDashPattern === 'function') {
      (doc as any).setLineDashPattern([1.2, 1.2], 0);
    }
    doc.roundedRect(x, y, labelW, labelH, 1.5, 1.5, 'S');
    if (typeof (doc as any).setLineDashPattern === 'function') {
      (doc as any).setLineDashPattern([], 0);
    }

    // Header strip inside label
    const headerH = layout.headerH;
    doc.setFillColor(6, 78, 59);
    doc.roundedRect(x, y, labelW, headerH, 1.5, 1.5, 'F');
    // Square off bottom corners of header strip
    doc.rect(x, y + headerH - 1.5, labelW, 1.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(sizePreset === 'compact' ? 5.0 : sizePreset === 'medium' ? 5.8 : 6.8);
    doc.setTextColor(253, 224, 71);
    doc.text(appName.toUpperCase().slice(0, 28), x + 1.8, y + headerH - 1.1);

    const statusKta = (item.member.keanggotaan?.status_kta || 'Pending').toUpperCase();
    doc.setTextColor(255, 255, 255);
    doc.text(statusKta, x + labelW - 1.8, y + headerH - 1.1, { align: 'right' });

    // Content area coordinates
    const innerPad = 1.8;
    const barcodeReserve = show1DBarcode ? layout.barcodeHeight + 2.4 : 1.5;
    const bodyMaxY = y + labelH - barcodeReserve;
    const contentTop = y + headerH + 1.4;
    const qrX = x + innerPad;
    const qrY = contentTop;
    const qrSize = Math.min(layout.qrSize, bodyMaxY - contentTop);

    // QR Code image
    if (item.qrDataUrl) {
      doc.addImage(item.qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
    }

    // Member text block on right of QR
    const textX = qrX + qrSize + 2.0;
    const textMaxW = Math.max(12, x + labelW - innerPad - textX);

    const fullName = [
      item.member.anggota.gelar_depan,
      item.member.anggota.nama_lengkap,
      item.member.anggota.gelar_belakang,
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(layout.nameFontSize);
    doc.setTextColor(17, 17, 19);
    const maxNameLines = sizePreset === 'compact' ? 1 : 2;
    const nameLines = doc.splitTextToSize(fullName || '-', textMaxW).slice(0, maxNameLines);
    let cursorY = contentTop + (sizePreset === 'compact' ? 2.1 : 2.5);
    doc.text(nameLines, textX, cursorY);

    cursorY += nameLines.length * (layout.nameFontSize * 0.4) + (sizePreset === 'compact' ? 0.4 : 0.7);

    // Helper to print a single neatly fitted line if within vertical bounds
    const drawSingleLine = (
      text: string,
      font: 'helvetica' | 'courier',
      style: 'normal' | 'bold',
      fontSize: number,
      color: [number, number, number]
    ) => {
      if (!text || cursorY > bodyMaxY - 0.3) return;
      doc.setFont(font, style);
      doc.setFontSize(fontSize);
      doc.setTextColor(color[0], color[1], color[2]);
      const fitted = doc.splitTextToSize(text, textMaxW)[0] || text;
      doc.text(fitted, textX, cursorY);
      cursorY += layout.lineStep;
    };

    const jabatan = item.member.jabatanRef?.nama_jabatan || 'Perangkat Desa';
    drawSingleLine(jabatan, 'helvetica', 'normal', layout.metaFontSize, [51, 65, 85]);

    const resolvedWilayah =
      item.desaLabel || item.kecamatanLabel
        ? { desaLabel: item.desaLabel, kecamatanLabel: item.kecamatanLabel }
        : resolveMemberWilayahLabels(item.member, kecamatanList, desaList);

    const desaLine = resolvedWilayah.desaLabel || 'Ds. -';
    const kecLine = resolvedWilayah.kecamatanLabel || 'Kec. -';

    drawSingleLine(desaLine, 'helvetica', 'normal', layout.metaFontSize, [71, 85, 105]);
    drawSingleLine(kecLine, 'helvetica', 'bold', layout.metaFontSize, [15, 23, 42]);

    const ktaDisplay = `KTA: ${item.uniqueSerial}`;
    drawSingleLine(ktaDisplay, 'courier', 'bold', layout.codeFontSize, [6, 78, 59]);

    const nikDisplay = `NIK: ${item.member.anggota.nik || '-'}`;
    drawSingleLine(nikDisplay, 'courier', 'normal', layout.codeFontSize, [51, 65, 85]);

    const nipdValue = (item.member.anggota.nipd || '').trim() || '-';
    const nipdDisplay = `NIPD: ${nipdValue}`;
    drawSingleLine(nipdDisplay, 'courier', 'normal', layout.codeFontSize, [51, 65, 85]);

    // Optional 1D visual barcode strip at the bottom of the label
    if (show1DBarcode) {
      const barAreaW = labelW - innerPad * 2;
      const barY = y + labelH - layout.barcodeHeight - 1.3;
      const totalUnits = item.barcodeBars.reduce((acc, w) => acc + w, 0);
      const unitW = barAreaW / Math.max(1, totalUnits);

      let cursorX = x + innerPad;
      doc.setFillColor(17, 17, 19);
      item.barcodeBars.forEach((units, barIdx) => {
        const w = units * unitW;
        if (barIdx % 2 === 0) {
          doc.rect(cursorX, barY, Math.max(0.15, w), layout.barcodeHeight, 'F');
        }
        cursorX += w;
      });
    }
  });

  const dateSlug = new Date().toISOString().slice(0, 10);
  doc.save(`Label_QR_Barcode_PPDI_${dateSlug}.pdf`);
}
