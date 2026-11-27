import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import { AnggotaFullDetail } from '../types/ppdi';
import { formatDateIndo, parseCalendarDateParts } from './ppdiHelpers';

export interface RetirementCategorySummary {
  h3bulan: number;
  kritis: number;
  siaga: number;
  waspada: number;
  sudah: number;
  total: number;
}

export interface ExportPurnaTugasParams {
  members: AnggotaFullDetail[];
  categoryLabel: string;
  categorySlug?: string;
  summary: RetirementCategorySummary;
  notifiedMap?: Record<string, { timestamp: string; status: string; category?: string }>;
  printedBy?: string;
  referenceDateLabel?: string;
}

const REFERENCE_DATE_LOCAL = new Date(2026, 9, 14); // 2026-10-14

export function computeRetirementDeadline(birthDateStr?: string): {
  tanggalPurnaTugas: string;
  sisaHari: number;
} {
  const parts = parseCalendarDateParts(birthDateStr);
  if (!parts) {
    return { tanggalPurnaTugas: '-', sisaHari: 9999 };
  }
  const retireDate = new Date(parts.year + 60, parts.month - 1, parts.day);
  const diffMs = retireDate.getTime() - REFERENCE_DATE_LOCAL.getTime();
  const sisaHari = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const tanggalPurnaTugas = `${retireDate.getFullYear()}-${String(retireDate.getMonth() + 1).padStart(2, '0')}-${String(retireDate.getDate()).padStart(2, '0')}`;
  return { tanggalPurnaTugas, sisaHari };
}

function getLocalDateTag(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatFullName(m: AnggotaFullDetail): string {
  const front = m.anggota.gelar_depan ? `${m.anggota.gelar_depan} ` : '';
  const name = (m.anggota.nama_lengkap || '').toUpperCase();
  const back = m.anggota.gelar_belakang ? `, ${m.anggota.gelar_belakang}` : '';
  return `${front}${name}${back}`.trim();
}

function formatSisaJabatan(m: AnggotaFullDetail): string {
  if (m.statusPensiun === 'Sudah Purna Tugas') {
    return 'Genap 60 Tahun';
  }
  const thn = m.sisaMasaPensiunTahun;
  const bln = m.sisaMasaPensiunBulan % 12;
  if (thn <= 0) return `${bln} Bulan`;
  return `${thn} Thn ${bln} Bln`;
}

function isH3Bulan(m: AnggotaFullDetail): boolean {
  if (m.statusPensiun === 'Sudah Purna Tugas') return false;
  if (m.sisaMasaPensiunBulan > 0 && m.sisaMasaPensiunBulan <= 3) return true;
  const { sisaHari } = computeRetirementDeadline(m.anggota.tanggal_lahir);
  return sisaHari > 0 && sisaHari <= 92;
}

function truncateText(text: string, maxChars: number): string {
  if (!text) return '-';
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

/**
 * Menghasilkan dan mengunduh laporan resmi Data Purna Tugas (Usia 60 Tahun)
 * dalam format Excel (.xlsx) berformat siap cetak.
 */
export async function exportPurnaTugasToExcel(params: ExportPurnaTugasParams): Promise<string> {
  const {
    members,
    categoryLabel,
    categorySlug = 'semua',
    summary,
    notifiedMap = {},
    printedBy = 'Administrator PPDI',
    referenceDateLabel = '14 Oktober 2026',
  } = params;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PPDI Kabupaten Bandung';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Data Purna Tugas', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  // Title Row
  worksheet.mergeCells('A1:P1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'LAPORAN DATA PURNA TUGAS & PERINGATAN DINI PENSIUN PERANGKAT DESA - PPDI KABUPATEN BANDUNG';
  titleCell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF064E3B' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 28;

  // Subtitle Row
  worksheet.mergeCells('A2:P2');
  const subCell = worksheet.getCell('A2');
  const exportTimestamp = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  subCell.value = `Kategori: ${categoryLabel} | Total Data: ${members.length} Perangkat Desa | Kalkulasi per: ${referenceDateLabel} | Dicetak: ${exportTimestamp} oleh ${printedBy}`;
  subCell.font = { name: 'Arial', size: 9.5, italic: true, color: { argb: 'FF064E3B' } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
  subCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(2).height = 20;

  // KPI Summary Strip Row
  worksheet.mergeCells('A3:P3');
  const kpiCell = worksheet.getCell('A3');
  kpiCell.value = `Ringkasan Wilayah — H-3 Bulan: ${summary.h3bulan} Orang  |  Kritis (<6 Bln): ${summary.kritis} Orang  |  Siaga (<1 Thn): ${summary.siaga} Orang  |  Waspada (<2 Thn): ${summary.waspada} Orang  |  Sudah Purna Tugas (≥60 Thn): ${summary.sudah} Orang  |  Regulasi: UU No. 3 Tahun 2024`;
  kpiCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF78350F' } };
  kpiCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
  kpiCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(3).height = 20;

  worksheet.addRow([]); // Spacer row 4

  const headers = [
    'No',
    'NIK',
    'NIPD',
    'Nama Lengkap',
    'Jabatan',
    'Desa',
    'Kecamatan',
    'No. HP / WhatsApp',
    'Tanggal Lahir',
    'Usia (Thn)',
    'Estimasi Purna Tugas (60 Th)',
    'Sisa Masa Jabatan',
    'Status Pensiun',
    'Prioritas H-3 Bln',
    'No. KTA PPDI',
    'Status Notifikasi WA',
  ];

  const headerRow = worksheet.addRow(headers);
  headerRow.height = 26;
  headerRow.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF047857' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF064E3B' } },
      bottom: { style: 'medium', color: { argb: 'FF064E3B' } },
      left: { style: 'thin', color: { argb: 'FF064E3B' } },
      right: { style: 'thin', color: { argb: 'FF064E3B' } },
    };
  });

  members.forEach((m, idx) => {
    const { tanggalPurnaTugas } = computeRetirementDeadline(m.anggota.tanggal_lahir);
    const h3 = isH3Bulan(m);
    const notif = notifiedMap[m.anggota.id_anggota];
    const notifLabel = notif
      ? `Terkirim (${new Date(notif.timestamp).toLocaleDateString('id-ID')})`
      : h3
      ? 'Belum Dinotifikasi'
      : '-';

    const row = worksheet.addRow([
      idx + 1,
      String(m.anggota.nik || '-'),
      String(m.anggota.nipd || '-'),
      formatFullName(m),
      m.jabatanRef?.nama_jabatan || '-',
      m.desa?.nama_desa || '-',
      m.kecamatan?.nama_kecamatan || '-',
      String(m.anggota.no_hp_wa || '-'),
      formatDateIndo(m.anggota.tanggal_lahir),
      m.usia,
      formatDateIndo(tanggalPurnaTugas),
      formatSisaJabatan(m),
      m.statusPensiun,
      h3 ? 'YA (≤ 3 Bln)' : '-',
      m.keanggotaan?.no_kta || '-',
      notifLabel,
    ]);

    row.height = 20;
    row.font = { name: 'Arial', size: 9 };
    const rowBg = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF9FAFB';

    row.eachCell((cell, colNumber) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };

      if (colNumber === 1 || colNumber === 9 || colNumber === 10 || colNumber === 11 || colNumber === 14) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colNumber === 2 || colNumber === 3 || colNumber === 8 || colNumber === 15) {
        cell.numFmt = '@';
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      } else if (colNumber === 13) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        if (m.statusPensiun === 'Kritis (<6 Bln)') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
          cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF991B1B' } };
        } else if (m.statusPensiun === 'Siaga (<1 Thn)') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
          cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF92400E' } };
        } else if (m.statusPensiun === 'Waspada (<2 Thn)') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
          cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF854D0E' } };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
          cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF374151' } };
        }
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }

      if (colNumber === 14 && h3) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE4E6' } };
        cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF9F1239' } };
      }
    });
  });

  // Set explicit balanced widths
  const widths = [5, 19, 26, 28, 22, 18, 18, 16, 14, 10, 18, 16, 18, 14, 22, 20];
  widths.forEach((w, i) => {
    const col = worksheet.getColumn(i + 1);
    col.width = w;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const filename = `LAPORAN_PURNA_TUGAS_${categorySlug.toUpperCase()}_PPDI_${getLocalDateTag()}.xlsx`;
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);

  return filename;
}

/**
 * Menghasilkan dan mengunduh laporan resmi Data Purna Tugas (Usia 60 Tahun)
 * dalam format PDF A4 Landscape siap cetak.
 */
export function exportPurnaTugasToPDF(params: ExportPurnaTugasParams): string {
  const {
    members,
    categoryLabel,
    categorySlug = 'semua',
    summary,
    printedBy = 'Administrator PPDI',
    referenceDateLabel = '14 Oktober 2026',
  } = params;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const primaryGreen: [number, number, number] = [6, 78, 59]; // #064E3B
  const gold: [number, number, number] = [217, 119, 6]; // #D97706
  const textDark: [number, number, number] = [17, 24, 39];
  const textMuted: [number, number, number] = [100, 116, 139];
  const borderGray: [number, number, number] = [209, 213, 219];
  const zebraGray: [number, number, number] = [249, 250, 251];

  const pageWidth = 297;
  const pageHeight = 210;
  const marginX = 12;
  const contentWidth = pageWidth - marginX * 2; // 273mm

  // Column X offsets & widths summing to 273mm
  const cols = {
    no: { x: marginX, w: 9 },
    nama: { x: marginX + 9, w: 54 },
    jabatan: { x: marginX + 63, w: 38 },
    wilayah: { x: marginX + 101, w: 46 },
    wa: { x: marginX + 147, w: 28 },
    lahir: { x: marginX + 175, w: 21 },
    purna: { x: marginX + 196, w: 22 },
    usia: { x: marginX + 218, w: 12 },
    sisa: { x: marginX + 230, w: 21 },
    status: { x: marginX + 251, w: 22 },
  };

  const drawPageHeader = (isContinuation = false) => {
    const headerH = isContinuation ? 15 : 23;
    doc.setFillColor(...primaryGreen);
    doc.rect(0, 0, pageWidth, headerH, 'F');

    doc.setFillColor(...gold);
    doc.rect(0, headerH, pageWidth, 1.5, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isContinuation ? 9.5 : 12);
    doc.text(
      'PERSATUAN PERANGKAT DESA INDONESIA (PPDI) KABUPATEN BANDUNG',
      pageWidth / 2,
      isContinuation ? 7 : 9.5,
      { align: 'center' }
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(isContinuation ? 7.5 : 8.5);
    doc.text(
      'LAPORAN DATA PURNA TUGAS & PERINGATAN DINI BATAS USIA PENSIUN PERANGKAT DESA (USIA 60 TAHUN)',
      pageWidth / 2,
      isContinuation ? 11.8 : 15,
      { align: 'center' }
    );

    if (!isContinuation) {
      doc.setFontSize(7.5);
      doc.setTextColor(253, 230, 138);
      doc.text(
        'Berdasarkan UU No. 3 Tahun 2024 tentang Desa (Kepala Desa & Staf Perangkat Desa Dikecualikan)',
        pageWidth / 2,
        19.8,
        { align: 'center' }
      );
    }
  };

  const drawTableHeader = (startY: number) => {
    doc.setFillColor(...primaryGreen);
    doc.rect(marginX, startY, contentWidth, 8, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.3);

    const textY = startY + 5.2;
    doc.text('No', cols.no.x + cols.no.w / 2, textY, { align: 'center' });
    doc.text('Nama Perangkat & NIK', cols.nama.x + 2, textY);
    doc.text('Jabatan', cols.jabatan.x + 2, textY);
    doc.text('Desa & Kecamatan', cols.wilayah.x + 2, textY);
    doc.text('No. WA', cols.wa.x + 2, textY);
    doc.text('Tgl Lahir', cols.lahir.x + cols.lahir.w / 2, textY, { align: 'center' });
    doc.text('Tgl Purna', cols.purna.x + cols.purna.w / 2, textY, { align: 'center' });
    doc.text('Usia', cols.usia.x + cols.usia.w / 2, textY, { align: 'center' });
    doc.text('Sisa Masa', cols.sisa.x + cols.sisa.w / 2, textY, { align: 'center' });
    doc.text('Status', cols.status.x + cols.status.w / 2, textY, { align: 'center' });

    return startY + 8;
  };

  drawPageHeader(false);

  // Metadata line
  let y = 30.5;
  const timestampStr = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...primaryGreen);
  doc.text(`REKAPITULASI KATEGORI: ${categoryLabel.toUpperCase()} (${members.length} ORANG)`, marginX, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...textMuted);
  doc.text(
    `Kalkulasi per: ${referenceDateLabel}  |  Dicetak: ${timestampStr} WIB  |  Oleh: ${printedBy}`,
    pageWidth - marginX,
    y,
    { align: 'right' }
  );

  // 5 KPI Summary Cards
  y += 3.5;
  const boxGap = 3;
  const boxWidth = (contentWidth - boxGap * 4) / 5;
  const boxHeight = 14.5;

  const kpiBoxes: Array<{
    label: string;
    value: string;
    sub: string;
    bg: [number, number, number];
    border: [number, number, number];
    accent: [number, number, number];
  }> = [
    {
      label: 'H-3 BULAN (<= 3 BLN)',
      value: `${summary.h3bulan} Orang`,
      sub: 'Prioritas notifikasi WA',
      bg: [255, 241, 242],
      border: [253, 164, 175],
      accent: [159, 18, 57],
    },
    {
      label: 'KRITIS (< 6 BULAN)',
      value: `${summary.kritis} Orang`,
      sub: 'Persiapan SK Pensiun',
      bg: [254, 242, 242],
      border: [252, 165, 165],
      accent: [153, 27, 27],
    },
    {
      label: 'SIAGA (< 1 TAHUN)',
      value: `${summary.siaga} Orang`,
      sub: 'Kaderisasi desa',
      bg: [255, 251, 235],
      border: [252, 211, 77],
      accent: [146, 64, 14],
    },
    {
      label: 'WASPADA (< 2 TAHUN)',
      value: `${summary.waspada} Orang`,
      sub: 'Usia 58 - 59 tahun',
      bg: [254, 252, 232],
      border: [253, 224, 71],
      accent: [133, 77, 14],
    },
    {
      label: 'SUDAH PURNA (>= 60 TH)',
      value: `${summary.sudah} Orang`,
      sub: 'Purna tugas terkonfirmasi',
      bg: [243, 244, 246],
      border: [209, 213, 219],
      accent: [55, 65, 81],
    },
  ];

  kpiBoxes.forEach((box, idx) => {
    const bx = marginX + idx * (boxWidth + boxGap);
    doc.setFillColor(...box.bg);
    doc.setDrawColor(...box.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(bx, y, boxWidth, boxHeight, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...box.accent);
    doc.text(box.label, bx + 3, y + 4.3);

    doc.setFontSize(10.5);
    doc.setTextColor(...textDark);
    doc.text(box.value, bx + 3, y + 9.6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.3);
    doc.setTextColor(...textMuted);
    doc.text(box.sub, bx + 3, y + 13);
  });

  y += boxHeight + 4.5;
  y = drawTableHeader(y);

  const rowHeight = 9.2;
  const bottomLimit = pageHeight - 16;

  if (members.length === 0) {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...borderGray);
    doc.rect(marginX, y, contentWidth, 14, 'FD');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(...textMuted);
    doc.text('Tidak ada data perangkat desa pada kategori purna tugas ini.', pageWidth / 2, y + 8.5, {
      align: 'center',
    });
    y += 14;
  } else {
    members.forEach((m, idx) => {
      if (y + rowHeight > bottomLimit) {
        doc.addPage();
        drawPageHeader(true);
        y = drawTableHeader(21);
      }

      const h3 = isH3Bulan(m);
      const { tanggalPurnaTugas } = computeRetirementDeadline(m.anggota.tanggal_lahir);

      // Row background
      if (h3) {
        doc.setFillColor(255, 241, 242);
      } else if (idx % 2 === 1) {
        doc.setFillColor(...zebraGray);
      } else {
        doc.setFillColor(255, 255, 255);
      }
      doc.setDrawColor(...borderGray);
      doc.setLineWidth(0.2);
      doc.rect(marginX, y, contentWidth, rowHeight, 'FD');

      // No
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(...textDark);
      doc.text(String(idx + 1), cols.no.x + cols.no.w / 2, y + 5.3, { align: 'center' });

      // Nama & NIK
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(...textDark);
      const displayName = truncateText(formatFullName(m), 31);
      doc.text(displayName, cols.nama.x + 2, y + 4);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.3);
      doc.setTextColor(...textMuted);
      const nikLine = h3 ? `NIK: ${m.anggota.nik}  [H-3 BLN]` : `NIK: ${m.anggota.nik}`;
      doc.text(nikLine, cols.nama.x + 2, y + 7.6);

      // Jabatan
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.1);
      doc.setTextColor(...textDark);
      doc.text(truncateText(m.jabatanRef?.nama_jabatan || '-', 22), cols.jabatan.x + 2, y + 5.3);

      // Wilayah (Desa & Kec)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...textDark);
      doc.text(truncateText(`Desa ${m.desa?.nama_desa || '-'}`, 26), cols.wilayah.x + 2, y + 4);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.3);
      doc.setTextColor(...textMuted);
      doc.text(truncateText(`Kec. ${m.kecamatan?.nama_kecamatan || '-'}`, 27), cols.wilayah.x + 2, y + 7.6);

      // No WA
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...textDark);
      doc.text(truncateText(m.anggota.no_hp_wa || '-', 16), cols.wa.x + 2, y + 5.3);

      // Tgl Lahir
      doc.text(formatDateIndo(m.anggota.tanggal_lahir), cols.lahir.x + cols.lahir.w / 2, y + 5.3, {
        align: 'center',
      });

      // Tgl Purna
      doc.setFont('helvetica', 'bold');
      doc.text(formatDateIndo(tanggalPurnaTugas), cols.purna.x + cols.purna.w / 2, y + 5.3, {
        align: 'center',
      });

      // Usia
      doc.setFont('helvetica', 'bold');
      doc.text(`${m.usia} Th`, cols.usia.x + cols.usia.w / 2, y + 5.3, { align: 'center' });

      // Sisa Masa
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.text(formatSisaJabatan(m), cols.sisa.x + cols.sisa.w / 2, y + 5.3, { align: 'center' });

      // Status Pensiun
      let statusColor: [number, number, number] = [55, 65, 81];
      let shortStatus = 'Purna Tugas';
      if (m.statusPensiun === 'Kritis (<6 Bln)') {
        statusColor = [153, 27, 27];
        shortStatus = 'Kritis (<6B)';
      } else if (m.statusPensiun === 'Siaga (<1 Thn)') {
        statusColor = [146, 64, 14];
        shortStatus = 'Siaga (<1T)';
      } else if (m.statusPensiun === 'Waspada (<2 Thn)') {
        statusColor = [133, 77, 14];
        shortStatus = 'Waspada (<2T)';
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(...statusColor);
      doc.text(shortStatus, cols.status.x + cols.status.w / 2, y + 5.3, { align: 'center' });

      y += rowHeight;
    });
  }

  // Signature block on last page (add page if insufficient room)
  if (y + 26 > pageHeight - 12) {
    doc.addPage();
    drawPageHeader(true);
    y = 26;
  } else {
    y += 7;
  }

  const sigX = pageWidth - marginX - 68;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(...textDark);
  const signDate = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  doc.text(`Soreang, ${signDate}`, sigX, y);
  doc.text('Pengurus Daerah PPDI Kabupaten Bandung', sigX, y + 4.2);
  doc.setFont('helvetica', 'bold');
  doc.text(printedBy, sigX, y + 18);
  doc.setDrawColor(...textDark);
  doc.setLineWidth(0.25);
  doc.line(sigX, y + 19, sigX + 58, y + 19);

  // Page numbers & footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...borderGray);
    doc.setLineWidth(0.2);
    doc.line(marginX, pageHeight - 10, pageWidth - marginX, pageHeight - 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...textMuted);
    doc.text(
      'Sistem Informasi Database & E-KTA PPDI Kabupaten Bandung — Laporan Data Purna Tugas',
      marginX,
      pageHeight - 6
    );
    doc.text(`Halaman ${p} dari ${totalPages}`, pageWidth - marginX, pageHeight - 6, {
      align: 'right',
    });
  }

  const filename = `LAPORAN_PURNA_TUGAS_${categorySlug.toUpperCase()}_PPDI_${getLocalDateTag()}.pdf`;
  doc.save(filename);
  return filename;
}
