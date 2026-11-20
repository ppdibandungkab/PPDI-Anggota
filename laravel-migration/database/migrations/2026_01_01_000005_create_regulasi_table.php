<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Migration Tabel Regulasi PPDI ('pustaka_regulasi').
     * Menyimpan arsip UU, PP, Permendagri, Perda/Perbup, dan AD/ART PPDI beserta PDF.
     */
    public function up(): void
    {
        if (!Schema::hasTable('pustaka_regulasi')) {
            Schema::create('pustaka_regulasi', function (Blueprint $table) {
                $table->engine = 'InnoDB';
                $table->charset = 'utf8mb4';
                $table->collation = 'utf8mb4_unicode_ci';

                $table->string('id_regulasi', 64)->primary();
                $table->string('judul', 255);
                $table->string('nomor_regulasi', 120);
                $table->integer('tahun');
                $table->string('kategori', 80)->default('Lainnya');
                $table->text('tentang')->nullable();
                $table->date('tanggal_penetapan')->nullable();
                $table->string('file_url', 255);
                $table->string('file_name', 255);
                $table->integer('file_size')->default(0);
                $table->boolean('is_public')->default(true);
                $table->integer('download_count')->default(0);
                $table->string('uploaded_by', 120)->nullable();
                $table->timestamp('created_at')->useCurrent();
                $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

                $table->index('tahun', 'idx_regulasi_tahun');
                $table->index('kategori', 'idx_regulasi_kategori');
                $table->index('is_public', 'idx_regulasi_public');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('pustaka_regulasi');
    }
};
