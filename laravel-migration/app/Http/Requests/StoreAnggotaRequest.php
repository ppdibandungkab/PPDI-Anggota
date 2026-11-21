<?php

namespace App\Http\Requests;

use App\Support\NipdFormatter;

class StoreAnggotaRequest extends ApiFormRequest
{
    /**
     * Mendukung payload bersarang ({ anggota, riwayat, keanggotaan }) dari frontend React
     * maupun payload datar ({ nik, nama_lengkap, nipd, id_desa, ... }).
     * Otomatis menormalisasi NIK dan NIPD (menghapus spasi/karakter non-digit) sebelum validasi.
     */
    protected function prepareForValidation(): void
    {
        if (!$this->has('anggota') && ($this->has('nik') || $this->has('nama_lengkap'))) {
            $anggotaFields = [
                'nik', 'nipd', 'niap_nipd', 'niap', 'nama_lengkap',
                'gelar_depan', 'gelar_belakang', 'tempat_lahir', 'tanggal_lahir',
                'jenis_kelamin', 'agama', 'pendidikan_terakhir', 'no_hp_wa',
                'email', 'foto', 'alamat_rumah', 'status_pernikahan',
            ];
            $riwayatFields = [
                'id_kecamatan', 'id_desa', 'id_jabatan', 'periode',
                'no_sk_pengangkatan', 'tgl_sk_pengangkatan', 'tmt_jabatan', 'file_sk',
            ];
            $keanggotaanFields = [
                'no_kta', 'tgl_bergabung', 'jabatan_pengurus', 'status_kta',
            ];

            $anggota = [];
            foreach ($anggotaFields as $f) {
                if ($this->has($f)) {
                    $anggota[$f] = $this->input($f);
                }
            }

            $riwayat = [];
            foreach ($riwayatFields as $f) {
                if ($this->has($f)) {
                    $riwayat[$f] = $this->input($f);
                }
            }

            $keanggotaan = [];
            foreach ($keanggotaanFields as $f) {
                if ($this->has($f)) {
                    $keanggotaan[$f] = $this->input($f);
                }
            }

            $merged = ['anggota' => $anggota];
            if (!empty($riwayat)) {
                $merged['riwayat'] = $riwayat;
            }
            if (!empty($keanggotaan)) {
                $merged['keanggotaan'] = $keanggotaan;
            }

            $this->merge($merged);
        }

        $anggotaData = $this->input('anggota');
        if (is_array($anggotaData)) {
            if (isset($anggotaData['nik']) && is_string($anggotaData['nik'])) {
                $anggotaData['nik'] = preg_replace('/\s+/', '', trim($anggotaData['nik']));
            }
            if (isset($anggotaData['nama_lengkap']) && is_string($anggotaData['nama_lengkap'])) {
                $anggotaData['nama_lengkap'] = trim($anggotaData['nama_lengkap']);
            }

            // Normalisasi NIPD: hapus spasi blok & karakter non-digit agar validasi digits:28 akurat
            foreach (['nipd', 'niap_nipd', 'niap'] as $nipdKey) {
                if (array_key_exists($nipdKey, $anggotaData) && is_string($anggotaData[$nipdKey])) {
                    $anggotaData[$nipdKey] = NipdFormatter::normalize($anggotaData[$nipdKey]);
                }
            }

            // Sinkronkan alias niap_nipd / niap ke field utama nipd jika nipd kosong
            if (empty($anggotaData['nipd'])) {
                $anggotaData['nipd'] = $anggotaData['niap_nipd'] ?? $anggotaData['niap'] ?? null;
            }

            $this->merge(['anggota' => $anggotaData]);
        }

        $riwayatData = $this->input('riwayat');
        if (is_array($riwayatData)) {
            $jabatanId = (int) ($riwayatData['id_jabatan'] ?? 0);
            if ($jabatanId !== 10) {
                // Selain Kepala Desa (id_jabatan = 10), field periode selalu NULL
                $riwayatData['periode'] = null;
            } elseif (array_key_exists('periode', $riwayatData) && $riwayatData['periode'] === '') {
                $riwayatData['periode'] = null;
            }
            $this->merge(['riwayat' => $riwayatData]);
        }
    }

    public function rules(): array
    {
        return [
            'anggota'                      => ['required', 'array'],
            'anggota.nik'                  => ['required', 'string', 'digits:16'],
            'anggota.nama_lengkap'         => ['required', 'string', 'max:150'],
            'anggota.nipd'                 => ['nullable', 'string', 'digits:28'],
            'anggota.niap_nipd'            => ['nullable', 'string', 'digits:28'],
            'anggota.niap'                 => ['nullable', 'string', 'digits:28'],
            'anggota.gelar_depan'          => ['nullable', 'string', 'max:30'],
            'anggota.gelar_belakang'       => ['nullable', 'string', 'max:50'],
            'anggota.tempat_lahir'         => ['nullable', 'string', 'max:100'],
            'anggota.tanggal_lahir'        => ['nullable', 'date_format:Y-m-d'],
            'anggota.jenis_kelamin'        => ['nullable', 'in:L,P'],
            'anggota.agama'                => ['nullable', 'string', 'max:30'],
            'anggota.pendidikan_terakhir'  => ['nullable', 'string', 'max:30'],
            'anggota.no_hp_wa'             => ['nullable', 'string', 'max:20'],
            'anggota.email'                => ['nullable', 'email', 'max:100'],
            'anggota.foto'                 => ['nullable', 'string'],
            'anggota.alamat_rumah'         => ['nullable', 'string'],
            'anggota.status_pernikahan'    => ['nullable', 'string', 'max:30'],
            'riwayat'                      => ['nullable', 'array'],
            'riwayat.id_kecamatan'         => ['nullable', 'string', 'max:20'],
            'riwayat.id_desa'              => ['nullable', 'string', 'max:20'],
            'riwayat.id_jabatan'           => ['nullable', 'integer'],
            'riwayat.periode'              => ['nullable', 'integer', 'in:1,2,3', 'required_if:riwayat.id_jabatan,10'],
            'riwayat.no_sk_pengangkatan'   => ['nullable', 'string', 'max:100'],
            'riwayat.tgl_sk_pengangkatan'  => ['nullable', 'date_format:Y-m-d'],
            'riwayat.tmt_jabatan'          => ['nullable', 'date_format:Y-m-d'],
            'riwayat.file_sk'              => ['nullable', 'string'],
            'keanggotaan'                  => ['nullable', 'array'],
            'keanggotaan.no_kta'           => ['nullable', 'string', 'max:50'],
            'keanggotaan.tgl_bergabung'    => ['nullable', 'date_format:Y-m-d'],
            'keanggotaan.jabatan_pengurus' => ['nullable', 'string', 'max:100'],
            'keanggotaan.status_kta'       => ['nullable', 'string', 'max:30'],
        ];
    }

    public function messages(): array
    {
        return [
            'anggota.required'                       => 'Data anggota tidak lengkap',
            'anggota.nik.required'                   => 'Data anggota tidak lengkap',
            'anggota.nik.digits'                     => 'NIK KTP harus terdiri dari tepat 16 digit angka.',
            'anggota.nama_lengkap.required'          => 'Data anggota tidak lengkap',
            'anggota.nipd.digits'                    => 'NIPD harus terdiri dari tepat 28 digit angka (YYYYMMDD YYYYMM J [01P/02X/031] 10-digit wilayah).',
            'anggota.niap_nipd.digits'               => 'NIPD harus terdiri dari tepat 28 digit angka.',
            'anggota.niap.digits'                    => 'NIPD harus terdiri dari tepat 28 digit angka.',
            'anggota.tanggal_lahir.date_format'      => 'Format tanggal_lahir harus YYYY-MM-DD.',
            'anggota.jenis_kelamin.in'               => 'Jenis kelamin harus L atau P.',
            'anggota.email.email'                    => 'Format alamat email tidak valid.',
            'riwayat.periode.required_if'            => 'Field periode wajib diisi (1, 2, atau 3) untuk jabatan Kepala Desa (id_jabatan = 10).',
            'riwayat.periode.integer'                => 'Field periode Kepala Desa harus berupa angka 1, 2, atau 3.',
            'riwayat.periode.in'                     => 'Field periode Kepala Desa hanya boleh bernilai 1 (periode pertama), 2 (periode kedua), atau 3 (periode ketiga).',
            'riwayat.tgl_sk_pengangkatan.date_format'=> 'Format tgl_sk_pengangkatan harus YYYY-MM-DD.',
            'riwayat.tmt_jabatan.date_format'        => 'Format tmt_jabatan harus YYYY-MM-DD.',
            'keanggotaan.tgl_bergabung.date_format'  => 'Format tgl_bergabung harus YYYY-MM-DD.',
        ];
    }
}
