import { Anggota, RiwayatJabatan, KeanggotaanPPDI, RefDesa, RefKecamatan, RefJabatan, AnggotaFullDetail, IuranAnggota, WhatsAppSettings } from '../types/ppdi';
import { generateKtaShortUrl } from './qrCrypto';

// Reference date for 2026-10-14
const TODAY = new Date('2026-10-14T00:00:00Z');

export function calculateAgeAndRetirement(birthDateStr: string): {
  usia: number;
  sisaTahun: number;
  sisaBulan: number;
  statusPensiun: 'Aman' | 'Waspada (<2 Thn)' | 'Siaga (<1 Thn)' | 'Kritis (<6 Bln)' | 'Sudah Purna Tugas';
  tanggalPurnaTugas: string;
} {
  const birthDate = new Date(birthDateStr);
  if (isNaN(birthDate.getTime())) {
    return {
      usia: 0,
      sisaTahun: 60,
      sisaBulan: 720,
      statusPensiun: 'Aman',
      tanggalPurnaTugas: '-',
    };
  }

  // Usia pensiun perangkat desa sesuai regulasi UU Desa adalah 60 tahun
  const retirementDate = new Date(birthDate);
  retirementDate.setFullYear(birthDate.getFullYear() + 60);

  // Age calculation
  let age = TODAY.getFullYear() - birthDate.getFullYear();
  const m = TODAY.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && TODAY.getDate() < birthDate.getDate())) {
    age--;
  }

  // Difference in months to retirement
  const totalMonthsDiff =
    (retirementDate.getFullYear() - TODAY.getFullYear()) * 12 +
    (retirementDate.getMonth() - TODAY.getMonth());

  const sisaTahun = Math.max(0, Math.floor(totalMonthsDiff / 12));
  const sisaBulan = Math.max(0, totalMonthsDiff);

  let statusPensiun: 'Aman' | 'Waspada (<2 Thn)' | 'Siaga (<1 Thn)' | 'Kritis (<6 Bln)' | 'Sudah Purna Tugas';

  if (TODAY >= retirementDate || totalMonthsDiff <= 0) {
    statusPensiun = 'Sudah Purna Tugas';
  } else if (totalMonthsDiff <= 6) {
    statusPensiun = 'Kritis (<6 Bln)';
  } else if (totalMonthsDiff <= 12) {
    statusPensiun = 'Siaga (<1 Thn)';
  } else if (totalMonthsDiff <= 24) {
    statusPensiun = 'Waspada (<2 Thn)';
  } else {
    statusPensiun = 'Aman';
  }

  const tanggalPurnaTugas = retirementDate.toISOString().split('T')[0];

  return {
    usia: Math.max(0, age),
    sisaTahun,
    sisaBulan,
    statusPensiun,
    tanggalPurnaTugas,
  };
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateIndo(dateStr?: string): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      const parts = dateStr.split(/[-/]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
        }
        return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
      }
      return dateStr;
    }
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
}

export function formatDateShort(dateStr?: string): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      // If already YYYY-MM-DD or similar
      const parts = dateStr.split(/[-/]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          // YYYY-MM-DD -> DD/MM/YYYY
          return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
        }
        return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
      }
      return dateStr;
    }
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
}

export function formatNamaLengkap(anggota: { nama_lengkap: string; gelar_depan?: string; gelar_belakang?: string }): string {
  const front = anggota.gelar_depan ? `${anggota.gelar_depan} ` : '';
  const name = (anggota.nama_lengkap || '').toUpperCase();
  const back = anggota.gelar_belakang ? `, ${anggota.gelar_belakang}` : '';
  return `${front}${name}${back}`;
}

export function buildFullMember(
  anggota: Anggota,
  riwayatList: RiwayatJabatan[],
  keanggotaanList: KeanggotaanPPDI[],
  desaList: RefDesa[],
  kecamatanList: RefKecamatan[],
  jabatanList: RefJabatan[],
  iuranList: IuranAnggota[]
): AnggotaFullDetail {
  // Ensure nama_lengkap is always uppercase
  const upperAnggota: Anggota = {
    ...anggota,
    nama_lengkap: (anggota.nama_lengkap || '').toUpperCase(),
  };

  // Find latest or active riwayat
  const riwayats = riwayatList.filter(
    (r) => String(r.id_anggota).toLowerCase() === String(upperAnggota.id_anggota).toLowerCase()
  );
  const activeRiwayat = riwayats.find((r) => r.status_aktif === 'Aktif') || riwayats[0];

  const cleanRiwayatDesa = activeRiwayat ? String(activeRiwayat.id_desa || '').replace(/\./g, '').trim() : '';
  const foundDesa = activeRiwayat
    ? desaList.find(
        (d) =>
          d.id_desa === activeRiwayat.id_desa ||
          String(d.id_desa || '').replace(/\./g, '').trim() === cleanRiwayatDesa
      )
    : undefined;

  const cleanDesaKec = foundDesa
    ? String(foundDesa.id_kecamatan || '').replace(/\./g, '').trim()
    : (cleanRiwayatDesa.length >= 6 ? cleanRiwayatDesa.slice(0, 6) : '');

  const kecamatan = (foundDesa || cleanDesaKec)
    ? kecamatanList.find(
        (k) =>
          (foundDesa && k.id_kecamatan === foundDesa.id_kecamatan) ||
          String(k.id_kecamatan || '').replace(/\./g, '').trim() === cleanDesaKec
      )
    : undefined;

  const desa: RefDesa | undefined = foundDesa || (activeRiwayat?.id_desa ? {
    id_desa: activeRiwayat.id_desa,
    id_kecamatan: cleanDesaKec,
    nama_desa: `Desa ${cleanRiwayatDesa.slice(-4) || cleanRiwayatDesa}`,
    alamat_kantor_desa: '-',
  } : undefined);

  const jabatanRef: RefJabatan | undefined = activeRiwayat
    ? (jabatanList.find((j) => Number(j.id_jabatan) === Number(activeRiwayat.id_jabatan)) || {
        id_jabatan: Number(activeRiwayat.id_jabatan) || 1,
        nama_jabatan: 'Perangkat Desa',
        kategori_jabatan: 'Pelaksana Teknis',
      })
    : undefined;

  const keanggotaan = keanggotaanList.find(
    (k) => String(k.id_anggota).toLowerCase() === String(upperAnggota.id_anggota).toLowerCase()
  );

  const retirement = calculateAgeAndRetirement(upperAnggota.tanggal_lahir);

  const isKepalaDesa = 
    jabatanRef?.kategori_jabatan === 'Kepala Desa' ||
    jabatanRef?.nama_jabatan?.toLowerCase().includes('kepala desa') ||
    jabatanRef?.nama_jabatan?.toLowerCase().includes('kades');

  // Jabatan Kepala Desa mengikuti periodisasi masa jabatan (UU Desa), bukan batas usia pensiun 60 tahun perangkat desa.
  // Oleh karena itu Kepala Desa tidak dimasukkan ke dalam filter/peringatan dini masa purna tugas.
  const effectiveStatusPensiun = isKepalaDesa
    ? 'Aman'
    : (activeRiwayat?.status_aktif === 'Purna Tugas' ? 'Sudah Purna Tugas' : retirement.statusPensiun);

  const totalIuranLunas = iuranList
    .filter((i) => i.id_anggota === upperAnggota.id_anggota && i.status_verifikasi === 'Lunas')
    .reduce((sum, item) => sum + item.jumlah, 0);

  return {
    anggota: upperAnggota,
    jabatanTerkini: activeRiwayat,
    desa,
    kecamatan,
    jabatanRef,
    keanggotaan,
    usia: retirement.usia,
    sisaMasaPensiunTahun: isKepalaDesa ? 99 : retirement.sisaTahun,
    sisaMasaPensiunBulan: isKepalaDesa ? 999 : retirement.sisaBulan,
    statusPensiun: effectiveStatusPensiun,
    totalIuranLunas,
  };
}

export function generateNextKTA(
  idKecamatan: string,
  idDesa: string,
  existingList: KeanggotaanPPDI[]
): string {
  // Pattern: 32.04.[KodeKec 2 digit].[KodeDesa 4 digit].[NoUrut 4 digit]
  let kecCode = '05';
  if (idKecamatan) {
    const cleanKec = idKecamatan.replace(/\./g, '').trim();
    if (cleanKec.length >= 6) {
      kecCode = cleanKec.slice(4, 6);
    } else if (cleanKec.length >= 2) {
      kecCode = cleanKec.slice(-2);
    } else {
      kecCode = cleanKec.padStart(2, '0');
    }
  }

  let desaCode = '2001';
  if (idDesa) {
    const cleanDesa = idDesa.replace(/\./g, '').trim();
    if (cleanDesa.length >= 10) {
      desaCode = cleanDesa.slice(6, 10);
    } else if (cleanDesa.length >= 4) {
      desaCode = cleanDesa.slice(-4);
    } else {
      desaCode = cleanDesa.padStart(4, '0');
    }
  }

  // Filter KTA list strictly for THIS kecamatan (match prefix "32.04.[kecCode].")
  const prefixKec = `32.04.${kecCode}.`;
  let maxSeqInKecamatan = 0;

  (existingList || []).forEach((k) => {
    if (k.no_kta && k.no_kta.startsWith(prefixKec)) {
      const parts = k.no_kta.split('.');
      if (parts.length >= 5) {
        const seqNum = parseInt(parts[4], 10);
        if (!isNaN(seqNum) && seqNum > maxSeqInKecamatan) {
          maxSeqInKecamatan = seqNum;
        }
      }
    }
  });

  const nextSeq = maxSeqInKecamatan + 1;
  const numStr = String(nextSeq).padStart(4, '0');
  return `32.04.${kecCode}.${desaCode}.${numStr}`;
}

export const ID_JABATAN_KEPALA_DESA = 10;
export const ID_JABATAN_STAF_PERANGKAT_DESA = 9;

/**
 * Menormalkan field periode (INT) sesuai ketentuan:
 * - id_jabatan === 10 (Kepala Desa): bernilai 1, 2, atau 3 (null jika belum valid)
 * - id_jabatan lainnya: selalu null
 */
export function normalizePeriodeForJabatan(
  idJabatan?: number | string | null,
  periode?: number | string | null
): number | null {
  if (Number(idJabatan) !== ID_JABATAN_KEPALA_DESA) {
    return null;
  }
  const parsed = Number(periode);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 3) {
    return parsed;
  }
  return null;
}

/**
 * Generates official 28-digit NIPD (Nomor Induk Perangkat Desa) based on statutory rules:
 *
 * 1. Kepala Desa (id_jabatan = 10):
 *    - 8 digit : Tahun, Bulan, Tanggal Lahir (YYYYMMDD)
 *    - 6 digit : Tahun & Bulan Pengangkatan/Pelantikan (YYYYMM)
 *    - 1 digit : Jenis Kelamin (1 = Laki-laki, 2 = Perempuan)
 *    - 2 digit : Kode Kepala Desa = "01"
 *    - 1 digit : Periodisasi Kepala Desa (1 = Periode 1, 2 = Periode 2, 3 = Periode 3)
 *    - 10 digit: Kode Wilayah Administrasi (2 Prov + 2 Kab/Kota + 2 Kec + 4 Desa)
 *
 * 2. Perangkat Desa (id_jabatan = 1..8):
 *    - 8 digit : YYYYMMDD (Tanggal Lahir)
 *    - 6 digit : YYYYMM (Tahun & Bulan Pengangkatan/Pelantikan)
 *    - 1 digit : Jenis Kelamin (1 = L, 2 = P)
 *    - 2 digit : Kode Perangkat Desa = "02"
 *    - 1 digit : Kode Jabatan (1 = Sekretaris Desa, 2 = Kepala Seksi, 3 = Kepala Urusan, 4 = Kepala Kewilayahan)
 *    - 10 digit: Kode Wilayah Administrasi (2 Prov + 2 Kab/Kota + 2 Kec + 4 Desa)
 *
 * 3. Staf Perangkat Desa (id_jabatan = 9):
 *    - 8 digit : YYYYMMDD (Tanggal Lahir)
 *    - 6 digit : YYYYMM (Tahun & Bulan Pengangkatan/Pelantikan)
 *    - 1 digit : Jenis Kelamin (1 = L, 2 = P)
 *    - 2 digit : Kode Staf Perangkat Desa = "03"
 *    - 1 digit : Kode Jabatan = "1" (Staf Perangkat Desa)
 *    - 10 digit: Kode Wilayah Administrasi (2 Prov + 2 Kab/Kota + 2 Kec + 4 Desa)
 */
export function generateNIPD(params: {
  tanggalLahir?: string;
  tmtJabatan?: string;
  jenisKelamin?: 'L' | 'P' | string;
  idJabatan?: number | string;
  namaJabatan?: string;
  kategoriJabatan?: string;
  periode?: number | string | null;
  idKecamatan?: string;
  idDesa?: string;
}): string {
  // a. 8 digit pertama: Tahun, Bulan, Tanggal Lahir (YYYYMMDD)
  let lahirStr = '19900101';
  if (params.tanggalLahir) {
    const cleanLahir = String(params.tanggalLahir).replace(/[^0-9]/g, '');
    if (cleanLahir.length >= 8) {
      lahirStr = cleanLahir.slice(0, 8);
    } else if (cleanLahir.length === 6) {
      lahirStr = cleanLahir + '01';
    }
  }

  // b. 6 digit berikutnya: Tahun & Bulan Pengangkatan/Pelantikan (YYYYMM)
  let tmtStr = '202001';
  if (params.tmtJabatan) {
    const cleanTmt = String(params.tmtJabatan).replace(/[^0-9]/g, '');
    if (cleanTmt.length >= 6) {
      tmtStr = cleanTmt.slice(0, 6);
    } else if (cleanTmt.length >= 4) {
      tmtStr = cleanTmt.slice(0, 4) + '01';
    }
  }

  // c. 1 digit berikutnya: Jenis Kelamin (1 = Laki-laki, 2 = Perempuan)
  const jk = (params.jenisKelamin || 'L').toUpperCase();
  const jkCode = jk === 'P' || jk === 'PEREMPUAN' ? '2' : '1';

  // d & e. 2 digit kode unsur + 1 digit kode periodisasi/jabatan
  const jId = Number(params.idJabatan) || 0;
  const namaLower = (params.namaJabatan || '').toLowerCase();
  const katLower = (params.kategoriJabatan || '').toLowerCase();

  const isKepalaDesa =
    jId === ID_JABATAN_KEPALA_DESA ||
    katLower === 'kepala desa' ||
    namaLower.includes('kepala desa') ||
    namaLower.includes('kades');

  const isStafPerangkatDesa =
    !isKepalaDesa &&
    (jId === ID_JABATAN_STAF_PERANGKAT_DESA ||
      katLower === 'staf desa' ||
      namaLower.includes('staf'));

  let devCode = '02';
  let subCode = '2';

  if (isKepalaDesa) {
    // 1. Kepala Desa: 01 + waktu periodisasi (1, 2, atau 3)
    devCode = '01';
    const parsedPeriode = Number(params.periode);
    subCode =
      Number.isInteger(parsedPeriode) && parsedPeriode >= 1 && parsedPeriode <= 3
        ? String(parsedPeriode)
        : '1';
  } else if (isStafPerangkatDesa) {
    // 3. Staf Perangkat Desa: 03 + 1
    devCode = '03';
    subCode = '1';
  } else {
    // 2. Perangkat Desa: 02 + Kode Jabatan (1=Sekdes, 2=Kasi, 3=Kaur, 4=Kewilayahan)
    devCode = '02';
    if (
      jId === 1 ||
      namaLower.includes('sekretaris desa') ||
      namaLower.includes('sekdes')
    ) {
      subCode = '1';
    } else if (
      jId === 2 ||
      jId === 3 ||
      jId === 4 ||
      katLower === 'pelaksana teknis' ||
      namaLower.includes('kepala seksi') ||
      namaLower.includes('kasi')
    ) {
      subCode = '2';
    } else if (
      jId === 5 ||
      jId === 6 ||
      jId === 7 ||
      namaLower.includes('kepala urusan') ||
      namaLower.includes('kaur')
    ) {
      subCode = '3';
    } else if (
      jId === 8 ||
      katLower === 'pelaksana kewilayahan' ||
      namaLower.includes('kepala dusun') ||
      namaLower.includes('kadus') ||
      namaLower.includes('kewilayahan')
    ) {
      subCode = '4';
    } else {
      subCode = '2';
    }
  }

  // f. 10 digit terakhir: 2 Prov + 2 Kab/Kota + 2 Kec + 4 Desa
  const cleanDesa = params.idDesa ? String(params.idDesa).replace(/[^0-9]/g, '') : '';
  const cleanKec = params.idKecamatan ? String(params.idKecamatan).replace(/[^0-9]/g, '') : '';

  let provKabCode = '3204';
  if (cleanDesa.length >= 10) {
    provKabCode = cleanDesa.slice(0, 4);
  } else if (cleanKec.length >= 6) {
    provKabCode = cleanKec.slice(0, 4);
  }

  let kecCode = '01';
  if (cleanKec.length >= 6) {
    kecCode = cleanKec.slice(4, 6);
  } else if (cleanDesa.length >= 10) {
    kecCode = cleanDesa.slice(4, 6);
  } else if (cleanKec.length >= 2) {
    kecCode = cleanKec.slice(-2);
  } else if (cleanKec.length === 1) {
    kecCode = cleanKec.padStart(2, '0');
  }

  let desaCode = '0001';
  if (cleanDesa.length >= 10) {
    desaCode = cleanDesa.slice(6, 10);
  } else if (cleanDesa.length >= 4) {
    desaCode = cleanDesa.slice(-4);
  } else if (cleanDesa.length > 0) {
    desaCode = cleanDesa.padStart(4, '0');
  }

  const wilayahCode = `${provKabCode}${kecCode}${desaCode}`;

  return `${lahirStr}${tmtStr}${jkCode}${devCode}${subCode}${wilayahCode}`;
}

/**
 * Memformat tampilan NIPD 28 digit di UI View dengan pemisah spasi:
 * 8 digit (Tgl Lahir) + 6 digit (TMT) + 1 digit (JK) + 3 digit (Kode Unsur+Jabatan/Periode) + 10 digit (Wilayah)
 * Contoh DB  : 1982082820240210213204152005
 * Contoh View: 19820828 202402 1 021 3204152005
 * Nilai di database tetap disimpan utuh 28 digit tanpa spasi.
 */
export function formatNIPDDisplay(nipd?: string | null): string {
  const trimmed = (nipd || '').trim();
  if (!trimmed) return '';
  const digitsOnly = trimmed.replace(/\s+/g, '');
  if (/^\d{28}$/.test(digitsOnly)) {
    return `${digitsOnly.slice(0, 8)} ${digitsOnly.slice(8, 14)} ${digitsOnly.slice(14, 15)} ${digitsOnly.slice(15, 18)} ${digitsOnly.slice(18, 28)}`;
  }
  return trimmed;
}

// Storage keys for API Base URL & Auth Session/Token
const API_BASE_URL_KEY = 'ppdi_custom_api_url';
const AUTH_TOKEN_KEY = 'ppdi_auth_token';

export function isCloudPreviewHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = (window.location.hostname || '').toLowerCase();
  return (
    host.endsWith('.run.app') ||
    host.endsWith('.googleusercontent.com') ||
    host.endsWith('.web.app') ||
    host.endsWith('.firebaseapp.com')
  );
}

export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  const isPreview = isCloudPreviewHost();
  const isLocalTarget = (u: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(u.trim());

  const stored = (localStorage.getItem(API_BASE_URL_KEY) || '').trim();
  if (stored) {
    // On HTTPS AI Studio Preview (*.run.app), ignore stale localhost overrides so requests hit the integrated Express backend
    if (isPreview && isLocalTarget(stored)) {
      try {
        localStorage.removeItem(API_BASE_URL_KEY);
      } catch (_) {}
    } else {
      return stored.replace(/\/+$/, '');
    }
  }
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    const cleanEnv = envUrl.trim().replace(/\/+$/, '');
    if (!(isPreview && isLocalTarget(cleanEnv))) {
      return cleanEnv;
    }
  }
  return '';
}

export function setApiBaseUrl(url: string): void {
  if (typeof window === 'undefined') return;
  const clean = (url || '').trim().replace(/\/+$/, '');
  if (clean) {
    localStorage.setItem(API_BASE_URL_KEY, clean);
  } else {
    localStorage.removeItem(API_BASE_URL_KEY);
  }
}

export function shouldSendCredentials(): boolean {
  const raw = String((import.meta as any).env?.VITE_API_WITH_CREDENTIALS || '').trim().toLowerCase();
  return raw === 'true' || raw === '1';
}

export function getAuthToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (localStorage.getItem(AUTH_TOKEN_KEY) || '').trim();
  } catch (_) {
    return '';
  }
}

export function setAuthToken(token?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    const clean = (token || '').trim();
    if (clean) {
      localStorage.setItem(AUTH_TOKEN_KEY, clean);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch (_) {}
}

export function clearAuthSessionStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem('ppdi_current_user_id');
    localStorage.removeItem('ppdi_current_user_role');
    localStorage.removeItem('ppdi_current_user_name');
  } catch (_) {}
}

/**
 * Resolves a relative API/asset path against VITE_API_URL / custom API base URL.
 * Returns the original path unchanged when running single-domain (baseUrl === '').
 */
export function resolveApiUrl(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

/**
 * Builds standard JSON + Auth headers compatible with both Laravel (Bearer / Sanctum / X-Requested-With)
 * and Express (x-user-id / x-user-role / x-user-name).
 */
export function buildApiAuthHeaders(extraHeaders?: HeadersInit): Headers {
  const headers = new Headers(extraHeaders || {});
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  if (!headers.has('X-Requested-With')) {
    headers.set('X-Requested-With', 'XMLHttpRequest');
  }

  if (typeof localStorage !== 'undefined') {
    const token = getAuthToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const curUserId = localStorage.getItem('ppdi_current_user_id');
    const curUserRole = localStorage.getItem('ppdi_current_user_role');
    const curUserName = localStorage.getItem('ppdi_current_user_name');
    if (curUserId && !headers.has('x-user-id')) {
      headers.set('x-user-id', curUserId);
    }
    if (curUserRole && !headers.has('x-user-role')) {
      headers.set('x-user-role', curUserRole);
    }
    if (curUserName && !headers.has('x-user-name')) {
      headers.set('x-user-name', curUserName);
    }
  }

  return headers;
}

/**
 * Safe fetch wrapper that handles HTML responses, network errors, Laravel Bearer/CSRF headers,
 * and JSON parse failures without altering calling components or UI state.
 */
export async function safeFetchJson<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T & { success?: boolean; message?: string; error?: string }; error?: string }> {
  const rawUrl: string = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : (input as Request).url);
  const baseUrl = getApiBaseUrl();
  const targetUrl = baseUrl && rawUrl.startsWith('/') ? `${baseUrl}${rawUrl}` : rawUrl;

  const isHtml = (str: string) => {
    const s = str.trim();
    return s.startsWith('<!DOCTYPE') || s.startsWith('<!doctype') || s.startsWith('<html') || s.startsWith('<');
  };

  const isLocalDevHost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const headers = buildApiAuthHeaders(init?.headers);
  const credentialsMode: RequestCredentials =
    init?.credentials ?? (shouldSendCredentials() ? 'include' : 'same-origin');

  const secureInit: RequestInit = {
    ...init,
    headers,
    credentials: credentialsMode,
  };

  try {
    let res = await fetch(targetUrl, secureInit);
    let text = await res.text();

    // Auto-fallback to same-origin /api/* if a configured custom/env baseUrl returns HTML or 404 (e.g. in AI Studio Preview)
    if (
      (res.status === 404 || isHtml(text)) &&
      baseUrl &&
      rawUrl.startsWith('/api')
    ) {
      try {
        const sameOriginRes = await fetch(rawUrl, secureInit);
        const sameOriginText = await sameOriginRes.text();
        if (!isHtml(sameOriginText) && (sameOriginRes.ok || sameOriginRes.status !== 404)) {
          setApiBaseUrl('');
          res = sameOriginRes;
          text = sameOriginText;
        }
      } catch (_) {
        // Keep original response if same-origin fallback also fails
      }
    }

    // Auto-probe local port 3000 ONLY during localhost development when no VITE_API_URL is configured
    if (
      (res.status === 404 || isHtml(text)) &&
      isLocalDevHost &&
      !baseUrl &&
      targetUrl.startsWith('/api') &&
      window.location.port !== '3000'
    ) {
      const probeUrl = `${window.location.protocol}//${window.location.hostname}:3000${targetUrl}`;
      try {
        const probeRes = await fetch(probeUrl, secureInit);
        const probeText = await probeRes.text();
        if (probeRes.ok && !isHtml(probeText)) {
          const detectedBase = `${window.location.protocol}//${window.location.hostname}:3000`;
          setApiBaseUrl(detectedBase);
          res = probeRes;
          text = probeText;
        }
      } catch (_) {
        // Probe failed, continue with standard error reporting
      }
    }

    if (!text || !text.trim()) {
      return { ok: res.ok, status: res.status, data: { success: res.ok } as any };
    }

    const trimmed = text.trim();
    if (isHtml(trimmed)) {
      const isNotFound = res.status === 404;
      const isGatewayError = res.status === 502 || res.status === 503 || res.status === 504;
      const backendHint = baseUrl
        ? `backend API (${baseUrl})`
        : 'server backend API (Laravel / Node.js)';
      let errorMsg = `Server mengembalikan halaman HTML (Status ${res.status}).`;
      if (isNotFound) {
        errorMsg = `Endpoint API tidak ditemukan (404 HTML). Pastikan ${backendHint} aktif dan konfigurasi rute /api pada web server (.htaccess / Nginx) sudah benar.`;
      } else if (isGatewayError) {
        errorMsg = `Server backend tidak dapat dijangkau (Gateway Error ${res.status}). Pastikan layanan PHP-FPM / backend aktif.`;
      } else {
        errorMsg = `Server mengembalikan halaman HTML (Status ${res.status}) bukannya JSON. Periksa konfigurasi VITE_API_URL dan header Accept: application/json pada ${backendHint}.`;
      }
      return {
        ok: false,
        status: res.status,
        data: { success: false, error: errorMsg, message: errorMsg } as any,
        error: errorMsg,
      };
    }

    try {
      const data = JSON.parse(text);
      // Clear expired/invalid Bearer token automatically on 401 from non-login endpoints
      if (
        res.status === 401 &&
        !rawUrl.includes('/api/auth/login') &&
        (data?.error === 'TOKEN_EXPIRED' || data?.error === 'UNAUTHENTICATED')
      ) {
        setAuthToken(null);
      }
      return { ok: res.ok, status: res.status, data };
    } catch (parseErr: any) {
      const errorMsg = `Format respons dari server tidak valid JSON: ${parseErr.message}`;
      return {
        ok: false,
        status: res.status,
        data: { success: false, error: errorMsg, message: errorMsg } as any,
        error: errorMsg,
      };
    }
  } catch (netErr: any) {
    // Auto-fallback to same-origin /api/* when custom/external baseUrl fails with network/CORS error
    if (baseUrl && rawUrl.startsWith('/api')) {
      try {
        const sameOriginRes = await fetch(rawUrl, secureInit);
        const sameOriginText = await sameOriginRes.text();
        if (!isHtml(sameOriginText)) {
          setApiBaseUrl('');
          const parsed = sameOriginText.trim() ? JSON.parse(sameOriginText) : { success: sameOriginRes.ok };
          return { ok: sameOriginRes.ok, status: sameOriginRes.status, data: parsed };
        }
      } catch (_) {}
    }

    if (
      isLocalDevHost &&
      !baseUrl &&
      targetUrl.startsWith('/api') &&
      window.location.port !== '3000'
    ) {
      const probeUrl = `${window.location.protocol}//${window.location.hostname}:3000${targetUrl}`;
      try {
        const probeRes = await fetch(probeUrl, secureInit);
        const probeText = await probeRes.text();
        if (probeRes.ok && !isHtml(probeText)) {
          const detectedBase = `${window.location.protocol}//${window.location.hostname}:3000`;
          setApiBaseUrl(detectedBase);
          const data = JSON.parse(probeText);
          return { ok: probeRes.ok, status: probeRes.status, data };
        }
      } catch (_) {}
    }

    const rawError = netErr.message || 'Koneksi jaringan ke server gagal';
    const isFetchFailed = String(rawError).toLowerCase().includes('failed to fetch');
    const friendlyError = isFetchFailed
      ? baseUrl
        ? `Server backend (${baseUrl}) tidak dapat dijangkau dari browser. Periksa status server Laravel, SSL, dan konfigurasi CORS.`
        : 'Server backend API tidak dapat dijangkau dari browser. Pastikan layanan backend aktif atau konfigurasi VITE_API_URL sudah benar.'
      : rawError;

    return {
      ok: false,
      status: 0,
      data: { success: false, error: friendlyError, message: friendlyError, isNetworkError: true } as any,
      error: friendlyError,
    };
  }
}

/**
 * Safe parser for Response objects to prevent Unexpected token '<' errors
 */
export async function safeResponseJson<T = any>(
  res: Response
): Promise<{ ok: boolean; status: number; data: T & { success?: boolean; message?: string; error?: string }; error?: string }> {
  try {
    const text = await res.text();
    if (!text || !text.trim()) {
      return { ok: res.ok, status: res.status, data: { success: res.ok } as any };
    }
    const trimmed = text.trim();
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.startsWith('<')) {
      const errorMsg = `Server mengembalikan halaman HTML (Status ${res.status}) bukannya data JSON.`;
      return {
        ok: false,
        status: res.status,
        data: { success: false, error: errorMsg, message: errorMsg } as any,
        error: errorMsg,
      };
    }
    const data = JSON.parse(text);
    return { ok: res.ok, status: res.status, data };
  } catch (err: any) {
    const errorMsg = `Format JSON tidak valid: ${err.message}`;
    return {
      ok: false,
      status: res.status,
      data: { success: false, error: errorMsg, message: errorMsg } as any,
      error: errorMsg,
    };
  }
}

/**
 * Default SVG shield favicon in emerald green & gold
 */
export function getDefaultFavicon(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="14" fill="#064E3B"/>
    <path d="M32 10 L50 18 V32 C50 44 42 52 32 56 C22 52 14 44 14 32 V18 Z" fill="#FDE047" stroke="#FFFFFF" stroke-width="2"/>
    <path d="M32 18 L44 24 V33 C44 41 38 47 32 50 C26 47 20 41 20 33 V24 Z" fill="#064E3B"/>
    <circle cx="32" cy="33" r="5" fill="#FDE047"/>
  </svg>`;
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    return `data:image/svg+xml;base64,${window.btoa(svg)}`;
  }
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Generates a crisp square PNG favicon (64x64) from an image URL / base64
 */
export function generateFaviconFromLogo(logoUrl: string): Promise<string> {
  return new Promise((resolve) => {
    if (!logoUrl) {
      resolve(getDefaultFavicon());
      return;
    }

    if (typeof window === 'undefined' || typeof document === 'undefined') {
      resolve(logoUrl);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(logoUrl);
          return;
        }

        ctx.clearRect(0, 0, 64, 64);

        // Calculate aspect-ratio preservation
        const hRatio = 60 / img.width;
        const vRatio = 60 / img.height;
        const ratio = Math.min(hRatio, vRatio);
        const shiftX = (64 - img.width * ratio) / 2;
        const shiftY = (64 - img.height * ratio) / 2;

        ctx.drawImage(
          img,
          0,
          0,
          img.width,
          img.height,
          shiftX,
          shiftY,
          img.width * ratio,
          img.height * ratio
        );

        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl);
      } catch (_) {
        // Fallback to original url if canvas is tainted
        resolve(logoUrl);
      }
    };

    img.onerror = () => {
      resolve(getDefaultFavicon());
    };

    img.src = logoUrl;
  });
}

/**
 * Dynamically updates document.title and browser tab favicons
 */
export async function updateFaviconAndTitle(logoUrl?: string, title?: string): Promise<void> {
  if (typeof document === 'undefined') return;

  if (title) {
    document.title = title;
  }

  const faviconDataUrl = await generateFaviconFromLogo(logoUrl || '');

  // 1. Rel icon
  let linkIcon = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
  if (!linkIcon) {
    linkIcon = document.createElement('link');
    linkIcon.rel = 'icon';
    document.head.appendChild(linkIcon);
  }
  linkIcon.type = faviconDataUrl.startsWith('data:image/svg') ? 'image/svg+xml' : 'image/png';
  linkIcon.href = faviconDataUrl;

  // 2. Shortcut icon
  let linkShortcut = document.querySelector("link[rel='shortcut icon']") as HTMLLinkElement | null;
  if (!linkShortcut) {
    linkShortcut = document.createElement('link');
    linkShortcut.rel = 'shortcut icon';
    document.head.appendChild(linkShortcut);
  }
  linkShortcut.href = faviconDataUrl;

  // 3. Apple touch icon
  let linkApple = document.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement | null;
  if (!linkApple) {
    linkApple = document.createElement('link');
    linkApple.rel = 'apple-touch-icon';
    document.head.appendChild(linkApple);
  }
  linkApple.href = faviconDataUrl;
}

/**
 * Formats phone number for WhatsApp deep links (e.g. 08123... -> 628123...)
 */
export function formatPhoneForWhatsApp(phone?: string | null): string {
  if (!phone) return '';
  let clean = phone.replace(/\D/g, '');
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1);
  } else if (!clean.startsWith('62') && clean.length > 5) {
    clean = '62' + clean;
  }
  return clean;
}

/**
 * Generates direct URL to Portal Verifikasi Keabsahan E-KTA (encrypted token when noKta & nik exist)
 */
export function getPortalVerifikasiEktaUrl(params?: {
  noKta?: string;
  nik?: string;
  idAnggota?: string;
  verifyUrl?: string;
}): string {
  if (params?.verifyUrl && params.verifyUrl.trim()) {
    return params.verifyUrl.trim();
  }
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin.replace(/\/+$/, '')
      : 'https://ppdi-bandungkab.id';

  const cleanKta = (params?.noKta || '').trim();
  const cleanNik = (params?.nik || '').trim();

  if (cleanKta && cleanNik) {
    return generateKtaShortUrl(
      { no_kta: cleanKta, nik: cleanNik, id_anggota: params?.idAnggota },
      origin
    ).url;
  }
  if (cleanKta) {
    return `${origin}/?v=${encodeURIComponent(cleanKta)}`;
  }
  return `${origin}/?verify=1`;
}

/**
 * Generates a unique public KTA verification URL based on the member's ID Anggota.
 * When scanned via QR Code, redirects directly to the public KTA verification modal.
 */
export function getMemberKtaVerifyByIdUrl(idAnggota: string | number): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin.replace(/\/+$/, '')
      : 'https://anggota.ppdibandungkab.or.id';
  const cleanId = encodeURIComponent(String(idAnggota || '').trim());
  if (!cleanId) return `${origin}/?verify=1`;
  return `${origin}/?verify=1&id_anggota=${cleanId}`;
}

export function buildWhatsAppApprovalMessage(params: {
  name: string;
  noKta: string;
  nik?: string;
  idAnggota?: string;
  desa?: string;
  kecamatan?: string;
  verifyUrl?: string;
}): string {
  const formattedName = (params.name || '').toUpperCase().trim();
  const desaName = params.desa ? `Desa ${params.desa.replace(/^desa\s+/i, '')}` : 'Desa';
  const kecName = params.kecamatan ? `Kec. ${params.kecamatan.replace(/^kec(amatan)?\s+/i, '')}` : '';
  const wilStr = [desaName, kecName].filter(Boolean).join(', ');
  const portalVerifyUrl = getPortalVerifikasiEktaUrl({
    noKta: params.noKta,
    nik: params.nik,
    idAnggota: params.idAnggota,
    verifyUrl: params.verifyUrl,
  });

  return (
    `*NOTIFIKASI RESMI PPDI KABUPATEN BANDUNG*\n\n` +
    `Yth. Bpk/Ibu *${formattedName}*,\n\n` +
    `Selamat! Formulir Pendaftaran Keanggotaan *PERSATUAN PERANGKAT DESA INDONESIA (PPDI)* Anda telah *DISETUJUI*.\n\n` +
    `*INFORMASI E-KTA DIGITAL:*\n` +
    `• Nama Lengkap: *${formattedName}*\n` +
    `• Wilayah Tugas: *${wilStr}*\n` +
    `• Nomor KTA Digital: *${params.noKta}*\n` +
    `• Status Keanggotaan: *AKTIF*\n\n` +
    `*Portal Verifikasi Keabsahan E-KTA:*\n` +
    `${portalVerifyUrl}\n\n` +
    `Kartu Tanda Anggota (E-KTA) Digital Anda telah resmi diterbitkan. Anda kini dapat login dan mengunduh E-KTA resmi di portal aplikasi PPDI.\n\n` +
    `Salam Perjuangan,\n` +
    `*Pengurus Daerah PPDI Kabupaten Bandung*`
  );
}

/**
 * Generates WhatsApp approval notification URL for approved members
 */
export function getWhatsAppApprovalUrl(params: {
  phone: string;
  name: string;
  noKta: string;
  nik?: string;
  idAnggota?: string;
  desa?: string;
  kecamatan?: string;
  verifyUrl?: string;
}): string {
  const cleanPhone = formatPhoneForWhatsApp(params.phone);
  const message = buildWhatsAppApprovalMessage(params);
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

export function buildWhatsAppKTAReminderMessage(params: {
  name: string;
  noKta?: string;
  nik?: string;
  idAnggota?: string;
  statusKta?: string;
  desa?: string;
  kecamatan?: string;
  verifyUrl?: string;
}): string {
  const formattedName = (params.name || '').toUpperCase().trim();
  const ktaStr = params.noKta || 'Belum Terbit / Pending';
  const statusStr = (params.statusKta || 'Aktif').toUpperCase();
  const desaName = params.desa ? `Desa ${params.desa.replace(/^desa\s+/i, '')}` : '';
  const kecName = params.kecamatan ? `Kec. ${params.kecamatan.replace(/^kec(amatan)?\s+/i, '')}` : '';
  const wilStr = [desaName, kecName].filter(Boolean).join(', ');
  const portalVerifyUrl = getPortalVerifikasiEktaUrl({
    noKta: params.noKta,
    nik: params.nik,
    idAnggota: params.idAnggota,
    verifyUrl: params.verifyUrl,
  });

  return (
    `*PENGINGAT RESMI KTA DIGITAL PPDI KABUPATEN BANDUNG*\n\n` +
    `Yth. Bpk/Ibu *${formattedName}*,\n\n` +
    `Informasi status Kartu Tanda Anggota (E-KTA) Digital Anda di sistem PPDI Kabupaten Bandung:\n\n` +
    `• Nama Lengkap: *${formattedName}*\n` +
    `• Wilayah Tugas: *${wilStr}*\n` +
    `• Nomor KTA Digital: *${ktaStr}*\n` +
    `• Status Keanggotaan: *${statusStr}*\n\n` +
    `*Portal Verifikasi Keabsahan E-KTA:*\n` +
    `${portalVerifyUrl}\n\n` +
    `Pastikan profil dan data kependudukan Anda selalu diperbarui di portal aplikasi PPDI. Apabila membutuhkan bantuan cetak ulang E-KTA, silakan hubungi pengurus wilayah.\n\n` +
    `Salam Perjuangan,\n` +
    `*Pengurus Daerah PPDI Kabupaten Bandung*`
  );
}

/**
 * Generates WhatsApp notification URL for KTA status and validity reminder
 */
export function getWhatsAppKTAReminderUrl(params: {
  phone: string;
  name: string;
  noKta?: string;
  nik?: string;
  idAnggota?: string;
  statusKta?: string;
  desa?: string;
  kecamatan?: string;
  verifyUrl?: string;
}): string {
  const cleanPhone = formatPhoneForWhatsApp(params.phone);
  const message = buildWhatsAppKTAReminderMessage(params);
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

export function buildWhatsAppIuranReminderMessage(params: {
  name: string;
  periode?: string;
  jumlah?: number;
  desa?: string;
  noKta?: string;
  nik?: string;
  idAnggota?: string;
  verifyUrl?: string;
}): string {
  const formattedName = (params.name || '').toUpperCase().trim();
  const nominalStr = params.jumlah ? `Rp ${params.jumlah.toLocaleString('id-ID')}` : 'Rp 35.000';
  const periodeStr = params.periode || 'Bulan Berjalan';
  const portalVerifyUrl = getPortalVerifikasiEktaUrl({
    noKta: params.noKta,
    nik: params.nik,
    idAnggota: params.idAnggota,
    verifyUrl: params.verifyUrl,
  });

  return (
    `*PEMBERITAHUAN IURAN KAS PPDI KABUPATEN BANDUNG*\n\n` +
    `Yth. Bpk/Ibu *${formattedName}*,\n\n` +
    `Pemberitahuan kewajiban iuran kas anggota Persatuan Perangkat Desa Indonesia (PPDI):\n\n` +
    `• Nama Anggota: *${formattedName}*\n` +
    `• Wilayah Tugas: *Desa ${params.desa || '-'}*\n` +
    `• Periode Iuran: *${periodeStr}*\n` +
    `• Nominal Wajib: *${nominalStr}*\n\n` +
    `*Portal Verifikasi Keabsahan E-KTA:*\n` +
    `${portalVerifyUrl}\n\n` +
    `Pembayaran iuran kas dapat disetorkan melalui Bendahara Pengurus Kecamatan / Desa atau diunggah pada aplikasi PPDI.\n\n` +
    `Terima kasih atas partisipasi dan loyalitas Anda.\n\n` +
    `Salam Perjuangan,\n` +
    `*Pengurus Daerah PPDI Kabupaten Bandung*`
  );
}

/**
 * Generates WhatsApp notification URL for Iuran dues/reminder
 */
export function getWhatsAppIuranReminderUrl(params: {
  phone: string;
  name: string;
  periode?: string;
  jumlah?: number;
  desa?: string;
  noKta?: string;
  nik?: string;
  idAnggota?: string;
  verifyUrl?: string;
}): string {
  const cleanPhone = formatPhoneForWhatsApp(params.phone);
  const message = buildWhatsAppIuranReminderMessage(params);
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

export interface DispatchWhatsAppResult {
  success: boolean;
  mode: 'fonnte' | 'wa_me';
  message: string;
  waMeUrl: string;
  detail?: any;
}

export function isFonnteWebhookActive(whatsappSettings?: WhatsAppSettings | null): boolean {
  return Boolean(whatsappSettings?.enabled && whatsappSettings?.fonnteToken?.trim());
}

/**
 * Otomatis mengirim notifikasi WhatsApp:
 * - Jika Webhook & Gateway Fonnte AKTIF -> kirim langsung melalui API Fonnte (/api/whatsapp/send)
 * - Jika Webhook TIDAK AKTIF -> gunakan API wa.me seperti semula (buka link WhatsApp)
 */
export async function dispatchWhatsAppNotification(params: {
  phone: string;
  message: string;
  recipientName?: string;
  idAnggota?: string;
  category?: string;
  batchId?: string;
  whatsappSettings?: WhatsAppSettings | null;
}): Promise<DispatchWhatsAppResult> {
  const cleanPhone = formatPhoneForWhatsApp(params.phone);
  const waMeUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(params.message)}`;

  if (!cleanPhone || cleanPhone.length < 8) {
    return {
      success: false,
      mode: isFonnteWebhookActive(params.whatsappSettings) ? 'fonnte' : 'wa_me',
      message: 'Nomor WhatsApp penerima tidak valid atau belum diisi.',
      waMeUrl,
    };
  }

  // Jika webhook tidak aktif, pakai API wa.me seperti semula
  if (!isFonnteWebhookActive(params.whatsappSettings)) {
    if (typeof window !== 'undefined') {
      window.open(waMeUrl, '_blank', 'noopener,noreferrer');
    }
    return {
      success: true,
      mode: 'wa_me',
      message: `Membuka WhatsApp (wa.me) untuk ${params.recipientName || cleanPhone}.`,
      waMeUrl,
    };
  }

  // Jika webhook aktif, kirim otomatis via backend Fonnte Gateway
  const res = await safeFetchJson('/api/whatsapp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      target: cleanPhone,
      message: params.message,
      recipientName: params.recipientName || '',
      idAnggota: params.idAnggota || undefined,
      category: params.category || 'notifikasi',
      batchId: params.batchId || undefined,
      token: params.whatsappSettings?.fonnteToken,
      senderNumber: params.whatsappSettings?.senderNumber,
      countryCode: params.whatsappSettings?.countryCode || '62',
    }),
  });

  if (res.ok && res.data?.success) {
    return {
      success: true,
      mode: 'fonnte',
      message:
        res.data?.message ||
        `Notifikasi WhatsApp berhasil dikirim via Fonnte ke ${params.recipientName || cleanPhone}.`,
      waMeUrl,
      detail: res.data,
    };
  }

  return {
    success: false,
    mode: 'fonnte',
    message: res.data?.message || res.error || 'Gagal mengirim pesan melalui Gateway Fonnte.',
    waMeUrl,
    detail: res.data,
  };
}

/**
 * Mengecek apakah nama jabatan termasuk Sekretaris Desa (Sekdes)
 */
export function isSekretarisDesaJabatan(namaJabatan?: string | null): boolean {
  const normalized = String(namaJabatan || '').trim().toLowerCase();
  if (!normalized) return false;
  return normalized.includes('sekretaris desa') || normalized === 'sekdes';
}

/**
 * Membangun pesan resmi pengiriman akses akun Admin Desa khusus untuk Sekretaris Desa
 * sesuai format baku PPDI Kabupaten Bandung.
 */
export function buildSekdesAdminDesaAccountMessage(params: {
  namaDesa: string;
  namaKecamatan: string;
  username: string;
  password: string;
}): string {
  const cleanDesa = (params.namaDesa || '-')
    .replace(/^desa\s+/i, '')
    .trim() || '-';
  const cleanKecamatan = (params.namaKecamatan || '-')
    .replace(/^kec(amatan)?\.?\s+/i, '')
    .trim() || '-';
  const cleanUsername = (params.username || '-').trim();
  const cleanPassword = (params.password || '-').trim();

  return [
    '*Assalamu’alaikum Warahmatullahi Wabarakatuh.*',
    '*Sampurasun.*',
    '',
    `Yth. Bapak/Ibu Sekretaris Desa *${cleanDesa}*,`,
    `Kecamatan *${cleanKecamatan}*.`,
    '',
    `Dalam rangka pengelolaan dan pemutakhiran data perangkat desa pada *Sistem Informasi Database & E-KTA PPDI Kabupaten Bandung*, bersama ini kami sampaikan akses akun *Admin Desa* untuk wilayah Desa *${cleanDesa}*:`,
    '',
    '🌐 *Link Login:* https://anggota.ppdibandungkab.or.id/',
    `👤 *Username:* \`${cleanUsername}\``,
    `🔑 *Password:* \`${cleanPassword}\``,
    '',
    '*Catatan Penting & Keamanan Akun:*',
    '1️⃣ Demi keamanan data, mohon untuk *segera mengganti password* setelah berhasil login pertama kali melalui menu Pengaturan/Ubah Password.',
    '2️⃣ Mohon menjaga kerahasiaan akun ini dan *tidak membagikannya* ke grup umum.',
    '3️⃣ Silakan gunakan akun ini untuk memverifikasi, melengkapi, atau memperbarui data perangkat desa di wilayah Anda.',
    '',
    'Apabila mengalami kendala saat login atau pengelolaan data, silakan hubungi Admin Kabupaten di nomor *081223418088*.',
    '',
    'Atas perhatian dan kerja samanya, kami ucapkan terima kasih.',
    '',
    '*Wassalamu’alaikum Warahmatullahi Wabarakatuh.*',
    '*Salam Satu Komando!*',
    '',
    'Hormat kami,',
    '*_Admin PPDI Kabupaten Bandung_*',
  ].join('\n');
}
