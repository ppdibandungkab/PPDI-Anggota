<?php

namespace App\Traits;

/**
 * Trait App\Traits\NipdFormatter untuk Eloquent Model (Anggota).
 *
 * - setNipdAttribute($value)    : Mutator Eloquent yang menghapus seluruh karakter non-digit
 *                                 menggunakan regex /[^0-9]/ sebelum disimpan ke database.
 * - formatNipdAttribute($value) : Menyisipkan spasi setiap 4 digit untuk tampilan/API Resource
 *                                 (contoh 28 digit: "1985 0412 2015 0110 2232 0405 2001").
 */
trait NipdFormatter
{
    /**
     * Menghapus seluruh karakter non-digit menggunakan regex /[^0-9]/.
     */
    public static function normalizeNipd(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $digits = preg_replace('/[^0-9]/', '', trim($value));

        return $digits === '' ? null : $digits;
    }

    /**
     * Menyisipkan spasi setiap 4 digit untuk tampilan yang rapi.
     *
     * Contoh:
     *   Input  : "1985041220150110223204052001"
     *   Output : "1985 0412 2015 0110 2232 0405 2001"
     */
    public function formatNipdAttribute(?string $value): string
    {
        return self::formatNipd($value);
    }

    /**
     * Versi static dari pemformatan spasi setiap 4 digit.
     */
    public static function formatNipd(?string $value): string
    {
        if ($value === null) {
            return '';
        }

        $digits = self::normalizeNipd($value);
        if ($digits === null) {
            return '';
        }

        return implode(' ', str_split($digits, 4));
    }

    /**
     * Memastikan NIPD terdiri dari tepat 28 digit angka setelah normalisasi.
     */
    public static function isValidNipd(?string $value): bool
    {
        $digits = self::normalizeNipd($value);

        return $digits !== null && preg_match('/^\d{28}$/', $digits) === 1;
    }

    /**
     * Mutator Eloquent: otomatis membersihkan karakter non-digit (/[^0-9]/) sebelum disimpan ke DB.
     */
    public function setNipdAttribute(?string $value): void
    {
        $this->attributes['nipd'] = self::normalizeNipd($value);
    }

    /**
     * Accessor Eloquent untuk atribut virtual `nipd_formatted` ($anggota->nipd_formatted).
     */
    public function getNipdFormattedAttribute(): string
    {
        return $this->formatNipdAttribute($this->attributes['nipd'] ?? null);
    }
}
