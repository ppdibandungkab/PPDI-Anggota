import {
  Anggota,
  RiwayatJabatan,
  KeanggotaanPPDI,
  RefKecamatan,
  RefDesa,
  RefJabatan,
} from '../types/ppdi';

export interface MemberBundleData {
  anggota: Anggota[];
  riwayat: RiwayatJabatan[];
  keanggotaan: KeanggotaanPPDI[];
}

export interface RefMasterData {
  kecamatan: RefKecamatan[];
  desa: RefDesa[];
  jabatan: RefJabatan[];
}

interface CacheEnvelope<T> {
  version: number;
  updatedAt: number;
  ttlMs: number;
  data: T;
}

export interface CacheReadResult<T> {
  data: T;
  updatedAt: number;
  isFresh: boolean;
  ageMs: number;
}

const CACHE_VERSION = 1;

export const MEMBER_CACHE_KEYS = {
  MEMBER_BUNDLE: 'ppdi_cache_members_bundle_v1',
  REF_MASTER: 'ppdi_cache_ref_master_v1',
  MEMBER_BUNDLE_META: 'ppdi_cache_members_meta_v1',
  REF_MASTER_META: 'ppdi_cache_ref_meta_v1',
} as const;

// TTL defaults: member records change infrequently (15 min), master regional/position references rarely change (60 min)
export const MEMBER_BUNDLE_TTL_MS = 15 * 60 * 1000;
export const REF_MASTER_TTL_MS = 60 * 60 * 1000;

function readEnvelope<T>(key: string, defaultTtlMs: number): CacheReadResult<T> | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || parsed.version !== CACHE_VERSION || !parsed.data || typeof parsed.updatedAt !== 'number') {
      return null;
    }
    const ttlMs = typeof parsed.ttlMs === 'number' && parsed.ttlMs > 0 ? parsed.ttlMs : defaultTtlMs;
    const ageMs = Math.max(0, Date.now() - parsed.updatedAt);
    return {
      data: parsed.data,
      updatedAt: parsed.updatedAt,
      isFresh: ageMs < ttlMs,
      ageMs,
    };
  } catch (_) {
    return null;
  }
}

function writeEnvelope<T>(key: string, metaKey: string, data: T, ttlMs: number): number | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  const updatedAt = Date.now();
  const envelope: CacheEnvelope<T> = {
    version: CACHE_VERSION,
    updatedAt,
    ttlMs,
    data,
  };
  try {
    window.localStorage.setItem(key, JSON.stringify(envelope));
    window.localStorage.setItem(metaKey, JSON.stringify({ updatedAt, ttlMs }));
    return updatedAt;
  } catch (err) {
    // Handle QuotaExceededError gracefully without breaking runtime state
    console.warn(`[MemberCache] Gagal menyimpan cache ${key} ke localStorage:`, err);
    return null;
  }
}

/**
 * Strip heavy inline base64 strings before caching to stay well within 5MB localStorage quota
 * while preserving normal `/uploads/...` URL paths and all member attributes.
 */
function sanitizeMemberBundleForStorage(bundle: MemberBundleData): MemberBundleData {
  const stripInlineDataUrl = (val?: string) => {
    if (!val) return val;
    if (val.startsWith('data:') && val.length > 2048) return '';
    return val;
  };

  return {
    anggota: bundle.anggota.map((a) => ({
      ...a,
      foto: stripInlineDataUrl(a.foto),
    })),
    riwayat: bundle.riwayat.map((r) => ({
      ...r,
      file_sk: stripInlineDataUrl(r.file_sk),
      tanda_tangan: stripInlineDataUrl(r.tanda_tangan),
    })),
    keanggotaan: bundle.keanggotaan,
  };
}

export function readMemberBundleCache(): CacheReadResult<MemberBundleData> | null {
  const result = readEnvelope<MemberBundleData>(MEMBER_CACHE_KEYS.MEMBER_BUNDLE, MEMBER_BUNDLE_TTL_MS);
  if (!result) return null;
  if (
    !Array.isArray(result.data.anggota) ||
    !Array.isArray(result.data.riwayat) ||
    !Array.isArray(result.data.keanggotaan)
  ) {
    return null;
  }
  return result;
}

export function writeMemberBundleCache(
  bundle: MemberBundleData,
  ttlMs: number = MEMBER_BUNDLE_TTL_MS
): number | null {
  if (!bundle.anggota || bundle.anggota.length === 0) return null;
  const sanitized = sanitizeMemberBundleForStorage(bundle);
  return writeEnvelope(
    MEMBER_CACHE_KEYS.MEMBER_BUNDLE,
    MEMBER_CACHE_KEYS.MEMBER_BUNDLE_META,
    sanitized,
    ttlMs
  );
}

export function isMemberBundleCacheFresh(): boolean {
  const cached = readMemberBundleCache();
  return Boolean(cached && cached.isFresh && cached.data.anggota.length > 0);
}

export function invalidateMemberBundleCache(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const raw = window.localStorage.getItem(MEMBER_CACHE_KEYS.MEMBER_BUNDLE);
    if (raw) {
      const parsed = JSON.parse(raw) as CacheEnvelope<MemberBundleData>;
      if (parsed && typeof parsed === 'object') {
        parsed.updatedAt = 0;
        window.localStorage.setItem(MEMBER_CACHE_KEYS.MEMBER_BUNDLE, JSON.stringify(parsed));
      }
    }
    window.localStorage.removeItem(MEMBER_CACHE_KEYS.MEMBER_BUNDLE_META);
  } catch (_) {}
}

export function readRefMasterCache(): CacheReadResult<RefMasterData> | null {
  const result = readEnvelope<RefMasterData>(MEMBER_CACHE_KEYS.REF_MASTER, REF_MASTER_TTL_MS);
  if (!result) return null;
  if (
    !Array.isArray(result.data.kecamatan) ||
    !Array.isArray(result.data.desa) ||
    !Array.isArray(result.data.jabatan)
  ) {
    return null;
  }
  return result;
}

export function writeRefMasterCache(
  refData: RefMasterData,
  ttlMs: number = REF_MASTER_TTL_MS
): number | null {
  if (!refData.kecamatan || refData.kecamatan.length === 0) return null;
  return writeEnvelope(
    MEMBER_CACHE_KEYS.REF_MASTER,
    MEMBER_CACHE_KEYS.REF_MASTER_META,
    refData,
    ttlMs
  );
}

export function isRefMasterCacheFresh(): boolean {
  const cached = readRefMasterCache();
  return Boolean(cached && cached.isFresh && cached.data.kecamatan.length > 0 && cached.data.desa.length > 0);
}

export function invalidateRefMasterCache(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const raw = window.localStorage.getItem(MEMBER_CACHE_KEYS.REF_MASTER);
    if (raw) {
      const parsed = JSON.parse(raw) as CacheEnvelope<RefMasterData>;
      if (parsed && typeof parsed === 'object') {
        parsed.updatedAt = 0;
        window.localStorage.setItem(MEMBER_CACHE_KEYS.REF_MASTER, JSON.stringify(parsed));
      }
    }
    window.localStorage.removeItem(MEMBER_CACHE_KEYS.REF_MASTER_META);
  } catch (_) {}
}

export function clearAllMemberCaches(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    Object.values(MEMBER_CACHE_KEYS).forEach((key) => {
      window.localStorage.removeItem(key);
    });
  } catch (_) {}
}
