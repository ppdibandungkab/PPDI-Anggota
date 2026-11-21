<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;

class AppSettingsService
{
    public const CHAIRMAN_DEFAULTS = [
        'chairman_name'     => 'Ketua PPDI Kabupaten Bandung',
        'chairman_title'    => 'Ketua Pengurus Daerah PPDI Kabupaten Bandung',
        'chairman_photo'    => '',
        'chairman_greeting' => '',
    ];

    public const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
    public const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    public const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB
    private const UPLOAD_SUBDIR = 'uploads/chairman';

    /**
     * Mengambil seluruh pengaturan aplikasi dari tabel app_settings dengan nilai default sambutan ketua.
     *
     * @return array<string, mixed>
     */
    public function getAllSettings(): array
    {
        $globalRow = DB::table('app_settings')->where('setting_key', 'global')->first();
        if ($globalRow && !empty($globalRow->setting_value)) {
            $decoded = json_decode((string) $globalRow->setting_value, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                return $this->normalizeChairmanFields(array_merge(self::CHAIRMAN_DEFAULTS, $decoded));
            }
        }

        $rows = DB::table('app_settings')->get();
        $settings = self::CHAIRMAN_DEFAULTS;
        foreach ($rows as $row) {
            if ($row->setting_key === 'global') {
                continue;
            }
            $decoded = json_decode((string) $row->setting_value, true);
            $settings[$row->setting_key] = json_last_error() === JSON_ERROR_NONE ? $decoded : $row->setting_value;
        }

        return $this->normalizeChairmanFields($settings);
    }

    /**
     * Mengambil khusus data Sambutan Ketua PPDI Kabupaten Bandung untuk halaman depan publik.
     *
     * @return array{chairman_name: string, chairman_title: string, chairman_photo: string, chairman_greeting: string}
     */
    public function getChairmanSettings(): array
    {
        $all = $this->getAllSettings();

        return [
            'chairman_name'     => (string) ($all['chairman_name'] ?? self::CHAIRMAN_DEFAULTS['chairman_name']),
            'chairman_title'    => (string) ($all['chairman_title'] ?? self::CHAIRMAN_DEFAULTS['chairman_title']),
            'chairman_photo'    => (string) ($all['chairman_photo'] ?? self::CHAIRMAN_DEFAULTS['chairman_photo']),
            'chairman_greeting' => (string) ($all['chairman_greeting'] ?? self::CHAIRMAN_DEFAULTS['chairman_greeting']),
        ];
    }

    /**
     * Memperbarui field Sambutan Ketua PPDI (chairman_name, chairman_title, chairman_photo, chairman_greeting)
     * termasuk pemrosesan upload foto ke public/uploads/chairman.
     *
     * @param  array<string, mixed>  $data
     * @return array{chairman_name: string, chairman_title: string, chairman_photo: string, chairman_greeting: string}
     */
    public function updateChairmanSettings(array $data, ?UploadedFile $photoFile = null): array
    {
        $currentAll = $this->getAllSettings();
        $previousPhoto = (string) ($currentAll['chairman_photo'] ?? '');
        $nextChairman = $this->extractChairmanFields($currentAll);

        if (array_key_exists('chairman_name', $data)) {
            $name = trim((string) ($data['chairman_name'] ?? ''));
            if (mb_strlen($name) > 150) {
                throw new InvalidArgumentException('Nama Ketua maksimal 150 karakter.');
            }
            $nextChairman['chairman_name'] = $name !== '' ? $name : self::CHAIRMAN_DEFAULTS['chairman_name'];
        }

        if (array_key_exists('chairman_title', $data)) {
            $title = trim((string) ($data['chairman_title'] ?? ''));
            if (mb_strlen($title) > 200) {
                throw new InvalidArgumentException('Jabatan Ketua maksimal 200 karakter.');
            }
            $nextChairman['chairman_title'] = $title !== '' ? $title : self::CHAIRMAN_DEFAULTS['chairman_title'];
        }

        if (array_key_exists('chairman_greeting', $data)) {
            $greeting = (string) ($data['chairman_greeting'] ?? '');
            if (mb_strlen($greeting) > 10000) {
                throw new InvalidArgumentException('Kata-kata sambutan Ketua maksimal 10.000 karakter.');
            }
            $nextChairman['chairman_greeting'] = $greeting;
        }

        $removePhoto = filter_var($data['remove_photo'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $uploadedNewPhotoPath = null;

        if ($photoFile !== null) {
            $uploadedNewPhotoPath = $this->uploadChairmanPhoto($photoFile);
            $nextChairman['chairman_photo'] = $uploadedNewPhotoPath;
        } elseif ($removePhoto) {
            $nextChairman['chairman_photo'] = '';
        } elseif (array_key_exists('chairman_photo_base64', $data) || array_key_exists('chairman_photo', $data)) {
            $rawPhoto = array_key_exists('chairman_photo_base64', $data)
                ? $data['chairman_photo_base64']
                : $data['chairman_photo'];

            $resolved = $this->resolveChairmanPhotoInput($rawPhoto);
            if ($resolved !== $previousPhoto && str_starts_with($resolved, '/' . self::UPLOAD_SUBDIR . '/')) {
                $uploadedNewPhotoPath = $resolved;
            }
            $nextChairman['chairman_photo'] = $resolved;
        }

        $mergedAll = array_merge($currentAll, $nextChairman);

        try {
            DB::transaction(function () use ($mergedAll, $nextChairman): void {
                DB::table('app_settings')->updateOrInsert(
                    ['setting_key' => 'global'],
                    [
                        'setting_value' => json_encode($mergedAll, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                        'updated_at'    => now(),
                    ]
                );

                // Sinkronkan juga jika key individual sudah ada di tabel app_settings
                foreach ($nextChairman as $key => $val) {
                    $exists = DB::table('app_settings')->where('setting_key', $key)->exists();
                    if ($exists) {
                        DB::table('app_settings')
                            ->where('setting_key', $key)
                            ->update([
                                'setting_value' => $val,
                                'updated_at'    => now(),
                            ]);
                    }
                }
            });
        } catch (\Throwable $e) {
            // Rollback file baru yang terlanjur ditulis jika transaksi DB gagal
            if ($uploadedNewPhotoPath !== null) {
                $this->deleteLocalChairmanPhoto($uploadedNewPhotoPath);
            }
            throw $e;
        }

        // Hapus file foto lokal lama apabila foto diganti atau dihapus
        if ($previousPhoto !== '' && $previousPhoto !== $nextChairman['chairman_photo']) {
            $this->deleteLocalChairmanPhoto($previousPhoto);
        }

        return $nextChairman;
    }

    /**
     * Memperbarui seluruh pengaturan aplikasi sekaligus (termasuk field sambutan ketua jika disertakan).
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function updateAllSettings(array $payload, ?UploadedFile $chairmanPhotoFile = null): array
    {
        $currentAll = $this->getAllSettings();
        $previousPhoto = (string) ($currentAll['chairman_photo'] ?? '');

        $chairmanKeys = ['chairman_name', 'chairman_title', 'chairman_photo', 'chairman_photo_base64', 'chairman_greeting', 'remove_photo'];
        $chairmanSubset = [];
        foreach ($chairmanKeys as $key) {
            if (array_key_exists($key, $payload)) {
                $chairmanSubset[$key] = $payload[$key];
                unset($payload[$key]);
            }
        }

        $merged = array_merge($currentAll, $payload);

        // Terapkan validasi & proses upload untuk field sambutan ketua
        $uploadedNewPhotoPath = null;
        if (array_key_exists('chairman_name', $chairmanSubset)) {
            $name = trim((string) ($chairmanSubset['chairman_name'] ?? ''));
            if (mb_strlen($name) > 150) {
                throw new InvalidArgumentException('Nama Ketua maksimal 150 karakter.');
            }
            $merged['chairman_name'] = $name !== '' ? $name : self::CHAIRMAN_DEFAULTS['chairman_name'];
        }

        if (array_key_exists('chairman_title', $chairmanSubset)) {
            $title = trim((string) ($chairmanSubset['chairman_title'] ?? ''));
            if (mb_strlen($title) > 200) {
                throw new InvalidArgumentException('Jabatan Ketua maksimal 200 karakter.');
            }
            $merged['chairman_title'] = $title !== '' ? $title : self::CHAIRMAN_DEFAULTS['chairman_title'];
        }

        if (array_key_exists('chairman_greeting', $chairmanSubset)) {
            $greeting = (string) ($chairmanSubset['chairman_greeting'] ?? '');
            if (mb_strlen($greeting) > 10000) {
                throw new InvalidArgumentException('Kata-kata sambutan Ketua maksimal 10.000 karakter.');
            }
            $merged['chairman_greeting'] = $greeting;
        }

        $removePhoto = filter_var($chairmanSubset['remove_photo'] ?? false, FILTER_VALIDATE_BOOLEAN);
        if ($chairmanPhotoFile !== null) {
            $uploadedNewPhotoPath = $this->uploadChairmanPhoto($chairmanPhotoFile);
            $merged['chairman_photo'] = $uploadedNewPhotoPath;
        } elseif ($removePhoto) {
            $merged['chairman_photo'] = '';
        } elseif (array_key_exists('chairman_photo_base64', $chairmanSubset) || array_key_exists('chairman_photo', $chairmanSubset)) {
            $rawPhoto = array_key_exists('chairman_photo_base64', $chairmanSubset)
                ? $chairmanSubset['chairman_photo_base64']
                : $chairmanSubset['chairman_photo'];

            $resolved = $this->resolveChairmanPhotoInput($rawPhoto);
            if ($resolved !== $previousPhoto && str_starts_with($resolved, '/' . self::UPLOAD_SUBDIR . '/')) {
                $uploadedNewPhotoPath = $resolved;
            }
            $merged['chairman_photo'] = $resolved;
        }

        $merged = $this->normalizeChairmanFields($merged);

        try {
            DB::transaction(function () use ($merged): void {
                DB::table('app_settings')->updateOrInsert(
                    ['setting_key' => 'global'],
                    [
                        'setting_value' => json_encode($merged, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                        'updated_at'    => now(),
                    ]
                );
            });
        } catch (\Throwable $e) {
            if ($uploadedNewPhotoPath !== null) {
                $this->deleteLocalChairmanPhoto($uploadedNewPhotoPath);
            }
            throw $e;
        }

        if ($previousPhoto !== '' && $previousPhoto !== (string) ($merged['chairman_photo'] ?? '')) {
            $this->deleteLocalChairmanPhoto($previousPhoto);
        }

        return $merged;
    }

    /**
     * Mengunggah file foto Ketua (multipart UploadedFile) ke public/uploads/chairman
     * dengan validasi ekstensi, MIME type, ukuran file (maks 2 MB), dan magic bytes.
     */
    public function uploadChairmanPhoto(UploadedFile $file): string
    {
        if (!$file->isValid()) {
            throw new InvalidArgumentException('Berkas foto Ketua tidak valid atau gagal diunggah.');
        }

        $size = (int) $file->getSize();
        if ($size <= 0) {
            throw new InvalidArgumentException('File foto Ketua kosong.');
        }

        if ($size > self::MAX_PHOTO_BYTES) {
            throw new InvalidArgumentException('Ukuran file foto Ketua melebihi batas maksimal 2 MB.');
        }

        $clientExt = strtolower((string) $file->getClientOriginalExtension());
        if ($clientExt !== '' && !in_array($clientExt, self::ALLOWED_EXTENSIONS, true)) {
            throw new InvalidArgumentException('Format file foto tidak didukung. Gunakan JPG, PNG, atau WEBP.');
        }

        $mimeType = strtolower((string) $file->getMimeType());
        if (!in_array($mimeType, self::ALLOWED_MIME_TYPES, true)) {
            throw new InvalidArgumentException('Tipe MIME file tidak valid. Hanya gambar JPG, PNG, atau WEBP yang diperbolehkan.');
        }

        $realPath = $file->getRealPath();
        if ($realPath === false || !is_readable($realPath)) {
            throw new InvalidArgumentException('File sementara foto Ketua tidak dapat dibaca.');
        }

        $headerBytes = file_get_contents($realPath, false, null, 0, 16);
        $verified = $this->detectVerifiedImageType($headerBytes !== false ? $headerBytes : '');
        if ($verified === null) {
            throw new InvalidArgumentException('Isi berkas bukan gambar JPG, PNG, atau WEBP yang valid.');
        }

        $targetDir = $this->ensureUploadDirectory();
        $fileName = 'chairman_' . time() . '_' . Str::lower(Str::random(10)) . '.' . $verified['ext'];
        $targetPath = $targetDir . DIRECTORY_SEPARATOR . $fileName;

        $this->assertPathInsideDirectory($targetPath, $targetDir);
        $file->move($targetDir, $fileName);

        return '/' . self::UPLOAD_SUBDIR . '/' . $fileName;
    }

    /**
     * Mengunggah foto Ketua dari string base64 Data URI ke public/uploads/chairman
     * dengan validasi MIME, ukuran maksimal 2 MB, dan pemeriksaan magic bytes.
     */
    public function uploadChairmanPhotoFromBase64(string $dataUrl): string
    {
        $trimmed = trim($dataUrl);
        if (!preg_match('/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+\/=\s]+)$/i', $trimmed, $matches)) {
            throw new InvalidArgumentException('Format foto Ketua tidak valid. Hanya gambar JPG, PNG, atau WEBP yang diperbolehkan.');
        }

        $binary = base64_decode((string) preg_replace('/\s+/', '', $matches[2]), true);
        if ($binary === false || $binary === '') {
            throw new InvalidArgumentException('Data gambar foto Ketua kosong atau rusak.');
        }

        if (strlen($binary) > self::MAX_PHOTO_BYTES) {
            throw new InvalidArgumentException('Ukuran foto Ketua melebihi batas maksimal 2 MB.');
        }

        $verified = $this->detectVerifiedImageType($binary);
        if ($verified === null) {
            throw new InvalidArgumentException('Isi berkas bukan gambar JPG, PNG, atau WEBP yang valid.');
        }

        $targetDir = $this->ensureUploadDirectory();
        $fileName = 'chairman_' . time() . '_' . Str::lower(Str::random(10)) . '.' . $verified['ext'];
        $targetPath = $targetDir . DIRECTORY_SEPARATOR . $fileName;

        $this->assertPathInsideDirectory($targetPath, $targetDir);
        file_put_contents($targetPath, $binary);

        return '/' . self::UPLOAD_SUBDIR . '/' . $fileName;
    }

    /**
     * Menghapus file foto lama secara aman hanya jika berada di dalam direktori public/uploads/chairman.
     */
    public function deleteLocalChairmanPhoto(?string $photoUrl): void
    {
        $cleanUrl = trim((string) $photoUrl);
        $prefix = '/' . self::UPLOAD_SUBDIR . '/';
        if ($cleanUrl === '' || !str_starts_with($cleanUrl, $prefix)) {
            return;
        }

        $baseName = basename($cleanUrl);
        if ($baseName === '' || $baseName === '.' || $baseName === '..') {
            return;
        }

        $uploadDir = realpath(public_path(self::UPLOAD_SUBDIR));
        if ($uploadDir === false) {
            return;
        }

        $candidate = realpath($uploadDir . DIRECTORY_SEPARATOR . $baseName);
        if ($candidate !== false && str_starts_with($candidate, $uploadDir . DIRECTORY_SEPARATOR) && is_file($candidate)) {
            @unlink($candidate);
        }
    }

    /**
     * Validasi dan resolusi input chairman_photo berupa string (base64, path relatif /uploads/, URL http(s), atau kosong).
     */
    private function resolveChairmanPhotoInput(mixed $rawValue): string
    {
        if ($rawValue === null) {
            return '';
        }

        $str = trim((string) $rawValue);
        if ($str === '') {
            return '';
        }

        if (str_starts_with($str, 'data:')) {
            return $this->uploadChairmanPhotoFromBase64($str);
        }

        if (str_starts_with($str, '/uploads/') && !str_contains($str, '..') && !str_contains($str, '\\')) {
            return $str;
        }

        if (filter_var($str, FILTER_VALIDATE_URL)) {
            $scheme = strtolower((string) parse_url($str, PHP_URL_SCHEME));
            if ($scheme === 'https' || $scheme === 'http') {
                return $str;
            }
        }

        throw new InvalidArgumentException('URL atau format foto Ketua tidak valid. Gunakan unggahan JPG/PNG/WEBP atau URL http(s).');
    }

    /**
     * Verifikasi magic bytes gambar untuk memastikan berkas benar-benar JPG, PNG, atau WEBP.
     *
     * @return array{ext: string, mime: string}|null
     */
    private function detectVerifiedImageType(string $binary): ?array
    {
        if (strlen($binary) < 12) {
            return null;
        }

        // JPEG: FF D8 FF
        if (substr($binary, 0, 3) === "\xFF\xD8\xFF") {
            return ['ext' => 'jpg', 'mime' => 'image/jpeg'];
        }

        // PNG: 89 50 4E 47 0D 0A 1A 0A
        if (substr($binary, 0, 8) === "\x89PNG\r\n\x1A\n") {
            return ['ext' => 'png', 'mime' => 'image/png'];
        }

        // WEBP: RIFF....WEBP
        if (substr($binary, 0, 4) === 'RIFF' && substr($binary, 8, 4) === 'WEBP') {
            return ['ext' => 'webp', 'mime' => 'image/webp'];
        }

        return null;
    }

    private function ensureUploadDirectory(): string
    {
        $targetDir = public_path(self::UPLOAD_SUBDIR);
        if (!is_dir($targetDir)) {
            mkdir($targetDir, 0755, true);
        }

        $realDir = realpath($targetDir);
        if ($realDir === false) {
            throw new InvalidArgumentException('Direktori penyimpanan foto tidak dapat diakses.');
        }

        return $realDir;
    }

    private function assertPathInsideDirectory(string $filePath, string $realBaseDir): void
    {
        $parentDir = realpath(dirname($filePath));
        if ($parentDir === false || $parentDir !== $realBaseDir) {
            throw new InvalidArgumentException('Path penyimpanan foto tidak valid.');
        }
    }

    /**
     * @param  array<string, mixed>  $settings
     * @return array<string, mixed>
     */
    private function normalizeChairmanFields(array $settings): array
    {
        $name = isset($settings['chairman_name']) ? trim((string) $settings['chairman_name']) : '';
        $title = isset($settings['chairman_title']) ? trim((string) $settings['chairman_title']) : '';

        $settings['chairman_name'] = $name !== '' ? $name : self::CHAIRMAN_DEFAULTS['chairman_name'];
        $settings['chairman_title'] = $title !== '' ? $title : self::CHAIRMAN_DEFAULTS['chairman_title'];
        $settings['chairman_photo'] = isset($settings['chairman_photo']) ? trim((string) $settings['chairman_photo']) : '';
        $settings['chairman_greeting'] = isset($settings['chairman_greeting']) ? (string) $settings['chairman_greeting'] : '';

        return $settings;
    }

    /**
     * @param  array<string, mixed>  $settings
     * @return array{chairman_name: string, chairman_title: string, chairman_photo: string, chairman_greeting: string}
     */
    private function extractChairmanFields(array $settings): array
    {
        $normalized = $this->normalizeChairmanFields($settings);

        return [
            'chairman_name'     => (string) $normalized['chairman_name'],
            'chairman_title'    => (string) $normalized['chairman_title'],
            'chairman_photo'    => (string) $normalized['chairman_photo'],
            'chairman_greeting' => (string) $normalized['chairman_greeting'],
        ];
    }
}
