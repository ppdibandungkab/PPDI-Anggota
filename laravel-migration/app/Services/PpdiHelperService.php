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
        return (new NipdGeneratorService())->validateAndNormalizePeriode($idJabatan, $rawPeriode);
    }

    /**
     * Exact parity with server.ts generateServerNIPD() (28 digit).
     * Didelegasikan ke App\Services\NipdGeneratorService.
     */
    public static function generateServerNIPD(array $params): string
    {
        return (new NipdGeneratorService())->generateFromArray($params);
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
