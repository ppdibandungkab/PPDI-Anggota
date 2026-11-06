import { Anggota, RiwayatJabatan, KeanggotaanPPDI, RefDesa, RefKecamatan, RefJabatan, AnggotaFullDetail, IuranAnggota } from '../types/ppdi';

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
    sisaMasaPensiunTahun: retirement.sisaTahun,
    sisaMasaPensiunBulan: retirement.sisaBulan,
    statusPensiun: activeRiwayat?.status_aktif === 'Purna Tugas' ? 'Sudah Purna Tugas' : retirement.statusPensiun,
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

/**
 * Generates official 28-digit NIPD (Nomor Induk Perangkat Desa) based on statutory rules:
 * - 8 digits: Birth Date (YYYYMMDD)
 * - 6 digits: Appointment / TMT Date (YYYYMM)
 * - 1 digit: Gender (1 = Male, 2 = Female)
 * - 2 digits: Device code ("02")
 * - 1 digit: Position code (1 = Sekdes, 2 = Kasi, 3 = Kaur, 4 = Kewilayahan)
 * - 10 digits: Regional code (3204 + 2 digit Kec + 4 digit Desa)
 */
export function generateNIPD(params: {
  tanggalLahir?: string;
  tmtJabatan?: string;
  jenisKelamin?: 'L' | 'P' | string;
  idJabatan?: number | string;
  idKecamatan?: string;
  idDesa?: string;
}): string {
  let lahirStr = '19900101';
  if (params.tanggalLahir) {
    const cleanLahir = params.tanggalLahir.replace(/[^0-9]/g, '');
    if (cleanLahir.length >= 8) {
      lahirStr = cleanLahir.slice(0, 8);
    } else if (cleanLahir.length === 6) {
      lahirStr = cleanLahir + '01';
    }
  }

  let tmtStr = '202001';
  if (params.tmtJabatan) {
    const cleanTmt = params.tmtJabatan.replace(/[^0-9]/g, '');
    if (cleanTmt.length >= 6) {
      tmtStr = cleanTmt.slice(0, 6);
    } else if (cleanTmt.length >= 4) {
      tmtStr = cleanTmt.slice(0, 4) + '01';
    }
  }

  const jk = (params.jenisKelamin || 'L').toUpperCase();
  const jkCode = (jk === 'P' || jk === 'PEREMPUAN') ? '2' : '1';

  const devCode = '02';

  let jabCode = '2';
  const jId = Number(params.idJabatan) || 2;
  if (jId === 1) jabCode = '1';
  else if (jId === 2) jabCode = '2';
  else if (jId === 3) jabCode = '3';
  else if (jId === 4) jabCode = '4';
  else jabCode = '2';

  let kecCode = '01';
  if (params.idKecamatan) {
    const cleanKec = params.idKecamatan.replace(/\./g, '').trim();
    if (cleanKec.length >= 6) {
      kecCode = cleanKec.slice(4, 6);
    } else if (cleanKec.length >= 2) {
      kecCode = cleanKec.slice(-2);
    } else {
      kecCode = cleanKec.padStart(2, '0');
    }
  }

  let desaCode = '0001';
  if (params.idDesa) {
    const cleanDesa = params.idDesa.replace(/\./g, '').trim();
    if (cleanDesa.length >= 10) {
      desaCode = cleanDesa.slice(6, 10);
    } else if (cleanDesa.length >= 4) {
      desaCode = cleanDesa.slice(-4);
    } else {
      desaCode = cleanDesa.padStart(4, '0');
    }
  }

  const wilayahCode = `3204${kecCode}${desaCode}`;

  return `${lahirStr}${tmtStr}${jkCode}${devCode}${jabCode}${wilayahCode}`;
}

// Storage key for user-configured API Base URL
const API_BASE_URL_KEY = 'ppdi_custom_api_url';

export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  const stored = localStorage.getItem(API_BASE_URL_KEY);
  if (stored) return stored.replace(/\/+$/, '');
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl) return envUrl.replace(/\/+$/, '');
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

/**
 * Safe fetch wrapper that handles HTML responses, network errors, and JSON parse failures.
 * Prevents "Unexpected token '<', '<!doctype '... is not valid JSON" errors completely.
 * Automatically tries http://localhost:3000 if frontend is served on a different port (e.g. Vite, Live Server, XAMPP).
 */
export async function safeFetchJson<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T & { success?: boolean; message?: string; error?: string }; error?: string }> {
  let targetUrl: string = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : (input as Request).url);
  const baseUrl = getApiBaseUrl();

  // If relative path starting with '/' and baseUrl is set, prepend it
  if (baseUrl && targetUrl.startsWith('/')) {
    targetUrl = `${baseUrl}${targetUrl}`;
  }

  const isHtml = (str: string) => {
    const s = str.trim();
    return s.startsWith('<!DOCTYPE') || s.startsWith('<!doctype') || s.startsWith('<html') || s.startsWith('<');
  };

  // Automatically inject active user auth context headers for server-side permission checks
  const headers = new Headers(init?.headers || {});
  if (typeof localStorage !== 'undefined') {
    const curUserId = localStorage.getItem('ppdi_current_user_id');
    const curUserRole = localStorage.getItem('ppdi_current_user_role');
    if (curUserId && !headers.has('x-user-id')) {
      headers.set('x-user-id', curUserId);
    }
    if (curUserRole && !headers.has('x-user-role')) {
      headers.set('x-user-role', curUserRole);
    }
  }
  const secureInit: RequestInit = {
    ...init,
    headers,
  };

  try {
    let res = await fetch(targetUrl, secureInit);
    let text = await res.text();

    // Auto-probe fallback:
    // If relative request to /api/... returned 404 or HTML, AND user is on a different port than 3000 (e.g. 5173, 4173, 80, 8080)
    if (
      (res.status === 404 || isHtml(text)) &&
      typeof window !== 'undefined' &&
      !baseUrl &&
      targetUrl.startsWith('/api') &&
      window.location.port !== '3000'
    ) {
      const probeUrl = `${window.location.protocol}//${window.location.hostname}:3000${targetUrl}`;
      try {
        const probeRes = await fetch(probeUrl, init);
        const probeText = await probeRes.text();
        if (probeRes.ok && !isHtml(probeText)) {
          // Port 3000 backend is active! Automatically register it as active API base URL
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

    // Check if the response returned an HTML document instead of JSON
    const trimmed = text.trim();
    if (isHtml(trimmed)) {
      const isNotFound = res.status === 404;
      const isGatewayError = res.status === 502 || res.status === 503 || res.status === 504;
      let errorMsg = `Server mengembalikan halaman HTML (Status ${res.status}).`;
      if (isNotFound) {
        errorMsg = `Endpoint API tidak ditemukan (404 HTML). Server backend Node.js (server.js) belum dijalankan di port 3000 atau rute /api belum di-proxy oleh web server lokal. Solusi: Jalankan "npm start" atau "node server.js" di terminal, lalu buka http://localhost:3000 di browser.`;
      } else if (isGatewayError) {
        errorMsg = `Server backend tidak dapat dijangkau (Gateway Error ${res.status}). Pastikan service Node.js sedang berjalan di port 3000.`;
      } else {
        errorMsg = `Server mengembalikan halaman web (HTML, status ${res.status}) bukannya data JSON. Pastikan aplikasi Node.js (server.js) berjalan di port 3000.`;
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
    // If network error occurred on relative path and we're not on port 3000, attempt probe
    if (
      typeof window !== 'undefined' &&
      !baseUrl &&
      targetUrl.startsWith('/api') &&
      window.location.port !== '3000'
    ) {
      const probeUrl = `${window.location.protocol}//${window.location.hostname}:3000${targetUrl}`;
      try {
        const probeRes = await fetch(probeUrl, init);
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
      ? 'Server backend Node.js (port 3000) tidak dapat dijangkau dari browser. Pastikan service "server.js" telah aktif via "npm start" atau URL backend telah dikonfigurasi.'
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
 * Generates WhatsApp approval notification URL for approved members
 */
export function getWhatsAppApprovalUrl(params: {
  phone: string;
  name: string;
  noKta: string;
  desa?: string;
  kecamatan?: string;
}): string {
  const cleanPhone = formatPhoneForWhatsApp(params.phone);
  const formattedName = (params.name || '').toUpperCase().trim();
  const desaName = params.desa ? `Desa ${params.desa.replace(/^desa\s+/i, '')}` : 'Desa';
  const kecName = params.kecamatan ? `Kec. ${params.kecamatan.replace(/^kec(amatan)?\s+/i, '')}` : '';
  const wilStr = [desaName, kecName].filter(Boolean).join(', ');

  const message =
    `*NOTIFIKASI RESMI PPDI KABUPATEN BANDUNG*\n\n` +
    `Yth. Bpk/Ibu *${formattedName}*,\n\n` +
    `Selamat! Formulir Pendaftaran Keanggotaan *PERSATUAN PERANGKAT DESA INDONESIA (PPDI)* Anda telah *DISETUJUI*.\n\n` +
    `*INFORMASI E-KTA DIGITAL:*\n` +
    `• Nama Lengkap: *${formattedName}*\n` +
    `• Wilayah Tugas: *${wilStr}*\n` +
    `• Nomor KTA Digital: *${params.noKta}*\n` +
    `• Status Keanggotaan: *AKTIF*\n\n` +
    `Kartu Tanda Anggota (E-KTA) Digital Anda telah resmi diterbitkan. Anda kini dapat login dan mengunduh E-KTA resmi di portal aplikasi PPDI.\n\n` +
    `Salam Perjuangan,\n` +
    `*Pengurus Daerah PPDI Kabupaten Bandung*`;

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

/**
 * Generates WhatsApp notification URL for KTA status and validity reminder
 */
export function getWhatsAppKTAReminderUrl(params: {
  phone: string;
  name: string;
  noKta?: string;
  statusKta?: string;
  desa?: string;
  kecamatan?: string;
}): string {
  const cleanPhone = formatPhoneForWhatsApp(params.phone);
  const formattedName = (params.name || '').toUpperCase().trim();
  const ktaStr = params.noKta || 'Belum Terbit / Pending';
  const statusStr = (params.statusKta || 'Aktif').toUpperCase();
  const desaName = params.desa ? `Desa ${params.desa.replace(/^desa\s+/i, '')}` : '';
  const kecName = params.kecamatan ? `Kec. ${params.kecamatan.replace(/^kec(amatan)?\s+/i, '')}` : '';
  const wilStr = [desaName, kecName].filter(Boolean).join(', ');

  const message =
    `*PENGINGAT RESMI KTA DIGITAL PPDI KABUPATEN BANDUNG*\n\n` +
    `Yth. Bpk/Ibu *${formattedName}*,\n\n` +
    `Informasi status Kartu Tanda Anggota (E-KTA) Digital Anda di sistem PPDI Kabupaten Bandung:\n\n` +
    `• Nama Lengkap: *${formattedName}*\n` +
    `• Wilayah Tugas: *${wilStr}*\n` +
    `• Nomor KTA Digital: *${ktaStr}*\n` +
    `• Status Keanggotaan: *${statusStr}*\n\n` +
    `Pastikan profil dan data kependudukan Anda selalu diperbarui di portal aplikasi PPDI. Apabila membutuhkan bantuan cetak ulang E-KTA, silakan hubungi pengurus wilayah.\n\n` +
    `Salam Perjuangan,\n` +
    `*Pengurus Daerah PPDI Kabupaten Bandung*`;

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
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
}): string {
  const cleanPhone = formatPhoneForWhatsApp(params.phone);
  const formattedName = (params.name || '').toUpperCase().trim();
  const nominalStr = params.jumlah ? `Rp ${params.jumlah.toLocaleString('id-ID')}` : 'Rp 35.000';
  const periodeStr = params.periode || 'Bulan Berjalan';

  const message =
    `*PEMBERITAHUAN IURAN KAS PPDI KABUPATEN BANDUNG*\n\n` +
    `Yth. Bpk/Ibu *${formattedName}*,\n\n` +
    `Pemberitahuan kewajiban iuran kas anggota Persatuan Perangkat Desa Indonesia (PPDI):\n\n` +
    `• Nama Anggota: *${formattedName}*\n` +
    `• Wilayah Tugas: *Desa ${params.desa || '-'}*\n` +
    `• Periode Iuran: *${periodeStr}*\n` +
    `• Nominal Wajib: *${nominalStr}*\n\n` +
    `Pembayaran iuran kas dapat disetorkan melalui Bendahara Pengurus Kecamatan / Desa atau diunggah pada aplikasi PPDI.\n\n` +
    `Terima kasih atas partisipasi dan loyalitas Anda.\n\n` +
    `Salam Perjuangan,\n` +
    `*Pengurus Daerah PPDI Kabupaten Bandung*`;

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}
