import ExcelJS from 'exceljs';
import { AnggotaFullDetail } from '../types/ppdi';

/**
 * Utility to export full list of PPDI members to formatted Excel (.xlsx) file
 */
export async function exportAnggotaToExcel(members: AnggotaFullDetail[], customFilename?: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PPDI Kabupaten Bandung';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Data Anggota PPDI', {
    pageSetup: { paperSize: 9, orientation: 'landscape' },
  });

  // Title Row
  worksheet.mergeCells('A1:AB1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'DATA INDUK ANGGOTA PERANGKAT DESA - PPDI KABUPATEN BANDUNG';
  titleCell.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF064E3B' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 30;

  // Subtitle Row
  worksheet.mergeCells('A2:AB2');
  const subCell = worksheet.getCell('A2');
  subCell.value = `Tanggal Ekspor: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })} | Total Rekaman: ${members.length} Anggota`;
  subCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF064E3B' } };
  subCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(2).height = 20;

  worksheet.addRow([]); // Blank spacer

  // Table Headers
  const headers = [
    'No',
    'NIK',
    'NIAP / NIPD',
    'Nama Lengkap',
    'Gelar Depan',
    'Gelar Belakang',
    'Tempat Lahir',
    'Tanggal Lahir',
    'Usia (Thn)',
    'Jenis Kelamin',
    'Agama',
    'Pendidikan Terakhir',
    'No HP / WhatsApp',
    'Email',
    'Kecamatan',
    'Desa',
    'Jabatan Perangkat Desa',
    'Kategori SOTK',
    'No. SK Pengangkatan',
    'Tgl SK Pengangkatan',
    'TMT Jabatan',
    'Status Keaktifan',
    'Nomor KTA PPDI',
    'Status E-KTA',
    'Jabatan Pengurus PPDI',
    'Tanggal Purna Tugas (60 Th)',
    'Status Masa Pensiun',
    'Total Iuran Lunas (Rp)',
  ];

  const headerRow = worksheet.addRow(headers);
  headerRow.height = 25;
  headerRow.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF047857' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'medium', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };
  });

  // Populate Data Rows
  members.forEach((m, idx) => {
    const purnaDateStr = m.anggota.tanggal_lahir
      ? new Date(new Date(m.anggota.tanggal_lahir).setFullYear(new Date(m.anggota.tanggal_lahir).getFullYear() + 60)).toISOString().split('T')[0]
      : '-';

    const rowData = [
      idx + 1,
      m.anggota.nik,
      m.anggota.nipd || '-',
      m.anggota.nama_lengkap,
      m.anggota.gelar_depan || '',
      m.anggota.gelar_belakang || '',
      m.anggota.tempat_lahir,
      m.anggota.tanggal_lahir,
      m.usia,
      m.anggota.jenis_kelamin === 'L' ? 'Laki-Laki' : 'Perempuan',
      m.anggota.agama || 'Islam',
      m.anggota.pendidikan_terakhir || 'SMA/SMK',
      m.anggota.no_hp_wa,
      m.anggota.email || '-',
      m.kecamatan?.nama_kecamatan || '-',
      m.desa?.nama_desa || '-',
      m.jabatanRef?.nama_jabatan || '-',
      m.jabatanRef?.kategori_jabatan || '-',
      m.jabatanTerkini?.no_sk_pengangkatan || '-',
      m.jabatanTerkini?.tgl_sk_pengangkatan || '-',
      m.jabatanTerkini?.tmt_jabatan || '-',
      m.jabatanTerkini?.status_aktif || '-',
      m.keanggotaan?.no_kta || '-',
      m.keanggotaan?.status_kta || '-',
      m.keanggotaan?.jabatan_pengurus || '-',
      purnaDateStr,
      m.statusPensiun,
      m.totalIuranLunas || 0,
    ];

    const row = worksheet.addRow(rowData);
    row.height = 20;
    row.font = { name: 'Arial', size: 9 };

    // Zebra striping for even rows
    const isEven = idx % 2 === 0;
    const bgPattern = isEven ? 'FFFFFFFF' : 'FFF9FAFB';

    row.eachCell((cell, colNumber) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgPattern } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };

      if (colNumber === 1 || colNumber === 9) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colNumber === 2 || colNumber === 3 || colNumber === 23) {
        cell.numFmt = '@'; // Explicit text format for NIK / NIPD / KTA
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      } else if (colNumber === 28) {
        cell.numFmt = 'Rp #,##0';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });
  });

  // Auto-calculate column widths
  worksheet.columns.forEach((column) => {
    let maxLen = 12;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > maxLen) maxLen = len;
    });
    column.width = Math.min(maxLen + 3, 36);
  });

  // Generate binary output and trigger browser file download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const dateTag = new Date().toISOString().slice(0, 10);
  const filename = customFilename || `DATA_ANGGOTA_PPDI_KAB_BANDUNG_${dateTag}.xlsx`;

  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

/**
 * Utility to export member list to standard CSV file
 */
export function exportAnggotaToCSV(members: AnggotaFullDetail[], customFilename?: string) {
  const headers = [
    'No',
    'NIK',
    'NIAP / NIPD',
    'Nama Lengkap',
    'Gelar Depan',
    'Gelar Belakang',
    'Tempat Lahir',
    'Tanggal Lahir',
    'Usia',
    'Jenis Kelamin',
    'Agama',
    'Pendidikan Terakhir',
    'No HP / WhatsApp',
    'Email',
    'Kecamatan',
    'Desa',
    'Jabatan',
    'Kategori SOTK',
    'No SK Pengangkatan',
    'TMT Jabatan',
    'Status Keaktifan',
    'No KTA PPDI',
    'Status KTA',
    'Jabatan Pengurus',
    'Status Masa Pensiun',
    'Total Iuran Lunas',
  ];

  const rows = members.map((m, idx) => [
    idx + 1,
    `'${m.anggota.nik}`,
    m.anggota.nipd ? `'${m.anggota.nipd}` : '-',
    `"${m.anggota.nama_lengkap}"`,
    m.anggota.gelar_depan || '',
    m.anggota.gelar_belakang || '',
    m.anggota.tempat_lahir,
    m.anggota.tanggal_lahir,
    m.usia,
    m.anggota.jenis_kelamin === 'L' ? 'Laki-Laki' : 'Perempuan',
    m.anggota.agama || 'Islam',
    m.anggota.pendidikan_terakhir || 'SMA/SMK',
    m.anggota.no_hp_wa,
    m.anggota.email || '-',
    m.kecamatan?.nama_kecamatan || '-',
    m.desa?.nama_desa || '-',
    `"${m.jabatanRef?.nama_jabatan || '-'}"`,
    m.jabatanRef?.kategori_jabatan || '-',
    `"${m.jabatanTerkini?.no_sk_pengangkatan || '-'}"`,
    m.jabatanTerkini?.tmt_jabatan || '-',
    m.jabatanTerkini?.status_aktif || '-',
    m.keanggotaan?.no_kta || '-',
    m.keanggotaan?.status_kta || '-',
    `"${m.keanggotaan?.jabatan_pengurus || '-'}"`,
    m.statusPensiun,
    m.totalIuranLunas || 0,
  ]);

  const csvContent =
    'data:text/csv;charset=utf-8,\uFEFF' +
    [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  const dateTag = new Date().toISOString().slice(0, 10);
  link.setAttribute(
    'download',
    customFilename || `DATA_ANGGOTA_PPDI_KAB_BANDUNG_${dateTag}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
