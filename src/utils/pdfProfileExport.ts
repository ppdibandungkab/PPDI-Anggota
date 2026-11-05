import jsPDF from 'jspdf';
import { AnggotaFullDetail } from '../types/ppdi';
import { formatDateIndo, formatRupiah } from './ppdiHelpers';

/**
 * Generates and downloads a formal PDF Member Profile Document using jsPDF
 */
export function exportMemberProfileToPDF(member: AnggotaFullDetail): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const primaryGreen = [6, 78, 59]; // #064E3B
  const emeraldAccent = [5, 150, 105]; // #059669
  const gold = [217, 119, 6]; // #D97706
  const textDark = [17, 24, 39]; // #111827
  const textMuted = [107, 114, 128]; // #6B7280
  const bgLight = [243, 244, 246]; // #F3F4F6

  // 1. Top Header Bar
  doc.setFillColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
  doc.rect(0, 0, 210, 26, 'F');

  doc.setFillColor(gold[0], gold[1], gold[2]);
  doc.rect(0, 26, 210, 2, 'F');

  // Header Copy
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('PERSATUAN PERANGKAT DESA INDONESIA (PPDI)', 105, 11, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('PENGURUS DAERAH KABUPATEN BANDUNG - PROVINSI JAWA BARAT', 105, 16.5, { align: 'center' });

  doc.setFontSize(7.5);
  doc.text('PORTAL DATABASE INDUK & SYSTEM E-KTA DIGITAL PERANGKAT DESA', 105, 21.5, { align: 'center' });

  // 2. Document Title Box
  doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('LEMBAR BIODATA & PROFIL RESMI ANGGOTA', 105, 36, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.setFont('helvetica', 'normal');
  const regNo = `REG-PPDI/${(member.anggota.nik || '000000').slice(-6)}/${new Date().getFullYear()}`;
  doc.text(`Nomor Registrasi Sistem: ${regNo}`, 105, 41, { align: 'center' });

  let y = 48;

  // Section Header Drawer Helper
  const drawSectionHeader = (title: string, currentY: number) => {
    doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
    doc.rect(14, currentY, 182, 7, 'F');
    doc.setFillColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.rect(14, currentY, 3, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text(title.toUpperCase(), 20, currentY + 4.8);
    return currentY + 10;
  };

  // Row Drawer Helper
  const drawRow = (label: string, value: string, currentY: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text(label, 20, currentY);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text(value || '-', 78, currentY);
    return currentY + 5.5;
  };

  // SECTION I: BIODATA & IDENTITAS KEPENDUDUKAN
  y = drawSectionHeader('I. BIODATA & IDENTITAS KEPENDUDUKAN', y);
  const fullName = (
    (member.anggota.gelar_depan ? `${member.anggota.gelar_depan} ` : '') +
    member.anggota.nama_lengkap +
    (member.anggota.gelar_belakang ? `, ${member.anggota.gelar_belakang}` : '')
  ).toUpperCase();

  y = drawRow('Nama Lengkap (Sesuai KTP)', fullName, y);
  y = drawRow('Nomor Induk Kependudukan (NIK)', member.anggota.nik || '-', y);
  y = drawRow('Nomor Induk Perangkat Desa (NIAP)', member.anggota.nipd || '-', y);
  y = drawRow(
    'Tempat, Tanggal Lahir',
    `${member.anggota.tempat_lahir || '-'}, ${formatDateIndo(member.anggota.tanggal_lahir)}`,
    y
  );
  y = drawRow('Jenis Kelamin', member.anggota.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan', y);
  y = drawRow('Agama', member.anggota.agama || '-', y);
  y = drawRow('Pendidikan Terakhir', member.anggota.pendidikan_terakhir || '-', y);
  y = drawRow('Status Pernikahan', member.anggota.status_pernikahan || '-', y);
  y = drawRow('Nomor WhatsApp / HP', member.anggota.no_hp_wa || '-', y);
  y = drawRow('Email Resmi', member.anggota.email || '-', y);
  y = drawRow('Alamat Tempat Tinggal', member.anggota.alamat_rumah || '-', y);

  y += 2;

  // SECTION II: PENEMPATAN WILAYAH TUGAS & FORMASI JABATAN
  y = drawSectionHeader('II. PENEMPATAN WILAYAH TUGAS & FORMASI JABATAN', y);
  y = drawRow('Kecamatan', `Kec. ${member.kecamatan?.nama_kecamatan || '-'}`, y);
  y = drawRow('Desa / Kelurahan', `Desa ${member.desa?.nama_desa || '-'}`, y);
  y = drawRow('Formasi Jabatan Perangkat Desa', member.jabatanRef?.nama_jabatan || '-', y);
  y = drawRow('Nomor SK Pengangkatan', member.jabatanTerkini?.no_sk_pengangkatan || 'Belum terinput', y);
  y = drawRow('Tanggal SK Pengangkatan', formatDateIndo(member.jabatanTerkini?.tgl_sk_pengangkatan), y);
  y = drawRow('Terhitung Mulai Tanggal (TMT)', formatDateIndo(member.jabatanTerkini?.tmt_jabatan), y);
  y = drawRow('Usia Perangkat Desa', `${member.usia} Tahun`, y);
  y = drawRow('Status Purna Tugas (Batas 60 Thn)', member.statusPensiun, y);

  y += 2;

  // SECTION III: KEANGGOTAAN PPDI & REKAM KAS IURAN
  y = drawSectionHeader('III. KEANGGOTAAN PPDI & REKAM KAS IURAN', y);
  y = drawRow('Nomor KTA Digital PPDI', member.keanggotaan?.no_kta || 'KTA Pending', y);
  y = drawRow('Status Keabsahan KTA', member.keanggotaan?.status_kta || 'Pending', y);
  y = drawRow('Jabatan Kepengurusan PPDI', member.keanggotaan?.jabatan_pengurus || 'Anggota Biasa', y);
  y = drawRow('Tanggal Bergabung Organisasi', formatDateIndo(member.keanggotaan?.tgl_bergabung), y);
  y = drawRow('Total Kas Iuran Terverifikasi Lunas', formatRupiah(member.totalIuranLunas), y);

  // Divider Line
  y += 4;
  doc.setDrawColor(220, 220, 220);
  doc.line(14, y, 196, y);
  y += 5;

  // Disclaimer text
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
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

  // Signature Block
  const signY = y + 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('Ditetapkan di: Kabupaten Bandung', 132, signY);
  doc.text('Pengurus Daerah PPDI Kab. Bandung', 132, signY + 4);

  // Box TTD / Stamp Placeholder
  doc.setDrawColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
  doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
  doc.roundedRect(132, signY + 7, 58, 16, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(emeraldAccent[0], emeraldAccent[1], emeraldAccent[2]);
  doc.text('VALIDATED DIGITAL DOCUMENT', 161, signY + 13, { align: 'center' });
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('PERSATUAN PERANGKAT DESA INDONESIA', 161, signY + 18, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('PENGURUS DAERAH PPDI KAB. BANDUNG', 132, signY + 28);

  // Save the PDF
  const cleanFileName = member.anggota.nama_lengkap.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  doc.save(`Profil_Anggota_PPDI_${cleanFileName}.pdf`);
}
