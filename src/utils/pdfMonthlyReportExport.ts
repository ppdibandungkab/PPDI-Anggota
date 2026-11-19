import jsPDF from 'jspdf';
import {
  AnggotaFullDetail,
  IuranAnggota,
  PendaftaranPerangkatDesa,
  RefKecamatan,
  RiwayatJabatan,
} from '../types/ppdi';
import { formatRupiah } from './ppdiHelpers';

export interface MonthlyReportExportParams {
  bulan: number; // 1 - 12
  tahun: number;
  members: AnggotaFullDetail[];
  riwayatList: RiwayatJabatan[];
  iuranList: IuranAnggota[];
  pendaftaranList: PendaftaranPerangkatDesa[];
  kecamatanList: RefKecamatan[];
  scopeLabel?: string;
  printedBy?: string;
}

const NAMA_BULAN_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const cleanId = (id?: string | null) => (id ? String(id).replace(/\./g, '').trim() : '');

function isSameMonthYear(dateStr: string | undefined | null, bulan: number, tahun: number): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  return d.getMonth() + 1 === bulan && d.getFullYear() === tahun;
}

function isRealUploadedSk(fileSk?: string | null): boolean {
  const raw = (fileSk || '').trim();
  if (!raw) return false;
  return raw.startsWith('/uploads/') || raw.startsWith('data:') || /^https?:\/\//i.test(raw);
}

/**
 * Menghasilkan dan mengunduh Laporan Bulanan Resmi PPDI Kabupaten Bandung (Format A4 PDF)
 * langsung dari panel Quick Actions di Dashboard.
 */
export function exportMonthlyReportToPDF(params: MonthlyReportExportParams): string {
  const {
    bulan,
    tahun,
    members,
    riwayatList,
    iuranList,
    pendaftaranList,
    kecamatanList,
    scopeLabel = 'Kabupaten Bandung (Seluruh Wilayah)',
    printedBy = 'Administrator PPDI',
  } = params;

  const namaBulan = NAMA_BULAN_ID[(bulan - 1) % 12] || `Bulan ${bulan}`;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const primaryGreen: [number, number, number] = [6, 78, 59];
  const emeraldSoft: [number, number, number] = [236, 253, 245];
  const gold: [number, number, number] = [217, 119, 6];
  const textDark: [number, number, number] = [17, 24, 39];
  const textMuted: [number, number, number] = [100, 116, 139];
  const borderGray: [number, number, number] = [203, 213, 225];
  const zebraGray: [number, number, number] = [248, 250, 252];

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 14;
  const contentW = pageWidth - marginX * 2; // 182mm

  const drawHeader = (isCont = false) => {
    doc.setFillColor(...primaryGreen);
    doc.rect(0, 0, pageWidth, isCont ? 17 : 26, 'F');
    doc.setFillColor(...gold);
    doc.rect(0, isCont ? 17 : 26, pageWidth, 1.8, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isCont ? 10 : 12.5);
    doc.text('PERSATUAN PERANGKAT DESA INDONESIA (PPDI)', pageWidth / 2, isCont ? 7.5 : 10, {
      align: 'center',
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(isCont ? 7.5 : 8.5);
    doc.text(
      'PENGURUS DAERAH KABUPATEN BANDUNG - PROVINSI JAWA BARAT',
      pageWidth / 2,
      isCont ? 13 : 15.5,
      { align: 'center' }
    );

    if (!isCont) {
      doc.setFontSize(7.5);
      doc.text(
        `LAPORAN BULANAN KEANGGOTAAN, VERIFIKASI SK, & IURAN KAS — PERIODE ${namaBulan.toUpperCase()} ${tahun}`,
        pageWidth / 2,
        21,
        { align: 'center' }
      );
    }
  };

  drawHeader(false);

  let y = 34;

  // Title & Metadata Box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...primaryGreen);
  doc.text(`LAPORAN BULANAN PERIODE ${namaBulan.toUpperCase()} ${tahun}`, marginX, y);
  y += 4;

  const printDate = new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  doc.setFillColor(...emeraldSoft);
  doc.setDrawColor(167, 243, 208);
  doc.roundedRect(marginX, y, contentW, 14, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...textDark);
  doc.text(`Periode Laporan : ${namaBulan} ${tahun}`, marginX + 3.5, y + 5.2);
  doc.text(`Cakupan Wilayah : ${scopeLabel}`, marginX + 3.5, y + 10.2);
  doc.text(`Dicetak Oleh : ${printedBy}`, marginX + contentW - 3.5, y + 5.2, { align: 'right' });
  doc.text(`Tanggal Cetak : ${printDate}`, marginX + contentW - 3.5, y + 10.2, { align: 'right' });

  y += 20;

  // Compute Metrics Scoped to Members
  const memberIdSet = new Set<string | number>(members.map((m) => m.anggota.id_anggota));
  const totalAnggota = members.length;
  const jabatanAktifCount = members.filter((m) => m.jabatanTerkini?.status_aktif === 'Aktif').length;
  const ktaAktifCount = members.filter((m) => m.keanggotaan?.status_kta === 'Aktif').length;
  const ktaPendingCount = members.filter((m) => m.keanggotaan?.status_kta === 'Pending').length;
  const anggotaBaruBulanIni = members.filter(
    (m) =>
      isSameMonthYear(m.anggota.created_at, bulan, tahun) ||
      isSameMonthYear(m.keanggotaan?.tgl_bergabung, bulan, tahun)
  ).length;

  const pensiun6BulanMembers = members.filter((m) => {
    const isKades =
      m.jabatanRef?.kategori_jabatan === 'Kepala Desa' ||
      m.jabatanRef?.nama_jabatan?.toLowerCase().includes('kepala desa') ||
      m.jabatanRef?.nama_jabatan?.toLowerCase().includes('kades');
    if (isKades || m.statusPensiun === 'Sudah Purna Tugas') return false;
    const sisa = typeof m.sisaMasaPensiunBulan === 'number' ? m.sisaMasaPensiunBulan : (m.sisaMasaPensiunTahun || 0) * 12;
    return sisa >= 0 && sisa <= 6;
  });

  // Iuran Metrics for Selected Period
  const periodIuran = iuranList.filter(
    (i) => memberIdSet.has(i.id_anggota) && Number(i.bulan) === bulan && Number(i.tahun) === tahun
  );
  const iuranLunas = periodIuran.filter((i) => i.status_verifikasi === 'Lunas');
  const iuranPending = periodIuran.filter((i) => i.status_verifikasi === 'Pending');
  const iuranDitolak = periodIuran.filter((i) => i.status_verifikasi === 'Ditolak');
  const nominalIuranLunas = iuranLunas.reduce((sum, i) => sum + Number(i.jumlah || 0), 0);
  const kepatuhanIuranPct =
    jabatanAktifCount > 0 ? Math.min(100, Math.round((iuranLunas.length / jabatanAktifCount) * 100)) : 0;

  // SK & Pendaftaran Metrics
  const scopedRiwayat = riwayatList.filter((r) => memberIdSet.has(r.id_anggota));
  const skUploadedCount = scopedRiwayat.filter((r) => isRealUploadedSk(r.file_sk)).length;
  const skBelumUploadCount = Math.max(0, scopedRiwayat.length - skUploadedCount);
  const pendaftaranBulanIni = pendaftaranList.filter((p) =>
    isSameMonthYear(p.tgl_pendaftaran, bulan, tahun)
  );
  const pendaftaranMenunggu = pendaftaranList.filter((p) => p.status_approval === 'Menunggu').length;
  const pendaftaranDisetujuiBulanIni = pendaftaranBulanIni.filter(
    (p) => p.status_approval === 'Disetujui'
  ).length;

  const drawSectionHeading = (title: string) => {
    if (y > pageHeight - 40) {
      doc.addPage();
      drawHeader(true);
      y = 24;
    }
    doc.setFillColor(...primaryGreen);
    doc.rect(marginX, y, 2.2, 5.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...primaryGreen);
    doc.text(title, marginX + 4.5, y + 4);
    y += 7.5;
  };

  const drawStatGrid = (cards: Array<{ label: string; value: string; sub: string }>) => {
    const gap = 3;
    const cardW = (contentW - gap * (cards.length - 1)) / cards.length;
    const cardH = 18;

    cards.forEach((c, idx) => {
      const cx = marginX + idx * (cardW + gap);
      doc.setFillColor(...zebraGray);
      doc.setDrawColor(...borderGray);
      doc.roundedRect(cx, y, cardW, cardH, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(...textMuted);
      doc.text(c.label.toUpperCase(), cx + 2.5, y + 4.8);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(...textDark);
      const valText = doc.splitTextToSize(c.value, cardW - 5)[0] || c.value;
      doc.text(valText, cx + 2.5, y + 10.8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...textMuted);
      const subText = doc.splitTextToSize(c.sub, cardW - 5)[0] || c.sub;
      doc.text(subText, cx + 2.5, y + 15.2);
    });

    y += cardH + 6;
  };

  // SECTION I
  drawSectionHeading('I. RINGKASAN EKSEKUTIF KEANGGOTAAN & E-KTA');
  drawStatGrid([
    { label: 'Total Anggota', value: `${totalAnggota}`, sub: `${jabatanAktifCount} Jabatan Aktif` },
    { label: 'E-KTA Aktif', value: `${ktaAktifCount}`, sub: `${ktaPendingCount} Menunggu Validasi` },
    { label: 'Anggota Baru', value: `${anggotaBaruBulanIni}`, sub: `Periode ${namaBulan} ${tahun}` },
    { label: 'Pensiun <= 6 Bln', value: `${pensiun6BulanMembers.length}`, sub: 'Perlu Tindak Lanjut SK' },
  ]);

  // SECTION II
  drawSectionHeading(`II. REKAPITULASI IURAN KAS BULANAN (${namaBulan.toUpperCase()} ${tahun})`);
  drawStatGrid([
    { label: 'Kas Lunas Periode Ini', value: formatRupiah(nominalIuranLunas), sub: `${iuranLunas.length} Transaksi Lunas` },
    { label: 'Menunggu Verifikasi', value: `${iuranPending.length}`, sub: 'Transaksi Pending' },
    { label: 'Ditolak / Revisi', value: `${iuranDitolak.length}`, sub: 'Perlu Bukti Ulang' },
    { label: 'Kepatuhan Bayar', value: `${kepatuhanIuranPct}%`, sub: `Dari ${jabatanAktifCount} Aktif` },
  ]);

  // SECTION III
  drawSectionHeading('III. KELENGKAPAN ARSIP SK & ANTREAN PENDAFTARAN');
  drawStatGrid([
    { label: 'Total Riwayat SK', value: `${scopedRiwayat.length}`, sub: 'SK Pengangkatan/Mutasi' },
    { label: 'File SK Terunggah', value: `${skUploadedCount}`, sub: `${skBelumUploadCount} Belum Upload File` },
    { label: 'Pendaftaran Baru', value: `${pendaftaranBulanIni.length}`, sub: `${pendaftaranDisetujuiBulanIni} Disetujui Bulan Ini` },
    { label: 'Antrean Verifikasi', value: `${pendaftaranMenunggu}`, sub: 'Status Menunggu Approval' },
  ]);

  // SECTION IV: REKAP PER KECAMATAN (TOP 15 WITH MEMBERS)
  const kecRows = kecamatanList
    .map((k) => {
      const kClean = cleanId(k.id_kecamatan);
      const kMembers = members.filter(
        (m) => cleanId(m.kecamatan?.id_kecamatan || m.desa?.id_kecamatan) === kClean
      );
      const kMemberIds = new Set(kMembers.map((m) => m.anggota.id_anggota));
      const kIuranLunas = periodIuran.filter(
        (i) => kMemberIds.has(i.id_anggota) && i.status_verifikasi === 'Lunas'
      );
      const kNominal = kIuranLunas.reduce((s, i) => s + Number(i.jumlah || 0), 0);
      const kPensiun = pensiun6BulanMembers.filter(
        (m) => cleanId(m.kecamatan?.id_kecamatan || m.desa?.id_kecamatan) === kClean
      ).length;

      return {
        nama: k.nama_kecamatan,
        total: kMembers.length,
        ktaAktif: kMembers.filter((m) => m.keanggotaan?.status_kta === 'Aktif').length,
        pensiun: kPensiun,
        iuranCount: kIuranLunas.length,
        nominal: kNominal,
      };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  if (kecRows.length > 0) {
    drawSectionHeading('IV. REKAPITULASI WILAYAH KECAMATAN (CAKUPAN AKTIF)');

    const drawKecTableHeader = () => {
      doc.setFillColor(...primaryGreen);
      doc.rect(marginX, y, contentW, 7.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(255, 255, 255);
      doc.text('No', marginX + 3, y + 5);
      doc.text('Kecamatan', marginX + 12, y + 5);
      doc.text('Anggota', marginX + 86, y + 5, { align: 'right' });
      doc.text('E-KTA Aktif', marginX + 109, y + 5, { align: 'right' });
      doc.text('Pensiun <=6 Bln', marginX + 135, y + 5, { align: 'right' });
      doc.text('Iuran Lunas (Rp)', marginX + contentW - 3, y + 5, { align: 'right' });
      y += 7.5;
    };

    drawKecTableHeader();

    kecRows.forEach((row, idx) => {
      if (y > pageHeight - 24) {
        doc.addPage();
        drawHeader(true);
        y = 24;
        drawKecTableHeader();
      }
      if (idx % 2 === 1) {
        doc.setFillColor(...zebraGray);
        doc.rect(marginX, y, contentW, 6.2, 'F');
      }
      doc.setDrawColor(...borderGray);
      doc.setLineWidth(0.15);
      doc.line(marginX, y + 6.2, marginX + contentW, y + 6.2);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.3);
      doc.setTextColor(...textDark);
      doc.text(String(idx + 1), marginX + 3, y + 4.3);
      doc.text(`Kec. ${row.nama}`, marginX + 12, y + 4.3);
      doc.text(String(row.total), marginX + 86, y + 4.3, { align: 'right' });
      doc.text(String(row.ktaAktif), marginX + 109, y + 4.3, { align: 'right' });
      doc.text(String(row.pensiun), marginX + 135, y + 4.3, { align: 'right' });
      doc.text(
        `${formatRupiah(row.nominal)} (${row.iuranCount})`,
        marginX + contentW - 3,
        y + 4.3,
        { align: 'right' }
      );
      y += 6.2;
    });

    y += 7;
  }

  // SECTION V: PENGINGAT PENSIUN <= 6 BULAN
  if (pensiun6BulanMembers.length > 0) {
    drawSectionHeading('V. DAFTAR PRIORITAS PERANGKAT DESA PENSIUN <= 6 BULAN');

    const drawPensiunHeader = () => {
      doc.setFillColor(185, 28, 28);
      doc.rect(marginX, y, contentW, 7.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(255, 255, 255);
      doc.text('No', marginX + 3, y + 5);
      doc.text('Nama Perangkat Desa', marginX + 11, y + 5);
      doc.text('Jabatan', marginX + 78, y + 5);
      doc.text('Desa / Kecamatan', marginX + 118, y + 5);
      doc.text('Sisa Waktu', marginX + contentW - 3, y + 5, { align: 'right' });
      y += 7.5;
    };

    drawPensiunHeader();

    pensiun6BulanMembers.slice(0, 15).forEach((m, idx) => {
      if (y > pageHeight - 24) {
        doc.addPage();
        drawHeader(true);
        y = 24;
        drawPensiunHeader();
      }
      if (idx % 2 === 1) {
        doc.setFillColor(254, 242, 242);
        doc.rect(marginX, y, contentW, 6.2, 'F');
      }
      doc.setDrawColor(...borderGray);
      doc.setLineWidth(0.15);
      doc.line(marginX, y + 6.2, marginX + contentW, y + 6.2);

      const sisa =
        typeof m.sisaMasaPensiunBulan === 'number'
          ? m.sisaMasaPensiunBulan
          : (m.sisaMasaPensiunTahun || 0) * 12;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(...textDark);
      doc.text(String(idx + 1), marginX + 3, y + 4.3);
      doc.text(
        doc.splitTextToSize(m.anggota.nama_lengkap.toUpperCase(), 62)[0] || '-',
        marginX + 11,
        y + 4.3
      );
      doc.text(
        doc.splitTextToSize(m.jabatanRef?.nama_jabatan || '-', 36)[0] || '-',
        marginX + 78,
        y + 4.3
      );
      doc.text(
        doc.splitTextToSize(
          `${m.desa?.nama_desa || '-'}, ${m.kecamatan?.nama_kecamatan || '-'}`,
          42
        )[0] || '-',
        marginX + 118,
        y + 4.3
      );
      doc.text(`${sisa} Bln`, marginX + contentW - 3, y + 4.3, { align: 'right' });
      y += 6.2;
    });

    y += 8;
  }

  // Signature Block
  if (y > pageHeight - 40) {
    doc.addPage();
    drawHeader(true);
    y = 28;
  }
  const sigX = marginX + contentW - 65;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...textDark);
  doc.text(`Kabupaten Bandung, ${printDate}`, sigX, y + 4);
  doc.setFont('helvetica', 'bold');
  doc.text('Pengurus Daerah PPDI Kab. Bandung', sigX, y + 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...textMuted);
  doc.text('[Dokumen Laporan Bulanan Resmi Sistem]', sigX, y + 21);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...primaryGreen);
  doc.text(printedBy, sigX, y + 27);

  // Page numbers
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...textMuted);
    doc.text(
      `PPDI Kabupaten Bandung · Laporan Bulanan ${namaBulan} ${tahun} · Halaman ${p} dari ${totalPages}`,
      pageWidth / 2,
      pageHeight - 6,
      { align: 'center' }
    );
  }

  const mmStr = String(bulan).padStart(2, '0');
  const fileName = `Laporan_Bulanan_PPDI_${tahun}_${mmStr}.pdf`;
  doc.save(fileName);
  return fileName;
}
