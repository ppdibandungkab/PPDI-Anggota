<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CheckRolePermission
{
    private const DEFAULT_ROLE_PERMISSIONS = [
        'Superadmin_Kabupaten' => ['*' => true],
        'Admin_Kabupaten' => [
            'dashboard'         => ['view' => true,  'add' => true,  'edit' => true,  'delete' => true],
            'pendaftaran'       => ['view' => true,  'add' => true,  'edit' => true,  'delete' => true],
            'anggota'           => ['view' => true,  'add' => true,  'edit' => true,  'delete' => true],
            'ekta'              => ['view' => true,  'add' => true,  'edit' => true,  'delete' => true],
            'pensiun'           => ['view' => true,  'add' => true,  'edit' => true,  'delete' => false],
            'arsip'             => ['view' => true,  'add' => true,  'edit' => true,  'delete' => true],
            'regulasi'          => ['view' => true,  'add' => true,  'edit' => true,  'delete' => true],
            'kalender'          => ['view' => true,  'add' => true,  'edit' => true,  'delete' => true],
            'iuran'             => ['view' => true,  'add' => true,  'edit' => true,  'delete' => true],
            'settings-user'     => ['view' => true,  'add' => true,  'edit' => true,  'delete' => true],
            'settings-app'      => ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
            'settings-role'     => ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
            'settings-db'       => ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
            'settings-telemetry'=> ['view' => true,  'add' => false, 'edit' => false, 'delete' => false],
            'settings-whatsapp' => ['view' => true,  'add' => true,  'edit' => true,  'delete' => false],
            'skema'             => ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
        ],
        'Admin_Kecamatan' => [
            'dashboard'         => ['view' => true,  'add' => false, 'edit' => false, 'delete' => false],
            'pendaftaran'       => ['view' => true,  'add' => true,  'edit' => true,  'delete' => false],
            'anggota'           => ['view' => true,  'add' => true,  'edit' => true,  'delete' => false],
            'ekta'              => ['view' => true,  'add' => true,  'edit' => false, 'delete' => false],
            'pensiun'           => ['view' => true,  'add' => false, 'edit' => false, 'delete' => false],
            'arsip'             => ['view' => true,  'add' => true,  'edit' => false, 'delete' => false],
            'regulasi'          => ['view' => true,  'add' => false, 'edit' => false, 'delete' => false],
            'kalender'          => ['view' => true,  'add' => true,  'edit' => true,  'delete' => false],
            'iuran'             => ['view' => true,  'add' => true,  'edit' => true,  'delete' => false],
            'settings-user'     => ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
            'settings-app'      => ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
            'settings-role'     => ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
            'settings-db'       => ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
            'settings-telemetry'=> ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
            'settings-whatsapp' => ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
            'skema'             => ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
        ],
        'Admin_Desa' => [
            'dashboard'         => ['view' => true,  'add' => false, 'edit' => false, 'delete' => false],
            'pendaftaran'       => ['view' => true,  'add' => true,  'edit' => false, 'delete' => false],
            'anggota'           => ['view' => true,  'add' => false, 'edit' => true,  'delete' => false],
            'ekta'              => ['view' => true,  'add' => false, 'edit' => false, 'delete' => false],
            'pensiun'           => ['view' => true,  'add' => false, 'edit' => false, 'delete' => false],
            'arsip'             => ['view' => true,  'add' => true,  'edit' => false, 'delete' => false],
            'regulasi'          => ['view' => true,  'add' => false, 'edit' => false, 'delete' => false],
            'kalender'          => ['view' => true,  'add' => false, 'edit' => false, 'delete' => false],
            'iuran'             => ['view' => true,  'add' => true,  'edit' => false, 'delete' => false],
            'settings-user'     => ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
            'settings-app'      => ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
            'settings-role'     => ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
            'settings-db'       => ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
            'settings-telemetry'=> ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
            'settings-whatsapp' => ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
            'skema'             => ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
        ],
        'Anggota' => [
            'dashboard'         => ['view' => true,  'add' => false, 'edit' => false, 'delete' => false],
            'pendaftaran'       => ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
            'anggota'           => ['view' => true,  'add' => false, 'edit' => false, 'delete' => false],
            'ekta'              => ['view' => true,  'add' => false, 'edit' => false, 'delete' => false],
            'pensiun'           => ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
            'arsip'             => ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
            'regulasi'          => ['view' => true,  'add' => false, 'edit' => false, 'delete' => false],
            'kalender'          => ['view' => true,  'add' => false, 'edit' => false, 'delete' => false],
            'iuran'             => ['view' => true,  'add' => true,  'edit' => false, 'delete' => false],
            'settings-user'     => ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
            'settings-app'      => ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
            'settings-role'     => ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
            'settings-db'       => ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
            'settings-telemetry'=> ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
            'settings-whatsapp' => ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
            'skema'             => ['view' => false, 'add' => false, 'edit' => false, 'delete' => false],
        ],
    ];

    public function handle(Request $request, Closure $next, string $moduleId, string $action)
    {
        $bearer = $request->bearerToken();
        $userRole = '';

        if ($bearer !== null && trim($bearer) !== '') {
            $claims = \App\Services\PpdiHelperService::verifySessionToken($bearer);
            if ($claims === null) {
                return response()->json([
                    'success' => false,
                    'error'   => 'TOKEN_EXPIRED',
                    'message' => 'Token autentikasi tidak valid atau telah kedaluwarsa. Silakan login kembali.',
                ], 401);
            }
            $userRole = trim((string) ($claims['role'] ?? ''));
            if (!empty($claims['uid']) && !$request->headers->has('x-user-id')) {
                $request->headers->set('x-user-id', (string) $claims['uid']);
            }
            if (!empty($claims['nama']) && !$request->headers->has('x-user-name')) {
                $request->headers->set('x-user-name', (string) $claims['nama']);
            }
            $request->headers->set('x-user-role', $userRole);
        }

        if ($userRole === '') {
            $userRole = trim((string) ($request->header('x-user-role') ?: $request->header('user-role')));
        }

        if ($userRole === '') {
            return response()->json([
                'success' => false,
                'error'   => 'FORBIDDEN',
                'message' => 'Akses ditolak: Anda tidak memiliki izin untuk melakukan aksi ini (Token atau header x-user-role tidak ditemukan)',
            ], 403);
        }

        if (!$this->checkPermission($userRole, $moduleId, $action)) {
            $actionUpper = strtoupper($action);
            return response()->json([
                'success' => false,
                'error'   => 'FORBIDDEN',
                'message' => "Akses ditolak: Peran '{$userRole}' tidak memiliki izin ({$actionUpper}) pada modul '{$moduleId}'.",
            ], 403);
        }

        return $next($request);
    }

    private function checkPermission(string $userRole, string $moduleId, string $action): bool
    {
        if ($userRole === 'Superadmin_Kabupaten') {
            return true;
        }

        // Check dynamic rolePermissions override stored in app_settings table (parity with settings.json)
        $dynamicConfig = $this->loadDynamicRolePermissions();
        if (isset($dynamicConfig[$userRole][$moduleId][$action])) {
            return $this->normalizeBool($dynamicConfig[$userRole][$moduleId][$action]);
        }

        if (isset(self::DEFAULT_ROLE_PERMISSIONS[$userRole][$moduleId][$action])) {
            return $this->normalizeBool(self::DEFAULT_ROLE_PERMISSIONS[$userRole][$moduleId][$action]);
        }

        return false;
    }

    private function loadDynamicRolePermissions(): array
    {
        try {
            $row = DB::table('app_settings')->where('setting_key', 'rolePermissions')->first();
            if ($row && !empty($row->setting_value)) {
                $decoded = json_decode($row->setting_value, true);
                if (is_array($decoded)) {
                    return $decoded;
                }
            }
        } catch (\Throwable) {
        }
        return [];
    }

    private function normalizeBool(mixed $val): bool
    {
        return $val === true || $val === 1 || $val === 'true' || $val === '1';
    }
}
