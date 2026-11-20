<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

class BackupDatabaseCommand extends Command
{
    protected $signature = 'ppdi:backup-database';
    protected $description = 'Menghasilkan dump SQL harian database PPDI tanpa ketergantungan binary mysqldump (aman di shared hosting / HestiaCP)';

    public function handle(): int
    {
        $backupDir = storage_path('app/backups');
        if (!File::isDirectory($backupDir)) {
            File::makeDirectory($backupDir, 0775, true);
        }

        $dbName = (string) config('database.connections.mysql.database');
        $timestamp = now()->format('Ymd_His');
        $fileName = "backup_{$dbName}_{$timestamp}.sql";
        $filePath = $backupDir . DIRECTORY_SEPARATOR . $fileName;

        try {
            $tables = DB::select('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"');
            $sqlLines = [
                "-- PPDI Kabupaten Bandung Automated SQL Backup",
                "-- Database: {$dbName}",
                "-- Generated: " . now()->toIso8601String(),
                "SET FOREIGN_KEY_CHECKS=0;",
                "",
            ];

            $totalRows = 0;
            foreach ($tables as $t) {
                $vals = array_values((array) $t);
                $tableName = $vals[0];

                $createRow = DB::selectOne("SHOW CREATE TABLE `{$tableName}`");
                $createArr = array_values((array) $createRow);
                $sqlLines[] = "DROP TABLE IF EXISTS `{$tableName}`;";
                $sqlLines[] = $createArr[1] . ';';
                $sqlLines[] = '';

                $rows = DB::table($tableName)->get();
                foreach ($rows as $row) {
                    $rowArr = (array) $row;
                    $cols = array_map(fn ($c) => "`{$c}`", array_keys($rowArr));
                    $escaped = array_map(function ($v) {
                        if ($v === null) {
                            return 'NULL';
                        }
                        return DB::getPdo()->quote((string) $v);
                    }, array_values($rowArr));
                    $sqlLines[] = "INSERT INTO `{$tableName}` (" . implode(', ', $cols) . ') VALUES (' . implode(', ', $escaped) . ');';
                    $totalRows++;
                }
                $sqlLines[] = '';
            }

            $sqlLines[] = 'SET FOREIGN_KEY_CHECKS=1;';
            File::put($filePath, implode("\n", $sqlLines));

            // Keep last 14 daily backups
            $existing = collect(File::files($backupDir))
                ->filter(fn ($f) => str_ends_with($f->getFilename(), '.sql'))
                ->sortByDesc(fn ($f) => $f->getMTime())
                ->values();
            foreach ($existing->slice(14) as $old) {
                File::delete($old->getPathname());
            }

            $meta = [
                'status'     => 'success',
                'fileName'   => $fileName,
                'sizeBytes'  => File::size($filePath),
                'tableCount' => count($tables),
                'rowCount'   => $totalRows,
                'timestamp'  => now()->toIso8601String(),
            ];
            File::put($backupDir . DIRECTORY_SEPARATOR . 'last-backup.json', json_encode($meta, JSON_PRETTY_PRINT));

            $this->info("Backup berhasil dibuat: {$fileName} ({$totalRows} baris)");
            return self::SUCCESS;
        } catch (\Throwable $e) {
            $meta = [
                'status'    => 'error',
                'error'     => $e->getMessage(),
                'timestamp' => now()->toIso8601String(),
            ];
            File::put($backupDir . DIRECTORY_SEPARATOR . 'last-backup.json', json_encode($meta, JSON_PRETTY_PRINT));
            $this->error('Backup gagal: ' . $e->getMessage());
            return self::FAILURE;
        }
    }
}
