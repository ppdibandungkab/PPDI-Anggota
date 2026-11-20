<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Migration Tabel 'purna_tugas'.
     * Menyimpan arsip administratif purna tugas / pemberhentian perangkat desa (usia 60 tahun),
     * melengkapi monitoring otomatis pada view v_purna_tugas_alert & v_monitoring_pensiun_perangkat.
     */
    public function up(): void
    {
        if (!Schema::hasTable('purna_tugas')) {
            Schema::create('purna_tugas', function (Blueprint $table) {
                $table->engine = 'InnoDB';
                $table->charset = 'utf8mb4';
                $table->collation = 'utf8mb4_unicode_ci';

                $table->id('id_purna_tugas');
                $table->foreignId('id_anggota')
                    ->constrained('anggota', 'id_anggota')
                    ->onUpdate('cascade')
                    ->onDelete('cascade');
                $table->string('id_desa', 20)->nullable();
                $table->string('jabatan_terakhir', 100)->nullable();
                $table->date('tanggal_lahir');
                $table->date('tanggal_purna_tugas')->comment('Tanggal mencapai batas usia 60 tahun / efektif purna tugas');
                $table->enum('status_purna_tugas', [
                    'Waspada (<2 Tahun)',
                    'Siaga (<1 Tahun)',
                    'Kritis (<6 Bulan)',
                    'Sudah Purna Tugas',
                    'Selesai Administrasi',
                ])->default('Sudah Purna Tugas');
                $table->string('no_sk_pemberhentian', 100)->nullable();
                $table->date('tgl_sk_pemberhentian')->nullable();
                $table->string('file_sk_pemberhentian', 255)->nullable();
                $table->text('catatan')->nullable();
                $table->timestamp('created_at')->useCurrent();
                $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

                $table->index('tanggal_purna_tugas', 'idx_purna_tugas_tanggal');
                $table->index('status_purna_tugas', 'idx_purna_tugas_status');
                $table->index('id_desa', 'idx_purna_tugas_desa');

                $table->foreign('id_desa', 'fk_purna_tugas_desa')
                    ->references('id_desa')
                    ->on('ref_desa')
                    ->cascadeOnUpdate()
                    ->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('purna_tugas');
    }
};
