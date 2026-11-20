<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Migration Tabel Iuran Anggota ('iuran_anggota').
     * Menggunakan foreignId('id_anggota')->constrained('anggota', 'id_anggota')->onDelete('cascade').
     */
    public function up(): void
    {
        if (!Schema::hasTable('iuran_anggota')) {
            Schema::create('iuran_anggota', function (Blueprint $table) {
                $table->engine = 'InnoDB';
                $table->charset = 'utf8mb4';
                $table->collation = 'utf8mb4_unicode_ci';

                $table->string('id_iuran', 36)->primary()->comment('UUID / ID Transaksi Iuran');
                $table->foreignId('id_anggota')
                    ->constrained('anggota', 'id_anggota')
                    ->onUpdate('cascade')
                    ->onDelete('cascade');
                $table->smallInteger('tahun');
                $table->tinyInteger('bulan')->comment('Bulan 1-12');
                $table->decimal('jumlah', 12, 2)->default(35000.00);
                $table->dateTime('tgl_bayar');
                $table->string('bukti_trf', 255)->nullable();
                $table->enum('status_verifikasi', ['Pending', 'Lunas', 'Ditolak'])->default('Pending');
                $table->string('catatan', 255)->nullable();
                $table->timestamp('created_at')->useCurrent();

                $table->index(['tahun', 'bulan'], 'idx_iuran_periode');
                $table->index('status_verifikasi', 'idx_iuran_status');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('iuran_anggota');
    }
};
