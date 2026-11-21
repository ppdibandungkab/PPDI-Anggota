<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Menambahkan kolom `periode` INT(11) NULL setelah `id_jabatan` pada tabel:
     * - pendaftaran_perangkat_desa
     * - riwayat_jabatan
     *
     * Serta menerapkan database-level CHECK constraint (MySQL 8.0.16+ / MariaDB 10.2.1+):
     * - id_jabatan = 10 (Kepala Desa): periode NOT NULL dan wajib bernilai 1, 2, atau 3
     * - id_jabatan <> 10 (Perangkat & Staf Desa): periode wajib NULL
     */
    public function up(): void
    {
        $targets = [
            'pendaftaran_perangkat_desa' => 'chk_pendaftaran_periode_kades',
            'riwayat_jabatan'            => 'chk_riwayat_periode_kades',
        ];

        foreach ($targets as $tableName => $constraintName) {
            if (!Schema::hasTable($tableName)) {
                continue;
            }

            if (!Schema::hasColumn($tableName, 'periode')) {
                Schema::table($tableName, function (Blueprint $table) {
                    $table->integer('periode')
                        ->nullable()
                        ->after('id_jabatan')
                        ->comment('Periodisasi Kepala Desa (1, 2, 3) wajib diisi bagi id_jabatan = 10; NULL untuk lainnya');
                });
            }

            // Normalisasi data eksisting sebelum menerapkan CHECK constraint agar migrasi aman di produksi
            DB::table($tableName)
                ->where('id_jabatan', 10)
                ->where(function ($q) {
                    $q->whereNull('periode')->orWhereNotIn('periode', [1, 2, 3]);
                })
                ->update(['periode' => 1]);

            DB::table($tableName)
                ->where('id_jabatan', '!=', 10)
                ->whereNotNull('periode')
                ->update(['periode' => null]);

            $this->addPeriodeCheckConstraint($tableName, $constraintName);
        }
    }

    public function down(): void
    {
        $targets = [
            'pendaftaran_perangkat_desa' => 'chk_pendaftaran_periode_kades',
            'riwayat_jabatan'            => 'chk_riwayat_periode_kades',
        ];

        foreach ($targets as $tableName => $constraintName) {
            if (!Schema::hasTable($tableName)) {
                continue;
            }

            $this->dropPeriodeCheckConstraint($tableName, $constraintName);

            if (Schema::hasColumn($tableName, 'periode')) {
                Schema::table($tableName, function (Blueprint $table) {
                    $table->dropColumn('periode');
                });
            }
        }
    }

    private function addPeriodeCheckConstraint(string $tableName, string $constraintName): void
    {
        $exists = DB::selectOne(
            'SELECT CONSTRAINT_NAME
             FROM information_schema.TABLE_CONSTRAINTS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = ?
               AND CONSTRAINT_NAME = ?
               AND CONSTRAINT_TYPE = \'CHECK\'
             LIMIT 1',
            [$tableName, $constraintName]
        );

        if ($exists) {
            return;
        }

        DB::statement(
            "ALTER TABLE `{$tableName}`
             ADD CONSTRAINT `{$constraintName}`
             CHECK ((`id_jabatan` = 10 AND `periode` IS NOT NULL AND `periode` IN (1, 2, 3))
                 OR (`id_jabatan` <> 10 AND `periode` IS NULL))"
        );
    }

    private function dropPeriodeCheckConstraint(string $tableName, string $constraintName): void
    {
        $exists = DB::selectOne(
            'SELECT CONSTRAINT_NAME
             FROM information_schema.TABLE_CONSTRAINTS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = ?
               AND CONSTRAINT_NAME = ?
               AND CONSTRAINT_TYPE = \'CHECK\'
             LIMIT 1',
            [$tableName, $constraintName]
        );

        if (!$exists) {
            return;
        }

        // MySQL 8 menggunakan DROP CHECK, sedangkan MariaDB menggunakan DROP CONSTRAINT
        try {
            DB::statement("ALTER TABLE `{$tableName}` DROP CHECK `{$constraintName}`");
        } catch (\Throwable) {
            DB::statement("ALTER TABLE `{$tableName}` DROP CONSTRAINT `{$constraintName}`");
        }
    }
};
