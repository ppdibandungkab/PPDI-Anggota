<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Migration Tabel 'anggota' beserta relasi inti 'riwayat_jabatan' & 'keanggotaan_ppdi'.
     * Menggunakan tipe data standar Laravel: id(), string(), text(), date(), timestamp(),
     * serta foreignId()->constrained()->onDelete('cascade').
     *
     * Catatan: Jika menghubungkan ke database MySQL lama yang kolom id_anggota-nya bertipe
     * INT(11) SIGNED, ubah id() menjadi integer('id_anggota', true) dan foreignId() menjadi integer().
     */
    public function up(): void
    {
        if (!Schema::hasTable('anggota')) {
            Schema::create('anggota', function (Blueprint $table) {
                $table->engine = 'InnoDB';
                $table->charset = 'utf8mb4';
                $table->collation = 'utf8mb4_unicode_ci';

                $table->id('id_anggota');
                $table->string('nik', 16)->unique('uq_anggota_nik')->comment('16 digit NIK KTP');
                $table->string('nipd', 30)->nullable()->comment('Nomor Induk Perangkat Desa');
                $table->string('nama_lengkap', 150);
                $table->string('gelar_depan', 30)->nullable();
                $table->string('gelar_belakang', 50)->nullable();
                $table->string('tempat_lahir', 100);
                $table->date('tanggal_lahir')->comment('Dasar kalkulasi purna tugas usia 60 tahun');
                $table->enum('jenis_kelamin', ['L', 'P'])->default('L');
                $table->string('agama', 30)->default('Islam');
                $table->string('pendidikan_terakhir', 30)->default('S1');
                $table->string('no_hp_wa', 20)->comment('Nomor WhatsApp aktif');
                $table->string('email', 100)->nullable();
                $table->string('foto', 255)->nullable();
                $table->text('alamat_rumah');
                $table->string('status_pernikahan', 30)->default('Kawin');
                $table->string('kode_kecamatan', 10)->nullable();
                $table->integer('nomor_urut')->nullable();
                $table->string('no_kta', 50)->nullable()->unique('uq_anggota_no_kta');
                $table->timestamp('created_at')->useCurrent();
                $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

                $table->index(['kode_kecamatan', 'nomor_urut'], 'idx_anggota_kecamatan_urut');
                $table->index('tanggal_lahir', 'idx_anggota_tgl_lahir');
                $table->index('nama_lengkap', 'idx_anggota_nama');
                $table->index('no_hp_wa', 'idx_anggota_hp');
            });
        }

        if (!Schema::hasTable('riwayat_jabatan')) {
            Schema::create('riwayat_jabatan', function (Blueprint $table) {
                $table->engine = 'InnoDB';
                $table->charset = 'utf8mb4';
                $table->collation = 'utf8mb4_unicode_ci';

                $table->id('id_riwayat');
                $table->foreignId('id_anggota')
                    ->constrained('anggota', 'id_anggota')
                    ->onUpdate('cascade')
                    ->onDelete('cascade');
                $table->string('id_desa', 20);
                $table->foreignId('id_jabatan')
                    ->constrained('ref_jabatan', 'id_jabatan')
                    ->onUpdate('cascade')
                    ->restrictOnDelete();
                $table->integer('periode')
                    ->nullable()
                    ->comment('Periodisasi Kepala Desa (1, 2, 3) wajib diisi bagi id_jabatan = 10; NULL untuk lainnya');
                $table->string('no_sk_pengangkatan', 100);
                $table->date('tgl_sk_pengangkatan');
                $table->date('tmt_jabatan')->comment('Terhitung Mulai Tanggal');
                $table->enum('status_aktif', [
                    'Aktif',
                    'Purna Tugas',
                    'Meninggal Dunia',
                    'Diberhentikan',
                    'Mutasi',
                ])->default('Aktif');
                $table->string('file_sk', 255)->nullable();
                $table->mediumText('tanda_tangan')->nullable();
                $table->text('keterangan')->nullable();
                $table->timestamp('created_at')->useCurrent();

                $table->index('id_desa', 'idx_riwayat_desa');
                $table->index('status_aktif', 'idx_riwayat_status');

                $table->foreign('id_desa', 'fk_riwayat_desa')
                    ->references('id_desa')
                    ->on('ref_desa')
                    ->cascadeOnUpdate()
                    ->restrictOnDelete();
            });
        }

        if (!Schema::hasTable('keanggotaan_ppdi')) {
            Schema::create('keanggotaan_ppdi', function (Blueprint $table) {
                $table->engine = 'InnoDB';
                $table->charset = 'utf8mb4';
                $table->collation = 'utf8mb4_unicode_ci';

                $table->id('id_ppdi');
                $table->foreignId('id_anggota')
                    ->unique('uq_ppdi_anggota')
                    ->constrained('anggota', 'id_anggota')
                    ->onUpdate('cascade')
                    ->onDelete('cascade');
                $table->string('no_kta', 50)->unique('uq_ppdi_no_kta');
                $table->date('tgl_bergabung');
                $table->string('jabatan_pengurus', 100)->default('Anggota Biasa');
                $table->string('status_kta', 30)->default('Aktif');
                $table->timestamp('created_at')->useCurrent();

                $table->index('status_kta', 'idx_ppdi_status');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('keanggotaan_ppdi');
        Schema::dropIfExists('riwayat_jabatan');
        Schema::dropIfExists('anggota');
    }
};
