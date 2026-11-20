<?php

namespace App\Support;

use App\Traits\NipdFormatter as NipdFormatterTrait;

/**
 * Helper static untuk normalisasi dan pemformatan NIPD 28 Digit.
 * Mendelegasikan logika langsung ke App\Traits\NipdFormatter agar
 * perilaku normalisasi (/[^0-9]/) dan spasi tiap 4 digit selalu konsisten.
 */
final class NipdFormatter
{
    use NipdFormatterTrait;

    public const EXPECTED_LENGTH = 28;

    /**
     * Menghapus seluruh karakter non-digit (/[^0-9]/) untuk validasi & penyimpanan MySQL.
     */
    public static function normalize(?string $value): ?string
    {
        return self::normalizeNipd($value);
    }

    /**
     * Memformat digit NIPD dengan spasi setiap 4 digit untuk tampilan/API.
     * Contoh: "1985041220150110223204052001" -> "1985 0412 2015 0110 2232 0405 2001"
     */
    public static function format(?string $value): string
    {
        return self::formatNipd($value);
    }

    /**
     * Memastikan NIPD terdiri dari tepat 28 digit angka setelah normalisasi.
     */
    public static function isValid(?string $value): bool
    {
        return self::isValidNipd($value);
    }
}
