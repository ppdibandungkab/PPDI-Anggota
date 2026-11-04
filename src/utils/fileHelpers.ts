import React from 'react';

/**
 * High-definition vector SVG avatar for Male (Laki-laki)
 * Professional Indonesian village apparatus / PPDI officer in formal attire.
 */
export const DEFAULT_AVATAR_MALE = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
  <defs>
    <linearGradient id="bgGradM" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#064E3B"/>
      <stop offset="50%" stop-color="#047857"/>
      <stop offset="100%" stop-color="#022c22"/>
    </linearGradient>
    <linearGradient id="skinM" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fed7aa"/>
      <stop offset="100%" stop-color="#fdba74"/>
    </linearGradient>
    <linearGradient id="suitM" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#064e3b"/>
      <stop offset="50%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#064e3b"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="160" height="160" rx="28" fill="url(#bgGradM)"/>
  <!-- Decorative badge border -->
  <circle cx="80" cy="80" r="74" fill="none" stroke="#FDE047" stroke-width="2" stroke-dasharray="4 2" opacity="0.4"/>
  
  <!-- Male Body / Suit -->
  <path d="M28 160 C28 124 50 114 80 114 C110 114 132 124 132 160 Z" fill="url(#suitM)"/>
  <!-- White Inner Shirt -->
  <polygon points="66,114 94,114 80,140" fill="#ffffff"/>
  <!-- Yellow / Gold PPDI Tie -->
  <polygon points="76,120 84,120 82,154 80,158 78,154" fill="#FBBF24"/>
  <!-- Suit Lapels -->
  <path d="M52 116 L66 142 L56 160 L36 160 Z" fill="#022c22" opacity="0.6"/>
  <path d="M108 116 L94 142 L104 160 L124 160 Z" fill="#022c22" opacity="0.6"/>

  <!-- Neck -->
  <rect x="71" y="94" width="18" height="24" rx="4" fill="url(#skinM)"/>

  <!-- Head / Face -->
  <ellipse cx="80" cy="70" rx="24" ry="29" fill="url(#skinM)"/>
  
  <!-- Ears -->
  <circle cx="55" cy="72" r="6" fill="#fca5a5" opacity="0.7"/>
  <circle cx="105" cy="72" r="6" fill="#fca5a5" opacity="0.7"/>

  <!-- Male Neat Hair -->
  <path d="M54 62 C54 42 66 38 80 38 C94 38 106 42 106 62 C106 52 98 44 80 44 C62 44 54 52 54 62 Z" fill="#1e293b"/>
  <path d="M53 58 C56 46 68 40 82 40 C96 40 106 47 107 58 C104 52 95 46 82 46 C67 46 57 52 53 58 Z" fill="#0f172a"/>
  
  <!-- Eyes -->
  <circle cx="71" cy="70" r="2.5" fill="#1e293b"/>
  <circle cx="89" cy="70" r="2.5" fill="#1e293b"/>
  <!-- Eyebrows -->
  <path d="M66 64 Q71 62 76 64" stroke="#1e293b" stroke-width="2" stroke-linecap="round" fill="none"/>
  <path d="M84 64 Q89 62 94 64" stroke="#1e293b" stroke-width="2" stroke-linecap="round" fill="none"/>
  <!-- Smile -->
  <path d="M74 84 Q80 89 86 84" stroke="#c2410c" stroke-width="2" stroke-linecap="round" fill="none"/>

  <!-- Gender Badge -->
  <g transform="translate(118, 118)">
    <circle cx="14" cy="14" r="14" fill="#0284c7" stroke="#ffffff" stroke-width="2"/>
    <text x="14" y="19" font-family="sans-serif" font-size="14" font-weight="bold" fill="#ffffff" text-anchor="middle">L</text>
  </g>
</svg>
`.trim())}`;

/**
 * High-definition vector SVG avatar for Female (Perempuan)
 * Professional Indonesian female village apparatus / PPDI officer in neat hijab & formal attire.
 */
export const DEFAULT_AVATAR_FEMALE = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
  <defs>
    <linearGradient id="bgGradF" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#064E3B"/>
      <stop offset="50%" stop-color="#047857"/>
      <stop offset="100%" stop-color="#022c22"/>
    </linearGradient>
    <linearGradient id="skinF" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fed7aa"/>
      <stop offset="100%" stop-color="#fdba74"/>
    </linearGradient>
    <linearGradient id="hijabF" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#047857"/>
      <stop offset="50%" stop-color="#064e3b"/>
      <stop offset="100%" stop-color="#022c22"/>
    </linearGradient>
    <linearGradient id="suitF" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="50%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="160" height="160" rx="28" fill="url(#bgGradF)"/>
  <!-- Decorative badge border -->
  <circle cx="80" cy="80" r="74" fill="none" stroke="#FDE047" stroke-width="2" stroke-dasharray="4 2" opacity="0.4"/>
  
  <!-- Female Body / Blazer -->
  <path d="M28 160 C28 126 50 118 80 118 C110 118 132 126 132 160 Z" fill="url(#suitF)"/>
  
  <!-- Hijab Drape over Shoulders & Chest -->
  <path d="M50 102 C50 128 62 142 80 142 C98 142 110 128 110 102 Z" fill="url(#hijabF)"/>
  <!-- Gold Brooch on Hijab -->
  <circle cx="80" cy="116" r="3.5" fill="#FDE047" stroke="#b45309" stroke-width="1"/>

  <!-- Hijab Head Covering (Outer Dome) -->
  <path d="M48 76 C48 42 60 34 80 34 C100 34 112 42 112 76 C112 108 98 118 80 118 C62 118 48 108 48 76 Z" fill="url(#hijabF)"/>
  <path d="M52 46 C60 38 70 36 80 36 C90 36 100 38 108 46" stroke="#FDE047" stroke-width="1.5" fill="none" opacity="0.6"/>

  <!-- Face Opening -->
  <ellipse cx="80" cy="74" rx="21" ry="25" fill="url(#skinF)"/>
  <!-- Inner Hijab Cap / Ciput Band -->
  <path d="M62 58 C68 53 74 52 80 52 C86 52 92 53 98 58 C92 55 86 54 80 54 C74 54 68 55 62 58 Z" fill="#0f172a" opacity="0.6"/>

  <!-- Eyes & Eyelashes -->
  <circle cx="72" cy="73" r="2.5" fill="#1e293b"/>
  <circle cx="88" cy="73" r="2.5" fill="#1e293b"/>
  <path d="M69 71 L66 69" stroke="#1e293b" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M91 71 L94 69" stroke="#1e293b" stroke-width="1.5" stroke-linecap="round"/>
  
  <!-- Eyebrows -->
  <path d="M67 67 Q72 65 77 67" stroke="#1e293b" stroke-width="1.8" stroke-linecap="round" fill="none"/>
  <path d="M83 67 Q88 65 93 67" stroke="#1e293b" stroke-width="1.8" stroke-linecap="round" fill="none"/>
  
  <!-- Smile with soft blush -->
  <circle cx="68" cy="79" r="3" fill="#f43f5e" opacity="0.25"/>
  <circle cx="92" cy="79" r="3" fill="#f43f5e" opacity="0.25"/>
  <path d="M75 84 Q80 88 85 84" stroke="#e11d48" stroke-width="2" stroke-linecap="round" fill="none"/>

  <!-- Gender Badge -->
  <g transform="translate(118, 118)">
    <circle cx="14" cy="14" r="14" fill="#e11d48" stroke="#ffffff" stroke-width="2"/>
    <text x="14" y="19" font-family="sans-serif" font-size="14" font-weight="bold" fill="#ffffff" text-anchor="middle">P</text>
  </g>
</svg>
`.trim())}`;

export const DEFAULT_AVATAR = DEFAULT_AVATAR_MALE;

/**
 * Returns the proper SVG Person avatar data URI according to gender (Jenis Kelamin).
 * - 'L' / 'Laki-laki' / 'Pria' -> DEFAULT_AVATAR_MALE
 * - 'P' / 'Perempuan' / 'Wanita' -> DEFAULT_AVATAR_FEMALE
 */
export function getDefaultAvatar(gender?: string | null): string {
  if (!gender) return DEFAULT_AVATAR_MALE;
  const clean = String(gender).trim().toUpperCase();
  if (clean === 'P' || clean === 'PEREMPUAN' || clean === 'WANITA' || clean === 'FEMALE') {
    return DEFAULT_AVATAR_FEMALE;
  }
  return DEFAULT_AVATAR_MALE;
}

/**
 * Resolves a photo path/URL into a valid browser image source.
 * Handles:
 * - base64 Data URLs (data:image/...)
 * - External HTTP/HTTPS URLs (filters out legacy unsplash demo avatars)
 * - Paths already starting with /uploads/foto/ or /
 * - Raw filenames stored in the database (e.g. foto_xxx.jpg) -> maps to /uploads/foto/foto_xxx.jpg
 * - Fallbacks dynamically to SVG Person Icon according to gender (Laki-laki / Perempuan)
 */
export function getPhotoUrl(foto?: string | null, gender?: string | null): string {
  if (!foto || !foto.trim()) {
    return getDefaultAvatar(gender);
  }
  const clean = foto.trim();

  // Replace any legacy Unsplash placeholder photos with SVG Person Icon according to gender
  if (clean.includes('unsplash.com')) {
    return getDefaultAvatar(gender);
  }

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

/**
 * Image onError handler to safely fall back to gender-specific SVG Person Icon if photo load fails.
 */
export function handleImageError(
  e: React.SyntheticEvent<HTMLImageElement, Event>,
  gender?: string | null
): void {
  const target = e.currentTarget;
  const fallback = getDefaultAvatar(gender);
  if (target && target.src !== fallback) {
    target.src = fallback;
  }
}
