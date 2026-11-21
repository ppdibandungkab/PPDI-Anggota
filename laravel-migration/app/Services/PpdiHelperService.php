<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use RuntimeException;

class PpdiHelperService
{
    public const DEFAULT_PASSWORDS = [
        'PPDIJaya#2006',
        'PPDIJaya2026',
        'PPDIJaya#2026',
    ];

    /**
     * Exact parity with server.ts isValidInt32Id():
     * Validates signed positive INT(11) range (1..2147483647).
     */
    public static function isValidInt32Id(mixed $val): ?int
    {
        if ($val === null || $val === '') {
            return null;
        }
        $str = trim((string) $val);
        if (!preg_match('/^\d+$/', $str)) {
            return null;
        }
        $num = (int) $str;
        if ($num <= 0 || $num > 2147483647) {
            return null;
        }
        return $num;
    }

    public const ID_JABATAN_KEPALA_DESA = 10;
    public const ID_JABATAN_STAF_PERANGKAT_DESA = 9;

    /**
     * Memvalidasi & menormalkan kolom `periode` (INT 11):
     * - id_jabatan === 10 (Kepala Desa): wajib bernilai 1, 2, atau 3
     * - id_jabatan lainnya: selalu null
     *
     * @return array{valid: bool, value: ?int, message?: string}
     */
    public static function validateAndNormalizePeriode(mixed $idJabatan, mixed $rawPeriode): array
    {
        $jId = (int) ($idJabatan ?? 0);
        if ($jId !== self::ID_JABATAN_KEPALA_DESA) {
            return ['valid' => true, 'value' => null];
        }

        if ($rawPeriode === null || trim((string) $rawPeriode) === '') {
            return [
                'valid'   => false,
                'value'   => null,
                'message' => 'Field periode wajib diisi (1, 2, atau 3) untuk jabatan Kepala Desa (id_jabatan = 10).',
            ];
        }

        if (!is_numeric($rawPeriode) || (int) $rawPeriode != $rawPeriode) {
            return [
                'valid'   => false,
                'value'   => null,
                'message' => 'Field periode Kepala Desa hanya boleh bernilai 1 (periode pertama), 2 (periode kedua), atau 3 (periode ketiga).',
            ];
        }

        $parsed = (int) $rawPeriode;
        if ($parsed < 1 || $parsed > 3) {
            return [
                'valid'   => false,
                'value'   => null,
                'message' => 'Field periode Kepala Desa hanya boleh bernilai 1 (periode pertama), 2 (periode kedua), atau 3 (periode ketiga).',
            ];
        }

        return ['valid' => true, 'value' => $parsed];
    }

    /**
     * Exact parity with server.ts generateServerNIPD() (28 digit):
     * 1. Kepala Desa (id_jabatan = 10):
     *    [YYYYMMDD lahir][YYYYMM tmt][jk 1|2][01][periode 1|2|3][10-digit wilayah]
     * 2. Perangkat Desa (id_jabatan = 1..8):
     *    [YYYYMMDD lahir][YYYYMM tmt][jk 1|2][02][1=Sekdes|2=Kasi|3=Kaur|4=Kewilayahan][10-digit wilayah]
     * 3. Staf Perangkat Desa (id_jabatan = 9):
     *    [YYYYMMDD lahir][YYYYMM tmt][jk 1|2][03][1][10-digit wilayah]
     */
    public static function generateServerNIPD(array $params): string
    {
        // a. 8 digit pertama: Tahun, Bulan, Tanggal Lahir (YYYYMMDD)
        $lahirStr = '19900101';
        if (!empty($params['tanggal_lahir'])) {
            $clean = preg_replace('/[^0-9]/', '', (string) $params['tanggal_lahir']);
            if (strlen($clean) >= 8) {
                $lahirStr = substr($clean, 0, 8);
            } elseif (strlen($clean) === 6) {
                $lahirStr = $clean . '01';
            }
        }

        // b. 6 digit berikutnya: Tahun & Bulan Pengangkatan/Pelantikan (YYYYMM)
        $tmtStr = '202001';
        if (!empty($params['tmt_jabatan'])) {
            $cleanTmt = preg_replace('/[^0-9]/', '', (string) $params['tmt_jabatan']);
            if (strlen($cleanTmt) >= 6) {
                $tmtStr = substr($cleanTmt, 0, 6);
            } elseif (strlen($cleanTmt) >= 4) {
                $tmtStr = substr($cleanTmt, 0, 4) . '01';
            }
        }

        // c. 1 digit berikutnya: Jenis Kelamin (1 = Laki-laki, 2 = Perempuan)
        $jk = strtoupper((string) ($params['jenis_kelamin'] ?? 'L'));
        $jkCode = ($jk === 'P' || $jk === 'PEREMPUAN') ? '2' : '1';

        // d & e. 2 digit kode unsur + 1 digit kode periodisasi/jabatan
        $jId = (int) ($params['id_jabatan'] ?? 0);
        $namaLower = strtolower((string) ($params['nama_jabatan'] ?? ''));
        $katLower = strtolower((string) ($params['kategori_jabatan'] ?? ''));

        $isKepalaDesa = $jId === self::ID_JABATAN_KEPALA_DESA
            || $katLower === 'kepala desa'
            || str_contains($namaLower, 'kepala desa')
            || str_contains($namaLower, 'kades');

        $isStafPerangkatDesa = !$isKepalaDesa && (
            $jId === self::ID_JABATAN_STAF_PERANGKAT_DESA
            || $katLower === 'staf desa'
            || str_contains($namaLower, 'staf')
        );

        if ($isKepalaDesa) {
            // 1. Kepala Desa: 01 + waktu periodisasi (1, 2, atau 3)
            $devCode = '01';
            $parsedPeriode = (int) ($params['periode'] ?? 1);
            $subCode = ($parsedPeriode >= 1 && $parsedPeriode <= 3) ? (string) $parsedPeriode : '1';
        } elseif ($isStafPerangkatDesa) {
            // 3. Staf Perangkat Desa: 03 + 1
            $devCode = '03';
            $subCode = '1';
        } else {
            // 2. Perangkat Desa: 02 + Kode Jabatan (1=Sekdes, 2=Kasi, 3=Kaur, 4=Kewilayahan)
            $devCode = '02';
            if ($jId === 1 || str_contains($namaLower, 'sekretaris desa') || str_contains($namaLower, 'sekdes')) {
                $subCode = '1';
            } elseif (
                in_array($jId, [2, 3, 4], true)
                || $katLower === 'pelaksana teknis'
                || str_contains($namaLower, 'kepala seksi')
                || str_contains($namaLower, 'kasi')
            ) {
                $subCode = '2';
            } elseif (
                in_array($jId, [5, 6, 7], true)
                || str_contains($namaLower, 'kepala urusan')
                || str_contains($namaLower, 'kaur')
            ) {
                $subCode = '3';
            } elseif (
                $jId === 8
                || $katLower === 'pelaksana kewilayahan'
                || str_contains($namaLower, 'kepala dusun')
                || str_contains($namaLower, 'kadus')
                || str_contains($namaLower, 'kewilayahan')
            ) {
                $subCode = '4';
            } else {
                $subCode = '2';
            }
        }

        // f. 10 digit terakhir: 2 Prov + 2 Kab/Kota + 2 Kec + 4 Desa
        $cleanDesa = !empty($params['id_desa']) ? (string) preg_replace('/[^0-9]/', '', (string) $params['id_desa']) : '';
        $cleanKec = !empty($params['id_kecamatan']) ? (string) preg_replace('/[^0-9]/', '', (string) $params['id_kecamatan']) : '';

        $provKabCode = '3204';
        if (strlen($cleanDesa) >= 10) {
            $provKabCode = substr($cleanDesa, 0, 4);
        } elseif (strlen($cleanKec) >= 6) {
            $provKabCode = substr($cleanKec, 0, 4);
        }

        $kecCode = '01';
        if (strlen($cleanKec) >= 6) {
            $kecCode = substr($cleanKec, 4, 2);
        } elseif (strlen($cleanDesa) >= 10) {
            $kecCode = substr($cleanDesa, 4, 2);
        } elseif (strlen($cleanKec) >= 2) {
            $kecCode = substr($cleanKec, -2);
        } elseif (strlen($cleanKec) === 1) {
            $kecCode = str_pad($cleanKec, 2, '0', STR_PAD_LEFT);
        }

        $desaCode = '0001';
        if (strlen($cleanDesa) >= 10) {
            $desaCode = substr($cleanDesa, 6, 4);
        } elseif (strlen($cleanDesa) >= 4) {
            $desaCode = substr($cleanDesa, -4);
        } elseif (strlen($cleanDesa) > 0) {
            $desaCode = str_pad($cleanDesa, 4, '0', STR_PAD_LEFT);
        }

        $wilayahCode = "{$provKabCode}{$kecCode}{$desaCode}";
        return "{$lahirStr}{$tmtStr}{$jkCode}{$devCode}{$subCode}{$wilayahCode}";
    }

    /**
     * Exact parity with src/services/ktaService.ts generateUniqueKTA():
     * Thread-safe sequential numbering per kecamatan using SELECT ... FOR UPDATE.
     * Pattern: 32.04.[KodeKec 2-digit].[KodeDesa 4-digit].[NomorUrut 4-digit]
     *
     * Must be invoked inside an active DB::transaction().
     */
    public static function generateUniqueKTA(
        string $idKecamatan,
        string $idDesa,
        ?string $customKta = null
    ): array {
        $cleanKec = trim(str_replace('.', '', $idKecamatan));
        $kecCode = strlen($cleanKec) >= 6
            ? substr($cleanKec, 4, 2)
            : (substr($cleanKec, -2) ?: '05');

        $cleanDesa = trim(str_replace('.', '', $idDesa));
        $desaCode = strlen($cleanDesa) >= 10
            ? substr($cleanDesa, 6, 4)
            : (substr($cleanDesa, -4) ?: '2001');

        $fullKecCode = strlen($cleanKec) >= 6 ? "32.04.{$kecCode}" : $kecCode;

        if ($customKta !== null && trim($customKta) !== '') {
            $customTrimmed = trim($customKta);
            $parts = explode('.', $customTrimmed);
            $customUrut = count($parts) >= 5 ? ((int) $parts[4] ?: 1) : 1;
            return [
                'noKta'         => $customTrimmed,
                'kodeKecamatan' => $fullKecCode,
                'kodeDesa'      => $desaCode,
                'nomorUrut'     => $customUrut,
            ];
        }

        $nextUrut = 1;

        try {
            $row = DB::selectOne(
                'SELECT COALESCE(MAX(nomor_urut), 0) + 1 AS next_urut
                 FROM anggota
                 WHERE kode_kecamatan = ? OR kode_kecamatan = ? OR kode_kecamatan = ?
                 FOR UPDATE',
                [$fullKecCode, $kecCode, "32.04.{$kecCode}"]
            );

            if ($row && !empty($row->next_urut)) {
                $nextUrut = max(1, (int) $row->next_urut);
            }
        } catch (\Throwable) {
            $kecPrefix = "32.04.{$kecCode}.%";
            $rowKec = DB::selectOne(
                "SELECT no_kta FROM keanggotaan_ppdi
                 WHERE no_kta LIKE ?
                 ORDER BY CAST(SUBSTRING_INDEX(no_kta, '.', -1) AS UNSIGNED) DESC
                 LIMIT 1 FOR UPDATE",
                [$kecPrefix]
            );
            if ($rowKec && !empty($rowKec->no_kta)) {
                $parts = explode('.', $rowKec->no_kta);
                if (count($parts) >= 5 && is_numeric($parts[4])) {
                    $nextUrut = (int) $parts[4] + 1;
                }
            }
        }

        $candidateKta = sprintf('32.04.%s.%s.%04d', $kecCode, $desaCode, $nextUrut);

        while (true) {
            $dupFound = false;

            try {
                if (DB::table('anggota')->where('no_kta', $candidateKta)->exists()) {
                    $dupFound = true;
                }
            } catch (\Throwable) {
            }

            try {
                if (DB::table('keanggotaan_ppdi')->where('no_kta', $candidateKta)->exists()) {
                    $dupFound = true;
                }
            } catch (\Throwable) {
            }

            if (!$dupFound) {
                break;
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
     * Exact parity with server.ts resolveDesaId()
     */
    public static function resolveDesaId(mixed $rawIdDesa, ?string $rawNamaDesa = null): string
    {
        $rawStr = (string) ($rawIdDesa ?? '');
        $clean = trim(str_replace('.', '', $rawStr));

        if ($clean !== '') {
            $match = DB::table('ref_desa')
                ->select('id_desa')
                ->where('id_desa', $clean)
                ->orWhere('id_desa', $rawStr)
                ->first();
            if ($match) {
                return (string) $match->id_desa;
            }
        }

        if ($rawNamaDesa !== null && trim($rawNamaDesa) !== '') {
            $byName = DB::table('ref_desa')
                ->select('id_desa')
                ->whereRaw('LOWER(nama_desa) = LOWER(?)', [trim($rawNamaDesa)])
                ->first();
            if ($byName) {
                return (string) $byName->id_desa;
            }
        }

        $any = DB::table('ref_desa')->select('id_desa')->first();
        return $any ? (string) $any->id_desa : '3204052001';
    }

    /**
     * Exact parity with server.ts resolveJabatanId()
     */
    public static function resolveJabatanId(mixed $rawIdJabatan): int
    {
        $parsed = self::isValidInt32Id($rawIdJabatan);
        if ($parsed !== null) {
            $match = DB::table('ref_jabatan')
                ->select('id_jabatan')
                ->where('id_jabatan', $parsed)
                ->first();
            if ($match) {
                return (int) $match->id_jabatan;
            }
        }

        $any = DB::table('ref_jabatan')->select('id_jabatan')->orderBy('id_jabatan')->first();
        return $any ? (int) $any->id_jabatan : 1;
    }

    public static function isKepalaDesa(?string $kategoriJabatan, ?string $namaJabatan): bool
    {
        $namaLower = strtolower((string) $namaJabatan);
        return $kategoriJabatan === 'Kepala Desa'
            || str_contains($namaLower, 'kepala desa')
            || str_contains($namaLower, 'kades');
    }

    public static function sanitizeJabatanPengurus(string $jabatanPengurus, bool $isKades): string
    {
        $val = trim($jabatanPengurus) ?: ($isKades ? 'Anggota Istimewa' : 'Anggota Biasa');
        if ($isKades && !in_array($val, ['Penasehat', 'Anggota Istimewa'], true)) {
            return 'Anggota Istimewa';
        }
        return $val;
    }

    public static function mapRoleNameToId(?string $roleName): string
    {
        if (!$roleName) {
            return '3';
        }
        $clean = trim($roleName);
        $map = [
            'Superadmin_Kabupaten' => '1',
            'Admin_Kabupaten'      => '2',
            'Admin_Kecamatan'      => '3',
            'Admin_Desa'           => '4',
            'Anggota'              => '5',
        ];
        return $map[$clean] ?? $clean;
    }

    /**
     * Exact parity with server.ts isValidPdfBase64Upload():
     * Checks .pdf filename extension, data:application/pdf MIME, and %PDF- magic header.
     */
    public static function isValidPdfBase64Upload(string $fileData, ?string $fileName = null): bool
    {
        $trimmedData = trim($fileData);
        if ($trimmedData === '') {
            return false;
        }

        $trimmedName = strtolower(trim((string) $fileName));
        if ($trimmedName !== '' && !str_ends_with($trimmedName, '.pdf')) {
            return false;
        }

        $base64Clean = $trimmedData;
        if (preg_match('/^data:([A-Za-z0-9\-+\/.]+);base64,(.+)$/s', $trimmedData, $matches)) {
            $mimeType = strtolower($matches[1]);
            $base64Clean = $matches[2];
            if (!in_array($mimeType, ['application/pdf', 'application/x-pdf'], true)) {
                return false;
            }
        } elseif (str_starts_with($trimmedData, 'data:')) {
            return false;
        }

        $decoded = base64_decode(substr($base64Clean, 0, 128), true);
        if ($decoded === false) {
            $decoded = base64_decode(substr($base64Clean, 0, 128));
        }

        return str_contains(substr((string) $decoded, 0, 64), '%PDF-');
    }

    /**
     * Resolves upload folder path safely for shared hosting / HestiaCP.
     * - UPLOADS_STORAGE_MODE=public  -> public/uploads/{folder} (tanpa perlu symlink storage:link)
     * - UPLOADS_STORAGE_MODE=storage -> storage/app/public/uploads/{folder} (dilayani via symlink atau fallback route)
     */
    public static function resolveUploadDir(string $folder): string
    {
        $safeFolder = in_array($folder, ['foto', 'sk', 'ttd', 'regulasi'], true) ? $folder : 'foto';
        $mode = strtolower(trim((string) env('UPLOADS_STORAGE_MODE', 'public')));

        return $mode === 'storage'
            ? storage_path("app/public/uploads/{$safeFolder}")
            : public_path("uploads/{$safeFolder}");
    }

    /**
     * Locates an uploaded file safely across both public/uploads and storage/app/public/uploads,
     * preventing directory traversal attacks.
     */
    public static function resolveUploadFilePath(string $folder, string $fileName): ?string
    {
        if (!in_array($folder, ['foto', 'sk', 'ttd', 'regulasi'], true)) {
            return null;
        }
        $safeName = basename(str_replace(['\\', "\0"], '', $fileName));
        if ($safeName === '' || $safeName === '.' || $safeName === '..' || str_starts_with($safeName, '.')) {
            return null;
        }

        $candidates = [
            public_path("uploads/{$folder}" . DIRECTORY_SEPARATOR . $safeName),
            storage_path("app/public/uploads/{$folder}" . DIRECTORY_SEPARATOR . $safeName),
        ];

        foreach ($candidates as $candidate) {
            if (File::exists($candidate) && File::isFile($candidate)) {
                return $candidate;
            }
        }

        return null;
    }

    /**
     * Exact parity with server.ts saveBase64UploadToDisk():
     * Stores physical files safely in resolved upload directory and returns /uploads/{folder}/{fileName}.
     */
    public static function saveBase64UploadToDisk(
        string $type,
        string $fileData,
        ?string $fileName = null,
        ?string $nik = null
    ): array {
        $folderType = match ($type) {
            'sk'       => 'sk',
            'ttd'      => 'ttd',
            'regulasi' => 'regulasi',
            default    => 'foto',
        };

        if ($folderType === 'sk' && !self::isValidPdfBase64Upload($fileData, $fileName)) {
            throw new RuntimeException('Hanya file berformat PDF (.pdf) yang diperbolehkan untuk berkas SK.');
        }

        $mimeType = '';
        $base64Clean = $fileData;
        if (preg_match('/^data:([A-Za-z0-9\-+\/.]+);base64,(.+)$/s', $fileData, $matches)) {
            $mimeType = $matches[1];
            $base64Clean = $matches[2];
        }

        $ext = $folderType === 'sk'
            ? '.pdf'
            : (($fileName && pathinfo($fileName, PATHINFO_EXTENSION)) ? '.' . strtolower(pathinfo($fileName, PATHINFO_EXTENSION)) : '');

        if ($ext === '') {
            if (str_contains($mimeType, 'pdf')) {
                $ext = '.pdf';
            } elseif (str_contains($mimeType, 'png')) {
                $ext = '.png';
            } elseif (str_contains($mimeType, 'jpeg') || str_contains($mimeType, 'jpg')) {
                $ext = '.jpg';
            } elseif (str_contains($mimeType, 'webp')) {
                $ext = '.webp';
            } else {
                $ext = match ($folderType) {
                    'sk', 'regulasi' => '.pdf',
                    'ttd'            => '.png',
                    default          => '.jpg',
                };
            }
        }

        // Whitelist safe extensions (prevents PHP/shell upload on shared hosting)
        $allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf'];
        if (!in_array(strtolower($ext), $allowedExts, true)) {
            throw new RuntimeException('Ekstensi file tidak diizinkan demi keamanan server.');
        }

        $rawBase = str_replace($ext, '', (string) ($fileName ?: "{$folderType}_doc"));
        $cleanBase = substr((string) preg_replace('/[^a-zA-Z0-9_-]/', '_', $rawBase), 0, 40);
        $prefix = $nik ? preg_replace('/[^0-9]/', '', $nik) . '_' : '';
        $timestamp = substr((string) round(microtime(true) * 1000), -6);
        $finalFileName = "{$folderType}_{$prefix}{$cleanBase}_{$timestamp}{$ext}";

        $targetDir = self::resolveUploadDir($folderType);
        if (!File::isDirectory($targetDir)) {
            File::makeDirectory($targetDir, 0755, true);
        }

        $binary = base64_decode($base64Clean, true);
        if ($binary === false) {
            $binary = base64_decode($base64Clean);
        }

        File::put($targetDir . DIRECTORY_SEPARATOR . $finalFileName, $binary);

        return [
            'url'       => "/uploads/{$folderType}/{$finalFileName}",
            'fileName'  => $finalFileName,
            'sizeBytes' => strlen((string) $binary),
            'mimeType'  => $mimeType ?: $ext,
        ];
    }

    /**
     * Prevents VARCHAR(255) overflow by converting inline base64 data URLs to disk paths.
     */
    public static function sanitizeVarcharPath(
        ?string $val,
        string $uploadType,
        string $defaultFileName,
        ?string $nik = null
    ): ?string {
        if ($val === null || trim($val) === '') {
            return null;
        }
        $trimmed = trim($val);
        if (str_starts_with($trimmed, 'data:')) {
            try {
                return self::saveBase64UploadToDisk($uploadType, $trimmed, $defaultFileName, $nik)['url'];
            } catch (\Throwable) {
                return null;
            }
        }
        return strlen($trimmed) > 255 ? substr($trimmed, 0, 255) : $trimmed;
    }

    /**
     * Issues a stateless HMAC-SHA256 signed Bearer token (zero extra Composer dependencies).
     */
    public static function issueSessionToken(array $userPayload): string
    {
        $ttlHours = max(1, (int) env('AUTH_TOKEN_TTL_HOURS', 24));
        $claims = [
            'uid'      => (int) ($userPayload['id_user'] ?? 0),
            'username' => (string) ($userPayload['username'] ?? ''),
            'nama'     => (string) ($userPayload['nama'] ?? ''),
            'role'     => (string) ($userPayload['role'] ?? 'Anggota'),
            'iat'      => time(),
            'exp'      => time() + ($ttlHours * 3600),
        ];

        $secret = (string) (config('app.key') ?: env('APP_KEY', 'ppdi-bandung-default-key'));
        $encoded = rtrim(strtr(base64_encode((string) json_encode($claims)), '+/', '-_'), '=');
        $sig = rtrim(strtr(base64_encode(hash_hmac('sha256', $encoded, $secret, true)), '+/', '-_'), '=');

        return "{$encoded}.{$sig}";
    }

    /**
     * Verifies a signed Bearer token and returns its claims array, or null if invalid/expired.
     */
    public static function verifySessionToken(?string $token): ?array
    {
        $clean = trim((string) $token);
        if ($clean === '' || !str_contains($clean, '.')) {
            return null;
        }

        [$encoded, $sig] = explode('.', $clean, 2);
        $secret = (string) (config('app.key') ?: env('APP_KEY', 'ppdi-bandung-default-key'));
        $expected = rtrim(strtr(base64_encode(hash_hmac('sha256', $encoded, $secret, true)), '+/', '-_'), '=');

        if (!hash_equals($expected, $sig)) {
            return null;
        }

        $padded = str_pad(strtr($encoded, '-_', '+/'), strlen($encoded) % 4 === 0 ? strlen($encoded) : strlen($encoded) + (4 - strlen($encoded) % 4), '=');
        $decoded = json_decode((string) base64_decode($padded), true);
        if (!is_array($decoded) || empty($decoded['role'])) {
            return null;
        }

        if (!empty($decoded['exp']) && (int) $decoded['exp'] < time()) {
            return null;
        }

        return $decoded;
    }

    public static function isValidTimestamp(?string $ts): bool
    {
        if ($ts === null) {
            return false;
        }
        $s = trim($ts);
        return $s !== '' && strtolower($s) !== 'null' && !str_starts_with($s, '0000-00-00');
    }

    public static function isDefaultPassword(?string $storedPass, ?string $effectiveUpdatedAt): bool
    {
        $cleanPass = trim((string) $storedPass);
        $hasValidUpdatedTs = self::isValidTimestamp($effectiveUpdatedAt);
        $isAlreadyChanged = $cleanPass !== ''
            && !in_array($cleanPass, self::DEFAULT_PASSWORDS, true)
            && $hasValidUpdatedTs;

        return !$isAlreadyChanged;
    }
}
