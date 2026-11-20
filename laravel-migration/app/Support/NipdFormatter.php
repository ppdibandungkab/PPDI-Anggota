<?php

namespace App\Support;

/**
 * Helper pemformatan dan normalisasi NIPD 28 Digit PPDI Kabupaten Bandung.
 *
 * Struktur 28 digit (blok 8-6-1-3-10):
 * - 8 digit  : Tanggal Lahir (YYYYMMDD)
 * - 6 digit  : TMT Pengangkatan (YYYYMM)
 * - 1 digit  : Kode Jenis Kelamin (1 = Laki-laki, 2 = Perempuan)
 * - 3 digit  : Kode Perangkat & Jabatan (02 + 1..4)
 * - 10 digit : Kode Wilayah Kemendagri (3204 + KodeKec 2-digit + KodeDesa 4-digit)
 *
 * Contoh tersimpan di MySQL : 1985041220150110223204052001
 * Contoh tampilan berjarak  : 19850412 201501 1 022 3204052001
 */
final class NipdFormatter
{
    public const EXPECTED_LENGTH = 28;

    /**
     * Menghapus seluruh spasi dan karakter non-digit untuk validasi & penyimpanan MySQL.
     */
    public static function normalize(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $digits = preg_replace('/\D+/', '', trim($value));

        return $digits === '' ? null : $digits;
    }

    /**
     * Memformat 28 digit NIPD menjadi blok berjarak spasi (8 6 1 3 10).
     * Identik dengan formatNIPDDisplay() di frontend React (ppdiHelpers.ts).
     */
    public static function format(?string $value): string
    {
        if ($value === null) {
            return '';
        }

        $trimmed = trim($value);
        if ($trimmed === '') {
            return '';
        }

        $digits = preg_replace('/\s+/', '', $trimmed);
        if (preg_match('/^\d{28}$/', (string) $digits)) {
            return sprintf(
                '%s %s %s %s %s',
                substr((string) $digits, 0, 8),
                substr((string) $digits, 8, 6),
                substr((string) $digits, 14, 1),
                substr((string) $digits, 15, 3),
                substr((string) $digits, 18, 10)
            );
        }

        return $trimmed;
    }

    /**
     * Memastikan NIPD terdiri dari tepat 28 digit angka setelah normalisasi.
     */
    public static function isValid(?string $value): bool
    {
        $normalized = self::normalize($value);

        return $normalized !== null && preg_match('/^\d{28}$/', $normalized) === 1;
    }
}
