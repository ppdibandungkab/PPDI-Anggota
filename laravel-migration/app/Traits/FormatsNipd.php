<?php

namespace App\Traits;

use App\Support\NipdFormatter;
use Illuminate\Database\Eloquent\Casts\Attribute;

/**
 * Trait Eloquent untuk normalisasi & pemformatan NIPD 28 digit:
 * - Mutator `nipd` menyimpan 28 digit angka bersih (tanpa spasi) ke kolom MySQL.
 * - Accessor `nipd_formatted` mengembalikan tampilan 28 digit berjarak spasi (8 6 1 3 10).
 */
trait FormatsNipd
{
    protected function nipd(): Attribute
    {
        return Attribute::make(
            get: fn (?string $value) => $value !== null ? trim($value) : null,
            set: fn (?string $value) => NipdFormatter::normalize($value),
        );
    }

    protected function nipdFormatted(): Attribute
    {
        return Attribute::make(
            get: fn () => NipdFormatter::format($this->attributes['nipd'] ?? null),
        );
    }
}
