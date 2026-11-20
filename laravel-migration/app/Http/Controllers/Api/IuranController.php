<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class IuranController extends Controller
{
    /**
     * GET /api/iuran
     */
    public function index()
    {
        try {
            $rows = DB::select("
                SELECT
                    id_iuran,
                    id_anggota,
                    tahun,
                    bulan,
                    jumlah,
                    DATE_FORMAT(tgl_bayar, '%Y-%m-%d %H:%i:%s') AS tgl_bayar,
                    bukti_trf,
                    status_verifikasi,
                    catatan
                FROM iuran_anggota
                ORDER BY id_iuran DESC
            ");

            return response()->json(['success' => true, 'iuran' => $rows]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * POST /api/iuran
     */
    public function store(Request $request)
    {
        try {
            DB::table('iuran_anggota')->insert([
                'id_iuran'          => $request->input('id_iuran') ?: ('iur-' . Str::random(8)),
                'id_anggota'        => (int) $request->input('id_anggota'),
                'tahun'             => (int) $request->input('tahun', date('Y')),
                'bulan'             => (int) $request->input('bulan', date('n')),
                'jumlah'            => $request->input('jumlah') ?: 35000,
                'tgl_bayar'         => $request->input('tgl_bayar') ?: now()->format('Y-m-d H:i:s'),
                'bukti_trf'         => $request->input('bukti_trf') ?: 'TRF_BJB_STRUK.png',
                'status_verifikasi' => $request->input('status_verifikasi') ?: 'Pending',
                'catatan'           => $request->input('catatan'),
            ]);

            return response()->json(['success' => true, 'message' => 'Iuran berhasil disimpan di MySQL']);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * PUT /api/iuran/{id}/verify
     */
    public function verify(Request $request, string $id)
    {
        try {
            DB::table('iuran_anggota')
                ->where('id_iuran', $id)
                ->update(['status_verifikasi' => $request->input('status_verifikasi', 'Lunas')]);

            return response()->json(['success' => true, 'message' => 'Status iuran diverifikasi di MySQL']);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }
}
