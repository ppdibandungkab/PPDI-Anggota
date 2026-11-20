<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Support\Facades\DB;

class RefController extends Controller
{
    /**
     * GET /api/ref/all
     */
    public function all()
    {
        try {
            $kecamatan = DB::table('ref_kecamatan')->orderBy('nama_kecamatan')->get();
            $desa = DB::table('ref_desa')->orderBy('nama_desa')->get();
            $jabatan = DB::table('ref_jabatan')->orderBy('id_jabatan')->get();

            return response()->json([
                'success'   => true,
                'kecamatan' => $kecamatan,
                'desa'      => $desa,
                'jabatan'   => $jabatan,
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'error'   => $e->getMessage(),
            ], 500);
        }
    }
}
