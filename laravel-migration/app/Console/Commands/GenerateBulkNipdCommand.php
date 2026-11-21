<?php

namespace App\Console\Commands;

use App\Services\NipdGeneratorService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Artisan command untuk Generate Massal NIPD 28 digit menggunakan NipdGeneratorService.
 *
 * Contoh penggunaan:
 *   php artisan ppdi:generate-nipd --dry-run
 *   php artisan ppdi:generate-nipd --kecamatan=32.04.05 --dry-run
 *   php artisan ppdi:generate-nipd --kecamatan=320405 --mode=non_standard --force
 *   php artisan ppdi:generate-nipd --kecamatan=32.04.05 --default-kades-periode=1
 */
class GenerateBulkNipdCommand extends Command
{
    protected $signature = 'ppdi:generate-nipd
        {--kecamatan= : Filter kode/ID kecamatan (contoh: 32.04.05 atau 320405)}
        {--desa= : Filter kode/ID desa (contoh: 32.04.05.2001 atau 3204052001)}
        {--jabatan= : Filter ID jabatan (1..10)}
        {--mode=non_standard : Mode pembaruan: non_standard (default), only_empty, atau all}
        {--default-kades-periode= : Periode bawaan (1, 2, atau 3) jika Kepala Desa belum memiliki periode}
        {--dry-run : Simulasi pratinjau tanpa menulis perubahan ke database}
        {--force : Lewati konfirmasi interaktif saat menyimpan ke database}
        {--limit-preview=25 : Maksimal baris pratinjau yang ditampilkan di tabel terminal}';

    protected $description = 'Generate & standarisasi massal NIPD 28 digit anggota PPDI menggunakan NipdGeneratorService (mendukung filter per kecamatan)';

    public function __construct(
        private readonly NipdGeneratorService $nipdGenerator
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $mode = strtolower(trim((string) $this->option('mode')));
        if (!in_array($mode, ['non_standard', 'only_empty', 'all'], true)) {
            $this->error("Mode tidak valid: '{$mode}'. Gunakan salah satu dari: non_standard, only_empty, all.");
            return self::INVALID;
        }

        $rawDefaultPeriode = $this->option('default-kades-periode');
        $defaultKadesPeriode = null;
        if ($rawDefaultPeriode !== null && trim((string) $rawDefaultPeriode) !== '') {
            if (!in_array((int) $rawDefaultPeriode, [1, 2, 3], true)) {
                $this->error('Opsi --default-kades-periode hanya boleh bernilai 1, 2, atau 3.');
                return self::INVALID;
            }
            $defaultKadesPeriode = (int) $rawDefaultPeriode;
        }

        $kecamatan = $this->option('kecamatan') ? trim((string) $this->option('kecamatan')) : null;
        $desa = $this->option('desa') ? trim((string) $this->option('desa')) : null;
        $jabatan = $this->option('jabatan') ? trim((string) $this->option('jabatan')) : null;
        $dryRun = (bool) $this->option('dry-run');
        $force = (bool) $this->option('force');
        $limitPreview = max(1, (int) $this->option('limit-preview'));

        // Tampilkan informasi cakupan filter kecamatan jika diberikan
        if ($kecamatan !== null) {
            $cleanKec = str_replace('.', '', $kecamatan);
            $kecRow = DB::table('ref_kecamatan')
                ->where('id_kecamatan', $kecamatan)
                ->orWhereRaw("REPLACE(id_kecamatan, '.', '') = ?", [$cleanKec])
                ->first();

            $kecLabel = $kecRow
                ? "{$kecRow->nama_kecamatan} ({$kecRow->id_kecamatan})"
                : $kecamatan;
            $this->info("Filter Kecamatan : {$kecLabel}");
        } else {
            $this->info('Filter Kecamatan : Semua Kecamatan (Kabupaten Bandung)');
        }

        if ($desa !== null) {
            $this->info("Filter Desa      : {$desa}");
        }
        if ($jabatan !== null) {
            $this->info("Filter Jabatan   : ID {$jabatan}");
        }
        $this->info("Mode Pembaruan   : {$mode}");
        $this->info('Mode Eksekusi    : ' . ($dryRun ? 'DRY-RUN (Simulasi)' : 'LIVE (Simpan ke Database)'));

        $options = [
            'mode'                  => $mode,
            'id_kecamatan'          => $kecamatan,
            'id_desa'               => $desa,
            'id_jabatan'            => $jabatan,
            'default_kades_periode' => $defaultKadesPeriode,
            'dry_run'               => true,
        ];

        // Tahap 1: Jalankan simulasi pratinjau terlebih dahulu
        $preview = $this->nipdGenerator->generateBatch($options);
        $summary = $preview['summary'];

        $this->newLine();
        $this->table(
            ['Total Dipindai', 'Akan Diperbarui', 'Sudah Sesuai', 'Dilewati'],
            [[
                $summary['total_scanned'],
                $summary['eligible'],
                $summary['unchanged'],
                $summary['skipped'],
            ]]
        );

        $previewItems = array_slice($preview['items'], 0, $limitPreview);
        if (count($previewItems) > 0) {
            $tableRows = array_map(fn (array $item) => [
                $item['id_anggota'],
                $item['nama_lengkap'],
                $item['nama_jabatan'] . ($item['periode'] ? " (P{$item['periode']})" : ''),
                $item['nama_desa'],
                $item['old_nipd'] ?: '(kosong)',
                $item['new_nipd_formatted'] ?: '-',
                strtoupper((string) $item['status']),
            ], $previewItems);

            $this->table(
                ['ID', 'Nama Lengkap', 'Jabatan', 'Desa', 'NIPD Lama', 'NIPD Baru (Spasi)', 'Status'],
                $tableRows
            );

            if (count($preview['items']) > $limitPreview) {
                $this->comment('Menampilkan ' . $limitPreview . ' dari ' . count($preview['items']) . ' baris. Gunakan --limit-preview untuk menampilkan lebih banyak.');
            }
        }

        if ($summary['eligible'] === 0) {
            $this->info('Tidak ada data anggota yang perlu diperbarui.');
            return self::SUCCESS;
        }

        if ($dryRun) {
            $this->warn("DRY-RUN selesai: {$summary['eligible']} NIPD siap diperbarui. Jalankan ulang tanpa --dry-run untuk menyimpan ke database.");
            return self::SUCCESS;
        }

        if (!$force && !$this->confirm("Lanjutkan memperbarui NIPD untuk {$summary['eligible']} anggota di database?", true)) {
            $this->warn('Eksekusi dibatalkan oleh pengguna.');
            return self::SUCCESS;
        }

        // Tahap 2: Eksekusi aktual di dalam DB::transaction()
        $options['dry_run'] = false;
        $committed = $this->nipdGenerator->generateBatch($options);
        $finalSummary = $committed['summary'];

        $this->info(
            "Generate Massal NIPD berhasil: {$finalSummary['updated']} diperbarui, "
            . "{$finalSummary['unchanged']} sudah sesuai, {$finalSummary['skipped']} dilewati."
        );

        return self::SUCCESS;
    }
}
