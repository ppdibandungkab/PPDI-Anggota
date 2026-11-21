<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tabel Pendukung Sistem PPDI:
     * - pendaftaran_perangkat_desa (Antrean pendaftaran online sebelum dipromosikan ke anggota)
     * - activity_logs (Audit log perubahan data anggota & sistem)
     * - app_settings (Pengaturan aplikasi, backup & tampilan)
     * - whatsapp_senders & whatsapp_logs (Gateway WhatsApp Fonnte)
     * - kalender_acara (Agenda rapat & kegiatan PPDI)
     */
    public function up(): void
    {
        if (!Schema::hasTable('pendaftaran_perangkat_desa')) {
            Schema::create('pendaftaran_perangkat_desa', function (Blueprint $table) {
                $table->engine = 'InnoDB';
                $table->charset = 'utf8mb4';
                $table->collation = 'utf8mb4_unicode_ci';

                $table->id('id_pendaftaran');
                $table->string('nik', 16);
                $table->string('nama_lengkap', 150);
                $table->string('gelar_depan', 30)->nullable();
                $table->string('gelar_belakang', 50)->nullable();
                $table->string('tempat_lahir', 100);
                $table->date('tanggal_lahir');
                $table->enum('jenis_kelamin', ['L', 'P'])->default('L');
                $table->string('agama', 30)->default('Islam');
                $table->string('pendidikan_terakhir', 30)->default('S1');
                $table->string('no_hp_wa', 20);
                $table->string('email', 100)->nullable();
                $table->text('alamat_rumah')->nullable();
                $table->longText('foto')->nullable();
                $table->string('status_pernikahan', 30)->default('Kawin');
                $table->string('id_kecamatan', 10);
                $table->string('id_desa', 20);
                $table->foreignId('id_jabatan')
                    ->default(1)
                    ->constrained('ref_jabatan', 'id_jabatan')
                    ->onUpdate('cascade')
                    ->restrictOnDelete();
                $table->integer('periode')
                    ->nullable()
                    ->comment('Periodisasi Kepala Desa (1, 2, 3) wajib diisi bagi id_jabatan = 10; NULL untuk lainnya');
                $table->string('no_sk_pengangkatan', 100)->nullable();
                $table->date('tgl_sk_pengangkatan')->nullable();
                $table->date('tmt_jabatan')->nullable();
                $table->longText('file_sk')->nullable();
                $table->mediumText('tanda_tangan')->nullable();
                $table->enum('status_approval', ['Menunggu', 'Disetujui', 'Ditolak'])->default('Menunggu');
                $table->text('catatan_approval')->nullable();
                $table->timestamp('tgl_pendaftaran')->useCurrent();
                $table->dateTime('tgl_approval')->nullable();
                $table->string('approved_by', 100)->nullable();

                $table->index('nik', 'idx_pendaftaran_nik');
                $table->index('status_approval', 'idx_pendaftaran_status');

                $table->foreign('id_kecamatan', 'fk_pendaftaran_kecamatan')
                    ->references('id_kecamatan')
                    ->on('ref_kecamatan')
                    ->cascadeOnUpdate()
                    ->restrictOnDelete();

                $table->foreign('id_desa', 'fk_pendaftaran_desa')
                    ->references('id_desa')
                    ->on('ref_desa')
                    ->cascadeOnUpdate()
                    ->restrictOnDelete();
            });
        }

        if (!Schema::hasTable('activity_logs')) {
            Schema::create('activity_logs', function (Blueprint $table) {
                $table->engine = 'InnoDB';
                $table->charset = 'utf8mb4';
                $table->collation = 'utf8mb4_unicode_ci';

                $table->id();
                $table->dateTime('timestamp')->useCurrent();
                $table->string('ip_address', 45)->nullable();
                $table->unsignedBigInteger('user_id')->nullable();
                $table->string('user_name', 150)->nullable();
                $table->string('user_role', 50)->nullable();
                $table->string('modul', 100)->nullable();
                $table->string('aksi', 50)->nullable();
                $table->string('target_id', 64)->nullable();
                $table->string('target_nama', 180)->nullable();
                $table->text('keterangan')->nullable();

                $table->index('target_id', 'idx_activity_target_id');
                $table->index('modul', 'idx_activity_modul');
                $table->index('timestamp', 'idx_activity_timestamp');
            });
        }

        if (!Schema::hasTable('app_settings')) {
            Schema::create('app_settings', function (Blueprint $table) {
                $table->engine = 'InnoDB';
                $table->charset = 'utf8mb4';
                $table->collation = 'utf8mb4_unicode_ci';

                $table->string('setting_key', 100)->primary();
                $table->longText('setting_value')->nullable();
                $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();
            });
        }

        if (!Schema::hasTable('whatsapp_senders')) {
            Schema::create('whatsapp_senders', function (Blueprint $table) {
                $table->engine = 'InnoDB';
                $table->charset = 'utf8mb4';
                $table->collation = 'utf8mb4_unicode_ci';

                $table->id('id_sender');
                $table->string('sender_label', 100)->default('Gateway Utama PPDI');
                $table->string('sender_number', 30)->default('');
                $table->string('provider', 30)->default('fonnte');
                $table->string('fonnte_token', 255)->default('');
                $table->string('webhook_url', 500)->nullable();
                $table->string('webhook_secret', 255)->nullable();
                $table->string('country_code', 10)->default('62');
                $table->boolean('is_enabled')->default(false);
                $table->boolean('auto_reply_enabled')->default(true);
                $table->boolean('is_default')->default(true);
                $table->timestamp('created_at')->useCurrent();
                $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

                $table->index('sender_number', 'idx_wa_sender_number');
                $table->index('is_default', 'idx_wa_sender_default');
            });
        }

        if (!Schema::hasTable('whatsapp_logs')) {
            Schema::create('whatsapp_logs', function (Blueprint $table) {
                $table->engine = 'InnoDB';
                $table->charset = 'utf8mb4';
                $table->collation = 'utf8mb4_unicode_ci';

                $table->string('id', 64)->primary();
                $table->string('timestamp', 40);
                $table->enum('direction', ['outbound', 'inbound', 'status'])->default('outbound');
                $table->string('provider', 30)->default('fonnte');
                $table->string('sender_number', 30)->nullable();
                $table->string('target_or_sender', 50);
                $table->string('sender_name', 150)->nullable();
                $table->foreignId('id_anggota')
                    ->nullable()
                    ->constrained('anggota', 'id_anggota')
                    ->onUpdate('cascade')
                    ->nullOnDelete();
                $table->string('category', 50)->nullable();
                $table->string('status', 30)->default('sent');
                $table->text('message');
                $table->string('fonnte_id', 100)->nullable();
                $table->string('batch_id', 64)->nullable();
                $table->longText('raw_payload')->nullable();
                $table->timestamp('created_at')->useCurrent();

                $table->index('created_at', 'idx_wa_logs_created');
                $table->index('direction', 'idx_wa_logs_direction');
                $table->index('status', 'idx_wa_logs_status');
                $table->index('target_or_sender', 'idx_wa_logs_target');
            });
        }

        if (!Schema::hasTable('kalender_acara')) {
            Schema::create('kalender_acara', function (Blueprint $table) {
                $table->engine = 'InnoDB';
                $table->charset = 'utf8mb4';
                $table->collation = 'utf8mb4_unicode_ci';

                $table->string('id_acara', 64)->primary();
                $table->string('judul', 255);
                $table->string('kategori', 80)->default('Kegiatan PPDI');
                $table->date('tanggal_mulai');
                $table->string('waktu_mulai', 10)->nullable();
                $table->date('tanggal_selesai')->nullable();
                $table->string('waktu_selesai', 10)->nullable();
                $table->boolean('is_all_day')->default(false);
                $table->string('lokasi', 255)->nullable();
                $table->text('deskripsi')->nullable();
                $table->integer('pengingat_menit')->default(1440);
                $table->string('status', 40)->default('Terjadwal');
                $table->string('created_by', 120)->nullable();
                $table->timestamp('created_at')->useCurrent();
                $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();

                $table->index('tanggal_mulai', 'idx_kalender_tanggal_mulai');
                $table->index('status', 'idx_kalender_status');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('kalender_acara');
        Schema::dropIfExists('whatsapp_logs');
        Schema::dropIfExists('whatsapp_senders');
        Schema::dropIfExists('app_settings');
        Schema::dropIfExists('activity_logs');
        Schema::dropIfExists('pendaftaran_perangkat_desa');
    }
};
