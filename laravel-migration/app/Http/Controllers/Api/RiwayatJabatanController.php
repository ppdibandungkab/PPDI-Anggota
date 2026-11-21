<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ActivityLoggerService;
use App\Services\PpdiHelperService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RiwayatJabatanController extends Controller
{
    /**
     * POST /api/riwayat
     */
    public function store(Request $request)
    {
        $idAnggota = $request->input('id_anggota');
        $idDesa = $request->input('id_desa');
        $idJabatan = $request->input('id_jabatan', 2);
        $noSk = $request->input('no_sk_pengangkatan');
        $tglSk = $request->input('tgl_sk_pengangkatan');
        $tmt = $request->input('tmt_jabatan');
        $statusAktif = $request->input('status_aktif', 'Aktif');
        $fileSk = $request->input('file_sk');
        $tandaTangan = $request->input('tanda_tangan');
        $keterangan = $request->input('keterangan');

        try {
            $validDesaId = PpdiHelperService::resolveDesaId($idDesa);
            $validJabatanId = PpdiHelperService::resolveJabatanId($idJabatan);

            $periodeCheck = PpdiHelperService::validateAndNormalizePeriode(
                $validJabatanId,
                $request->input('periode')
            );
            if (!$periodeCheck['valid']) {
                return response()->json([
                    'success' => false,
                    'message' => $periodeCheck['message'],
                ], 400);
            }

            $savedTtdPath = $tandaTangan ? trim((string) $tandaTangan) : null;
            if ($savedTtdPath && str_starts_with($savedTtdPath, 'data:')) {
                try {
                    $savedTtdPath = PpdiHelperService::saveBase64UploadToDisk('ttd', $savedTtdPath, 'ttd_sk', (string) $idAnggota)['url'];
                } catch (\Throwable) {
                }
            }

            $newId = (int) DB::table('riwayat_jabatan')->insertGetId([
                'id_anggota'          => (int) $idAnggota,
                'id_desa'             => $validDesaId,
                'id_jabatan'          => $validJabatanId,
                'periode'             => $periodeCheck['value'],
                'no_sk_pengangkatan'  => $noSk ?: '-',
                'tgl_sk_pengangkatan' => $tglSk ?: date('Y-m-d'),
                'tmt_jabatan'         => $tmt ?: date('Y-m-d'),
                'status_aktif'        => $statusAktif ?: 'Aktif',
                'file_sk'             => $fileSk ?: null,
                'tanda_tangan'        => $savedTtdPath,
                'keterangan'          => $keterangan ?: null,
            ]);

            $namaJabatan = DB::table('ref_jabatan')->where('id_jabatan', $validJabatanId)->value('nama_jabatan') ?: "Jabatan #{$validJabatanId}";
            $namaDesaRow = DB::table('ref_desa')->where('id_desa', $validDesaId)->value('nama_desa');
            $namaDesa = $namaDesaRow ? "Desa {$namaDesaRow}" : $validDesaId;

            ActivityLoggerService::logMemberActivity($request, [
                'idAnggota'  => $idAnggota,
                'modul'      => 'Riwayat Jabatan & SK',
                'aksi'       => 'TAMBAH',
                'keterangan' => "Menambahkan SK/Mutasi jabatan baru: {$namaJabatan} di {$namaDesa} (No. SK: " . ($noSk ?: '-') . ', TMT: ' . ($tmt ?: '-') . ', Status: ' . ($statusAktif ?: 'Aktif') . ')' . ($keterangan ? " — {$keterangan}" : '') . '.',
            ]);

            return response()->json([
                'success'    => true,
                'id_riwayat' => $newId,
                'message'    => 'Riwayat mutasi/jabatan berhasil disimpan di MySQL',
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * PUT /api/riwayat/{id}/status
     */
    public function updateStatus(Request $request, string $id)
    {
        $statusAktif = (string) $request->input('status_aktif');

        try {
            $prevRow = DB::selectOne(
                'SELECT r.id_anggota, r.status_aktif, r.no_sk_pengangkatan, j.nama_jabatan
                 FROM riwayat_jabatan r
                 LEFT JOIN ref_jabatan j ON j.id_jabatan = r.id_jabatan
                 WHERE r.id_riwayat = ? LIMIT 1',
                [$id]
            );

            DB::table('riwayat_jabatan')->where('id_riwayat', $id)->update([
                'status_aktif' => $statusAktif,
            ]);

            if ($prevRow && !empty($prevRow->id_anggota)) {
                ActivityLoggerService::logMemberActivity($request, [
                    'idAnggota'  => $prevRow->id_anggota,
                    'modul'      => 'Status Jabatan',
                    'aksi'       => 'EDIT',
                    'keterangan' => 'Mengubah status jabatan ' . ($prevRow->nama_jabatan ?: 'Perangkat Desa')
                        . ' (SK: ' . ($prevRow->no_sk_pengangkatan ?: '-') . '): '
                        . ($prevRow->status_aktif ?: '-') . " → {$statusAktif}.",
                ]);
            }

            return response()->json([
                'success' => true,
                'message' => 'Status jabatan diperbarui di MySQL',
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * PUT /api/riwayat/{id}
     */
    public function update(Request $request, string $id)
    {
        try {
            $prevRow = DB::selectOne(
                'SELECT r.*, j.nama_jabatan
                 FROM riwayat_jabatan r
                 LEFT JOIN ref_jabatan j ON j.id_jabatan = r.id_jabatan
                 WHERE r.id_riwayat = ? LIMIT 1',
                [$id]
            );

            $validDesaId = $request->filled('id_desa')
                ? PpdiHelperService::resolveDesaId($request->input('id_desa'))
                : null;

            $effectiveJabatanId = $request->filled('id_jabatan')
                ? PpdiHelperService::resolveJabatanId($request->input('id_jabatan'))
                : (int) ($prevRow->id_jabatan ?? 0);

            $candidatePeriode = $request->has('periode')
                ? $request->input('periode')
                : ($prevRow->periode ?? null);

            $periodeCheck = PpdiHelperService::validateAndNormalizePeriode(
                $effectiveJabatanId,
                $candidatePeriode
            );
            if (!$periodeCheck['valid']) {
                return response()->json([
                    'success' => false,
                    'message' => $periodeCheck['message'],
                ], 400);
            }

            $savedTtdPath = $request->filled('tanda_tangan') ? trim((string) $request->input('tanda_tangan')) : null;
            if ($savedTtdPath && str_starts_with($savedTtdPath, 'data:')) {
                try {
                    $savedTtdPath = PpdiHelperService::saveBase64UploadToDisk('ttd', $savedTtdPath, 'ttd_sk_upd', $id)['url'];
                } catch (\Throwable) {
                }
            }

            DB::update(
                'UPDATE riwayat_jabatan SET
                    id_desa = COALESCE(?, id_desa),
                    id_jabatan = COALESCE(?, id_jabatan),
                    periode = ?,
                    no_sk_pengangkatan = COALESCE(?, no_sk_pengangkatan),
                    tgl_sk_pengangkatan = COALESCE(?, tgl_sk_pengangkatan),
                    tmt_jabatan = COALESCE(?, tmt_jabatan),
                    status_aktif = COALESCE(?, status_aktif),
                    file_sk = COALESCE(?, file_sk),
                    tanda_tangan = COALESCE(?, tanda_tangan)
                 WHERE id_riwayat = ?',
                [
                    $validDesaId,
                    $request->filled('id_jabatan') ? $effectiveJabatanId : null,
                    $periodeCheck['value'],
                    $request->input('no_sk_pengangkatan'),
                    $request->input('tgl_sk_pengangkatan'),
                    $request->input('tmt_jabatan'),
                    $request->input('status_aktif'),
                    $request->input('file_sk'),
                    $savedTtdPath,
                    $id,
                ]
            );

            if ($prevRow && !empty($prevRow->id_anggota)) {
                $newJabId = $request->input('id_jabatan');
                $newJabName = $newJabId
                    ? (DB::table('ref_jabatan')->where('id_jabatan', $newJabId)->value('nama_jabatan') ?: $prevRow->nama_jabatan)
                    : ($prevRow->nama_jabatan ?? '');

                $diffs = [];
                if ($newJabId && (int) $newJabId !== (int) $prevRow->id_jabatan) {
                    $diffs[] = 'Jabatan (' . ($prevRow->nama_jabatan ?: $prevRow->id_jabatan) . " → {$newJabName})";
                }
                if ($request->filled('no_sk_pengangkatan') && $request->input('no_sk_pengangkatan') !== $prevRow->no_sk_pengangkatan) {
                    $diffs[] = 'No. SK (' . ($prevRow->no_sk_pengangkatan ?: '-') . ' → ' . $request->input('no_sk_pengangkatan') . ')';
                }
                if ($request->filled('status_aktif') && $request->input('status_aktif') !== $prevRow->status_aktif) {
                    $diffs[] = 'Status (' . ($prevRow->status_aktif ?: '-') . ' → ' . $request->input('status_aktif') . ')';
                }

                ActivityLoggerService::logMemberActivity($request, [
                    'idAnggota'  => $prevRow->id_anggota,
                    'modul'      => 'Riwayat Jabatan & SK',
                    'aksi'       => 'EDIT',
                    'keterangan' => count($diffs) > 0
                        ? 'Memperbarui data SK/Jabatan: ' . implode('; ', $diffs) . '.'
                        : 'Memperbarui detail riwayat jabatan ' . ($newJabName ?: 'Perangkat Desa') . ' (SK: ' . ($request->input('no_sk_pengangkatan') ?: ($prevRow->no_sk_pengangkatan ?: '-')) . ').',
                ]);
            }

            return response()->json([
                'success' => true,
                'message' => 'Riwayat jabatan berhasil diperbarui di MySQL',
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * DELETE /api/riwayat/{id}
     */
    public function destroy(Request $request, string $id)
    {
        try {
            $prevRow = DB::selectOne(
                'SELECT r.id_anggota, r.no_sk_pengangkatan, j.nama_jabatan
                 FROM riwayat_jabatan r
                 LEFT JOIN ref_jabatan j ON j.id_jabatan = r.id_jabatan
                 WHERE r.id_riwayat = ? LIMIT 1',
                [$id]
            );

            DB::table('riwayat_jabatan')->where('id_riwayat', $id)->delete();

            if ($prevRow && !empty($prevRow->id_anggota)) {
                ActivityLoggerService::logMemberActivity($request, [
                    'idAnggota'  => $prevRow->id_anggota,
                    'modul'      => 'Riwayat Jabatan & SK',
                    'aksi'       => 'HAPUS',
                    'keterangan' => 'Menghapus riwayat jabatan ' . ($prevRow->nama_jabatan ?: 'Perangkat Desa')
                        . ' (No. SK: ' . ($prevRow->no_sk_pengangkatan ?: '-') . ').',
                ]);
            }

            return response()->json([
                'success' => true,
                'message' => 'Riwayat jabatan berhasil dihapus dari MySQL',
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }
}
