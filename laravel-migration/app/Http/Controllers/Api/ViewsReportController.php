<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ViewsReportController extends Controller
{
    public function rekapKecamatan()
    {
        return $this->runView('SELECT * FROM v_rekap_ppdi_kecamatan ORDER BY nama_kecamatan ASC', [], 'rekap');
    }

    public function rekapDesa(Request $request)
    {
        $idKec = $request->query('id_kecamatan');
        $sql = 'SELECT * FROM v_rekap_ppdi_desa' . ($idKec ? ' WHERE id_kecamatan = ?' : '') . ' ORDER BY nama_kecamatan ASC, nama_desa ASC';
        return $this->runView($sql, $idKec ? [$idKec] : [], 'rekap');
    }

    public function purnaTugas()
    {
        return $this->runView('SELECT * FROM v_purna_tugas_alert', [], 'purna_tugas');
    }

    public function monitoringPensiun()
    {
        return $this->runView('SELECT * FROM v_monitoring_pensiun_perangkat', [], 'monitoring');
    }

    public function rekapIuranKecamatan(Request $request)
    {
        $conds = [];
        $params = [];
        if ($request->filled('tahun')) { $conds[] = 'tahun = ?'; $params[] = (int) $request->query('tahun'); }
        if ($request->filled('bulan')) { $conds[] = 'bulan = ?'; $params[] = (int) $request->query('bulan'); }
        $sql = 'SELECT * FROM v_rekap_iuran_kecamatan' . (count($conds) ? ' WHERE ' . implode(' AND ', $conds) : '') . ' ORDER BY nama_kecamatan ASC';
        return $this->runView($sql, $params, 'rekap_iuran');
    }

    public function rekapIuranDesa(Request $request)
    {
        $conds = [];
        $params = [];
        if ($request->filled('id_kecamatan')) { $conds[] = 'id_kecamatan = ?'; $params[] = $request->query('id_kecamatan'); }
        if ($request->filled('tahun')) { $conds[] = 'tahun = ?'; $params[] = (int) $request->query('tahun'); }
        if ($request->filled('bulan')) { $conds[] = 'bulan = ?'; $params[] = (int) $request->query('bulan'); }
        $sql = 'SELECT * FROM v_rekap_iuran_desa' . (count($conds) ? ' WHERE ' . implode(' AND ', $conds) : '') . ' ORDER BY nama_kecamatan ASC, nama_desa ASC';
        return $this->runView($sql, $params, 'rekap_iuran');
    }

    public function antreanVerifikasi(Request $request)
    {
        $idKec = $request->query('id_kecamatan');
        $sql = 'SELECT * FROM v_antrean_verifikasi_kecamatan' . ($idKec ? ' WHERE id_kecamatan = ?' : '') . ' ORDER BY tanggal_pengajuan DESC';
        return $this->runView($sql, $idKec ? [$idKec] : [], 'antrean');
    }

    public function anggotaAktif()
    {
        return $this->runView('SELECT * FROM v_anggota_aktif_kabupaten ORDER BY nama_lengkap ASC', [], 'anggota');
    }

    private function runView(string $sql, array $params, string $key)
    {
        try {
            $rows = DB::select($sql, $params);
            return response()->json(['success' => true, $key => $rows]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }
}
