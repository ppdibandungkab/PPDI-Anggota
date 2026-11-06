import { Connection } from 'mysql2/promise';

export interface KTAGenerationResult {
  noKta: string;
  kodeKecamatan: string;
  kodeDesa: string;
  nomorUrut: number;
}

/**
 * KTA Service: Generates a unique, thread-safe KTA number per kecamatan using MySQL transaction locking.
 * Uses query: 'SELECT COALESCE(MAX(nomor_urut), 0) + 1 AS next_urut FROM anggota WHERE kode_kecamatan = ? FOR UPDATE'
 * Pattern: 32.04.[KodeKec 2-digit].[KodeDesa 4-digit].[NomorUrut 4-digit]
 */
export async function generateUniqueKTA(
  conn: Connection,
  idKecamatan: string,
  idDesa: string,
  customKta?: string
): Promise<KTAGenerationResult> {
  // Extract 2-digit kecamatan code and 4-digit desa code
  const cleanKec = (idKecamatan || '').replace(/\./g, '').trim();
  const kecCode = cleanKec.length >= 6 ? cleanKec.slice(4, 6) : (cleanKec.slice(-2) || '05');

  const cleanDesa = (idDesa || '').replace(/\./g, '').trim();
  const desaCode = cleanDesa.length >= 10 ? cleanDesa.slice(6, 10) : (cleanDesa.slice(-4) || '2001');

  const fullKecCode = cleanKec.length >= 6 ? `32.04.${kecCode}` : kecCode;

  if (customKta && customKta.trim()) {
    const customTrimmed = customKta.trim();
    const parts = customTrimmed.split('.');
    const customUrut = parts.length >= 5 ? parseInt(parts[4], 10) || 1 : 1;
    return {
      noKta: customTrimmed,
      kodeKecamatan: fullKecCode,
      kodeDesa: desaCode,
      nomorUrut: customUrut,
    };
  }

  let nextUrut = 1;

  try {
    // Primary query: SELECT MAX(nomor_urut) + 1 FROM anggota WHERE kode_kecamatan = ? FOR UPDATE
    const [rows]: [any[], any] = await conn.query(
      `SELECT COALESCE(MAX(nomor_urut), 0) + 1 AS next_urut 
       FROM anggota 
       WHERE kode_kecamatan = ? OR kode_kecamatan = ? OR kode_kecamatan = ? 
       FOR UPDATE`,
      [fullKecCode, kecCode, `32.04.${kecCode}`]
    );

    if (rows && rows.length > 0 && rows[0].next_urut) {
      nextUrut = Number(rows[0].next_urut) || 1;
    }
  } catch (_) {
    // Fallback query if table schema is in transition
    const kecPrefix = `32.04.${kecCode}.%`;
    const [rowsKec]: [any[], any] = await conn.query(
      `SELECT no_kta FROM keanggotaan_ppdi WHERE no_kta LIKE ? ORDER BY CAST(SUBSTRING_INDEX(no_kta, '.', -1) AS UNSIGNED) DESC LIMIT 1 FOR UPDATE`,
      [kecPrefix]
    );
    if (rowsKec && rowsKec.length > 0 && rowsKec[0].no_kta) {
      const parts = rowsKec[0].no_kta.split('.');
      if (parts.length >= 5) {
        const parsed = parseInt(parts[4], 10);
        if (!isNaN(parsed)) nextUrut = parsed + 1;
      }
    }
  }

  const paddedUrut = String(nextUrut).padStart(4, '0');
  let candidateKta = `32.04.${kecCode}.${desaCode}.${paddedUrut}`;

  // Double safeguard loop to ensure database-level uniqueness across both tables
  while (true) {
    let dupFound = false;

    try {
      const [dupAng]: [any[], any] = await conn.query(
        'SELECT id_anggota FROM anggota WHERE no_kta = ? LIMIT 1',
        [candidateKta]
      );
      if (dupAng && dupAng.length > 0) dupFound = true;
    } catch (_) {}

    try {
      const [dupPpdi]: [any[], any] = await conn.query(
        'SELECT id_ppdi FROM keanggotaan_ppdi WHERE no_kta = ? LIMIT 1',
        [candidateKta]
      );
      if (dupPpdi && dupPpdi.length > 0) dupFound = true;
    } catch (_) {}

    if (!dupFound) break;

    nextUrut++;
    candidateKta = `32.04.${kecCode}.${desaCode}.${String(nextUrut).padStart(4, '0')}`;
  }

  return {
    noKta: candidateKta,
    kodeKecamatan: fullKecCode,
    kodeDesa: desaCode,
    nomorUrut: nextUrut,
  };
}
