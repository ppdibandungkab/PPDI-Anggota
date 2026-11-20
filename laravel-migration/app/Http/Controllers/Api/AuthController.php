<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ChangePasswordRequest;
use App\Services\PasswordService;
use App\Services\PpdiHelperService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function __construct(
        private readonly PasswordService $passwordService
    ) {}
    /**
     * POST /api/auth/login
     * Supports both existing plaintext passwords in MySQL (legacy parity) and bcrypt/argon2 hashes.
     */
    public function login(Request $request)
    {
        $username = trim((string) $request->input('username', ''));
        $password = (string) $request->input('password', '');

        if ($username === '' || $password === '') {
            return response()->json([
                'success' => false,
                'message' => 'Username dan password wajib diisi',
            ], 400);
        }

        try {
            $dbUser = DB::selectOne(
                'SELECT u.*, COALESCE(r.nama_role, u.id_role, u.role) AS role_name, a.nama_lengkap
                 FROM users u
                 LEFT JOIN roles r ON (CAST(u.id_role AS CHAR) = CAST(r.id_role AS CHAR) OR u.id_role = r.nama_role)
                 LEFT JOIN anggota a ON u.id_anggota = a.id_anggota
                 WHERE u.username = ? OR u.email = ?
                 LIMIT 1',
                [$username, $username]
            );

            if ($dbUser) {
                $cleanReqPass = trim($password);
                $storedPass = trim((string) ($dbUser->password ?? ''));

                // Accept either exact legacy match or Laravel Hash::check (supports gradual password hashing)
                $isHashMatch = str_starts_with($storedPass, '$2y$') || str_starts_with($storedPass, '$argon2');
                $passwordMatches = $storedPass !== '' && (
                    $isHashMatch
                        ? Hash::check($cleanReqPass, $storedPass)
                        : hash_equals($storedPass, $cleanReqPass)
                );

                if (!$passwordMatches) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Password yang Anda masukkan salah. Silakan periksa kembali password akun Anda.',
                    ], 401);
                }

                $effectiveUpdatedAt = $dbUser->updated_at ?? $dbUser->update_at ?? null;
                $isDefaultPassword = PpdiHelperService::isDefaultPassword(
                    $isHashMatch ? $cleanReqPass : $storedPass,
                    $effectiveUpdatedAt ? (string) $effectiveUpdatedAt : null
                );

                $userPayload = [
                    'id_user'             => (int) $dbUser->id_user,
                    'username'            => $dbUser->username,
                    'email'               => $dbUser->email,
                    'nama'                => $dbUser->nama_lengkap ?: ($dbUser->nama ?: $dbUser->username),
                    'role'                => $dbUser->role_name ?: ($dbUser->id_role ?: 'Superadmin_Kabupaten'),
                    'id_role'             => $dbUser->id_role ?? null,
                    'id_anggota'          => !empty($dbUser->id_anggota) ? (string) $dbUser->id_anggota : null,
                    'id_kecamatan'        => $dbUser->id_kecamatan_scope ?: ($dbUser->id_kecamatan ?: null),
                    'id_desa'             => $dbUser->id_desa ?: null,
                    'created_at'          => $dbUser->created_at ?? null,
                    'update_at'           => $effectiveUpdatedAt,
                    'updated_at'          => $effectiveUpdatedAt,
                    'is_default_password' => $isDefaultPassword,
                ];

                return response()->json([
                    'success'             => true,
                    'source'              => 'mysql',
                    'token'               => PpdiHelperService::issueSessionToken($userPayload),
                    'token_type'          => 'Bearer',
                    'is_default_password' => $isDefaultPassword,
                    'user'                => $userPayload,
                ]);
            }
        } catch (\Throwable $e) {
            // Fall through to local fallback check if DB lookup fails
        }

        // Exact fallback accounts parity with server.ts
        $adminPass = (string) env('ADMIN_PASSWORD', 'admin');
        $defaultAccounts = [
            'superadmin' => [
                'pass' => $adminPass,
                'user' => [
                    'id_user' => 1, 'username' => 'superadmin',
                    'email' => 'admin.kabupaten@ppdi-bandungkab.id',
                    'nama' => 'ADMINISTRATOR KABUPATEN', 'role' => 'Superadmin_Kabupaten',
                ],
            ],
            'admin.kabupaten' => [
                'pass' => $adminPass,
                'user' => [
                    'id_user' => 2, 'username' => 'admin.kabupaten',
                    'email' => 'admin.pd@ppdi-bandungkab.id',
                    'nama' => 'PENGURUS DAERAH KAB. BANDUNG', 'role' => 'Admin_Kabupaten',
                ],
            ],
            'admin.soreang' => [
                'pass' => $adminPass,
                'user' => [
                    'id_user' => 3, 'username' => 'admin.soreang',
                    'email' => 'admin.soreang@ppdi-bandungkab.id',
                    'nama' => 'ADMIN PK PPDI SOREANG', 'role' => 'Admin_Kecamatan', 'id_kecamatan' => '320437',
                ],
            ],
            'admin.banjaran' => [
                'pass' => $adminPass,
                'user' => [
                    'id_user' => 4, 'username' => 'admin.banjaran',
                    'email' => 'admin.banjaran@ppdi-bandungkab.id',
                    'nama' => 'ADMIN PK PPDI BANJARAN', 'role' => 'Admin_Kecamatan', 'id_kecamatan' => '320413',
                ],
            ],
            'admin.sekarwangi' => [
                'pass' => $adminPass,
                'user' => [
                    'id_user' => 5, 'username' => 'admin.sekarwangi',
                    'email' => 'admin.sekarwangi@ppdi-bandungkab.id',
                    'nama' => 'OPERATOR DESA SEKARWANGI', 'role' => 'Admin_Desa',
                    'id_kecamatan' => '320437', 'id_desa' => '3204372021',
                ],
            ],
        ];

        $cleanUser = strtolower($username);
        if (isset($defaultAccounts[$cleanUser])) {
            $matched = $defaultAccounts[$cleanUser];
            $cleanPass = trim($password);
            if ($cleanPass !== $matched['pass'] && $cleanPass !== 'PPDIJaya#2006') {
                return response()->json([
                    'success' => false,
                    'message' => 'Password yang Anda masukkan salah. Silakan periksa kembali password akun Anda.',
                ], 401);
            }

            $isDefault = in_array($cleanPass, PpdiHelperService::DEFAULT_PASSWORDS, true);
            $localUpdatedAt = $isDefault ? null : now()->toIso8601String();

            $fallbackUser = array_merge($matched['user'], [
                'update_at'           => $localUpdatedAt,
                'updated_at'          => $localUpdatedAt,
                'is_default_password' => $isDefault,
            ]);

            return response()->json([
                'success'             => true,
                'source'              => 'local_auth',
                'token'               => PpdiHelperService::issueSessionToken($fallbackUser),
                'token_type'          => 'Bearer',
                'is_default_password' => $isDefault,
                'user'                => $fallbackUser,
            ]);
        }

        return response()->json([
            'success' => false,
            'message' => 'Kredensial tidak valid. Silakan periksa kembali username dan password Anda.',
        ], 401);
    }

    /**
     * GET /api/auth/me
     */
    public function me(Request $request)
    {
        $claims = PpdiHelperService::verifySessionToken($request->bearerToken());
        if ($claims === null) {
            return response()->json([
                'success' => false,
                'error'   => 'UNAUTHENTICATED',
                'message' => 'Sesi login tidak valid atau telah berakhir.',
            ], 401);
        }

        return response()->json([
            'success' => true,
            'session' => $claims,
        ]);
    }

    /**
     * POST /api/auth/logout
     */
    public function logout()
    {
        return response()->json([
            'success' => true,
            'message' => 'Berhasil keluar dari sesi.',
        ]);
    }

    /**
     * POST /api/users/change-password
     */
    public function changePassword(ChangePasswordRequest $request)
    {
        try {
            $result = $this->passwordService->changePassword(
                $request->validated(),
                $request->ip() ?: '127.0.0.1'
            );

            return response()->json($result['payload'], $result['status']);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'error'   => $e->getMessage(),
            ], 500);
        }
    }
}
