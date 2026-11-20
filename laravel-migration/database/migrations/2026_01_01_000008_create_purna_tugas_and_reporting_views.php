<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * 8 Live MySQL Views untuk Monitoring Purna Tugas (Usia 60 Tahun) & Agregasi Wilayah/Iuran.
     */
    public function up(): void
    {
        DB::unprepared("
            CREATE OR REPLACE VIEW `v_anggota_aktif_kabupaten` AS
            SELECT
                a.id_anggota,
                a.nik,
                a.nipd,
                CONCAT(IFNULL(CONCAT(a.gelar_depan, ' '), ''), a.nama_lengkap, IFNULL(CONCAT(', ', a.gelar_belakang), '')) AS nama_bergelar,
                a.nama_lengkap,
                a.tanggal_lahir,
                TIMESTAMPDIFF(YEAR, a.tanggal_lahir, CURDATE()) AS usia,
                (60 - TIMESTAMPDIFF(YEAR, a.tanggal_lahir, CURDATE())) AS sisa_tahun_pensiun,
                a.no_hp_wa,
                k.id_kecamatan,
                k.nama_kecamatan,
                d.id_desa,
                d.nama_desa,
                j.id_jabatan,
                j.nama_jabatan,
                j.kategori_jabatan,
                rj.no_sk_pengangkatan,
                rj.tmt_jabatan,
                kp.no_kta,
                kp.status_kta,
                kp.jabatan_pengurus
            FROM anggota a
            JOIN riwayat_jabatan rj ON a.id_anggota = rj.id_anggota AND rj.status_aktif = 'Aktif'
            JOIN ref_desa d ON rj.id_desa = d.id_desa
            JOIN ref_kecamatan k ON d.id_kecamatan = k.id_kecamatan
            JOIN ref_jabatan j ON rj.id_jabatan = j.id_jabatan
            LEFT JOIN keanggotaan_ppdi kp ON a.id_anggota = kp.id_anggota
        ");

        DB::unprepared("
            CREATE OR REPLACE VIEW `v_purna_tugas_alert` AS
            SELECT
                a.id_anggota,
                a.nik,
                a.nama_lengkap,
                a.no_hp_wa,
                a.tanggal_lahir,
                DATE_ADD(a.tanggal_lahir, INTERVAL 60 YEAR) AS tanggal_purna_tugas,
                PERIOD_DIFF(
                    EXTRACT(YEAR_MONTH FROM DATE_ADD(a.tanggal_lahir, INTERVAL 60 YEAR)),
                    EXTRACT(YEAR_MONTH FROM CURDATE())
                ) AS sisa_bulan_pensiun,
                k.nama_kecamatan,
                d.nama_desa,
                j.nama_jabatan,
                CASE
                    WHEN DATE_ADD(a.tanggal_lahir, INTERVAL 60 YEAR) <= CURDATE() THEN 'Sudah Purna Tugas'
                    WHEN PERIOD_DIFF(EXTRACT(YEAR_MONTH FROM DATE_ADD(a.tanggal_lahir, INTERVAL 60 YEAR)), EXTRACT(YEAR_MONTH FROM CURDATE())) <= 6 THEN 'Kritis (<6 Bulan)'
                    WHEN PERIOD_DIFF(EXTRACT(YEAR_MONTH FROM DATE_ADD(a.tanggal_lahir, INTERVAL 60 YEAR)), EXTRACT(YEAR_MONTH FROM CURDATE())) <= 12 THEN 'Siaga (<1 Tahun)'
                    WHEN PERIOD_DIFF(EXTRACT(YEAR_MONTH FROM DATE_ADD(a.tanggal_lahir, INTERVAL 60 YEAR)), EXTRACT(YEAR_MONTH FROM CURDATE())) <= 24 THEN 'Waspada (<2 Tahun)'
                    ELSE 'Aman'
                END AS status_peringatan
            FROM anggota a
            JOIN riwayat_jabatan rj ON a.id_anggota = rj.id_anggota AND rj.status_aktif = 'Aktif'
            JOIN ref_desa d ON rj.id_desa = d.id_desa
            JOIN ref_kecamatan k ON d.id_kecamatan = k.id_kecamatan
            JOIN ref_jabatan j ON rj.id_jabatan = j.id_jabatan
            WHERE j.kategori_jabatan <> 'Kepala Desa'
              AND LOWER(j.nama_jabatan) NOT LIKE '%kepala desa%'
              AND LOWER(j.nama_jabatan) NOT LIKE '%kades%'
            ORDER BY sisa_bulan_pensiun ASC
        ");

        DB::unprepared("
            CREATE OR REPLACE VIEW `v_monitoring_pensiun_perangkat` AS
            SELECT
                a.id_anggota,
                a.nik,
                a.nipd,
                a.nama_lengkap,
                a.jenis_kelamin,
                a.no_hp_wa,
                d.id_desa,
                d.nama_desa,
                k.id_kecamatan,
                k.nama_kecamatan,
                j.nama_jabatan,
                a.tanggal_lahir,
                TIMESTAMPDIFF(YEAR, a.tanggal_lahir, CURDATE()) AS usia_sekarang,
                DATE_ADD(a.tanggal_lahir, INTERVAL 60 YEAR) AS tanggal_pensiun_60,
                (60 - TIMESTAMPDIFF(YEAR, a.tanggal_lahir, CURDATE())) AS sisa_tahun_pensiun,
                CASE
                    WHEN TIMESTAMPDIFF(YEAR, a.tanggal_lahir, CURDATE()) >= 60 THEN 'Sudah Mencapai Usia Pensiun'
                    WHEN TIMESTAMPDIFF(YEAR, a.tanggal_lahir, CURDATE()) = 59 THEN 'Pensiun Tahun Ini (Siap-siap Regenerasi)'
                    WHEN TIMESTAMPDIFF(YEAR, a.tanggal_lahir, CURDATE()) = 58 THEN '2 Tahun Menuju Pensiun'
                    WHEN TIMESTAMPDIFF(YEAR, a.tanggal_lahir, CURDATE()) = 57 THEN '3 Tahun Menuju Pensiun'
                    ELSE 'Masa Bakti Masih Panjang'
                END AS status_pensiun_kategori
            FROM anggota a
            JOIN riwayat_jabatan r ON a.id_anggota = r.id_anggota
            JOIN ref_desa d ON r.id_desa = d.id_desa
            JOIN ref_kecamatan k ON d.id_kecamatan = k.id_kecamatan
            JOIN ref_jabatan j ON r.id_jabatan = j.id_jabatan
            WHERE r.status_aktif = 'Aktif'
              AND j.kategori_jabatan <> 'Kepala Desa'
              AND LOWER(j.nama_jabatan) NOT LIKE '%kepala desa%'
              AND LOWER(j.nama_jabatan) NOT LIKE '%kades%'
        ");

        DB::unprepared("
            CREATE OR REPLACE VIEW `v_rekap_ppdi_kecamatan` AS
            SELECT
                k.id_kecamatan,
                k.nama_kecamatan,
                COUNT(DISTINCT r.id_anggota) AS total_terdaftar,
                SUM(CASE WHEN r.status_aktif = 'Aktif' AND p.status_kta = 'Aktif' THEN 1 ELSE 0 END) AS total_aktif,
                SUM(CASE WHEN r.status_aktif = 'Aktif' AND p.status_kta = 'Aktif' AND a.jenis_kelamin = 'L' THEN 1 ELSE 0 END) AS total_laki_laki,
                SUM(CASE WHEN r.status_aktif = 'Aktif' AND p.status_kta = 'Aktif' AND a.jenis_kelamin = 'P' THEN 1 ELSE 0 END) AS total_perempuan,
                SUM(CASE WHEN r.status_aktif <> 'Aktif' OR p.status_kta <> 'Aktif' THEN 1 ELSE 0 END) AS total_non_aktif
            FROM ref_kecamatan k
            LEFT JOIN ref_desa d ON k.id_kecamatan = d.id_kecamatan
            LEFT JOIN riwayat_jabatan r ON d.id_desa = r.id_desa
            LEFT JOIN anggota a ON r.id_anggota = a.id_anggota
            LEFT JOIN keanggotaan_ppdi p ON a.id_anggota = p.id_anggota
            GROUP BY k.id_kecamatan, k.nama_kecamatan
        ");

        DB::unprepared("
            CREATE OR REPLACE VIEW `v_rekap_ppdi_desa` AS
            SELECT
                d.id_desa,
                d.nama_desa,
                k.id_kecamatan,
                k.nama_kecamatan,
                COUNT(DISTINCT r.id_anggota) AS total_terdaftar,
                SUM(CASE WHEN r.status_aktif = 'Aktif' AND p.status_kta = 'Aktif' THEN 1 ELSE 0 END) AS total_aktif,
                SUM(CASE WHEN r.status_aktif = 'Aktif' AND p.status_kta = 'Aktif' AND a.jenis_kelamin = 'L' THEN 1 ELSE 0 END) AS total_laki_laki,
                SUM(CASE WHEN r.status_aktif = 'Aktif' AND p.status_kta = 'Aktif' AND a.jenis_kelamin = 'P' THEN 1 ELSE 0 END) AS total_perempuan,
                SUM(CASE WHEN r.status_aktif <> 'Aktif' OR p.status_kta <> 'Aktif' THEN 1 ELSE 0 END) AS total_non_aktif
            FROM ref_desa d
            JOIN ref_kecamatan k ON d.id_kecamatan = k.id_kecamatan
            LEFT JOIN riwayat_jabatan r ON d.id_desa = r.id_desa
            LEFT JOIN anggota a ON r.id_anggota = a.id_anggota
            LEFT JOIN keanggotaan_ppdi p ON a.id_anggota = p.id_anggota
            GROUP BY d.id_desa, d.nama_desa, k.id_kecamatan, k.nama_kecamatan
        ");

        DB::unprepared("
            CREATE OR REPLACE VIEW `v_rekap_iuran_kecamatan` AS
            SELECT
                k.id_kecamatan,
                k.nama_kecamatan,
                i.tahun,
                i.bulan,
                COUNT(DISTINCT r.id_anggota) AS total_wajib_iuran,
                SUM(CASE WHEN i.status_verifikasi = 'Lunas' THEN 1 ELSE 0 END) AS total_lunas,
                SUM(CASE WHEN i.status_verifikasi = 'Pending' THEN 1 ELSE 0 END) AS total_pending,
                SUM(CASE WHEN i.status_verifikasi = 'Ditolak' OR i.status_verifikasi IS NULL THEN 1 ELSE 0 END) AS total_belum_bayar,
                SUM(CASE WHEN i.status_verifikasi = 'Lunas' THEN i.jumlah ELSE 0.00 END) AS total_nominal_terkumpul
            FROM ref_kecamatan k
            JOIN ref_desa d ON k.id_kecamatan = d.id_kecamatan
            JOIN riwayat_jabatan r ON d.id_desa = r.id_desa AND r.status_aktif = 'Aktif'
            JOIN anggota a ON r.id_anggota = a.id_anggota
            LEFT JOIN iuran_anggota i ON a.id_anggota = i.id_anggota
            GROUP BY k.id_kecamatan, k.nama_kecamatan, i.tahun, i.bulan
        ");

        DB::unprepared("
            CREATE OR REPLACE VIEW `v_rekap_iuran_desa` AS
            SELECT
                d.id_desa,
                d.nama_desa,
                k.id_kecamatan,
                k.nama_kecamatan,
                i.tahun,
                i.bulan,
                COUNT(DISTINCT r.id_anggota) AS total_wajib_iuran,
                SUM(CASE WHEN i.status_verifikasi = 'Lunas' THEN 1 ELSE 0 END) AS total_lunas,
                SUM(CASE WHEN i.status_verifikasi = 'Pending' THEN 1 ELSE 0 END) AS total_pending,
                SUM(CASE WHEN i.status_verifikasi = 'Ditolak' OR i.status_verifikasi IS NULL THEN 1 ELSE 0 END) AS total_belum_bayar,
                SUM(CASE WHEN i.status_verifikasi = 'Lunas' THEN i.jumlah ELSE 0.00 END) AS total_nominal_terkumpul
            FROM ref_desa d
            JOIN ref_kecamatan k ON d.id_kecamatan = k.id_kecamatan
            JOIN riwayat_jabatan r ON d.id_desa = r.id_desa AND r.status_aktif = 'Aktif'
            JOIN anggota a ON r.id_anggota = a.id_anggota
            LEFT JOIN iuran_anggota i ON a.id_anggota = i.id_anggota
            GROUP BY d.id_desa, d.nama_desa, k.id_kecamatan, k.nama_kecamatan, i.tahun, i.bulan
        ");

        DB::unprepared("
            CREATE OR REPLACE VIEW `v_antrean_verifikasi_kecamatan` AS
            SELECT
                k.id_kecamatan,
                k.nama_kecamatan,
                d.id_desa,
                d.nama_desa,
                a.id_anggota,
                a.nik,
                a.nipd,
                a.nama_lengkap,
                a.jenis_kelamin,
                a.no_hp_wa,
                j.nama_jabatan,
                r.no_sk_pengangkatan,
                r.tgl_sk_pengangkatan,
                r.tmt_jabatan,
                r.file_sk,
                p.status_kta AS status_verifikasi,
                a.created_at AS tanggal_pengajuan
            FROM anggota a
            JOIN riwayat_jabatan r ON a.id_anggota = r.id_anggota
            JOIN ref_desa d ON r.id_desa = d.id_desa
            JOIN ref_kecamatan k ON d.id_kecamatan = k.id_kecamatan
            JOIN ref_jabatan j ON r.id_jabatan = j.id_jabatan
            JOIN keanggotaan_ppdi p ON a.id_anggota = p.id_anggota
            WHERE (p.status_kta = 'Pending_Verifikasi' OR p.status_kta = 'Pending')
              AND r.status_aktif = 'Aktif'
        ");
    }

    public function down(): void
    {
        DB::unprepared('DROP VIEW IF EXISTS `v_antrean_verifikasi_kecamatan`');
        DB::unprepared('DROP VIEW IF EXISTS `v_rekap_iuran_desa`');
        DB::unprepared('DROP VIEW IF EXISTS `v_rekap_iuran_kecamatan`');
        DB::unprepared('DROP VIEW IF EXISTS `v_rekap_ppdi_desa`');
        DB::unprepared('DROP VIEW IF EXISTS `v_rekap_ppdi_kecamatan`');
        DB::unprepared('DROP VIEW IF EXISTS `v_monitoring_pensiun_perangkat`');
        DB::unprepared('DROP VIEW IF EXISTS `v_purna_tugas_alert`');
        DB::unprepared('DROP VIEW IF EXISTS `v_anggota_aktif_kabupaten`');
    }
};
