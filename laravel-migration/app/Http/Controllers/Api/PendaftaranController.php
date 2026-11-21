<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePendaftaranRequest;
use App\Services\ActivityLoggerService;
use App\Services\PpdiHelperService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use PDOException;
use RuntimeException;

class PendaftaranController extends Controller
{
    /**
     * GET /api/pendaftaran?id_kecamatan=...&id_desa=...&nik=...
     */
    public function index(Request $request)
    {
        try {
            $idKecamatan = trim((string) $request->query('id_kecamatan', ''));
            $idDesa = trim((string) $request->query('id_desa', ''));
            $nik = trim((string) $request->query('nik', ''));

            $sql = "
                SELECT
                    p.*,
                    DATE_FORMAT(p.tanggal_lahir, '%Y-%m-%d') AS tanggal_lahir,
                    DATE_FORMAT(p.tgl_sk_pengangkatan, '%Y-%m-%d') AS tgl_sk_pengangkatan,
                    DATE_FORMAT(p.tmt_jabatan, '%Y-%m-%d') AS tmt_jabatan,
                    DATE_FORMAT(p.tgl_pendaftaran, '%Y-%m-%d %H:%i:%s') AS tgl_pendaftaran,
                    DATE_FORMAT(p.tgl_approval, '%Y-%m-%d %H:%i:%s') AS tgl_approval,
                    k.nama_kecamatan,
                    d.nama_desa,
                    j.nama_jabatan
                FROM pendaftaran_perangkat_desa p
                LEFT JOIN ref_kecamatan k ON p.id_kecamatan = k.id_kecamatan
                LEFT JOIN ref_desa d ON p.id_desa = d.id_desa
                LEFT JOIN ref_jabatan j ON p.id_jabatan = j.id_jabatan
            ";

            $where = [];
            $params = [];

            if ($idDesa !== '' && strtolower($idDesa) !== 'all') {
                $cleanDesa = str_replace('.', '', $idDesa);
                $where[] = "(p.id_desa = ? OR REPLACE(p.id_desa, '.', '') = ?)";
                $params[] = $idDesa;
                $params[] = $cleanDesa;
            } elseif ($idKecamatan !== '' && strtolower($idKecamatan) !== 'all') {
                $cleanKec = str_replace('.', '', $idKecamatan);
                $where[] = "(p.id_kecamatan = ? OR REPLACE(p.id_kecamatan, '.', '') = ? OR REPLACE(p.id_desa, '.', '') LIKE CONCAT(?, '%'))";
                $params[] = $idKecamatan;
                $params[] = $cleanKec;
                $params[] = $cleanKec;
            }

            if ($nik !== '') {
                $where[] = 'p.nik = ?';
                $params[] = $nik;
            }

            if (count($where) > 0) {
                $sql .= ' WHERE ' . implode(' AND ', $where);
            }
            $sql .= ' ORDER BY p.id_pendaftaran DESC';

            $rows = DB::select($sql, $params);
            return response()->json(['success' => true, 'pendaftaran' => $rows]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * POST /api/pendaftaran
     */
    public function store(StorePendaftaranRequest $request)
    {
        $data = $request->all();
        $cleanNik = trim((string) $data['nik']);

        try {
            $existsInAnggota = DB::table('anggota')
                ->select('nama_lengkap')
                ->where('nik', $cleanNik)
                ->first();

            if ($existsInAnggota) {
                return response()->json([
                    'success' => false,
                    'message' => "NIK {$cleanNik} sudah terdaftar aktif sebagai perangkat desa atas nama {$existsInAnggota->nama_lengkap}",
                ], 409);
            }

            $existsInPending = DB::table('pendaftaran_perangkat_desa')
                ->where('nik', $cleanNik)
                ->where('status_approval', 'Menunggu')
                ->exists();

            if ($existsInPending) {
                return response()->json([
                    'success' => false,
                    'message' => "NIK {$cleanNik} sudah memiliki pengajuan pendaftaran yang sedang menunggu approval.",
                ], 409);
            }

            $validDesaId = PpdiHelperService::resolveDesaId($data['id_desa']);
            $cleanKecId = !empty($data['id_kecamatan']) ? (string) $data['id_kecamatan'] : substr($validDesaId, 0, 6);

            $savedFotoPath = PpdiHelperService::sanitizeVarcharPath(
                $data['foto'] ?? null,
                'foto',
                'pendaftaran_foto.jpg',
                $cleanNik
            );

            $savedSkPath = !empty($data['file_sk']) ? trim((string) $data['file_sk']) : null;
            if ($savedSkPath !== null) {
                if (str_starts_with($savedSkPath, 'data:')) {
                    if (!PpdiHelperService::isValidPdfBase64Upload($savedSkPath, 'pendaftaran_sk.pdf')) {
                        return response()->json([
                            'success' => false,
                            'message' => 'Hanya file berformat PDF (.pdf) yang diperbolehkan untuk berkas SK.',
                        ], 400);
                    }
                    $savedSkPath = PpdiHelperService::saveBase64UploadToDisk('sk', $savedSkPath, 'pendaftaran_sk.pdf', $cleanNik)['url'];
                } else {
                    $pathOnly = strtolower(explode('?', $savedSkPath)[0]);
                    if (!str_ends_with($pathOnly, '.pdf')) {
                        return response()->json([
                            'success' => false,
                            'message' => 'Hanya file berformat PDF (.pdf) yang diperbolehkan untuk berkas SK.',
                        ], 400);
                    }
                }
            }

            $savedTtdPath = !empty($data['tanda_tangan']) ? trim((string) $data['tanda_tangan']) : null;
            if ($savedTtdPath && str_starts_with($savedTtdPath, 'data:')) {
                try {
                    $savedTtdPath = PpdiHelperService::saveBase64UploadToDisk('ttd', $savedTtdPath, 'pendaftaran_ttd.png', $cleanNik)['url'];
                } catch (\Throwable) {
                }
            }

            $validJabatanId = PpdiHelperService::resolveJabatanId($data['id_jabatan'] ?? 1);
            $periodeCheck = PpdiHelperService::validateAndNormalizePeriode(
                $validJabatanId,
                $data['periode'] ?? null
            );
            if (!$periodeCheck['valid']) {
                return response()->json([
                    'success' => false,
                    'message' => $periodeCheck['message'],
                ], 400);
            }

            $idPendaftaran = (int) DB::table('pendaftaran_perangkat_desa')->insertGetId([
                'nik'                 => $cleanNik,
                'nama_lengkap'        => strtoupper(trim((string) $data['nama_lengkap'])),
                'gelar_depan'         => !empty($data['gelar_depan']) ? trim((string) $data['gelar_depan']) : null,
                'gelar_belakang'      => !empty($data['gelar_belakang']) ? trim((string) $data['gelar_belakang']) : null,
                'tempat_lahir'        => ($data['tempat_lahir'] ?? null) ?: 'Bandung',
                'tanggal_lahir'       => ($data['tanggal_lahir'] ?? null) ?: '1990-01-01',
                'jenis_kelamin'       => ($data['jenis_kelamin'] ?? 'L') === 'P' ? 'P' : 'L',
                'agama'               => ($data['agama'] ?? null) ?: 'Islam',
                'pendidikan_terakhir' => ($data['pendidikan_terakhir'] ?? null) ?: 'S1',
                'no_hp_wa'            => ($data['no_hp_wa'] ?? null) ?: '-',
                'email'               => ($data['email'] ?? null) ?: null,
                'alamat_rumah'        => ($data['alamat_rumah'] ?? null) ?: 'Kabupaten Bandung',
                'status_pernikahan'   => ($data['status_pernikahan'] ?? null) ?: 'Kawin',
                'id_kecamatan'        => $cleanKecId,
                'id_desa'             => $validDesaId,
                'id_jabatan'          => $validJabatanId,
                'periode'             => $periodeCheck['value'],
                'no_sk_pengangkatan'  => ($data['no_sk_pengangkatan'] ?? null) ?: ('141.1/Kep.Reg-' . date('Y')),
                'tgl_sk_pengangkatan' => ($data['tgl_sk_pengangkatan'] ?? null) ?: date('Y-m-d'),
                'tmt_jabatan'         => ($data['tmt_jabatan'] ?? null) ?: date('Y-m-d'),
                'foto'                => $savedFotoPath,
                'file_sk'             => $savedSkPath,
                'tanda_tangan'        => $savedTtdPath,
                'status_approval'     => 'Menunggu',
            ]);

            return response()->json([
                'success'        => true,
                'id_pendaftaran' => $idPendaftaran,
                'message'        => 'Formulir induk pendaftaran berhasil dikirim. Menunggu verifikasi & approval admin.',
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * PUT /api/pendaftaran/{id}/approve
     * Exact parity with hardened server.ts approval transaction:
     * - INT(11) validation for id_pendaftaran, id_anggota, id_riwayat, id_ppdi
     * - FK resolution (resolveDesaId + resolveJabatanId)
     * - VARCHAR(255) path safeguards for foto & file_sk
     * - Thread-safe KTA generation (SELECT ... FOR UPDATE)
     * - Kepala Desa jabatan_pengurus enforcement
     * - Step-tracked rollback & persistent activity_logs recording
     */
    public function approve(Request $request, string $id)
    {
        $approverName = trim((string) ($request->input('approved_by') ?: 'Admin Kabupaten'));
        $customKta = $request->input('no_kta_custom');
        $clientIp = $request->ip() ?: '-';
        $userRole = trim((string) ($request->header('x-user-role') ?: $request->header('user-role') ?: 'Admin'));

        $txStep = 'fetch_pendaftaran';
        try {
            $parsedPendaftaranId = PpdiHelperService::isValidInt32Id($id);
            if ($parsedPendaftaranId === null) {
                return response()->json([
                    'success' => false,
                    'message' => "ID pendaftaran tidak valid: {$id}",
                ], 400);
            }

            $p = DB::table('pendaftaran_perangkat_desa')
                ->where('id_pendaftaran', $parsedPendaftaranId)
                ->first();

            if (!$p) {
                return response()->json([
                    'success' => false,
                    'message' => 'Data pendaftaran tidak ditemukan',
                ], 404);
            }

            if ($p->status_approval === 'Disetujui') {
                return response()->json([
                    'success' => false,
                    'message' => 'Pendaftaran ini sudah disetujui sebelumnya',
                ], 400);
            }

            $result = DB::transaction(function () use ($p, $parsedPendaftaranId, $approverName, $customKta, &$txStep) {
                $txStep = 'check_existing_anggota';
                $cleanNik = trim((string) ($p->nik ?? ''));
                $existingAng = DB::table('anggota')
                    ->select('id_anggota', 'nama_lengkap')
                    ->where('nik', $cleanNik)
                    ->first();

                $txStep = 'resolve_foreign_keys';
                $validDesaId = PpdiHelperService::resolveDesaId($p->id_desa);
                $validJabatanId = PpdiHelperService::resolveJabatanId($p->id_jabatan);

                $jabatanInfo = DB::table('ref_jabatan')
                    ->select('nama_jabatan', 'kategori_jabatan')
                    ->where('id_jabatan', $validJabatanId)
                    ->first();

                $periodeCheck = PpdiHelperService::validateAndNormalizePeriode(
                    $validJabatanId,
                    $p->periode ?? null
                );
                $effectiveApprovedPeriode = $validJabatanId === PpdiHelperService::ID_JABATAN_KEPALA_DESA
                    ? ($periodeCheck['valid'] ? $periodeCheck['value'] : 1)
                    : null;

                $safeTglLahir = $p->tanggal_lahir ? substr((string) $p->tanggal_lahir, 0, 10) : '1990-01-01';
                $safeTglSk = $p->tgl_sk_pengangkatan ? substr((string) $p->tgl_sk_pengangkatan, 0, 10) : date('Y-m-d');
                $safeTmt = $p->tmt_jabatan ? substr((string) $p->tmt_jabatan, 0, 10) : date('Y-m-d');

                $safeFotoPath = PpdiHelperService::sanitizeVarcharPath($p->foto ?? null, 'foto', 'pendaftaran_foto.jpg', $cleanNik);
                $safeFileSkPath = PpdiHelperService::sanitizeVarcharPath($p->file_sk ?? null, 'sk', 'pendaftaran_sk.pdf', $cleanNik);

                $normalizedGender = ($p->jenis_kelamin ?? 'L') === 'P' ? 'P' : 'L';
                $normalizedNama = strtoupper(trim((string) ($p->nama_lengkap ?? '')));

                $nipdVal = PpdiHelperService::generateServerNIPD([
                    'tanggal_lahir'    => $safeTglLahir,
                    'tmt_jabatan'      => $safeTmt,
                    'jenis_kelamin'    => $normalizedGender,
                    'id_jabatan'       => $validJabatanId,
                    'nama_jabatan'     => $jabatanInfo->nama_jabatan ?? null,
                    'kategori_jabatan' => $jabatanInfo->kategori_jabatan ?? null,
                    'periode'          => $effectiveApprovedPeriode,
                    'id_kecamatan'     => $p->id_kecamatan ?: substr($validDesaId, 0, 6),
                    'id_desa'          => $validDesaId,
                ]);

                // 1. Insert or update anggota (INT(11) AUTO_INCREMENT)
                if ($existingAng) {
                    $txStep = 'update_existing_anggota';
                    $effectiveIdAnggota = PpdiHelperService::isValidInt32Id($existingAng->id_anggota);
                    if ($effectiveIdAnggota === null) {
                        throw new RuntimeException("Nilai id_anggota eksisting tidak valid sebagai INT(11): {$existingAng->id_anggota}");
                    }

                    DB::update(
                        'UPDATE anggota SET
                            nama_lengkap = ?,
                            gelar_depan = COALESCE(?, gelar_depan),
                            gelar_belakang = COALESCE(?, gelar_belakang),
                            tempat_lahir = COALESCE(?, tempat_lahir),
                            tanggal_lahir = COALESCE(?, tanggal_lahir),
                            jenis_kelamin = COALESCE(?, jenis_kelamin),
                            agama = COALESCE(?, agama),
                            pendidikan_terakhir = COALESCE(?, pendidikan_terakhir),
                            no_hp_wa = COALESCE(?, no_hp_wa),
                            email = COALESCE(?, email),
                            foto = COALESCE(?, foto),
                            alamat_rumah = COALESCE(?, alamat_rumah),
                            status_pernikahan = COALESCE(?, status_pernikahan)
                         WHERE id_anggota = ?',
                        [
                            $normalizedNama,
                            $p->gelar_depan ?: null,
                            $p->gelar_belakang ?: null,
                            $p->tempat_lahir ?: 'Bandung',
                            $safeTglLahir,
                            $normalizedGender,
                            $p->agama ?: 'Islam',
                            $p->pendidikan_terakhir ?: 'S1',
                            $p->no_hp_wa ?: '-',
                            $p->email ?: null,
                            $safeFotoPath,
                            $p->alamat_rumah ?: 'Kabupaten Bandung',
                            $p->status_pernikahan ?: 'Kawin',
                            $effectiveIdAnggota,
                        ]
                    );
                } else {
                    $txStep = 'insert_new_anggota';
                    $effectiveIdAnggota = (int) DB::table('anggota')->insertGetId([
                        'nik'                 => $cleanNik,
                        'nipd'                => $nipdVal,
                        'nama_lengkap'        => $normalizedNama,
                        'gelar_depan'         => $p->gelar_depan ?: null,
                        'gelar_belakang'      => $p->gelar_belakang ?: null,
                        'tempat_lahir'        => $p->tempat_lahir ?: 'Bandung',
                        'tanggal_lahir'       => $safeTglLahir,
                        'jenis_kelamin'       => $normalizedGender,
                        'agama'               => $p->agama ?: 'Islam',
                        'pendidikan_terakhir' => $p->pendidikan_terakhir ?: 'S1',
                        'no_hp_wa'            => $p->no_hp_wa ?: '-',
                        'email'               => $p->email ?: null,
                        'foto'                => $safeFotoPath,
                        'alamat_rumah'        => $p->alamat_rumah ?: 'Kabupaten Bandung',
                        'status_pernikahan'   => $p->status_pernikahan ?: 'Kawin',
                    ]);
                    if ($effectiveIdAnggota <= 0) {
                        throw new RuntimeException('Gagal memperoleh INT(11) AUTO_INCREMENT id_anggota baru');
                    }
                }

                // 2. Insert or update riwayat_jabatan
                $txStep = 'upsert_riwayat_jabatan';
                $existingRw = DB::table('riwayat_jabatan')
                    ->select('id_riwayat')
                    ->where('id_anggota', $effectiveIdAnggota)
                    ->where('status_aktif', 'Aktif')
                    ->first();

                if (!$existingRw) {
                    $effectiveIdRiwayat = (int) DB::table('riwayat_jabatan')->insertGetId([
                        'id_anggota'          => $effectiveIdAnggota,
                        'id_desa'             => $validDesaId,
                        'id_jabatan'          => $validJabatanId,
                        'periode'             => $effectiveApprovedPeriode,
                        'no_sk_pengangkatan'  => $p->no_sk_pengangkatan ?: ('141.1/Kep.01-Desa/' . date('Y')),
                        'tgl_sk_pengangkatan' => $safeTglSk,
                        'tmt_jabatan'         => $safeTmt,
                        'status_aktif'        => 'Aktif',
                        'file_sk'             => $safeFileSkPath,
                        'tanda_tangan'        => $p->tanda_tangan ?? null,
                    ]);
                } else {
                    $effectiveIdRiwayat = (int) $existingRw->id_riwayat;
                    DB::update(
                        'UPDATE riwayat_jabatan SET
                            id_desa = ?,
                            id_jabatan = ?,
                            periode = ?,
                            no_sk_pengangkatan = COALESCE(?, no_sk_pengangkatan),
                            tgl_sk_pengangkatan = COALESCE(?, tgl_sk_pengangkatan),
                            tmt_jabatan = COALESCE(?, tmt_jabatan),
                            file_sk = COALESCE(?, file_sk),
                            tanda_tangan = COALESCE(?, tanda_tangan)
                         WHERE id_riwayat = ?',
                        [
                            $validDesaId,
                            $validJabatanId,
                            $effectiveApprovedPeriode,
                            $p->no_sk_pengangkatan ?: null,
                            $safeTglSk,
                            $safeTmt,
                            $safeFileSkPath,
                            $p->tanda_tangan ?? null,
                            $effectiveIdRiwayat,
                        ]
                    );
                }

                // 3. Upsert keanggotaan_ppdi + Generate Unique KTA
                $txStep = 'upsert_keanggotaan_ppdi';
                $existingKta = DB::table('keanggotaan_ppdi')
                    ->select('id_ppdi', 'no_kta')
                    ->where('id_anggota', $effectiveIdAnggota)
                    ->first();

                if ($existingKta) {
                    $effectiveIdPpdi = (int) $existingKta->id_ppdi;
                    $finalKta = (string) $existingKta->no_kta;
                    $ktaParts = explode('.', $finalKta);
                    $finalKecCode = count($ktaParts) >= 3 ? "32.04.{$ktaParts[2]}" : ($p->id_kecamatan ?: '32.04.05');
                    $finalNomorUrut = count($ktaParts) >= 5 ? ((int) $ktaParts[4] ?: 1) : 1;

                    DB::table('keanggotaan_ppdi')
                        ->where('id_ppdi', $effectiveIdPpdi)
                        ->update(['status_kta' => 'Aktif']);
                } else {
                    $txStep = 'generate_unique_kta';
                    $ktaResult = PpdiHelperService::generateUniqueKTA(
                        (string) ($p->id_kecamatan ?: $validDesaId),
                        $validDesaId,
                        $customKta ? (string) $customKta : null
                    );
                    $finalKta = $ktaResult['noKta'];
                    $finalKecCode = $ktaResult['kodeKecamatan'];
                    $finalNomorUrut = $ktaResult['nomorUrut'];

                    $isKades = $jabatanInfo
                        ? PpdiHelperService::isKepalaDesa($jabatanInfo->kategori_jabatan, $jabatanInfo->nama_jabatan)
                        : false;

                    $effectiveJabPengurus = PpdiHelperService::sanitizeJabatanPengurus(
                        (string) ($p->jabatan_pengurus ?? ''),
                        $isKades
                    );

                    $txStep = 'insert_keanggotaan_ppdi';
                    $effectiveIdPpdi = (int) DB::table('keanggotaan_ppdi')->insertGetId([
                        'id_anggota'       => $effectiveIdAnggota,
                        'no_kta'           => $finalKta,
                        'tgl_bergabung'    => date('Y-m-d'),
                        'jabatan_pengurus' => $effectiveJabPengurus,
                        'status_kta'       => 'Aktif',
                    ]);
                    if ($effectiveIdPpdi <= 0) {
                        throw new RuntimeException('Gagal memperoleh INT(11) AUTO_INCREMENT id_ppdi baru');
                    }
                }

                // Sync KTA columns back to anggota table
                $txStep = 'sync_anggota_kta_columns';
                try {
                    DB::table('anggota')
                        ->where('id_anggota', $effectiveIdAnggota)
                        ->update([
                            'kode_kecamatan' => $finalKecCode,
                            'nomor_urut'     => $finalNomorUrut,
                            'no_kta'         => $finalKta,
                        ]);
                } catch (\Throwable) {
                }

                // 4. Mark registration as Disetujui
                $txStep = 'update_pendaftaran_status';
                $updated = DB::table('pendaftaran_perangkat_desa')
                    ->where('id_pendaftaran', $parsedPendaftaranId)
                    ->update([
                        'status_approval' => 'Disetujui',
                        'tgl_approval'    => now(),
                        'approved_by'     => $approverName,
                    ]);

                if ($updated === 0) {
                    throw new RuntimeException("Gagal memperbarui status pendaftaran_perangkat_desa untuk id_pendaftaran={$parsedPendaftaranId}");
                }

                return [
                    'nama_lengkap' => $normalizedNama,
                    'nik'          => $cleanNik,
                    'id_anggota'   => $effectiveIdAnggota,
                    'id_riwayat'   => $effectiveIdRiwayat,
                    'id_ppdi'      => $effectiveIdPpdi,
                    'no_kta'       => $finalKta,
                ];
            });

            ActivityLoggerService::logApprovalTransaction([
                'ipAddress'     => $clientIp,
                'userName'      => $approverName,
                'userRole'      => $userRole,
                'aksi'          => 'APPROVE_SUCCESS',
                'idPendaftaran' => $parsedPendaftaranId,
                'idAnggota'     => $result['id_anggota'],
                'targetNama'    => $result['nama_lengkap'],
                'step'          => 'completed',
                'detail'        => "Disetujui: {$result['nama_lengkap']} (NIK: {$result['nik']}) -> id_anggota={$result['id_anggota']}, id_riwayat={$result['id_riwayat']}, id_ppdi={$result['id_ppdi']}, no_kta={$result['no_kta']}",
            ]);

            return response()->json([
                'success'      => true,
                'message'      => "Pendaftaran atas nama {$result['nama_lengkap']} berhasil disetujui! Telah diterbitkan ke Data Induk Anggota dengan No. KTA {$result['no_kta']}",
                'nama_lengkap' => $result['nama_lengkap'],
                'id_anggota'   => $result['id_anggota'],
                'id_riwayat'   => $result['id_riwayat'],
                'id_ppdi'      => $result['id_ppdi'],
                'no_kta'       => $result['no_kta'],
            ]);
        } catch (\Throwable $e) {
            $sqlCode = $e instanceof PDOException ? (string) ($e->errorInfo[0] ?? 'SQL_ERR') : 'UNKNOWN';
            $sqlErrno = $e instanceof PDOException ? (string) ($e->errorInfo[1] ?? '-') : '-';
            $sqlMsg = $e->getMessage() ?: 'Terjadi kesalahan sistem saat menyetujui pendaftaran';
            $detailedMsg = "[Step: {$txStep}] [{$sqlCode}/{$sqlErrno}] {$sqlMsg}";

            ActivityLoggerService::logApprovalTransaction([
                'ipAddress'     => $clientIp,
                'userName'      => $approverName,
                'userRole'      => $userRole,
                'aksi'          => 'APPROVE_ERROR',
                'idPendaftaran' => $id,
                'step'          => $txStep,
                'detail'        => $detailedMsg,
            ]);

            return response()->json([
                'success' => false,
                'step'    => $txStep,
                'code'    => $sqlCode,
                'message' => "Gagal menyetujui pendaftaran pada tahap \"{$txStep}\": {$sqlMsg}",
                'error'   => $detailedMsg,
            ], 500);
        }
    }

    /**
     * PUT /api/pendaftaran/{id}/reject
     */
    public function reject(Request $request, string $id)
    {
        try {
            DB::table('pendaftaran_perangkat_desa')
                ->where('id_pendaftaran', $id)
                ->update([
                    'status_approval'  => 'Ditolak',
                    'catatan_approval' => $request->input('catatan_approval', 'Ditolak oleh administrator'),
                    'tgl_approval'     => now(),
                    'approved_by'      => $request->input('approved_by', 'Admin'),
                ]);

            return response()->json([
                'success' => true,
                'message' => 'Pengajuan pendaftaran berhasil ditolak',
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * DELETE /api/pendaftaran/{id}
     */
    public function destroy(string $id)
    {
        try {
            DB::table('pendaftaran_perangkat_desa')->where('id_pendaftaran', $id)->delete();
            return response()->json([
                'success' => true,
                'message' => 'Data pendaftaran berhasil dihapus',
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }
}
