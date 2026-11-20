<?php

namespace App\Models;

use App\Services\PpdiHelperService;
use Illuminate\Database\Eloquent\Model;

class User extends Model
{
    protected $table = 'users';
    protected $primaryKey = 'id_user';

    /**
     * Tetap mengaktifkan Eloquent timestamps, NAMUN override updateTimestamps()
     * agar saat User baru dibuat (`!$this->exists`), kolom `updated_at` & `update_at`
     * TETAP bernilai NULL (tidak otomatis terisi seperti perilaku default Laravel).
     * Kolom `updated_at` dan `update_at` baru terisi saat profil/password diperbarui.
     */
    public $timestamps = true;

    public const CREATED_AT = 'created_at';
    public const UPDATED_AT = 'updated_at';

    protected $fillable = [
        'username',
        'email',
        'nama',
        'password',
        'id_role',
        'role',
        'id_anggota',
        'id_kecamatan_scope',
        'id_kecamatan',
        'id_desa',
        'update_at',
        'updated_at',
    ];

    protected $hidden = ['password'];

    protected $casts = [
        'id_user'    => 'integer',
        'id_anggota' => 'integer',
    ];

    /**
     * Override HasTimestamps::updateTimestamps():
     * - INSERT baru  : hanya mengisi created_at, membiarkan updated_at & update_at = NULL.
     * - UPDATE       : mengisi updated_at & update_at secara eksplisit ke waktu sekarang (WIB).
     */
    protected function updateTimestamps(): void
    {
        $time = $this->freshTimestamp();

        if (!$this->exists) {
            if (!is_null(static::CREATED_AT) && !$this->isDirty(static::CREATED_AT)) {
                $this->setCreatedAt($time);
            }
            return;
        }

        if (!is_null(static::UPDATED_AT) && !$this->isDirty(static::UPDATED_AT)) {
            $this->setUpdatedAt($time);
            $this->attributes['update_at'] = $this->fromDateTime($time);
        }
    }

    /**
     * Mengembalikan timestamp pembaruan efektif (updated_at atau fallback kolom lama update_at).
     */
    public function getEffectiveUpdatedAt(): ?string
    {
        $raw = $this->attributes['updated_at'] ?? $this->attributes['update_at'] ?? null;

        return $raw !== null ? (string) $raw : null;
    }

    /**
     * Memeriksa apakah kolom updated_at / update_at sudah NOT NULL dan valid
     * (bukan kosong, bukan 'null', dan bukan '0000-00-00 00:00:00').
     */
    public function hasValidUpdatedAt(): bool
    {
        return PpdiHelperService::isValidTimestamp($this->getEffectiveUpdatedAt());
    }

    /**
     * Menentukan apakah akun masih wajib mengganti password default awal.
     * Identik dengan isDefaultPasswordRequired() pada frontend React (authHelpers.ts).
     */
    public function isDefaultPasswordRequired(?string $plainPassword = null): bool
    {
        $passToCheck = $plainPassword ?? (string) ($this->attributes['password'] ?? '');

        return PpdiHelperService::isDefaultPassword($passToCheck, $this->getEffectiveUpdatedAt());
    }

    /**
     * Cari user berdasarkan id_user atau username.
     */
    public static function findByIdOrUsername(mixed $idUser, ?string $username): ?self
    {
        $query = static::query();

        if (!empty($idUser) && is_numeric($idUser)) {
            $query->where('id_user', (int) $idUser);
            if (!empty($username)) {
                $query->orWhere('username', trim($username));
            }
            return $query->first();
        }

        if (!empty($username)) {
            return $query->where('username', trim($username))->first();
        }

        return null;
    }
}
