<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ActivityLoggerService;
use App\Services\PpdiHelperService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class KeanggotaanKtaController extends Controller
{
    /**
     * PUT /api/kta/{idAnggota}/status
     */
    public function updateStatus(Request $request, string $idAnggota)
    {
        $statusKta = (string) $request->input('status_kta', 'Aktif');
        $dbStatusKta = match ($statusKta) {
            'Aktif'   => 'Approved',
            'Pending' => 'Pending_Verifikasi',
            default   => 'Non-Aktif',
        };

        try {
            $prevKta = DB::table('keanggotaan_ppdi')
                ->select('status_kta', 'no_kta')
                ->where('id_anggota', $idAnggota)
                ->first();

            DB::table('keanggotaan_ppdi')
                ->where('id_anggota', $idAnggota)
                ->update(['status_kta' => $dbStatusKta]);

            $prevLabel = match ($prevKta->status_kta ?? null) {
                'Approved'           => 'Aktif',
                'Pending_Verifikasi' => 'Pending',
                default              => $prevKta->status_kta ?? '-',
            };

            ActivityLoggerService::logMemberActivity($request, [
                'idAnggota'  => $idAnggota,
                'modul'      => 'Keanggotaan & E-KTA',
                'aksi'       => 'STATUS_KTA',
                'keterangan' => 'Mengubah status keabsahan E-KTA'
                    . (!empty($prevKta->no_kta) ? " ({$prevKta->no_kta})" : '')
                    . ": {$prevLabel} → {$statusKta}.",
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Status KTA diperbarui di MySQL',
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * PUT /api/kta/{idAnggota}/jabatan-pengurus
     */
    public function updateJabatanPengurus(Request $request, string $idAnggota)
    {
        $rawVal = (string) ($request->input('jabatan_pengurus') ?: $request->input('jabatanPengurus') ?: 'Anggota Biasa');

        try {
            // Enforce Kepala Desa rule identically to PPDIContext / server.ts
            $activeJab = DB::selectOne(
                'SELECT j.nama_jabatan, j.kategori_jabatan
                 FROM riwayat_jabatan r
                 JOIN ref_jabatan j ON j.id_jabatan = r.id_jabatan
                 WHERE r.id_anggota = ? AND r.status_aktif = "Aktif"
                 LIMIT 1',
                [$idAnggota]
            );
            $isKades = $activeJab
                ? PpdiHelperService::isKepalaDesa($activeJab->kategori_jabatan, $activeJab->nama_jabatan)
                : false;
            $val = PpdiHelperService::sanitizeJabatanPengurus($rawVal, $isKades);

            $existingPpdi = DB::table('keanggotaan_ppdi')
                ->select('id_ppdi', 'jabatan_pengurus')
                ->where('id_anggota', $idAnggota)
                ->first();

            $prevRole = $existingPpdi->jabatan_pengurus ?? 'Anggota Biasa';

            if ($existingPpdi) {
                DB::table('keanggotaan_ppdi')
                    ->where('id_anggota', $idAnggota)
                    ->update(['jabatan_pengurus' => $val]);
            } else {
                $defaultKta = '32.04.PPDI.' . substr((string) round(microtime(true) * 1000), -6);
                DB::table('keanggotaan_ppdi')->insert([
                    'id_anggota'       => (int) $idAnggota,
                    'no_kta'           => $defaultKta,
                    'tgl_bergabung'    => date('Y-m-d'),
                    'jabatan_pengurus' => $val,
                    'status_kta'       => 'Aktif',
                ]);
            }

            ActivityLoggerService::logMemberActivity($request, [
                'idAnggota'  => $idAnggota,
                'modul'      => 'Keanggotaan & E-KTA',
                'aksi'       => 'EDIT',
                'keterangan' => "Mengubah jabatan kepengurusan PPDI: {$prevRole} → {$val}.",
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Jabatan kepengurusan PPDI berhasil diperbarui di MySQL',
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }
}
