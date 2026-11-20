<?php

namespace App\Http\Resources;

use App\Traits\NipdFormatter;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * API Resource untuk model Anggota (atau stdClass hasil query DB).
 * Memformat NIPD 28 digit menjadi blok berjarak spasi (8 6 1 3 10) saat dikirim ke React.
 */
class AnggotaResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $rawNipd = NipdFormatter::normalizeNipd($this->nipd ?? null);
        $formattedNipd = method_exists($this->resource, 'formatNipdAttribute')
            ? $this->resource->formatNipdAttribute($rawNipd ?? ($this->nipd ?? null))
            : NipdFormatter::formatNipd($rawNipd ?? ($this->nipd ?? null));

        $tglLahir = $this->tanggal_lahir;
        if ($tglLahir instanceof \DateTimeInterface) {
            $tglLahir = $tglLahir->format('Y-m-d');
        }

        return [
            'id_anggota'          => (int) $this->id_anggota,
            'nik'                 => (string) $this->nik,
            'nipd'                => $rawNipd ?? $this->nipd,
            'nipd_formatted'      => $formattedNipd,
            'nama_lengkap'        => (string) $this->nama_lengkap,
            'gelar_depan'         => $this->gelar_depan ?? null,
            'gelar_belakang'      => $this->gelar_belakang ?? null,
            'tempat_lahir'        => $this->tempat_lahir ?? null,
            'tanggal_lahir'       => $tglLahir,
            'jenis_kelamin'       => $this->jenis_kelamin ?? 'L',
            'agama'               => $this->agama ?? 'Islam',
            'pendidikan_terakhir' => $this->pendidikan_terakhir ?? null,
            'no_hp_wa'            => $this->no_hp_wa ?? null,
            'email'               => $this->email ?? null,
            'foto'                => $this->foto ?? null,
            'alamat_rumah'        => $this->alamat_rumah ?? null,
            'status_pernikahan'   => $this->status_pernikahan ?? null,
            'kode_kecamatan'      => $this->kode_kecamatan ?? null,
            'nomor_urut'          => isset($this->nomor_urut) ? (int) $this->nomor_urut : null,
            'no_kta'              => $this->no_kta ?? null,
            'created_at'          => $this->created_at ?? null,
            'updated_at'          => $this->updated_at ?? null,
        ];
    }
}
