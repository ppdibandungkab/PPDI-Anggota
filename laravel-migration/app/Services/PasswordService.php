<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class PasswordService
{
    /**
     * Memvalidasi kecocokan password lama (mendukung plaintext MySQL eksisting maupun bcrypt/argon2).
     */
    public function verifyPassword(string $plainInput, string $storedPassword): bool
    {
        $cleanInput = trim($plainInput);
        $cleanStored = trim($storedPassword);

        if ($cleanStored === '') {
            return true;
        }

        $isHashed = str_starts_with($cleanStored, '$2y$') || str_starts_with($cleanStored, '$argon2');

        return $isHashed
            ? Hash::check($cleanInput, $cleanStored)
            : hash_equals($cleanStored, $cleanInput);
    }

    /**
     * Mengeksekusi perubahan password secara atomik:
     * 1. Memastikan kondisi updated_at !== null bila mode requireUpdatedAt aktif.
     * 2. Memverifikasi password lama bila requireOldPassword = true.
     * 3. Memperbarui password + updated_at & update_at ke NOW() dalam DB::transaction().
     * 4. Mencatat log audit ke activity_logs.
     *
     * @return array{status: int, payload: array<string, mixed>}
     */
    public function changePassword(array $data, string $clientIp): array
    {
        $idUser = $data['id_user'] ?? null;
        $username = trim((string) ($data['username'] ?? ''));
        $cleanNewPass = trim((string) ($data['newPassword'] ?? ''));
        $cleanOldPass = trim((string) ($data['oldPassword'] ?? ''));
        $requireOld = array_key_exists('requireOldPassword', $data)
            ? filter_var($data['requireOldPassword'], FILTER_VALIDATE_BOOLEAN)
            : true;
        $requireUpdatedAt = array_key_exists('requireUpdatedAt', $data)
            ? filter_var($data['requireUpdatedAt'], FILTER_VALIDATE_BOOLEAN)
            : filter_var(env('STRICT_PASSWORD_UPDATED_AT_CHECK', false), FILTER_VALIDATE_BOOLEAN);

        $user = User::findByIdOrUsername($idUser, $username);

        if (!$user) {
            return [
                'status'  => 404,
                'payload' => [
                    'success' => false,
                    'message' => 'Data pengguna tidak ditemukan di database',
                ],
            ];
        }

        // Validasi berbasis updated_at !== null (saat mode ketat aktif dan bukan aktivasi password default)
        $isDefaultPassActivation = in_array($cleanOldPass, PpdiHelperService::DEFAULT_PASSWORDS, true)
            || !$requireOld;

        if ($requireUpdatedAt && !$user->hasValidUpdatedAt() && !$isDefaultPassActivation) {
            return [
                'status'  => 400,
                'payload' => [
                    'success' => false,
                    'error'   => 'UPDATED_AT_REQUIRED',
                    'message' => 'Perubahan password ditolak: akun/profil harus diperbarui terlebih dahulu (kolom updated_at masih kosong/null).',
                ],
            ];
        }

        // Jika akun sudah pernah diperbarui (updated_at !== null), wajib verifikasi password lama
        $effectiveRequireOld = $requireOld || ($user->hasValidUpdatedAt() && !$isDefaultPassActivation);
        $storedPass = (string) ($user->getAttributes()['password'] ?? '');

        if ($effectiveRequireOld && $storedPass !== '' && !$this->verifyPassword($cleanOldPass, $storedPass)) {
            return [
                'status'  => 400,
                'payload' => [
                    'success' => false,
                    'message' => 'Password lama yang Anda masukkan salah / tidak sesuai.',
                ],
            ];
        }

        $nowSql = now()->format('Y-m-d H:i:s');
        $passwordToStore = filter_var(env('HASH_PASSWORDS', false), FILTER_VALIDATE_BOOLEAN)
            ? Hash::make($cleanNewPass)
            : $cleanNewPass;

        $roleRow = DB::selectOne(
            'SELECT COALESCE(r.nama_role, u.id_role, u.role) AS role_name
             FROM users u
             LEFT JOIN roles r ON (CAST(u.id_role AS CHAR) = CAST(r.id_role AS CHAR) OR u.id_role = r.nama_role)
             WHERE u.id_user = ? LIMIT 1',
            [$user->id_user]
        );
        $resolvedRole = $roleRow->role_name ?? ($user->role ?: 'User');

        $logEntry = [
            'timestamp'  => $nowSql,
            'ip_address' => $clientIp,
            'user_id'    => (int) $user->id_user,
            'user_name'  => $user->nama ?: $user->username,
            'user_role'  => $resolvedRole,
            'modul'      => 'Keamanan & Password',
            'aksi'       => 'EDIT',
            'keterangan' => "Pengguna {$user->username} (ID: {$user->id_user}) berhasil memperbarui password dari IP {$clientIp}",
        ];

        DB::transaction(function () use ($user, $passwordToStore, $nowSql, $logEntry) {
            try {
                DB::update(
                    'UPDATE users SET password = ?, update_at = ?, updated_at = ? WHERE id_user = ?',
                    [$passwordToStore, $nowSql, $nowSql, $user->id_user]
                );
            } catch (\Throwable) {
                try {
                    DB::update(
                        'UPDATE users SET password = ?, update_at = ? WHERE id_user = ?',
                        [$passwordToStore, $nowSql, $user->id_user]
                    );
                } catch (\Throwable) {
                    DB::update(
                        'UPDATE users SET password = ? WHERE id_user = ?',
                        [$passwordToStore, $user->id_user]
                    );
                }
            }

            try {
                DB::table('activity_logs')->insert($logEntry);
            } catch (\Throwable) {
            }
        });

        return [
            'status'  => 200,
            'payload' => [
                'success'             => true,
                'message'             => 'Password akun berhasil diperbarui! Tanggal updated_at telah tercatat di tabel users.',
                'update_at'           => $nowSql,
                'updated_at'          => $nowSql,
                'is_default_password' => false,
                'activity_log'        => $logEntry,
            ],
        ];
    }
}
