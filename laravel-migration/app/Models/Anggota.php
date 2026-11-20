<?php

namespace App\Models;

use App\Traits\FormatsNipd;
use Illuminate\Database\Eloquent\Model;

class Anggota extends Model
{
    use FormatsNipd;

    protected $table = 'anggota';
    protected $primaryKey = 'id_anggota';

    public $timestamps = true;

    protected $fillable = [
        'nik',
        'nipd',
        'nama_lengkap',
        'gelar_depan',
        'gelar_belakang',
        'tempat_lahir',
        'tanggal_lahir',
        'jenis_kelamin',
        'agama',
        'pendidikan_terakhir',
        'no_hp_wa',
        'email',
        'foto',
        'alamat_rumah',
        'status_pernikahan',
        'kode_kecamatan',
        'nomor_urut',
        'no_kta',
    ];

    protected $appends = ['nipd_formatted'];

    protected $casts = [
        'id_anggota'    => 'integer',
        'nomor_urut'    => 'integer',
        'tanggal_lahir' => 'date:Y-m-d',
    ];

    /**
     * Menjaga konsistensi timestamp awal: saat record baru dibuat,
     * created_at diisi otomatis, sedangkan updated_at dapat dibiarkan NULL
     * sampai terjadi pembaruan profil/data pertama jika diperlukan.
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
        }
    }
}
