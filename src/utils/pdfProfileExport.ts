import jsPDF from 'jspdf';
import { AnggotaFullDetail } from '../types/ppdi';
import {
  calculateAgeAndRetirement,
  formatDateIndo,
  formatRupiah,
  formatNIPDDisplay,
  resolveApiUrl,
} from './ppdiHelpers';

export interface PdfProfileExportOptions {
  logoUrl?: string;
}

interface ImageCanvasConfig {
  mode: 'contain' | 'cover-top';
  widthPx: number;
  heightPx: number;
  format: 'PNG' | 'JPEG';
  background?: string;
}

/**
 * Loads an image URL or data URI and renders it cleanly onto a canvas for crisp jsPDF embedding.
 * Supports SVG, PNG, JPG, and WebP without stretching.
 */
async function loadImageForPdf(
  rawUrl: string | undefined,
  config: ImageCanvasConfig
): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' } | null> {
  if (!rawUrl || !rawUrl.trim()) return null;
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  const resolvedUrl = resolveApiUrl(rawUrl.trim());

  const renderElementToCanvas = (img: HTMLImageElement): { dataUrl: string; format: 'PNG' | 'JPEG' } | null => {
    const naturalW = img.naturalWidth || img.width;
    const naturalH = img.naturalHeight || img.height;
    if (!naturalW || !naturalH) return null;

    const canvas = document.createElement('canvas');
    canvas.width = config.widthPx;
    canvas.height = config.heightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (config.background) {
      ctx.fillStyle = config.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (config.mode === 'contain') {
      const scale = Math.min(canvas.width / naturalW, canvas.height / naturalH);
      const drawW = naturalW * scale;
      const drawH = naturalH * scale;
      const offsetX = (canvas.width - drawW) / 2;
      const offsetY = (canvas.height - drawH) / 2;
      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    } else {
      // 'cover-top': crop to target aspect ratio (3x4) favoring the top portion so head/face is never clipped
      const targetRatio = canvas.width / canvas.height;
      const sourceRatio = naturalW / naturalH;
      let sx = 0;
      let sy = 0;
      let sw = naturalW;
      let sh = naturalH;

      if (sourceRatio > targetRatio) {
        sw = naturalH * targetRatio;
        sx = (naturalW - sw) / 2;
      } else if (sourceRatio < targetRatio) {
        sh = naturalW / targetRatio;
        sy = Math.max(0, (naturalH - sh) * 0.15);
      }

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    }

    const mime = config.format === 'PNG' ? 'image/png' : 'image/jpeg';
    const quality = config.format === 'JPEG' ? 0.92 : undefined;
    return {
      dataUrl: canvas.toDataURL(mime, quality),
      format: config.format,
    };
  };

  const loadImgElement = (src: string, useCors: boolean): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      if (useCors && !src.startsWith('data:') && !src.startsWith('blob:')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(err);
      img.src = src;
    });

  // 1. Try loading directly as Image element
  try {
    const img = await loadImgElement(resolvedUrl, true);
    const rendered = renderElementToCanvas(img);
    if (rendered) return rendered;
  } catch (_) {
    // Fallback to fetch -> Blob -> ObjectURL
  }

  // 2. Fallback via fetch + Blob (helps with SVG or relative assets)
  try {
    const res = await fetch(resolvedUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = await loadImgElement(objectUrl, false);
      return renderElementToCanvas(img);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch (_) {
    return null;
  }
}

/**
 * Generates and downloads a formal PDF Member Profile Document using jsPDF
 */
export async function exportMemberProfileToPDF(
  member: AnggotaFullDetail,
  options?: PdfProfileExportOptions
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const primaryGreen: [number, number, number] = [6, 78, 59]; // #064E3B
  const emeraldAccent: [number, number, number] = [5, 150, 105]; // #059669
  const gold: [number, number, number] = [217, 119, 6]; // #D97706
  const textDark: [number, number, number] = [17, 24, 39]; // #111827
  const textMuted: [number, number, number] = [107, 114, 128]; // #6B7280
  const bgLight: [number, number, number] = [243, 244, 246]; // #F3F4F6
  const borderGray: [number, number, number] = [209, 213, 219]; // #D1D5DB
  const rowDivider: [number, number, number] = [235, 238, 241];

  const logoSrc = (options?.logoUrl || '').trim() || '/logo_kabupaten_bandung.svg';

  // Load Header Logo and Member 3x4 Photo in parallel
  const [logoAsset, memberPhotoAsset] = await Promise.all([
    loadImageForPdf(logoSrc, {
      mode: 'contain',
      widthPx: 240,
      heightPx: 240,
      format: 'PNG',
    }),
    loadImageForPdf(member.anggota.foto, {
      mode: 'cover-top',
      widthPx: 360,
      heightPx: 480,
      format: 'JPEG',
      background: '#FFFFFF',
    }),
  ]);

  // 1. Top Header Bar
  doc.setFillColor(...primaryGreen);
  doc.rect(0, 0, 210, 26, 'F');

  doc.setFillColor(...gold);
  doc.rect(0, 26, 210, 2, 'F');

  // Header Logo on the Left
  const logoBoxX = 14;
  const logoBoxY = 3.5;
  const logoBoxSize = 19;

  if (logoAsset) {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...gold);
    doc.setLineWidth(0.35);
    doc.roundedRect(logoBoxX, logoBoxY, logoBoxSize, logoBoxSize, 2.5, 2.5, 'FD');
    doc.addImage(
      logoAsset.dataUrl,
      logoAsset.format,
      logoBoxX + 1.2,
      logoBoxY + 1.2,
      logoBoxSize - 2.4,
      logoBoxSize - 2.4
    );
  }

  // Header Copy (balanced neatly to the right of the left logo)
  const headerTextCenterX = logoAsset ? 113 : 105;
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.text('PERSATUAN PERANGKAT DESA INDONESIA (PPDI)', headerTextCenterX, 10.8, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('PENGURUS DAERAH KABUPATEN BANDUNG - PROVINSI JAWA BARAT', headerTextCenterX, 16.3, { align: 'center' });

  doc.setFontSize(7.5);
  doc.text('PORTAL DATABASE INDUK & SYSTEM E-KTA DIGITAL PERANGKAT DESA', headerTextCenterX, 21.3, { align: 'center' });

  // 2. Document Title Box
  doc.setTextColor(...primaryGreen);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.text('LEMBAR BIODATA & PROFIL RESMI ANGGOTA', 105, 35, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(...textMuted);
  doc.setFont('helvetica', 'normal');
  const regNo = `REG-PPDI/${(member.anggota.nik || '000000').slice(-6)}/${new Date().getFullYear()}`;
  doc.text(`Nomor Registrasi Sistem: ${regNo}`, 105, 39.8, { align: 'center' });

  let y = 44.5;

  // Section Header Drawer Helper
  const drawSectionHeader = (title: string, currentY: number) => {
    doc.setFillColor(...bgLight);
    doc.rect(14, currentY, 182, 7, 'F');
    doc.setFillColor(...primaryGreen);
    doc.rect(14, currentY, 3, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(...primaryGreen);
    doc.text(title.toUpperCase(), 20, currentY + 4.8);
    return currentY + 7;
  };

  // Standard Row Drawer Helper (for Sections II & III)
  const drawRow = (label: string, value: string, currentY: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.3);
    doc.setTextColor(...textMuted);
    doc.text(label, 19, currentY);
    doc.text(':', 73, currentY);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...textDark);
    const wrapped = doc.splitTextToSize(value || '-', 117);
    doc.text(wrapped, 76, currentY);

    const lineHeight = 4.1;
    const extraHeight = Math.max(0, wrapped.length - 1) * lineHeight;
    return currentY + 5.2 + extraHeight;
  };

  // =========================================================================
  // SECTION I: BIODATA & IDENTITAS KEPENDUDUKAN (Tabel dengan Foto 3x4 Kanan)
  // =========================================================================
  const bioBodyTopY = drawSectionHeader('I. BIODATA & IDENTITAS KEPENDUDUKAN', y);

  // Foto 3x4 cm (30mm x 40mm) di sebelah kanan di dalam tabel Biodata
  const photoW = 30;
  const photoH = 40;
  const photoX = 196 - photoW - 4; // 162mm (4mm padding dari tepi kanan tabel 196mm)
  const photoY = bioBodyTopY + 3.5;
  const photoBottomZoneY = photoY + photoH + 5; // termasuk label caption kecil di bawah foto

  const fullName = (
    (member.anggota.gelar_depan ? `${member.anggota.gelar_depan} ` : '') +
    member.anggota.nama_lengkap +
    (member.anggota.gelar_belakang ? `, ${member.anggota.gelar_belakang}` : '')
  ).toUpperCase();

  const biodataRows: Array<[string, string]> = [
    ['Nama Lengkap (Sesuai KTP)', fullName],
    ['Nomor Induk Kependudukan (NIK)', member.anggota.nik || '-'],
    ['Nomor Induk Perangkat Desa (NIAP)', formatNIPDDisplay(member.anggota.nipd) || '-'],
    [
      'Tempat, Tanggal Lahir',
      `${member.anggota.tempat_lahir || '-'}, ${formatDateIndo(member.anggota.tanggal_lahir)}`,
    ],
    ['Jenis Kelamin', member.anggota.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'],
    ['Agama', member.anggota.agama || '-'],
    ['Pendidikan Terakhir', member.anggota.pendidikan_terakhir || '-'],
    ['Status Pernikahan', member.anggota.status_pernikahan || '-'],
    ['Nomor WhatsApp / HP', member.anggota.no_hp_wa || '-'],
    ['Email Resmi', member.anggota.email || '-'],
    ['Alamat Tempat Tinggal', member.anggota.alamat_rumah || '-'],
  ];

  let bioRowY = bioBodyTopY + 5;
  biodataRows.forEach(([label, val], idx) => {
    // Saat baris berada sejajar dengan kotak foto 3x4, batasi lebar nilai agar tidak bertabrakan dengan foto
    const isBesidePhoto = bioRowY < photoBottomZoneY;
    const valueMaxWidth = isBesidePhoto ? photoX - 70 - 4 : 196 - 70 - 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(...textMuted);
    doc.text(label, 18, bioRowY);
    doc.text(':', 67, bioRowY);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...textDark);
    const wrappedVal = doc.splitTextToSize(val || '-', valueMaxWidth);
    doc.text(wrappedVal, 70, bioRowY);

    const lineHeight = 3.9;
    const rowStep = 5.1 + Math.max(0, wrappedVal.length - 1) * lineHeight;
    const dividerY = bioRowY + rowStep - 3.6;

    if (idx < biodataRows.length - 1) {
      doc.setDrawColor(...rowDivider);
      doc.setLineWidth(0.2);
      const dividerEndX = dividerY < photoBottomZoneY ? photoX - 3 : 193;
      doc.line(17, dividerY, dividerEndX, dividerY);
    }

    bioRowY += rowStep;
  });

  const bioBodyBottomY = Math.max(bioRowY + 1, photoBottomZoneY + 2);

  // Outer Border Tabel Biodata (mengelilingi seluruh biodata & foto 3x4)
  doc.setDrawColor(...borderGray);
  doc.setLineWidth(0.35);
  doc.rect(14, bioBodyTopY, 182, bioBodyBottomY - bioBodyTopY, 'S');

  // Render Foto Anggota 3x4 cm di sebelah kanan dalam tabel Biodata
  if (memberPhotoAsset) {
    doc.setFillColor(255, 255, 255);
    doc.rect(photoX, photoY, photoW, photoH, 'F');
    doc.addImage(memberPhotoAsset.dataUrl, memberPhotoAsset.format, photoX, photoY, photoW, photoH);
    doc.setDrawColor(...primaryGreen);
    doc.setLineWidth(0.4);
    doc.rect(photoX, photoY, photoW, photoH, 'S');
  } else {
    doc.setFillColor(...bgLight);
    doc.setDrawColor(...borderGray);
    doc.setLineWidth(0.35);
    doc.rect(photoX, photoY, photoW, photoH, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...textMuted);
    doc.text('PAS FOTO', photoX + photoW / 2, photoY + photoH / 2 - 1.5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('3 x 4 cm', photoX + photoW / 2, photoY + photoH / 2 + 3, { align: 'center' });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...textMuted);
  doc.text('Foto Anggota (3x4 cm)', photoX + photoW / 2, photoY + photoH + 3.2, { align: 'center' });

  y = bioBodyBottomY + 3.5;

  // =========================================================================
  // SECTION II: PENEMPATAN WILAYAH TUGAS & FORMASI JABATAN
  // =========================================================================
  y = drawSectionHeader('II. PENEMPATAN WILAYAH TUGAS & FORMASI JABATAN', y) + 4.5;

  const idJabatan = Number(member.jabatanTerkini?.id_jabatan ?? member.jabatanRef?.id_jabatan ?? 0);
  const namaJabatanLower = (member.jabatanRef?.nama_jabatan || '').toLowerCase();
  const kategoriJabatan = member.jabatanRef?.kategori_jabatan || '';

  const isKepalaDesa =
    idJabatan === 10 ||
    kategoriJabatan === 'Kepala Desa' ||
    namaJabatanLower.includes('kepala desa') ||
    namaJabatanLower.includes('kades');

  const isStafPerangkatDesa =
    idJabatan === 9 ||
    kategoriJabatan === 'Staf Desa' ||
    namaJabatanLower.includes('staf');

  const isExemptFromPurnaTugas = isKepalaDesa || isStafPerangkatDesa;

  y = drawRow('Kecamatan', `Kec. ${member.kecamatan?.nama_kecamatan || '-'}`, y);
  y = drawRow('Desa / Kelurahan', `Desa ${member.desa?.nama_desa || '-'}`, y);
  y = drawRow('Formasi Jabatan Perangkat Desa', member.jabatanRef?.nama_jabatan || '-', y);
  y = drawRow('Nomor SK Pengangkatan', member.jabatanTerkini?.no_sk_pengangkatan || 'Belum terinput', y);
  y = drawRow('Tanggal SK Pengangkatan', formatDateIndo(member.jabatanTerkini?.tgl_sk_pengangkatan), y);
  y = drawRow('Terhitung Mulai Tanggal (TMT)', formatDateIndo(member.jabatanTerkini?.tmt_jabatan), y);
  y = drawRow('Usia Perangkat Desa', `${member.usia} Tahun`, y);

  // Tambahkan Tanggal Purna Tugas di atas Status Purna Tugas (Batas 60 Thn) kecuali Kepala Desa & Staf Perangkat Desa
  if (!isExemptFromPurnaTugas) {
    const { tanggalPurnaTugas } = calculateAgeAndRetirement(member.anggota.tanggal_lahir);
    const formattedPurnaTugas =
      tanggalPurnaTugas && tanggalPurnaTugas !== '-' ? formatDateIndo(tanggalPurnaTugas) : '-';
    y = drawRow('Tanggal Purna Tugas', formattedPurnaTugas, y);
  }

  y = drawRow('Status Purna Tugas (Batas 60 Thn)', member.statusPensiun, y);

  y += 2;

  // =========================================================================
  // SECTION III: KEANGGOTAAN PPDI & REKAM KAS IURAN
  // =========================================================================
  y = drawSectionHeader('III. KEANGGOTAAN PPDI & REKAM KAS IURAN', y) + 4.5;
  y = drawRow('Nomor KTA Digital PPDI', member.keanggotaan?.no_kta || 'KTA Pending', y);
  y = drawRow('Status Keabsahan KTA', member.keanggotaan?.status_kta || 'Pending', y);
  y = drawRow('Jabatan Kepengurusan PPDI', member.keanggotaan?.jabatan_pengurus || 'Anggota Biasa', y);
  y = drawRow('Tanggal Bergabung Organisasi', formatDateIndo(member.keanggotaan?.tgl_bergabung), y);
  y = drawRow('Total Kas Iuran Terverifikasi Lunas', formatRupiah(member.totalIuranLunas), y);

  // Divider Line
  y += 2.5;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(14, y, 196, y);
  y += 4.5;

  // Disclaimer text
  doc.setFontSize(7.4);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...textMuted);
  doc.text(
    'Dokumen ini dicetak secara sah melalui Sistem Informasi Database Induk Perangkat Desa PPDI Kab. Bandung.',
    14,
    y
  );
  doc.text(
    `Dicetak pada: ${new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })} WIB`,
    14,
    y + 3.8
  );

  // Signature Block (pastikan tidak melebihi batas bawah A4)
  const signY = Math.min(y + 8.5, 258);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...textDark);
  doc.text('Ditetapkan di: Kabupaten Bandung', 132, signY);
  doc.text('Pengurus Daerah PPDI Kab. Bandung', 132, signY + 4);

  // Box TTD / Stamp Placeholder
  doc.setDrawColor(...primaryGreen);
  doc.setFillColor(...bgLight);
  doc.setLineWidth(0.35);
  doc.roundedRect(132, signY + 6.5, 58, 15, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...emeraldAccent);
  doc.text('VALIDATED DIGITAL DOCUMENT', 161, signY + 12.2, { align: 'center' });
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...textMuted);
  doc.text('PERSATUAN PERANGKAT DESA INDONESIA', 161, signY + 17, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...textDark);
  doc.text('PENGURUS DAERAH PPDI KAB. BANDUNG', 132, signY + 26.5);

  // Save the PDF
  const cleanFileName = member.anggota.nama_lengkap.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  doc.save(`Profil_Anggota_PPDI_${cleanFileName}.pdf`);
}
