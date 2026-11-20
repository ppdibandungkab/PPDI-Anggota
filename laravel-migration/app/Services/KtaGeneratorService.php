<?php

namespace App\Services;

use App\Exceptions\KtaConflictException;
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
     * Membungkus operasi pembuatan anggota + generate KTA dalam DB::transaction()
     * dengan retry otomatis saat terjadi bentrok UNIQUE constraint (MySQL 1062)
     * akibat request paralel (concurrent requests).
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
                        usleep(50_000 * $attempt); // Backoff 50ms, 100ms sebelum retry lockForUpdate
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
     * Menghasilkan nomor KTA berikutnya yang unik per kecamatan menggunakan
     * pessimistic locking (SELECT ... FOR UPDATE via lockForUpdate()).
     *
     * WAJIB dipanggil di dalam DB::transaction() yang aktif.
     *
     * @return array{noKta: string, kodeKecamatan: string, kodeDesa: string, nomorUrut: int}
     *
     * @throws KtaConflictException
     */
    public function generateNextForKecamatan(
        string $idKecamatan,
        string $idDesa,
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

        // Jika admin memasukkan Nomor KTA manual, kunci & cek keunikannya lebih dulu
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

        // Kunci baris kecamatan terkait pada tabel anggota (SELECT ... FOR UPDATE)
        $maxUrut = $this->resolveNextSequenceWithLock($fullKecCode, $kecCode);
        $nextUrut = max(1, $maxUrut);
        $candidateKta = sprintf('32.04.%s.%s.%04d', $kecCode, $desaCode, $nextUrut);

        // Safeguard ganda: pastikan tidak bentrok di tabel anggota maupun keanggotaan_ppdi
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
     * Membaca nomor urut terakhir pada kecamatan dengan lockForUpdate().
     */
    private function resolveNextSequenceWithLock(string $fullKecCode, string $kecCode): int
    {
        $maxAnggota = 0;
        $maxPpdi = 0;

        try {
            $lockedAnggota = DB::table('anggota')
                ->whereIn('kode_kecamatan', [$fullKecCode, $kecCode, "3204{$kecCode}"])
                ->orderByDesc('nomor_urut')
                ->lockForUpdate()
                ->first(['nomor_urut']);

            if ($lockedAnggota && !empty($lockedAnggota->nomor_urut)) {
                $maxAnggota = (int) $lockedAnggota->nomor_urut;
            }
        } catch (\Throwable) {
            // Lanjutkan fallback ke tabel keanggotaan_ppdi bila kolom kode_kecamatan/nomor_urut belum ada
        }

        try {
            $lockedPpdi = DB::table('keanggotaan_ppdi')
                ->where('no_kta', 'like', "32.04.{$kecCode}.%")
                ->orderByRaw("CAST(SUBSTRING_INDEX(no_kta, '.', -1) AS UNSIGNED) DESC")
                ->lockForUpdate()
                ->first(['no_kta']);

            if ($lockedPpdi && !empty($lockedPpdi->no_kta)) {
                $parts = explode('.', (string) $lockedPpdi->no_kta);
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
            $inAnggota = DB::table('anggota')
                ->where('no_kta', $candidateKta)
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
