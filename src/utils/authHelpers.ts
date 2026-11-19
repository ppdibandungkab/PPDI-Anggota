import { UserAccount } from '../types/ppdi';

export const PRIMARY_DEFAULT_PASSWORD = 'PPDIJaya#2006';

export const KNOWN_DEFAULT_PASSWORDS = [
  'PPDIJaya#2006',
  'PPDIJaya2026',
  'PPDIJaya#2026',
] as const;

export function isKnownDefaultPassword(password?: string | null): boolean {
  if (!password) return false;
  const clean = String(password).trim();
  return (KNOWN_DEFAULT_PASSWORDS as readonly string[]).includes(clean);
}

/**
 * Checks whether a user's updated_at / update_at timestamp is present and valid (NOT NULL).
 */
export function hasValidPasswordUpdateTimestamp(
  input?: Pick<Partial<UserAccount>, 'updated_at' | 'update_at'> | string | null
): boolean {
  if (!input) return false;
  const ts = typeof input === 'string' ? input : input.updated_at || input.update_at;
  if (!ts) return false;
  const str = String(ts).trim();
  if (!str || str === 'null' || str === 'undefined' || str.startsWith('0000-00-00')) {
    return false;
  }
  return true;
}

/**
 * Password dianggap SUDAH diganti (bukan default) hanya apabila memenuhi kedua syarat:
 * 1. Password saat ini berbeda dari password default awal, DAN
 * 2. Timestamp updated_at (atau update_at) bernilai NOT NULL (sudah pernah diperbarui).
 */
export function hasPasswordBeenChanged(
  user?: Pick<
    Partial<UserAccount>,
    'password' | 'updated_at' | 'update_at' | 'is_default_password'
  > | null
): boolean {
  if (!user) return false;

  const hasUpdatedTs = hasValidPasswordUpdateTimestamp(user);

  // Jika plaintext password tersedia di state lokal (misal setelah login / ubah password / offline)
  if (typeof user.password === 'string' && user.password.trim().length > 0) {
    return !isKnownDefaultPassword(user.password) && hasUpdatedTs;
  }

  // Jika data berasal dari API /api/users (tanpa field password): gunakan flag server + validasi updated_at
  const serverDefaultFlag =
    user.is_default_password === true || Number(user.is_default_password) === 1;

  return !serverDefaultFlag && hasUpdatedTs;
}

/**
 * Mengembalikan true apabila pengguna masih menggunakan password default atau belum pernah memperbarui passwordnya.
 */
export function isDefaultPasswordRequired(
  user?: Pick<
    Partial<UserAccount>,
    'password' | 'updated_at' | 'update_at' | 'is_default_password'
  > | null
): boolean {
  if (!user) return false;
  return !hasPasswordBeenChanged(user);
}
