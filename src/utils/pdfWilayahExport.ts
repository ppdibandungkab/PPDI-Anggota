import jsPDF from 'jspdf';

export interface WilayahStatRow {
  id_kecamatan: string;
  nama_kecamatan: string;
  totalAnggota: number;
  ktaAktif: number;
  ktaPending: number;
  lakiLaki: number;
  perempuan: number;
  totalDesa: number;
  desaWithMembers: number;
  persentaseTotal: number;
}

export interface ExportWilayahPdfParams {
  rows: WilayahStatRow[];
  totalAnggotaKabupaten: number;
  avgAnggotaPerKecamatan: number;
  scopeLabel?: string;
  filterSummary?: string;
  printedBy?: string;
}

/**
 * Menghasilkan dan mengunduh laporan resmi Data Statistik Wilayah Per Kecamatan
 * dalam format PDF A4 siap cetak untuk kebutuhan pelaporan admin PPDI Kab. Bandung.
 */
export function exportStatistikWilayahToPDF(params: ExportWilayahPdfParams): string {
  const {
    rows,
    totalAnggotaKabupaten,
    avgAnggotaPerKecamatan,
    scopeLabel = 'Kabupaten Bandung (Seluruh Wilayah)',
    filterSummary = 'Semua Kecamatan',
    printedBy = 'Administrator PPDI',
  } = params;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const primaryGreen: [number, number, number] = [6, 78, 59]; // #064E3B
  const emeraldLight: [number, number, number] = [236, 253, 245]; // #ECFDF5
  const gold: [number, number, number] = [217, 119, 6]; // #D97706
  const textDark: [number, number, number] = [17, 24, 39];
  const textMuted: [number, number, number] = [107, 114, 128];
  const borderGray: [number, number, number] = [209, 213, 219];
  const zebraGray: [number, number, number] = [249, 250, 251];

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2; // 182mm

  const drawHeader = (isContinuation = false) => {
    doc.setFillColor(...primaryGreen);
    doc.rect(0, 0, pageWidth, isContinuation ? 18 : 26, 'F');

    doc.setFillColor(...gold);
    doc.rect(0, isContinuation ? 18 : 26, pageWidth, 1.8, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isContinuation ? 10 : 12.5);
    doc.text(
      'PERSATUAN PERANGKAT DESA INDONESIA (PPDI)',
      pageWidth / 2,
      isContinuation ? 8 : 10.5,
      { align: 'center' }
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(isContinuation ? 7.5 : 8.5);
    doc.text(
      'PENGURUS DAERAH KABUPATEN BANDUNG - PROVINSI JAWA BARAT',
      pageWidth / 2,
      isContinuation ? 13.5 : 16,
      { align: 'center' }
    );

    if (!isContinuation) {
      doc.setFontSize(7.5);
      doc.text(
        'LAPORAN RESMI STATISTIK & SEBARAN PERANGKAT DESA PER WILAYAH KECAMATAN',
        pageWidth / 2,
        21.2,
        { align: 'center' }
      );
    }
  };

  const drawTableHeader = (startY: number) => {
    doc.setFillColor(...primaryGreen);
    doc.rect(marginX, startY, contentWidth, 8, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);

    doc.text('No', marginX + 3, startY + 5.3);
    doc.text('Kode', marginX + 11, startY + 5.3);
    doc.text('Nama Kecamatan', marginX + 27, startY + 5.3);
    doc.text('Anggota', marginX + 86, startY + 5.3, { align: 'right' });
    doc.text('Porsi', marginX + 101, startY + 5.3, { align: 'right' });
    doc.text('KTA (Aktif/Pnd)', marginX + 125, startY + 5.3, { align: 'center' });
    doc.text('Gender (L/P)', marginX + 151, startY + 5.3, { align: 'center' });
    doc.text('Desa Aktif', marginX + 179, startY + 5.3, { align: 'right' });

    return startY + 8;
  };

  drawHeader(false);

  // Title & Metadata Block
  let y = 34;
  doc.setTextColor(...primaryGreen);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.text('REKAPITULASI DATA STATISTIK WILAYAH ANGGOTA PPDI', pageWidth / 2, y, {
    align: 'center',
  });

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...textMuted);
  const timestampStr = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.text(`Dicetak: ${timestampStr} WIB  |  Oleh: ${printedBy}`, pageWidth / 2, y, {
    align: 'center',
  });

  y += 4.2;
  doc.text(`Cakupan: ${scopeLabel}  |  Filter: ${filterSummary}`, pageWidth / 2, y, {
    align: 'center',
  });

  // Executive KPI Summary Cards (4 boxes)
  y += 6;
  const activeKecCount = rows.filter((r) => r.totalAnggota > 0).length;
  const totalKtaAktif = rows.reduce((sum, r) => sum + r.ktaAktif, 0);
  const totalKtaPending = rows.reduce((sum, r) => sum + r.ktaPending, 0);
  const topKec = [...rows].sort((a, b) => b.totalAnggota - a.totalAnggota)[0];

  const boxGap = 3;
  const boxWidth = (contentWidth - boxGap * 3) / 4;
  const boxHeight = 17;

  const summaryBoxes = [
    {
      label: 'TOTAL KECAMATAN',
      value: `${rows.length} Kec.`,
      sub: `${activeKecCount} Kec. Terdata Aktif`,
    },
    {
      label: 'TOTAL PERANGKAT',
      value: `${totalAnggotaKabupaten} Org`,
      sub: `Rata-rata ${avgAnggotaPerKecamatan} / kec`,
    },
    {
      label: 'STATUS KTA DIGITAL',
      value: `${totalKtaAktif} Aktif`,
      sub: `${totalKtaPending} Menunggu Validasi`,
    },
    {
      label: 'WILAYAH TERBANYAK',
      value: topKec ? topKec.nama_kecamatan.slice(0, 16) : '-',
      sub: `${topKec?.totalAnggota || 0} Perangkat Desa`,
    },
  ];

  summaryBoxes.forEach((box, idx) => {
    const bx = marginX + idx * (boxWidth + boxGap);
    doc.setFillColor(...emeraldLight);
    doc.setDrawColor(...borderGray);
    doc.roundedRect(bx, y, boxWidth, boxHeight, 1.8, 1.8, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...primaryGreen);
    doc.text(box.label, bx + 2.5, y + 4.5);

    doc.setFontSize(10);
    doc.setTextColor(...textDark);
    doc.text(box.value, bx + 2.5, y + 10.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...textMuted);
    doc.text(box.sub, bx + 2.5, y + 14.5);
  });

  y += boxHeight + 6;

  // Section Label
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...primaryGreen);
  doc.text(`RINCIAN DATA PER KECAMATAN (${rows.length} WILAYAH)`, marginX, y);
  y += 3;

  y = drawTableHeader(y);

  const rowHeight = 6.2;
  const bottomLimit = pageHeight - 24;

  rows.forEach((row, index) => {
    if (y + rowHeight > bottomLimit) {
      doc.addPage();
      drawHeader(true);
      y = 25;
      y = drawTableHeader(y);
    }

    if (index % 2 === 1) {
      doc.setFillColor(...zebraGray);
      doc.rect(marginX, y, contentWidth, rowHeight, 'F');
    }

    doc.setDrawColor(235, 238, 242);
    doc.line(marginX, y + rowHeight, marginX + contentWidth, y + rowHeight);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...textMuted);
    doc.text(String(index + 1), marginX + 3, y + 4.3);
    doc.text(String(row.id_kecamatan || '-'), marginX + 11, y + 4.3);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...textDark);
    const kecName =
      row.nama_kecamatan.length > 26
        ? `${row.nama_kecamatan.slice(0, 24)}..`
        : row.nama_kecamatan;
    doc.text(kecName, marginX + 27, y + 4.3);

    doc.text(String(row.totalAnggota), marginX + 86, y + 4.3, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...textMuted);
    doc.text(`${row.persentaseTotal}%`, marginX + 101, y + 4.3, { align: 'right' });

    doc.setTextColor(...textDark);
    doc.text(`${row.ktaAktif} / ${row.ktaPending}`, marginX + 125, y + 4.3, { align: 'center' });
    doc.text(`${row.lakiLaki}L · ${row.perempuan}P`, marginX + 151, y + 4.3, { align: 'center' });
    doc.text(`${row.desaWithMembers} / ${row.totalDesa}`, marginX + 179, y + 4.3, { align: 'right' });

    y += rowHeight;
  });

  // Grand Total Row
  const totalShownAnggota = rows.reduce((s, r) => s + r.totalAnggota, 0);
  const totalL = rows.reduce((s, r) => s + r.lakiLaki, 0);
  const totalP = rows.reduce((s, r) => s + r.perempuan, 0);
  const totalDesaAktif = rows.reduce((s, r) => s + r.desaWithMembers, 0);
  const totalDesaAll = rows.reduce((s, r) => s + r.totalDesa, 0);

  if (y + 8 > bottomLimit) {
    doc.addPage();
    drawHeader(true);
    y = 25;
  }

  doc.setFillColor(...emeraldLight);
  doc.setDrawColor(...primaryGreen);
  doc.rect(marginX, y, contentWidth, 7, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(...primaryGreen);
  doc.text(`TOTAL (${rows.length} KECAMATAN)`, marginX + 11, y + 4.8);
  doc.text(String(totalShownAnggota), marginX + 86, y + 4.8, { align: 'right' });
  doc.text('100%', marginX + 101, y + 4.8, { align: 'right' });
  doc.text(`${totalKtaAktif} / ${totalKtaPending}`, marginX + 125, y + 4.8, { align: 'center' });
  doc.text(`${totalL}L · ${totalP}P`, marginX + 151, y + 4.8, { align: 'center' });
  doc.text(`${totalDesaAktif} / ${totalDesaAll}`, marginX + 179, y + 4.8, { align: 'right' });

  y += 13;

  // Signature block (ensure enough room on page)
  if (y + 34 > pageHeight - 16) {
    doc.addPage();
    drawHeader(true);
    y = 28;
  }

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.3);
  doc.setTextColor(...textMuted);
  doc.text(
    'Dokumen laporan resmi ini dihasilkan secara otomatis oleh Sistem Informasi Data Induk PPDI Kab. Bandung.',
    marginX,
    y
  );

  const signX = 130;
  const signY = y + 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...textDark);
  doc.text('Ditetapkan di: Kabupaten Bandung', signX, signY);
  doc.text('Pengurus Daerah PPDI Kabupaten Bandung', signX, signY + 4.2);

  doc.setDrawColor(...primaryGreen);
  doc.setFillColor(245, 247, 246);
  doc.roundedRect(signX, signY + 7, 64, 14, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(...primaryGreen);
  doc.text('DOKUMEN STATISTIK TERVERIFIKASI', signX + 32, signY + 13, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...textMuted);
  doc.text('PPDI KABUPATEN BANDUNG', signX + 32, signY + 17.5, { align: 'center' });

  // Add page footers across all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...textMuted);
    doc.text(
      `PPDI Kabupaten Bandung · Laporan Statistik Wilayah`,
      marginX,
      pageHeight - 8
    );
    doc.text(`Halaman ${p} dari ${totalPages}`, pageWidth - marginX, pageHeight - 8, {
      align: 'right',
    });
  }

  const dateSlug = new Date().toISOString().slice(0, 10);
  const fileName = `Laporan_Statistik_Wilayah_PPDI_KabBandung_${dateSlug}.pdf`;
  doc.save(fileName);
  return fileName;
}
