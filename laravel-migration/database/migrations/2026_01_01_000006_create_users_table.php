<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Migration Tabel 'users' beserta master 'roles' dan 'user_groups'.
     * Relasi opsional id_anggota menggunakan foreignId()->nullable()->constrained()->onDelete('cascade').
     */
    public function up(): void
    {
        if (!Schema::hasTable('roles')) {
            Schema::create('roles', function (Blueprint $table) {
                $table->engine = 'InnoDB';
                $table->charset = 'utf8mb4';
                $table->collation = 'utf8mb4_unicode_ci';

                $table->id('id_role');
                $table->string('nama_role', 50);
            });
        }

        if (!Schema::hasTable('user_groups')) {
            Schema::create('user_groups', function (Blueprint $table) {
                $table->engine = 'InnoDB';
                $table->charset = 'utf8mb4';
                $table->collation = 'utf8mb4_unicode_ci';

                $table->id('id_group');
                $table->string('nama_group', 50);
            });
        }

        if (!Schema::hasTable('users')) {
            Schema::create('users', function (Blueprint $table) {
                $table->engine = 'InnoDB';
                $table->charset = 'utf8mb4';
                $table->collation = 'utf8mb4_unicode_ci';

                $table->id('id_user');
                $table->string('username', 50)->unique('uq_user_username');
                $table->string('email', 100)->unique('uq_user_email');
                $table->string('nama', 150)->nullable();
                $table->string('password', 255);
                $table->string('id_role', 50)->default('Anggota');
                $table->string('role', 50)->default('Admin_Kecamatan');
                $table->foreignId('id_anggota')
                    ->nullable()
                    ->constrained('anggota', 'id_anggota')
                    ->onUpdate('cascade')
                    ->onDelete('cascade');
                $table->string('id_kecamatan_scope', 20)->nullable();
                $table->string('id_kecamatan', 10)->nullable();
                $table->string('id_desa', 20)->nullable();
                $table->timestamp('created_at')->useCurrent();
                $table->timestamp('update_at')->nullable()->useCurrentOnUpdate();
                $table->timestamp('updated_at')->nullable()->useCurrentOnUpdate();

                $table->index('id_role', 'idx_user_role');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
        Schema::dropIfExists('user_groups');
        Schema::dropIfExists('roles');
    }
};
