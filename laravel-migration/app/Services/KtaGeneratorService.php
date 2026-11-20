<?php

namespace App\Services;

use App\Exceptions\KtaConflictException;
use App\Models\Anggota;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

class KtaGeneratorService
{
    /**
     * Format Nomor KTA PPDI Kabupaten Bandung:
     * 32.04.[KodeKec 2-digit].[KodeDesa 4-digit].[NomorUrut 4-digit]
     *
     * Contoh: 32.04.05.2001.0042
     */

    /**
     * Menghasilkan nomor KTA unik berikutnya secara sekuensial untuk sebuah kecamatan
     * menggunakan DB::transaction() + Anggota::where(...)->lockForUpdate().
     *
     * Dapat dipanggil cukup dengan 1 argumen:
     *   $service->generateForKecamatan('32.04.05');
     * atau lengkap dengan kode desa / custom KTA:
     *   $service->generateForKecamatan('32.04.05', '32.04.05.2001');
     *
     * @return array{noKta: string, kodeKecamatan: string, kodeDesa: string, nomorUrut: int}
     *
     * @throws KtaConflictException
     */
    public function generateForKecamatan(
        string $kodeKecamatan,
        string $kodeDesa = '2001',
        ?string $customKta = null
    ): array {
        return $this->executeWithUniqueRetry(
            fn () => $this->generateNextForKecamatan($kodeKecamatan, $kodeDesa, $customKta)
        );
    }

    /**
     * Alias kompatibel untuk generateForKecamatan().
     *
     * @return array{noKta: string, kodeKecamatan: string, kodeDesa: string, nomorUrut: int}
     */
    public function generate(
        string $idKecamatan,
        string $idDesa = '2001',
        ?string $customKta = null
    ): array {
        return $this->generateForKecamatan($idKecamatan, $idDesa, $customKta);
    }

    /**
     * Membungkus operasi pembuatan anggota + generate KTA dalam DB::transaction()
     * dengan retry otomatis saat terjadi bentrok UNIQUE constraint (MySQL 1062)
     * akibat concurrent requests.
     *
     * @template T
     * @param  callable(): T  $callback
     * @return T
     *
     * @throws KtaConflictException
     */
    public function executeWithUniqueRetry(callable $callback, int $maxAttempts = 3): mixed
    {
        $attempt = 0;

        while (true) {
            $attempt++;
            try {
                return DB::transaction(fn () => $callback());
            } catch (QueryException $e) {
                if ($this->isKtaUniqueConstraintViolation($e)) {
                    if ($attempt < $maxAttempts) {
                        usleep(50_000 * $attempt);
                        continue;
                    }

                    throw new KtaConflictException(
                        'Terjadi bentrok nomor KTA unik saat proses penyimpanan paralel. Silakan ulangi penyimpanan.',
                        null,
                        $e
                    );
                }

                throw $e;
            }
        }
    }

    /**
     * Membaca nomor urut terakhir kecamatan menggunakan Eloquent
     * Anggota::where(...)->lockForUpdate() di dalam DB::transaction() yang aktif
     * dan menghitung nomor KTA berikutnya (+1).
     *
     * @return array{noKta: string, kodeKecamatan: string, kodeDesa: string, nomorUrut: int}
     *
     * @throws KtaConflictException
     */
    public function generateNextForKecamatan(
        string $idKecamatan,
        string $idDesa = '2001',
        ?string $customKta = null
    ): array {
        $cleanKec = trim(str_replace('.', '', $idKecamatan));
        $kecCode = strlen($cleanKec) >= 6
            ? substr($cleanKec, 4, 2)
            : str_pad(substr($cleanKec, -2) ?: '05', 2, '0', STR_PAD_LEFT);

        $cleanDesa = trim(str_replace('.', '', $idDesa));
        $desaCode = strlen($cleanDesa) >= 10
            ? substr($cleanDesa, 6, 4)
            : str_pad(substr($cleanDesa, -4) ?: '2001', 4, '0', STR_PAD_LEFT);

        $fullKecCode = "32.04.{$kecCode}";

        if ($customKta !== null && trim($customKta) !== '') {
            $customTrimmed = trim($customKta);
            if ($this->ktaExistsWithLock($customTrimmed)) {
                throw new KtaConflictException(
                    "Nomor KTA {$customTrimmed} sudah terdaftar pada anggota lain. Nomor KTA wajib unik!",
                    $customTrimmed
                );
            }

            $parts = explode('.', $customTrimmed);
            $customUrut = (count($parts) >= 5 && is_numeric($parts[4])) ? max(1, (int) $parts[4]) : 1;

            return [
                'noKta'         => $customTrimmed,
                'kodeKecamatan' => $fullKecCode,
                'kodeDesa'      => $desaCode,
                'nomorUrut'     => $customUrut,
            ];
        }

        $nextUrut = max(1, $this->resolveNextSequenceWithLock($fullKecCode, $kecCode));
        $candidateKta = sprintf('32.04.%s.%s.%04d', $kecCode, $desaCode, $nextUrut);

        $guard = 0;
        while ($this->ktaExistsWithLock($candidateKta)) {
            $guard++;
            if ($guard > 500) {
                throw new KtaConflictException(
                    "Gagal menentukan nomor urut KTA unik pada kecamatan {$fullKecCode}.",
                    $candidateKta
                );
            }
            $nextUrut++;
            $candidateKta = sprintf('32.04.%s.%s.%04d', $kecCode, $desaCode, $nextUrut);
        }

        return [
            'noKta'         => $candidateKta,
            'kodeKecamatan' => $fullKecCode,
            'kodeDesa'      => $desaCode,
            'nomorUrut'     => $nextUrut,
        ];
    }

    /**
     * Menggunakan Anggota::where(...)->lockForUpdate() untuk membaca nomor urut terakhir
     * kecamatan secara aman dari race condition, lalu mengembalikan nomor urut + 1.
     */
    private function resolveNextSequenceWithLock(string $fullKecCode, string $kecCode): int
    {
        $maxAnggota = 0;
        $maxPpdi = 0;

        try {
            $lastAnggota = Anggota::where(function ($query) use ($fullKecCode, $kecCode) {
                $query->where('kode_kecamatan', $fullKecCode)
                    ->orWhere('kode_kecamatan', $kecCode)
                    ->orWhere('kode_kecamatan', "3204{$kecCode}");
            })
                ->orderByDesc('nomor_urut')
                ->lockForUpdate()
                ->first(['nomor_urut']);

            if ($lastAnggota && !empty($lastAnggota->nomor_urut)) {
                $maxAnggota = (int) $lastAnggota->nomor_urut;
            }
        } catch (\Throwable) {
        }

        try {
            $lastPpdi = DB::table('keanggotaan_ppdi')
                ->where('no_kta', 'like', "32.04.{$kecCode}.%")
                ->orderByRaw("CAST(SUBSTRING_INDEX(no_kta, '.', -1) AS UNSIGNED) DESC")
                ->lockForUpdate()
                ->first(['no_kta']);

            if ($lastPpdi && !empty($lastPpdi->no_kta)) {
                $parts = explode('.', (string) $lastPpdi->no_kta);
                if (count($parts) >= 5 && is_numeric($parts[4])) {
                    $maxPpdi = (int) $parts[4];
                }
            }
        } catch (\Throwable) {
        }

        return max($maxAnggota, $maxPpdi) + 1;
    }

    private function ktaExistsWithLock(string $candidateKta): bool
    {
        $inAnggota = false;
        $inPpdi = false;

        try {
            $inAnggota = Anggota::where('no_kta', $candidateKta)
                ->lockForUpdate()
                ->exists();
        } catch (\Throwable) {
        }

        try {
            $inPpdi = DB::table('keanggotaan_ppdi')
                ->where('no_kta', $candidateKta)
                ->lockForUpdate()
                ->exists();
        } catch (\Throwable) {
        }

        return $inAnggota || $inPpdi;
    }

    /**
     * Mendeteksi MySQL SQLSTATE 23000 / Error 1062 khusus pada constraint unique nomor KTA.
     */
    private function isKtaUniqueConstraintViolation(QueryException $e): bool
    {
        $sqlState = (string) ($e->errorInfo[0] ?? $e->getCode());
        $driverCode = (int) ($e->errorInfo[1] ?? 0);
        $msg = strtolower($e->getMessage());

        $isDuplicate = $sqlState === '23000' && ($driverCode === 1062 || str_contains($msg, 'duplicate entry'));
        if (!$isDuplicate) {
            return false;
        }

        return str_contains($msg, 'no_kta')
            || str_contains($msg, 'uq_anggota_no_kta')
            || str_contains($msg, 'uq_ppdi_no_kta');
    }
}
