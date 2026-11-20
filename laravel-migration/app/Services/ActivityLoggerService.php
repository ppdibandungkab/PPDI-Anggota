<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ActivityLoggerService
{
    public static function resolveActor(Request $request): array
    {
        $rawUserId = trim((string) $request->header('x-user-id', ''));
        $parsedUserId = ctype_digit($rawUserId) ? (int) $rawUserId : null;
        $userRole = trim((string) ($request->header('x-user-role') ?: $request->header('user-role') ?: 'Admin')) ?: 'Admin';
        $userName = trim((string) $request->header('x-user-name', ''));
        $ipAddress = $request->ip() ?: '-';

        if ($userName === '' && $parsedUserId !== null) {
            try {
                $user = DB::table('users')
                    ->select('nama', 'username')
                    ->where('id_user', $parsedUserId)
                    ->first();
                if ($user) {
                    $userName = (string) ($user->nama ?: $user->username ?: '');
                }
            } catch (\Throwable) {
            }
        }

        return [
            'userId'    => $parsedUserId,
            'userName'  => $userName !== '' ? $userName : str_replace('_', ' ', $userRole),
            'userRole'  => $userRole,
            'ipAddress' => $ipAddress,
        ];
    }

    /**
     * Exact parity with server.ts logMemberActivity()
     */
    public static function logMemberActivity(Request $request, array $params): void
    {
        try {
            $actor = self::resolveActor($request);
            $targetIdStr = (string) ($params['idAnggota'] ?? '');
            $targetNama = trim((string) ($params['targetNama'] ?? ''));

            if ($targetNama === '' && ctype_digit($targetIdStr)) {
                $ang = DB::table('anggota')
                    ->select('nama_lengkap')
                    ->where('id_anggota', (int) $targetIdStr)
                    ->first();
                if ($ang) {
                    $targetNama = (string) $ang->nama_lengkap;
                }
            }

            DB::table('activity_logs')->insert([
                'timestamp'   => now(),
                'ip_address'  => $actor['ipAddress'],
                'user_id'     => $actor['userId'],
                'user_name'   => $actor['userName'],
                'user_role'   => $actor['userRole'],
                'modul'       => $params['modul'] ?? 'Data Induk Anggota',
                'aksi'        => $params['aksi'] ?? 'EDIT',
                'target_id'   => $targetIdStr !== '' ? $targetIdStr : null,
                'target_nama' => $targetNama !== '' ? $targetNama : null,
                'keterangan'  => $params['keterangan'] ?? '',
            ]);
        } catch (\Throwable $e) {
            Log::warning('[MemberActivity] Gagal mencatat log aktivitas anggota: ' . $e->getMessage());
        }
    }

    /**
     * Exact parity with server.ts logApprovalTransaction():
     * Executes outside rolled-back transactions so failure logs are preserved.
     */
    public static function logApprovalTransaction(array $params): void
    {
        $aksi = (string) ($params['aksi'] ?? 'APPROVE_INFO');
        $step = (string) ($params['step'] ?? '-');
        $idPendaftaran = (string) ($params['idPendaftaran'] ?? '-');
        $detail = (string) ($params['detail'] ?? '');
        $userName = (string) ($params['userName'] ?? 'Admin');

        $line = "[Approval TX] pendaftaran={$idPendaftaran} step={$step} user={$userName} | {$detail}";
        if (str_contains($aksi, 'ERROR')) {
            Log::error($line);
        } else {
            Log::info($line);
        }

        try {
            DB::table('activity_logs')->insert([
                'timestamp'   => now(),
                'ip_address'  => $params['ipAddress'] ?? '-',
                'user_id'     => null,
                'user_name'   => $userName,
                'user_role'   => $params['userRole'] ?? 'Admin',
                'modul'       => 'Approval Pendaftaran',
                'aksi'        => $aksi,
                'target_id'   => isset($params['idAnggota']) ? (string) $params['idAnggota'] : null,
                'target_nama' => $params['targetNama'] ?? null,
                'keterangan'  => "[Pendaftaran #{$idPendaftaran}" . ($step !== '-' ? " @ {$step}" : '') . "] {$detail}",
            ]);
        } catch (\Throwable $e) {
            Log::warning('[Approval TX] Gagal menyimpan log ke activity_logs: ' . $e->getMessage());
        }
    }
}
