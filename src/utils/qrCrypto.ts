/**
 * QR Code Crypto & Short URL Tokenization Utility for PPDI E-KTA
 * Encrypts KTA and NIK into a secure, obfuscated URL-safe token.
 * Prevents exposing plain NIK and No KTA in QR codes and short URLs.
 */

const SECRET_SALT = 'PPDI_BDG_EKTA_2026_SECURE_TOKEN';

/**
 * Base64URL encode a UTF-8 string
 */
function base64UrlEncode(str: string): string {
  try {
    const utf8Bytes = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => {
      return String.fromCharCode(parseInt(p1, 16));
    });
    const b64 = typeof window !== 'undefined' && typeof window.btoa === 'function'
      ? window.btoa(utf8Bytes)
      : Buffer.from(str, 'utf-8').toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return '';
  }
}

/**
 * Base64URL decode to UTF-8 string
 */
function base64UrlDecode(str: string): string {
  try {
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) {
      b64 += '=';
    }
    const decoded = typeof window !== 'undefined' && typeof window.atob === 'function'
      ? window.atob(b64)
      : Buffer.from(b64, 'base64').toString('utf-8');
    return decodeURIComponent(
      Array.prototype.map
        .call(decoded, (c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  } catch {
    try {
      let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      return atob(b64);
    } catch {
      return '';
    }
  }
}

/**
 * Lightweight reversible XOR cipher with key
 */
function xorTransform(text: string, key: string): string {
  const output: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    output.push(String.fromCharCode(charCode));
  }
  return output.join('');
}

/**
 * Calculates a simple 4-char hex checksum
 */
function getChecksum(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 4);
}

export interface KtaDecodedData {
  no_kta: string;
  nik: string;
  id_anggota?: string;
  timestamp?: number;
  valid: boolean;
}

/**
 * Generates an encrypted, URL-safe token representing the member's KTA & NIK.
 * Example output: "v_3e8f_aX9mK..."
 */
export function encodeKtaToken(params: {
  no_kta: string;
  nik: string;
  id_anggota?: string;
}): string {
  const { no_kta, nik, id_anggota } = params;
  if (!no_kta || !nik) return '';

  const cleanKta = no_kta.trim();
  const cleanNik = nik.trim();
  const cleanId = (id_anggota || '').trim();

  // Compact payload structure
  const rawPayload = JSON.stringify({
    k: cleanKta,
    n: cleanNik,
    i: cleanId,
    t: Date.now(),
  });

  const check = getChecksum(rawPayload + SECRET_SALT);
  const cipher = xorTransform(rawPayload, SECRET_SALT);
  const encodedCipher = base64UrlEncode(cipher);

  return `v_${check}_${encodedCipher}`;
}

/**
 * Decodes an encrypted token or URL back to { no_kta, nik, id_anggota }.
 * Supports full verification URLs, raw tokens, or query parameters.
 */
export function decodeKtaToken(input: string): KtaDecodedData | null {
  if (!input || !input.trim()) return null;
  let text = input.trim();

  // 1. If user passed a full URL, extract the token or parameters
  if (text.includes('/v/')) {
    const parts = text.split('/v/');
    if (parts[1]) {
      text = parts[1].split('?')[0].split('#')[0].trim();
    }
  } else if (text.includes('v=')) {
    const match = text.match(/[?&]v=([^&#]+)/);
    if (match && match[1]) {
      text = decodeURIComponent(match[1]);
    }
  } else if (text.includes('token=')) {
    const match = text.match(/[?&]token=([^&#]+)/);
    if (match && match[1]) {
      text = decodeURIComponent(match[1]);
    }
  } else if (text.includes('kta=') && text.includes('nik=')) {
    // Legacy fallback URL support
    const ktaMatch = text.match(/[?&]kta=([^&#]+)/);
    const nikMatch = text.match(/[?&]nik=([^&#]+)/);
    if (ktaMatch && nikMatch) {
      return {
        no_kta: decodeURIComponent(ktaMatch[1]),
        nik: decodeURIComponent(nikMatch[1]),
        valid: true,
      };
    }
  }

  // 2. Parse encrypted token format: v_<check>_<encodedCipher>
  if (text.startsWith('v_')) {
    const segments = text.split('_');
    if (segments.length >= 3) {
      const check = segments[1];
      const encodedCipher = segments.slice(2).join('_');
      const cipher = base64UrlDecode(encodedCipher);
      if (cipher) {
        const rawPayload = xorTransform(cipher, SECRET_SALT);
        const expectedCheck = getChecksum(rawPayload + SECRET_SALT);
        if (check === expectedCheck) {
          try {
            const data = JSON.parse(rawPayload);
            if (data && data.k && data.n) {
              return {
                no_kta: data.k,
                nik: data.n,
                id_anggota: data.i,
                timestamp: data.t,
                valid: true,
              };
            }
          } catch {
            // parse error
          }
        }
      }
    }
  }

  return null;
}

/**
 * Generates the official short verification URL to be embedded into the E-KTA QR Code.
 * It does NOT display KTA or NIK in the query string!
 * E.g.: "https://ppdi-bandungkab.id/v/v_4b2a_..."
 */
export function generateKtaShortUrl(
  params: {
    no_kta: string;
    nik: string;
    id_anggota?: string;
  },
  customBaseOrigin?: string
): { url: string; token: string; shortDisplay: string } {
  const token = encodeKtaToken(params);

  // Determine domain base
  let origin = 'https://ppdi-bandungkab.id';
  if (customBaseOrigin) {
    origin = customBaseOrigin.replace(/\/+$/, '');
  } else if (typeof window !== 'undefined' && window.location?.origin) {
    // If running in development or custom domain, use active host
    origin = window.location.origin;
  }

  const url = `${origin}/v/${token}`;
  const shortDisplay = `ppdi-bandungkab.id/v/${token.slice(0, 16)}...`;

  return { url, token, shortDisplay };
}
