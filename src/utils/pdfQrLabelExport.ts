import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { AnggotaFullDetail } from '../types/ppdi';
import { generateKtaShortUrl } from './qrCrypto';

export type QrLabelSizePreset = 'compact' | 'medium' | 'large';

export interface QrLabelItemData {
  member: AnggotaFullDetail;
  qrDataUrl: string;
  shortUrl: string;
  shortToken: string;
  uniqueSerial: string;
  barcodeBars: number[]; // Array of bar widths (in units 1..3), alternating dark/light starting dark
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
export async function buildMemberQrLabelData(member: AnggotaFullDetail): Promise<QrLabelItemData> {
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

  const uniqueSerial = cleanKta;
  const barcodeBars = buildDeterministicBarcodePattern(`${cleanNik}-${cleanKta}`);

  return {
    member,
    qrDataUrl,
    shortUrl: url,
    shortToken: token,
    uniqueSerial,
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
  nameFontSize: number;
  metaFontSize: number;
  barcodeHeight: number;
}

const PRESET_LAYOUTS: Record<QrLabelSizePreset, PresetLayout> = {
  compact: {
    cols: 3,
    rows: 8,
    gapX: 4,
    gapY: 3.5,
    marginX: 10,
    marginTop: 14,
    qrSize: 19,
    nameFontSize: 7.5,
    metaFontSize: 5.8,
    barcodeHeight: 3.2,
  },
  medium: {
    cols: 3,
    rows: 6,
    gapX: 5,
    gapY: 4.5,
    marginX: 10,
    marginTop: 15,
    qrSize: 23,
    nameFontSize: 8.5,
    metaFontSize: 6.4,
    barcodeHeight: 4,
  },
  large: {
    cols: 2,
    rows: 5,
    gapX: 7,
    gapY: 5.5,
    marginX: 12,
    marginTop: 16,
    qrSize: 30,
    nameFontSize: 10.5,
    metaFontSize: 7.5,
    barcodeHeight: 5.2,
  },
};

export interface ExportQrLabelsPdfOptions {
  items: QrLabelItemData[];
  sizePreset: QrLabelSizePreset;
  appName?: string;
  show1DBarcode?: boolean;
}

/**
 * Generates an A4 print-ready PDF containing grid sheets of unique member QR & barcode labels.
 */
export function exportQrLabelsToPDF({
  items,
  sizePreset,
  appName = 'PPDI KAB. BANDUNG',
  show1DBarcode = true,
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

  const footerSpace = 10;
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
      pageHeight - 5,
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
    const headerH = sizePreset === 'compact' ? 4.2 : sizePreset === 'medium' ? 4.8 : 5.6;
    doc.setFillColor(6, 78, 59);
    doc.roundedRect(x, y, labelW, headerH, 1.5, 1.5, 'F');
    // Square off bottom corners of header strip
    doc.rect(x, y + headerH - 1.5, labelW, 1.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(sizePreset === 'compact' ? 5.2 : sizePreset === 'medium' ? 5.8 : 6.8);
    doc.setTextColor(253, 224, 71);
    doc.text(appName.toUpperCase().slice(0, 28), x + 2, y + headerH - 1.3);

    const statusKta = (item.member.keanggotaan?.status_kta || 'Pending').toUpperCase();
    doc.setTextColor(255, 255, 255);
    doc.text(statusKta, x + labelW - 2, y + headerH - 1.3, { align: 'right' });

    // Content area coordinates
    const innerPad = 2;
    const contentTop = y + headerH + 1.5;
    const qrX = x + innerPad;
    const qrY = contentTop;
    const qrSize = Math.min(layout.qrSize, labelH - headerH - (show1DBarcode ? layout.barcodeHeight + 5 : 4));

    // QR Code image
    if (item.qrDataUrl) {
      doc.addImage(item.qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
    }

    // Member text block on right of QR
    const textX = qrX + qrSize + 2.2;
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
    const nameLines = doc.splitTextToSize(fullName || '-', textMaxW).slice(0, 2);
    doc.text(nameLines, textX, contentTop + 2.6);

    const afterNameY = contentTop + 2.6 + nameLines.length * (layout.nameFontSize * 0.42) + 0.6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(layout.metaFontSize);
    doc.setTextColor(51, 65, 85);

    const jabatan = item.member.jabatanRef?.nama_jabatan || 'Perangkat Desa';
    const jabatanLines = doc.splitTextToSize(jabatan, textMaxW).slice(0, 1);
    doc.text(jabatanLines, textX, afterNameY);

    const wilayah = [
      item.member.desa?.nama_desa ? `Ds. ${item.member.desa.nama_desa}` : '',
      item.member.kecamatan?.nama_kecamatan ? `Kec. ${item.member.kecamatan.nama_kecamatan}` : '',
    ]
      .filter(Boolean)
      .join(', ');
    const wilayahLines = doc.splitTextToSize(wilayah || 'Kab. Bandung', textMaxW).slice(0, 1);
    doc.setTextColor(100, 116, 139);
    doc.text(wilayahLines, textX, afterNameY + layout.metaFontSize * 0.48);

    doc.setFont('courier', 'bold');
    doc.setFontSize(layout.metaFontSize);
    doc.setTextColor(6, 78, 59);
    const ktaDisplay = `KTA: ${item.uniqueSerial}`.slice(0, 26);
    doc.text(ktaDisplay, textX, afterNameY + layout.metaFontSize * 0.98);

    doc.setFont('courier', 'normal');
    doc.setTextColor(71, 85, 105);
    const nikDisplay = `NIK: ${item.member.anggota.nik || '-'}`.slice(0, 24);
    doc.text(nikDisplay, textX, afterNameY + layout.metaFontSize * 1.45);

    // Optional 1D visual barcode strip at the bottom of the label
    if (show1DBarcode) {
      const barAreaW = labelW - innerPad * 2;
      const barY = y + labelH - layout.barcodeHeight - 1.6;
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
