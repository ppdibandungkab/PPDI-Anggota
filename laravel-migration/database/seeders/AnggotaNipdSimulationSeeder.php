<?php

namespace Database\Seeders;

use App\Services\KtaGeneratorService;
use App\Services\NipdGeneratorService;
use App\Support\NipdFormatter;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Seeder simulasi data anggota PPDI Kabupaten Bandung dengan format NIPD 28 digit terbaru.
 *
 * Mencakup seluruh skenario pengujian validasi 28 digit & pemformatan spasi di frontend:
 * - Kepala Desa (01 + periode 1, 2, 3) dengan kolom `periode` terisi (1/2/3)
 * - Perangkat Desa (02 + kode jabatan: 1 Sekdes, 2 Kasi, 3 Kaur, 4 Kewilayahan/Kadus), `periode = NULL`
 * - Staf Perangkat Desa (03 + 1), `periode = NULL`
 * - Lintas kecamatan (Soreang, Banjaran, Baleendah) dan lintas jenis kelamin (L / P)
 *
 * Cara menjalankan:
 *   php artisan db:seed --class=AnggotaNipdSimulationSeeder
 */
class AnggotaNipdSimulationSeeder extends Seeder
{
    public function run(): void
    {
        $nipdService = app(NipdGeneratorService::class);
        $ktaService = app(KtaGeneratorService::class);

        $this->seedBaselineReferences();

        $samples = [
            // 1. Kepala Desa — Periode Ke-1 (Laki-laki) => 011
            [
                'nik'                 => '3204051405800001',
                'nama_lengkap'        => 'H. DEDI SUPRIADI',
                'gelar_depan'         => 'H.',
                'gelar_belakang'      => 'S.IP',
                'tempat_lahir'        => 'Bandung',
                'tanggal_lahir'       => '1980-05-14',
                'jenis_kelamin'       => 'L',
                'pendidikan_terakhir' => 'S1',
                'no_hp_wa'            => '081220001001',
                'email'               => 'dedi.kades1@desa.bandungkab.go.id',
                'alamat_rumah'        => 'Jl. Raya Soreang No. 10 RT 01/02',
                'id_kecamatan'        => '32.04.05',
                'id_desa'             => '32.04.05.2001',
                'id_jabatan'          => 10,
                'user_type'           => 'Kepala Desa',
                'periode'             => 1,
                'no_sk_pengangkatan'  => '141.1/Kep.101-Bup/2021',
                'tgl_sk_pengangkatan' => '2021-11-10',
                'tmt_jabatan'         => '2021-11-20',
                'jabatan_pengurus'    => 'Penasehat',
            ],
            // 2. Kepala Desa — Periode Ke-2 (Perempuan) => 012
            [
                'nik'                 => '3204056208780002',
                'nama_lengkap'        => 'HJ. NENG SITI MARYAM',
                'gelar_depan'         => 'Hj.',
                'gelar_belakang'      => 'S.Sos',
                'tempat_lahir'        => 'Bandung',
                'tanggal_lahir'       => '1978-08-22',
                'jenis_kelamin'       => 'P',
                'pendidikan_terakhir' => 'S1',
                'no_hp_wa'            => '081220001002',
                'email'               => 'siti.kades2@desa.bandungkab.go.id',
                'alamat_rumah'        => 'Kp. Cingcin Tengah RT 02/04',
                'id_kecamatan'        => '32.04.05',
                'id_desa'             => '32.04.05.2002',
                'id_jabatan'          => 10,
                'user_type'           => 'Kepala Desa',
                'periode'             => 2,
                'no_sk_pengangkatan'  => '141.1/Kep.202-Bup/2023',
                'tgl_sk_pengangkatan' => '2023-10-15',
                'tmt_jabatan'         => '2023-11-01',
                'jabatan_pengurus'    => 'Anggota Istimewa',
            ],
            // 3. Kepala Desa — Periode Ke-3 (Laki-laki) => 013
            [
                'nik'                 => '3204130502750003',
                'nama_lengkap'        => 'ASEP RAHMAT HIDAYAT',
                'gelar_depan'         => null,
                'gelar_belakang'      => 'S.AP',
                'tempat_lahir'        => 'Bandung',
                'tanggal_lahir'       => '1975-02-05',
                'jenis_kelamin'       => 'L',
                'pendidikan_terakhir' => 'S1',
                'no_hp_wa'            => '081220001003',
                'email'               => 'asep.kades3@desa.bandungkab.go.id',
                'alamat_rumah'        => 'Jl. Raya Banjaran No. 88 RT 03/01',
                'id_kecamatan'        => '32.04.13',
                'id_desa'             => '32.04.13.2001',
                'id_jabatan'          => 10,
                'user_type'           => 'Kepala Desa',
                'periode'             => 3,
                'no_sk_pengangkatan'  => '141.1/Kep.303-Bup/2022',
                'tgl_sk_pengangkatan' => '2022-05-01',
                'tmt_jabatan'         => '2022-05-15',
                'jabatan_pengurus'    => 'Penasehat',
            ],
            // 4. Perangkat Desa — Sekretaris Desa (id_jabatan = 1, L) => 021
            [
                'nik'                 => '3204051203850004',
                'nama_lengkap'        => 'YUSUF MAULANA',
                'gelar_depan'         => null,
                'gelar_belakang'      => 'S.Kom',
                'tempat_lahir'        => 'Bandung',
                'tanggal_lahir'       => '1985-03-12',
                'jenis_kelamin'       => 'L',
                'pendidikan_terakhir' => 'S1',
                'no_hp_wa'            => '081220001004',
                'email'               => 'yusuf.sekdes@desa.bandungkab.go.id',
                'alamat_rumah'        => 'Kp. Pamekaran RT 01/05',
                'id_kecamatan'        => '32.04.05',
                'id_desa'             => '32.04.05.2001',
                'id_jabatan'          => 1,
                'user_type'           => 'Perangkat',
                'periode'             => null,
                'no_sk_pengangkatan'  => '141.1/Kep.01-Desa/2023',
                'tgl_sk_pengangkatan' => '2023-01-15',
                'tmt_jabatan'         => '2023-02-01',
                'jabatan_pengurus'    => 'Ketua Pengurus Kecamatan',
            ],
            // 5. Perangkat Desa — Kasi Pemerintahan (id_jabatan = 2, P) => 022
            [
                'nik'                 => '3204055507890005',
                'nama_lengkap'        => 'RINA KARTIKA SARI',
                'gelar_depan'         => null,
                'gelar_belakang'      => 'S.AP',
                'tempat_lahir'        => 'Bandung',
                'tanggal_lahir'       => '1989-07-15',
                'jenis_kelamin'       => 'P',
                'pendidikan_terakhir' => 'S1',
                'no_hp_wa'            => '081220001005',
                'email'               => 'rina.kasipem@desa.bandungkab.go.id',
                'alamat_rumah'        => 'Kp. Cingcin Kolot RT 04/02',
                'id_kecamatan'        => '32.04.05',
                'id_desa'             => '32.04.05.2002',
                'id_jabatan'          => 2,
                'user_type'           => 'Perangkat',
                'periode'             => null,
                'no_sk_pengangkatan'  => '141.1/Kep.04-Desa/2022',
                'tgl_sk_pengangkatan' => '2022-03-01',
                'tmt_jabatan'         => '2022-03-10',
                'jabatan_pengurus'    => 'Anggota Biasa',
            ],
            // 6. Perangkat Desa — Kasi Pelayanan (id_jabatan = 4, L) => 022
            [
                'nik'                 => '3204131911910006',
                'nama_lengkap'        => 'GALIH PRATAMA',
                'gelar_depan'         => null,
                'gelar_belakang'      => 'S.Pd',
                'tempat_lahir'        => 'Bandung',
                'tanggal_lahir'       => '1991-11-19',
                'jenis_kelamin'       => 'L',
                'pendidikan_terakhir' => 'S1',
                'no_hp_wa'            => '081220001006',
                'email'               => 'galih.kasipel@desa.bandungkab.go.id',
                'alamat_rumah'        => 'Jl. Sindangreret No. 21 Banjaran',
                'id_kecamatan'        => '32.04.13',
                'id_desa'             => '32.04.13.2001',
                'id_jabatan'          => 4,
                'user_type'           => 'Perangkat',
                'periode'             => null,
                'no_sk_pengangkatan'  => '141.1/Kep.09-Desa/2024',
                'tgl_sk_pengangkatan' => '2024-01-20',
                'tmt_jabatan'         => '2024-02-01',
                'jabatan_pengurus'    => 'Anggota Biasa',
            ],
            // 7. Perangkat Desa — Kaur Keuangan (id_jabatan = 6, P) => 023
            [
                'nik'                 => '3204326005900007',
                'nama_lengkap'        => 'SITI RAHMAWATI',
                'gelar_depan'         => null,
                'gelar_belakang'      => 'S.E',
                'tempat_lahir'        => 'Bandung',
                'tanggal_lahir'       => '1990-05-20',
                'jenis_kelamin'       => 'P',
                'pendidikan_terakhir' => 'S1',
                'no_hp_wa'            => '081220001007',
                'email'               => 'siti.kaurkeu@desa.bandungkab.go.id',
                'alamat_rumah'        => 'Kp. Bojongmalaka RT 02/06',
                'id_kecamatan'        => '32.04.32',
                'id_desa'             => '32.04.32.2002',
                'id_jabatan'          => 6,
                'user_type'           => 'Perangkat',
                'periode'             => null,
                'no_sk_pengangkatan'  => '141.1/Kep.12-Desa/2024',
                'tgl_sk_pengangkatan' => '2024-02-15',
                'tmt_jabatan'         => '2024-03-01',
                'jabatan_pengurus'    => 'Bendahara Kecamatan',
            ],
            // 8. Perangkat Desa — Kaur Perencanaan (id_jabatan = 7, L) => 023
            [
                'nik'                 => '3204130804870008',
                'nama_lengkap'        => 'BUDI SANTOSO',
                'gelar_depan'         => null,
                'gelar_belakang'      => 'S.T',
                'tempat_lahir'        => 'Bandung',
                'tanggal_lahir'       => '1987-04-08',
                'jenis_kelamin'       => 'L',
                'pendidikan_terakhir' => 'S1',
                'no_hp_wa'            => '081220001008',
                'email'               => 'budi.kaurper@desa.bandungkab.go.id',
                'alamat_rumah'        => 'Kp. Ciapus RT 05/03 Banjaran',
                'id_kecamatan'        => '32.04.13',
                'id_desa'             => '32.04.13.2002',
                'id_jabatan'          => 7,
                'user_type'           => 'Perangkat',
                'periode'             => null,
                'no_sk_pengangkatan'  => '141.1/Kep.14-Desa/2021',
                'tgl_sk_pengangkatan' => '2021-07-01',
                'tmt_jabatan'         => '2021-07-15',
                'jabatan_pengurus'    => 'Anggota Biasa',
            ],
            // 9. Perangkat Desa — Kepala Dusun / Kewilayahan (id_jabatan = 8, L) => 024
            [
                'nik'                 => '3204320910880009',
                'nama_lengkap'        => 'UJANG SUHERMAN',
                'gelar_depan'         => null,
                'gelar_belakang'      => null,
                'tempat_lahir'        => 'Bandung',
                'tanggal_lahir'       => '1988-10-09',
                'jenis_kelamin'       => 'L',
                'pendidikan_terakhir' => 'SMA/SMK',
                'no_hp_wa'            => '081220001009',
                'email'               => 'ujang.kadus@desa.bandungkab.go.id',
                'alamat_rumah'        => 'Kp. Rancamanyar RT 01/08',
                'id_kecamatan'        => '32.04.32',
                'id_desa'             => '32.04.32.2001',
                'id_jabatan'          => 8,
                'user_type'           => 'Perangkat',
                'periode'             => null,
                'no_sk_pengangkatan'  => '141.1/Kep.18-Desa/2020',
                'tgl_sk_pengangkatan' => '2020-06-01',
                'tmt_jabatan'         => '2020-06-15',
                'jabatan_pengurus'    => 'Anggota Biasa',
            ],
            // 10. Staf Perangkat Desa (id_jabatan = 9, P) => 031
            [
                'nik'                 => '3204054501950010',
                'nama_lengkap'        => 'DEWI ANGGRAENI',
                'gelar_depan'         => null,
                'gelar_belakang'      => 'A.Md',
                'tempat_lahir'        => 'Bandung',
                'tanggal_lahir'       => '1995-01-05',
                'jenis_kelamin'       => 'P',
                'pendidikan_terakhir' => 'D3',
                'no_hp_wa'            => '081220001010',
                'email'               => 'dewi.staf@desa.bandungkab.go.id',
                'alamat_rumah'        => 'Jl. Al-Fathu No. 17 Soreang',
                'id_kecamatan'        => '32.04.05',
                'id_desa'             => '32.04.05.2001',
                'id_jabatan'          => 9,
                'user_type'           => 'Staf',
                'periode'             => null,
                'no_sk_pengangkatan'  => '141.1/Kep.21-Desa/2024',
                'tgl_sk_pengangkatan' => '2024-01-05',
                'tmt_jabatan'         => '2024-01-10',
                'jabatan_pengurus'    => 'Anggota Biasa',
            ],
        ];

        $previewRows = [];

        foreach ($samples as $item) {
            $nipd28 = $nipdService->generate(
                birthDate: $item['tanggal_lahir'],
                appointmentDate: $item['tmt_jabatan'],
                gender: $item['jenis_kelamin'],
                userType: $item['user_type'],
                jabatanId: $item['id_jabatan'],
                locationCodes: [
                    'id_kecamatan' => $item['id_kecamatan'],
                    'id_desa'      => $item['id_desa'],
                ],
                periode: $item['periode'],
                strictPeriode: true
            );

            $formattedNipd = NipdFormatter::format($nipd28);

            $existing = DB::table('anggota')->where('nik', $item['nik'])->first();
            if ($existing) {
                // Perbarui NIPD dan periode pada riwayat aktif agar hasil simulasi selalu sinkron
                DB::table('anggota')
                    ->where('id_anggota', $existing->id_anggota)
                    ->update(['nipd' => $nipd28]);

                DB::table('riwayat_jabatan')
                    ->where('id_anggota', $existing->id_anggota)
                    ->where('status_aktif', 'Aktif')
                    ->update([
                        'id_jabatan' => $item['id_jabatan'],
                        'periode'    => $item['periode'],
                    ]);

                $previewRows[] = [
                    $item['nik'],
                    $item['nama_lengkap'],
                    $item['user_type'] . " (#{$item['id_jabatan']})",
                    $item['periode'] ?? 'NULL',
                    $nipd28,
                    $formattedNipd,
                    'UPDATED',
                ];
                continue;
            }

            $ktaService->executeWithUniqueRetry(function () use ($item, $nipd28, $ktaService) {
                $idAnggota = (int) DB::table('anggota')->insertGetId([
                    'nik'                 => $item['nik'],
                    'nipd'                => $nipd28,
                    'nama_lengkap'        => $item['nama_lengkap'],
                    'gelar_depan'         => $item['gelar_depan'],
                    'gelar_belakang'      => $item['gelar_belakang'],
                    'tempat_lahir'        => $item['tempat_lahir'],
                    'tanggal_lahir'       => $item['tanggal_lahir'],
                    'jenis_kelamin'       => $item['jenis_kelamin'],
                    'agama'               => 'Islam',
                    'pendidikan_terakhir' => $item['pendidikan_terakhir'],
                    'no_hp_wa'            => $item['no_hp_wa'],
                    'email'               => $item['email'],
                    'alamat_rumah'        => $item['alamat_rumah'],
                    'status_pernikahan'   => 'Kawin',
                ]);

                DB::table('riwayat_jabatan')->insert([
                    'id_anggota'          => $idAnggota,
                    'id_desa'             => $item['id_desa'],
                    'id_jabatan'          => $item['id_jabatan'],
                    'periode'             => $item['periode'],
                    'no_sk_pengangkatan'  => $item['no_sk_pengangkatan'],
                    'tgl_sk_pengangkatan' => $item['tgl_sk_pengangkatan'],
                    'tmt_jabatan'         => $item['tmt_jabatan'],
                    'status_aktif'        => 'Aktif',
                ]);

                $kta = $ktaService->generateNextForKecamatan($item['id_kecamatan'], $item['id_desa']);

                DB::table('keanggotaan_ppdi')->insert([
                    'id_anggota'       => $idAnggota,
                    'no_kta'           => $kta['noKta'],
                    'tgl_bergabung'    => date('Y-m-d'),
                    'jabatan_pengurus' => $item['jabatan_pengurus'],
                    'status_kta'       => 'Aktif',
                ]);

                DB::table('anggota')->where('id_anggota', $idAnggota)->update([
                    'kode_kecamatan' => $kta['kodeKecamatan'],
                    'nomor_urut'     => $kta['nomorUrut'],
                    'no_kta'         => $kta['noKta'],
                ]);
            });

            $previewRows[] = [
                $item['nik'],
                $item['nama_lengkap'],
                $item['user_type'] . " (#{$item['id_jabatan']})",
                $item['periode'] ?? 'NULL',
                $nipd28,
                $formattedNipd,
                'INSERTED',
            ];
        }

        if ($this->command) {
            $this->command->info('Simulasi 10 data anggota NIPD 28 digit berhasil disemai:');
            $this->command->table(
                ['NIK', 'Nama Lengkap', 'Unsur (ID)', 'Periode', 'NIPD Raw (28 Digit)', 'NIPD Spasi', 'Status'],
                $previewRows
            );
        }
    }

    /**
     * Memastikan data master kecamatan, desa, dan 10 jabatan standar tersedia (idempotent).
     */
    private function seedBaselineReferences(): void
    {
        $kecamatans = [
            ['id_kecamatan' => '32.04.05', 'nama_kecamatan' => 'Soreang'],
            ['id_kecamatan' => '32.04.13', 'nama_kecamatan' => 'Banjaran'],
            ['id_kecamatan' => '32.04.32', 'nama_kecamatan' => 'Baleendah'],
        ];
        foreach ($kecamatans as $k) {
            DB::table('ref_kecamatan')->updateOrInsert(
                ['id_kecamatan' => $k['id_kecamatan']],
                ['nama_kecamatan' => $k['nama_kecamatan']]
            );
        }

        $desas = [
            ['id_desa' => '32.04.05.2001', 'id_kecamatan' => '32.04.05', 'nama_desa' => 'Pamekaran'],
            ['id_desa' => '32.04.05.2002', 'id_kecamatan' => '32.04.05', 'nama_desa' => 'Cingcin'],
            ['id_desa' => '32.04.13.2001', 'id_kecamatan' => '32.04.13', 'nama_desa' => 'Banjaran'],
            ['id_desa' => '32.04.13.2002', 'id_kecamatan' => '32.04.13', 'nama_desa' => 'Ciapus'],
            ['id_desa' => '32.04.32.2001', 'id_kecamatan' => '32.04.32', 'nama_desa' => 'Rancamanyar'],
            ['id_desa' => '32.04.32.2002', 'id_kecamatan' => '32.04.32', 'nama_desa' => 'Bojongmalaka'],
        ];
        foreach ($desas as $d) {
            DB::table('ref_desa')->updateOrInsert(
                ['id_desa' => $d['id_desa']],
                ['id_kecamatan' => $d['id_kecamatan'], 'nama_desa' => $d['nama_desa']]
            );
        }

        $jabatans = [
            ['id_jabatan' => 1,  'nama_jabatan' => 'Sekretaris Desa',         'kategori_jabatan' => 'Sekretariat'],
            ['id_jabatan' => 2,  'nama_jabatan' => 'Kasi Pemerintahan',       'kategori_jabatan' => 'Pelaksana Teknis'],
            ['id_jabatan' => 3,  'nama_jabatan' => 'Kasi Kesejahteraan',      'kategori_jabatan' => 'Pelaksana Teknis'],
            ['id_jabatan' => 4,  'nama_jabatan' => 'Kasi Pelayanan',          'kategori_jabatan' => 'Pelaksana Teknis'],
            ['id_jabatan' => 5,  'nama_jabatan' => 'Kaur Tata Usaha dan Umum','kategori_jabatan' => 'Sekretariat'],
            ['id_jabatan' => 6,  'nama_jabatan' => 'Kaur Keuangan',           'kategori_jabatan' => 'Sekretariat'],
            ['id_jabatan' => 7,  'nama_jabatan' => 'Kaur Perencanaan',        'kategori_jabatan' => 'Sekretariat'],
            ['id_jabatan' => 8,  'nama_jabatan' => 'Kepala Dusun',            'kategori_jabatan' => 'Pelaksana Kewilayahan'],
            ['id_jabatan' => 9,  'nama_jabatan' => 'Staf Perangkat Desa',     'kategori_jabatan' => 'Staf Desa'],
            ['id_jabatan' => 10, 'nama_jabatan' => 'Kepala Desa',             'kategori_jabatan' => 'Kepala Desa'],
        ];
        foreach ($jabatans as $j) {
            DB::table('ref_jabatan')->updateOrInsert(
                ['id_jabatan' => $j['id_jabatan']],
                ['nama_jabatan' => $j['nama_jabatan'], 'kategori_jabatan' => $j['kategori_jabatan']]
            );
        }
    }
}
