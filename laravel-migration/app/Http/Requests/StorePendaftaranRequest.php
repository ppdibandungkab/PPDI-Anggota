<?php

namespace App\Http\Requests;

class StorePendaftaranRequest extends ApiFormRequest
{
    protected function prepareForValidation(): void
    {
        $jabatanId = (int) $this->input('id_jabatan', 1);
        if ($jabatanId !== 10) {
            // Selain Kepala Desa (id_jabatan = 10), periode selalu NULL
            $this->merge(['periode' => null]);
        } elseif ($this->input('periode') === '') {
            $this->merge(['periode' => null]);
        }
    }

    public function rules(): array
    {
        return [
            'nik'                 => ['required', 'string', 'max:16'],
            'nama_lengkap'        => ['required', 'string', 'max:150'],
            'id_desa'             => ['required', 'string', 'max:20'],
            'id_kecamatan'        => ['nullable', 'string', 'max:10'],
            'id_jabatan'          => ['nullable', 'integer'],
            'periode'             => ['nullable', 'integer', 'in:1,2,3', 'required_if:id_jabatan,10'],
            'gelar_depan'         => ['nullable', 'string', 'max:30'],
            'gelar_belakang'      => ['nullable', 'string', 'max:50'],
            'tempat_lahir'        => ['nullable', 'string', 'max:100'],
            'tanggal_lahir'       => ['nullable', 'string'],
            'jenis_kelamin'       => ['nullable', 'in:L,P'],
            'agama'               => ['nullable', 'string', 'max:30'],
            'pendidikan_terakhir' => ['nullable', 'string', 'max:30'],
            'no_hp_wa'            => ['nullable', 'string', 'max:20'],
            'email'               => ['nullable', 'string', 'max:100'],
            'alamat_rumah'        => ['nullable', 'string'],
            'status_pernikahan'   => ['nullable', 'string', 'max:30'],
            'no_sk_pengangkatan'  => ['nullable', 'string', 'max:100'],
            'tgl_sk_pengangkatan' => ['nullable', 'string'],
            'tmt_jabatan'         => ['nullable', 'string'],
            'foto'                => ['nullable', 'string'],
            'file_sk'             => ['nullable', 'string'],
            'tanda_tangan'        => ['nullable', 'string'],
        ];
    }

    public function messages(): array
    {
        return [
            'nik.required'          => 'NIK, Nama Lengkap, dan Desa penempatan wajib diisi',
            'nama_lengkap.required' => 'NIK, Nama Lengkap, dan Desa penempatan wajib diisi',
            'id_desa.required'      => 'NIK, Nama Lengkap, dan Desa penempatan wajib diisi',
            'periode.required_if'   => 'Field periode wajib diisi (1, 2, atau 3) untuk jabatan Kepala Desa (id_jabatan = 10).',
            'periode.integer'       => 'Field periode Kepala Desa harus berupa angka 1, 2, atau 3.',
            'periode.in'            => 'Field periode Kepala Desa hanya boleh bernilai 1 (periode pertama), 2 (periode kedua), atau 3 (periode ketiga).',
        ];
    }
}
