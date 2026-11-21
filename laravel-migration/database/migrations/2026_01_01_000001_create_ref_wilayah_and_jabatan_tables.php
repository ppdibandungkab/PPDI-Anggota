<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tabel Referensi Wilayah (Kecamatan & Desa) dan Jabatan Perangkat Desa.
     * Menggunakan $table->id('id_jabatan') agar cocok dengan foreignId('id_jabatan') pada tabel anak.
     */
    public function up(): void
    {
        if (!Schema::hasTable('ref_kecamatan')) {
            Schema::create('ref_kecamatan', function (Blueprint $table) {
                $table->engine = 'InnoDB';
                $table->charset = 'utf8mb4';
                $table->collation = 'utf8mb4_unicode_ci';

                $table->string('id_kecamatan', 10)->primary()->comment('Kode Wilayah Kemendagri e.g. 32.04.05');
                $table->string('nama_kecamatan', 100);

                $table->index('nama_kecamatan', 'idx_nama_kecamatan');
            });
        }

        if (!Schema::hasTable('ref_desa')) {
            Schema::create('ref_desa', function (Blueprint $table) {
                $table->engine = 'InnoDB';
                $table->charset = 'utf8mb4';
                $table->collation = 'utf8mb4_unicode_ci';

                $table->string('id_desa', 20)->primary()->comment('Kode Kemendagri e.g. 32.04.05.2001');
                $table->string('id_kecamatan', 10);
                $table->string('nama_desa', 100);
                $table->text('alamat_kantor_desa')->nullable();

                $table->index('id_kecamatan', 'idx_desa_kecamatan');
                $table->index('nama_desa', 'idx_nama_desa');

                $table->foreign('id_kecamatan', 'fk_desa_kecamatan')
                    ->references('id_kecamatan')
                    ->on('ref_kecamatan')
                    ->cascadeOnUpdate()
                    ->restrictOnDelete();
            });
        }

        if (!Schema::hasTable('ref_jabatan')) {
            Schema::create('ref_jabatan', function (Blueprint $table) {
                $table->engine = 'InnoDB';
                $table->charset = 'utf8mb4';
                $table->collation = 'utf8mb4_unicode_ci';

                $table->id('id_jabatan');
                $table->string('nama_jabatan', 100);
                $table->enum('kategori_jabatan', [
                    'Sekretariat',
                    'Pelaksana Teknis',
                    'Pelaksana Kewilayahan',
                    'Staf Desa',
                    'Kepala Desa',
                ]);

                $table->index('kategori_jabatan', 'idx_kategori_jabatan');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('ref_jabatan');
        Schema::dropIfExists('ref_desa');
        Schema::dropIfExists('ref_kecamatan');
    }
};
