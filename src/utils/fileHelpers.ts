export const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80';

/**
 * Resolves a photo path/URL into a valid browser image source.
 * Handles:
 * - base64 Data URLs (data:image/...)
 * - External HTTP/HTTPS URLs
 * - Paths already starting with /uploads/foto/ or /
 * - Raw filenames stored in the database (e.g. foto_xxx.jpg) -> maps to /uploads/foto/foto_xxx.jpg
 */
export function getPhotoUrl(foto?: string | null): string {
  if (!foto || !foto.trim()) {
    return DEFAULT_AVATAR;
  }
  const clean = foto.trim();
  if (
    clean.startsWith('http://') ||
    clean.startsWith('https://') ||
    clean.startsWith('data:') ||
    clean.startsWith('/')
  ) {
    return clean;
  }
  return `/uploads/foto/${clean}`;
}

/**
 * Resolves an SK document file path/URL into a downloadable or viewable link.
 * Handles:
 * - base64 Data URLs (data:application/pdf...)
 * - External HTTP/HTTPS URLs
 * - Paths already starting with /uploads/sk/ or /
 * - Raw filenames stored in the database (e.g. sk_xxx.pdf) -> maps to /uploads/sk/sk_xxx.pdf
 */
export function getSkFileUrl(fileSk?: string | null): string {
  if (!fileSk || !fileSk.trim()) {
    return '';
  }
  const clean = fileSk.trim();
  if (
    clean.startsWith('http://') ||
    clean.startsWith('https://') ||
    clean.startsWith('data:') ||
    clean.startsWith('/')
  ) {
    return clean;
  }
  return `/uploads/sk/${clean}`;
}

/**
 * Extracts a user-friendly display filename.
 */
export function getFileNameDisplay(pathOrUrl?: string | null, fallback = 'Dokumen_SK.pdf'): string {
  if (!pathOrUrl || !pathOrUrl.trim()) return fallback;
  const clean = pathOrUrl.trim();
  if (clean.startsWith('data:')) {
    return 'Berkas_Digital_Tersimpan';
  }
  const parts = clean.split('/');
  return parts[parts.length - 1] || fallback;
}
