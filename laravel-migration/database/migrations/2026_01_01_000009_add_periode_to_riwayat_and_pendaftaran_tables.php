<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Menambahkan kolom `periode` INT(11) NULL setelah `id_jabatan` pada tabel:
     * - pendaftaran_perangkat_desa
     * - riwayat_jabatan
     *
     * Ketentuan:
     * - id_jabatan = 10 (Kepala Desa): wajib diisi (1 = Periode Ke-1, 2 = Periode Ke-2, 3 = Periode Ke-3)
     * - id_jabatan lainnya: NULL
     */
    public function up(): void
    {
        if (Schema::hasTable('pendaftaran_perangkat_desa') && !Schema::hasColumn('pendaftaran_perangkat_desa', 'periode')) {
            Schema::table('pendaftaran_perangkat_desa', function (Blueprint $table) {
                $table->integer('periode')
                    ->nullable()
                    ->after('id_jabatan')
                    ->comment('Periodisasi Kepala Desa (1, 2, 3) wajib diisi bagi id_jabatan = 10; NULL untuk lainnya');
            });
        }

        if (Schema::hasTable('riwayat_jabatan') && !Schema::hasColumn('riwayat_jabatan', 'periode')) {
            Schema::table('riwayat_jabatan', function (Blueprint $table) {
                $table->integer('periode')
                    ->nullable()
                    ->after('id_jabatan')
                    ->comment('Periodisasi Kepala Desa (1, 2, 3) wajib diisi bagi id_jabatan = 10; NULL untuk lainnya');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('pendaftaran_perangkat_desa') && Schema::hasColumn('pendaftaran_perangkat_desa', 'periode')) {
            Schema::table('pendaftaran_perangkat_desa', function (Blueprint $table) {
                $table->dropColumn('periode');
            });
        }

        if (Schema::hasTable('riwayat_jabatan') && Schema::hasColumn('riwayat_jabatan', 'periode')) {
            Schema::table('riwayat_jabatan', function (Blueprint $table) {
                $table->dropColumn('periode');
            });
        }
    }
};
