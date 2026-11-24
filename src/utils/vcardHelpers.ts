import QRCode from 'qrcode';
import { AnggotaFullDetail } from '../types/ppdi';
import { formatNIPDDisplay } from './ppdiHelpers';

function escapeVCardText(value?: string | null): string {
  if (!value) return '';
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .trim();
}

export function normalizePhoneForVCard(phone?: string | null): string {
  if (!phone) return '';
  const cleaned = String(phone).replace(/[^0-9+]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('62')) return `+${cleaned}`;
  if (cleaned.startsWith('0')) return `+62${cleaned.slice(1)}`;
  return cleaned;
}

export function getFullNameWithTitles(member: AnggotaFullDetail): string {
  const parts = [
    member.anggota.gelar_depan ? `${member.anggota.gelar_depan.trim()} ` : '',
    (member.anggota.nama_lengkap || '').trim(),
    member.anggota.gelar_belakang ? `, ${member.anggota.gelar_belakang.trim()}` : '',
  ];
  return parts.join('').replace(/\s+/g, ' ').trim();
}

/**
 * Generates an RFC 2426 compliant vCard 3.0 string for a PPDI member.
 * Concise text-only format guarantees crisp, reliable QR scanning on Android & iOS.
 */
export function buildMemberVCard(member: AnggotaFullDetail): string {
  const rawName = (member.anggota.nama_lengkap || '').trim();
  const nameTokens = rawName.split(/\s+/).filter(Boolean);
  const firstName = nameTokens.length > 1 ? nameTokens.slice(0, -1).join(' ') : rawName;
  const lastName = nameTokens.length > 1 ? nameTokens[nameTokens.length - 1] : '';

  const prefix = (member.anggota.gelar_depan || '').trim();
  const suffix = (member.anggota.gelar_belakang || '').trim();
  const formattedName = getFullNameWithTitles(member);

  const desaName = member.desa?.nama_desa ? `Desa ${member.desa.nama_desa}` : '';
  const kecName = member.kecamatan?.nama_kecamatan ? `Kec. ${member.kecamatan.nama_kecamatan}` : '';
  const unitKerja = [desaName, kecName].filter(Boolean).join(', ');
  const orgValue = unitKerja
    ? `PPDI Kabupaten Bandung;${escapeVCardText(unitKerja)}`
    : 'PPDI Kabupaten Bandung';

  const jabatanPerangkat = member.jabatanRef?.nama_jabatan || 'Perangkat Desa';
  const jabatanPpdi = member.keanggotaan?.jabatan_pengurus || 'Anggota Biasa';
  const titleValue =
    jabatanPpdi && jabatanPpdi !== 'Anggota Biasa'
      ? `${jabatanPerangkat} (${jabatanPpdi} PPDI)`
      : jabatanPerangkat;

  const phone = normalizePhoneForVCard(member.anggota.no_hp_wa);
  const email = (member.anggota.email || '').trim();
  const street = (member.anggota.alamat_rumah || '').trim();
  const noKta = member.keanggotaan?.no_kta || '-';
  const nipdFormatted = formatNIPDDisplay(member.anggota.nipd) || '-';
  const statusKta = member.keanggotaan?.status_kta || 'Aktif';

  const noteParts = [
    `No. KTA PPDI: ${noKta}`,
    nipdFormatted !== '-' ? `NIAP/NIPD: ${nipdFormatted}` : '',
    `Jabatan PPDI: ${jabatanPpdi}`,
    `Status KTA: ${statusKta}`,
  ].filter(Boolean);

  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${escapeVCardText(lastName)};${escapeVCardText(firstName)};;${escapeVCardText(prefix)};${escapeVCardText(suffix)}`,
    `FN:${escapeVCardText(formattedName)}`,
    `ORG:${orgValue}`,
    `TITLE:${escapeVCardText(titleValue)}`,
  ];

  if (phone) {
    lines.push(`TEL;TYPE=CELL,VOICE:${phone}`);
  }
  if (email) {
    lines.push(`EMAIL;TYPE=INTERNET:${escapeVCardText(email)}`);
  }
  if (street || unitKerja) {
    lines.push(
      `ADR;TYPE=HOME:;;${escapeVCardText(street)};${escapeVCardText(unitKerja || 'Kabupaten Bandung')};Jawa Barat;;Indonesia`
    );
  }
  lines.push(`NOTE:${escapeVCardText(noteParts.join(' | '))}`);
  lines.push('END:VCARD');

  return lines.join('\r\n');
}

/**
 * Generates raw scannable QR code PNG data URL for a vCard string.
 */
export async function generateRawVCardQrDataUrl(vcardString: string): Promise<string> {
  return QRCode.toDataURL(vcardString, {
    width: 440,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#064e3b',
      light: '#ffffff',
    },
  });
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Composes a clean, printable/shareable PNG card containing the member's vCard QR Code
 * and key contact metadata so admins can immediately share via WhatsApp or print.
 */
export async function composeVCardQrCardPng(
  qrDataUrl: string,
  member: AnggotaFullDetail
): Promise<string> {
  const width = 720;
  const height = 940;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return qrDataUrl;

  // Card background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Subtle outer border
  ctx.strokeStyle = '#d1fae5';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, width - 4, height - 4);

  // Top emerald header band
  ctx.fillStyle = '#065f46';
  ctx.fillRect(0, 0, width, 128);

  // Accent bar
  ctx.fillStyle = '#d97706';
  ctx.fillRect(0, 128, width, 6);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#a7f3d0';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('PERSATUAN PERANGKAT DESA INDONESIA (PPDI)', width / 2, 48);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('KARTU KONTAK DIGITAL (vCard QR)', width / 2, 86);

  ctx.fillStyle = '#d1fae5';
  ctx.font = '15px sans-serif';
  ctx.fillText('Kabupaten Bandung · Pindai QR untuk menyimpan kontak', width / 2, 112);

  // Member name & title
  const fullName = getFullNameWithTitles(member).toUpperCase();
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 26px sans-serif';
  const nameLines = wrapCanvasText(ctx, fullName, width - 96).slice(0, 2);
  let cursorY = 182;
  for (const line of nameLines) {
    ctx.fillText(line, width / 2, cursorY);
    cursorY += 32;
  }

  const jabatan = member.jabatanRef?.nama_jabatan || 'Perangkat Desa';
  const wilayah = [
    member.desa?.nama_desa ? `Desa ${member.desa.nama_desa}` : '',
    member.kecamatan?.nama_kecamatan ? `Kec. ${member.kecamatan.nama_kecamatan}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  ctx.fillStyle = '#047857';
  ctx.font = 'bold 19px sans-serif';
  ctx.fillText(jabatan, width / 2, cursorY + 4);

  if (wilayah) {
    ctx.fillStyle = '#4b5563';
    ctx.font = '16px sans-serif';
    ctx.fillText(wilayah, width / 2, cursorY + 30);
  }

  // QR Container Frame
  const qrSize = 420;
  const qrX = (width - qrSize) / 2;
  const qrY = cursorY + 56;

  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(qrX - 24, qrY - 24, qrSize + 48, qrSize + 48, 20);
  ctx.fill();
  ctx.stroke();

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = qrDataUrl;
  });
  ctx.drawImage(img, qrX, qrY, qrSize, qrSize);

  // Footer details
  const footerStartY = qrY + qrSize + 58;
  ctx.fillStyle = '#065f46';
  ctx.font = 'bold 18px monospace';
  ctx.fillText(`NO. KTA: ${member.keanggotaan?.no_kta || 'BELUM TERBIT'}`, width / 2, footerStartY);

  const phoneDisplay = member.anggota.no_hp_wa ? `WA/Telp: ${member.anggota.no_hp_wa}` : '';
  const emailDisplay = member.anggota.email ? `Email: ${member.anggota.email}` : '';
  const contactLine = [phoneDisplay, emailDisplay].filter(Boolean).join('   |   ');
  if (contactLine) {
    ctx.fillStyle = '#374151';
    ctx.font = '15px sans-serif';
    ctx.fillText(contactLine, width / 2, footerStartY + 30);
  }

  ctx.fillStyle = '#9ca3af';
  ctx.font = '13px sans-serif';
  ctx.fillText('Format vCard 3.0 · Kompatibel dengan Kamera Android & iOS', width / 2, height - 28);

  return canvas.toDataURL('image/png');
}

export function buildSafeFileSlug(name: string): string {
  return (name || 'anggota')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'anggota';
}

/**
 * Generates high-error-correction scannable QR code PNG data URL for a member's public KTA verification URL.
 */
export async function generateKtaVerifyQrDataUrl(verifyUrl: string): Promise<string> {
  return QRCode.toDataURL(verifyUrl, {
    width: 440,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: {
      dark: '#064e3b',
      light: '#ffffff',
    },
  });
}

/**
 * Composes an official printable/shareable PNG card containing the unique member KTA verification QR Code
 * keyed by ID Anggota.
 */
export async function composeKtaVerifyQrCardPng(
  qrDataUrl: string,
  member: AnggotaFullDetail,
  verifyUrl: string
): Promise<string> {
  const width = 720;
  const height = 960;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return qrDataUrl;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#a7f3d0';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, width - 4, height - 4);

  // Top emerald header band
  ctx.fillStyle = '#064e3b';
  ctx.fillRect(0, 0, width, 134);

  // Gold accent bar
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(0, 134, width, 6);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#a7f3d0';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('PERSATUAN PERANGKAT DESA INDONESIA (PPDI)', width / 2, 46);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('QR VERIFIKASI KEABSAHAN E-KTA', width / 2, 86);

  ctx.fillStyle = '#d1fae5';
  ctx.font = '15px sans-serif';
  ctx.fillText('Kabupaten Bandung · Pindai untuk cek keabsahan anggota resmi', width / 2, 114);

  // Member Name & Position
  const fullName = getFullNameWithTitles(member).toUpperCase();
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 26px sans-serif';
  const nameLines = wrapCanvasText(ctx, fullName, width - 96).slice(0, 2);
  let cursorY = 188;
  for (const line of nameLines) {
    ctx.fillText(line, width / 2, cursorY);
    cursorY += 32;
  }

  const jabatan = member.jabatanRef?.nama_jabatan || 'Perangkat Desa';
  const wilayah = [
    member.desa?.nama_desa ? `Desa ${member.desa.nama_desa}` : '',
    member.kecamatan?.nama_kecamatan ? `Kec. ${member.kecamatan.nama_kecamatan}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  ctx.fillStyle = '#047857';
  ctx.font = 'bold 19px sans-serif';
  ctx.fillText(jabatan, width / 2, cursorY + 4);

  if (wilayah) {
    ctx.fillStyle = '#4b5563';
    ctx.font = '16px sans-serif';
    ctx.fillText(wilayah, width / 2, cursorY + 30);
  }

  // QR Container Frame
  const qrSize = 420;
  const qrX = (width - qrSize) / 2;
  const qrY = cursorY + 56;

  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#d1fae5';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(qrX - 24, qrY - 24, qrSize + 48, qrSize + 48, 20);
  ctx.fill();
  ctx.stroke();

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = qrDataUrl;
  });
  ctx.drawImage(img, qrX, qrY, qrSize, qrSize);

  // Footer details
  const footerStartY = qrY + qrSize + 56;
  ctx.fillStyle = '#065f46';
  ctx.font = 'bold 18px monospace';
  ctx.fillText(
    `ID ANGGOTA: #${member.anggota.id_anggota}  |  NO. KTA: ${member.keanggotaan?.no_kta || 'PENDING'}`,
    width / 2,
    footerStartY
  );

  ctx.fillStyle = '#374151';
  ctx.font = '13px monospace';
  const truncatedUrl = verifyUrl.length > 74 ? `${verifyUrl.slice(0, 71)}...` : verifyUrl;
  ctx.fillText(truncatedUrl, width / 2, footerStartY + 30);

  ctx.fillStyle = '#9ca3af';
  ctx.font = '13px sans-serif';
  ctx.fillText('Pindai dengan Kamera Ponsel untuk membuka Portal Verifikasi Resmi PPDI', width / 2, height - 28);

  return canvas.toDataURL('image/png');
}
