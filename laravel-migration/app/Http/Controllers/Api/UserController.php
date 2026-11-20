<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\PpdiHelperService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class UserController extends Controller
{
    /**
     * GET /api/users
     */
    public function index()
    {
        try {
            $rows = DB::select("
                SELECT
                    u.id_user,
                    u.username,
                    u.email,
                    u.nama,
                    COALESCE(r.nama_role, u.role, u.id_role) AS role,
                    u.id_role,
                    u.id_anggota,
                    COALESCE(u.id_kecamatan_scope, u.id_kecamatan) AS id_kecamatan,
                    u.id_desa,
                    u.created_at,
                    COALESCE(u.updated_at, u.update_at) AS updated_at
                FROM users u
                LEFT JOIN roles r ON (CAST(u.id_role AS CHAR) = CAST(r.id_role AS CHAR) OR u.id_role = r.nama_role)
                ORDER BY u.id_user ASC
            ");

            return response()->json(['success' => true, 'users' => $rows]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * POST /api/users
     */
    public function store(Request $request)
    {
        $username = trim((string) $request->input('username', ''));
        $email = trim((string) $request->input('email', ''));
        $password = trim((string) ($request->input('password') ?: 'PPDIJaya#2006'));
        $role = trim((string) ($request->input('role') ?: 'Admin_Kecamatan'));

        if ($username === '') {
            return response()->json(['success' => false, 'message' => 'Username wajib diisi'], 400);
        }

        if (DB::table('users')->where('username', $username)->exists()) {
            return response()->json([
                'success' => false,
                'message' => "Username '{$username}' sudah terdaftar.",
            ], 409);
        }

        try {
            $idUser = (int) DB::table('users')->insertGetId([
                'username'           => $username,
                'email'              => $email !== '' ? $email : "{$username}@ppdi-bandungkab.id",
                'nama'               => trim((string) ($request->input('nama') ?: $username)),
                'password'           => $password,
                'id_role'            => PpdiHelperService::mapRoleNameToId($role),
                'role'               => $role,
                'id_anggota'         => PpdiHelperService::isValidInt32Id($request->input('id_anggota')),
                'id_kecamatan_scope' => $request->input('id_kecamatan') ?: null,
                'id_kecamatan'       => $request->input('id_kecamatan') ?: null,
                'id_desa'            => $request->input('id_desa') ?: null,
            ]);

            return response()->json([
                'success' => true,
                'id_user' => $idUser,
                'message' => 'Pengguna berhasil ditambahkan di MySQL',
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * PUT /api/users/{id}
     */
    public function update(Request $request, string $id)
    {
        try {
            $payload = [];
            if ($request->filled('username')) {
                $payload['username'] = trim((string) $request->input('username'));
            }
            if ($request->filled('email')) {
                $payload['email'] = trim((string) $request->input('email'));
            }
            if ($request->filled('nama')) {
                $payload['nama'] = trim((string) $request->input('nama'));
            }
            if ($request->filled('password')) {
                $payload['password'] = trim((string) $request->input('password'));
            }
            if ($request->filled('role')) {
                $role = trim((string) $request->input('role'));
                $payload['role'] = $role;
                $payload['id_role'] = PpdiHelperService::mapRoleNameToId($role);
            }
            if ($request->has('id_kecamatan')) {
                $payload['id_kecamatan_scope'] = $request->input('id_kecamatan') ?: null;
                $payload['id_kecamatan'] = $request->input('id_kecamatan') ?: null;
            }
            if ($request->has('id_desa')) {
                $payload['id_desa'] = $request->input('id_desa') ?: null;
            }
            if ($request->has('id_anggota')) {
                $payload['id_anggota'] = PpdiHelperService::isValidInt32Id($request->input('id_anggota'));
            }

            if (count($payload) > 0) {
                DB::table('users')->where('id_user', $id)->update($payload);
            }

            return response()->json(['success' => true, 'message' => 'Data pengguna berhasil diperbarui di MySQL']);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * DELETE /api/users/{id}
     */
    public function destroy(string $id)
    {
        try {
            DB::table('users')->where('id_user', $id)->delete();
            return response()->json(['success' => true, 'message' => 'Pengguna berhasil dihapus dari MySQL']);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }
}
