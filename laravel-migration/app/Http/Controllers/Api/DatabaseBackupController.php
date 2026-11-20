<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

class DatabaseBackupController extends Controller
{
    /**
     * GET /api/db/status
     */
    public function dbStatus()
    {
        try {
            $version = DB::selectOne('SELECT VERSION() AS ver');
            $counts = [
                'anggota'      => DB::table('anggota')->count(),
                'riwayat'      => DB::table('riwayat_jabatan')->count(),
                'keanggotaan'  => DB::table('keanggotaan_ppdi')->count(),
                'pendaftaran'  => DB::table('pendaftaran_perangkat_desa')->count(),
                'kecamatan'    => DB::table('ref_kecamatan')->count(),
                'desa'         => DB::table('ref_desa')->count(),
            ];

            return response()->json([
                'success'   => true,
                'connected' => true,
                'database'  => config('database.connections.mysql.database'),
                'host'      => config('database.connections.mysql.host'),
                'version'   => $version->ver ?? 'MySQL',
                'counts'    => $counts,
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success'   => false,
                'connected' => false,
                'error'     => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * GET /api/diagnostic
     * Compatible with React DatabaseStatusIndicator component.
     */
    public function diagnostic()
    {
        $started = microtime(true);
        try {
            $version = DB::selectOne('SELECT VERSION() AS ver');
            $latencyMs = (int) round((microtime(true) - $started) * 1000);

            return response()->json([
                'success'   => true,
                'status'    => 'ONLINE',
                'service'   => 'PPDI Laravel API',
                'timestamp' => now()->toIso8601String(),
                'timezone'  => config('app.timezone', 'Asia/Jakarta'),
                'server'    => [
                    'port'        => (int) request()->getPort(),
                    'pid'         => (int) getmypid(),
                    'nodeVersion' => 'PHP ' . PHP_VERSION . ' / Laravel ' . app()->version(),
                ],
                'database'  => [
                    'connected' => true,
                    'host'      => config('database.connections.mysql.host'),
                    'database'  => config('database.connections.mysql.database'),
                    'version'   => $version->ver ?? 'MySQL',
                    'latencyMs' => $latencyMs,
                ],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success'   => false,
                'status'    => 'DEGRADED',
                'service'   => 'PPDI Laravel API',
                'timestamp' => now()->toIso8601String(),
                'error'     => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * GET /api/db/schema-diagnostic
     * Checks INT(11) AUTO_INCREMENT alignment, foreign key type parity, and orphan child rows.
     */
    public function schemaDiagnostic()
    {
        try {
            $dbName = config('database.connections.mysql.database');
            $columns = DB::select(
                "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, EXTRA
                 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = ?
                   AND TABLE_NAME IN ('anggota','riwayat_jabatan','keanggotaan_ppdi','iuran_anggota','users','pendaftaran_perangkat_desa')
                   AND COLUMN_NAME IN ('id_anggota','id_riwayat','id_ppdi','id_desa','id_jabatan','id_pendaftaran')",
                [$dbName]
            );

            $foreignKeys = DB::select(
                "SELECT kcu.TABLE_NAME, kcu.COLUMN_NAME, kcu.CONSTRAINT_NAME,
                        kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME,
                        c1.COLUMN_TYPE AS CHILD_TYPE, c2.COLUMN_TYPE AS PARENT_TYPE
                 FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
                 JOIN INFORMATION_SCHEMA.COLUMNS c1
                   ON c1.TABLE_SCHEMA = kcu.TABLE_SCHEMA AND c1.TABLE_NAME = kcu.TABLE_NAME AND c1.COLUMN_NAME = kcu.COLUMN_NAME
                 JOIN INFORMATION_SCHEMA.COLUMNS c2
                   ON c2.TABLE_SCHEMA = kcu.REFERENCED_TABLE_SCHEMA AND c2.TABLE_NAME = kcu.REFERENCED_TABLE_NAME AND c2.COLUMN_NAME = kcu.REFERENCED_COLUMN_NAME
                 WHERE kcu.TABLE_SCHEMA = ? AND kcu.REFERENCED_TABLE_NAME IS NOT NULL",
                [$dbName]
            );

            $fkMismatches = collect($foreignKeys)->filter(fn ($fk) => strtolower($fk->CHILD_TYPE) !== strtolower($fk->PARENT_TYPE))->values();

            $orphans = [
                'riwayat_without_anggota' => DB::selectOne('SELECT COUNT(*) AS cnt FROM riwayat_jabatan r LEFT JOIN anggota a ON a.id_anggota = r.id_anggota WHERE a.id_anggota IS NULL')->cnt ?? 0,
                'ppdi_without_anggota'    => DB::selectOne('SELECT COUNT(*) AS cnt FROM keanggotaan_ppdi k LEFT JOIN anggota a ON a.id_anggota = k.id_anggota WHERE a.id_anggota IS NULL')->cnt ?? 0,
            ];

            $recentApprovalLogs = [];
            try {
                $recentApprovalLogs = DB::table('activity_logs')
                    ->where('modul', 'Approval Pendaftaran')
                    ->orderByDesc('timestamp')
                    ->limit(20)
                    ->get();
            } catch (\Throwable) {
            }

            $healthy = $fkMismatches->count() === 0
                && ($orphans['riwayat_without_anggota'] === 0)
                && ($orphans['ppdi_without_anggota'] === 0);

            return response()->json([
                'success'              => true,
                'healthy'              => $healthy,
                'columns'              => $columns,
                'foreign_keys'         => $foreignKeys,
                'fk_mismatches'        => $fkMismatches,
                'orphans'              => $orphans,
                'recent_approval_logs' => $recentApprovalLogs,
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * GET /api/database/backup/status
     */
    public function status()
    {
        $logFile = storage_path('app/backups/last-backup.json');
        $lastBackup = File::exists($logFile) ? json_decode(File::get($logFile), true) : null;
        $files = File::isDirectory(storage_path('app/backups'))
            ? collect(File::files(storage_path('app/backups')))->filter(fn ($f) => str_ends_with($f->getFilename(), '.sql'))->values()
            : collect();

        return response()->json([
            'success'      => true,
            'lastBackup'   => $lastBackup,
            'totalBackups' => $files->count(),
            'files'        => $files->map(fn ($f) => [
                'name'      => $f->getFilename(),
                'sizeBytes' => $f->getSize(),
                'mtime'     => date('c', $f->getMTime()),
            ]),
        ]);
    }

    /**
     * POST /api/database/backup
     */
    public function trigger()
    {
        try {
            Artisan::call('ppdi:backup-database');
            return $this->status();
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * GET /api/database/backup/download/{filename?}
     */
    public function download(?string $filename = null)
    {
        $backupDir = storage_path('app/backups');
        if (!File::isDirectory($backupDir)) {
            return response()->json(['success' => false, 'message' => 'Belum ada file backup tersedia'], 404);
        }

        if ($filename) {
            $safeName = basename($filename);
            $path = $backupDir . DIRECTORY_SEPARATOR . $safeName;
        } else {
            $latest = collect(File::files($backupDir))
                ->filter(fn ($f) => str_ends_with($f->getFilename(), '.sql'))
                ->sortByDesc(fn ($f) => $f->getMTime())
                ->first();
            if (!$latest) {
                return response()->json(['success' => false, 'message' => 'Belum ada file backup SQL'], 404);
            }
            $path = $latest->getPathname();
            $safeName = $latest->getFilename();
        }

        if (!File::exists($path)) {
            return response()->json(['success' => false, 'message' => 'File backup tidak ditemukan'], 404);
        }

        return response()->download($path, $safeName, ['Content-Type' => 'application/sql']);
    }
}
