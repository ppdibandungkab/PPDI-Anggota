<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\KtaConflictException;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAnggotaRequest;
use App\Services\ActivityLoggerService;
use App\Services\KtaGeneratorService;
use App\Services\PpdiHelperService;
use App\Support\NipdFormatter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AnggotaController extends Controller
{
    public function __construct(
        private readonly KtaGeneratorService $ktaGenerator
    ) {}
    /**
     * GET /api/anggota
     */
    public function index()
    {
        try {
            $anggotaRows = DB::select("
                SELECT
                    a.id_anggota,
                    a.nik,
                    a.nipd,
                    a.nama_lengkap,
                    a.gelar_depan,
                    a.gelar_belakang,
                    a.tempat_lahir,
                    DATE_FORMAT(a.tanggal_lahir, '%Y-%m-%d') AS tanggal_lahir,
                    a.jenis_kelamin,
                    a.agama,
                    a.pendidikan_terakhir,
                    a.no_hp_wa,
                    a.email,
                    a.foto,
                    a.alamat_rumah,
                    a.status_pernikahan,
                    a.created_at,
                    a.updated_at
                FROM anggota a
                ORDER BY a.created_at DESC, a.id_anggota ASC
            ");

            try {
                $riwayatRows = DB::select("
                    SELECT
                        id_riwayat,
                        id_anggota,
                        id_desa,
                        id_jabatan,
                        no_sk_pengangkatan,
                        DATE_FORMAT(tgl_sk_pengangkatan, '%Y-%m-%d') AS tgl_sk_pengangkatan,
                        DATE_FORMAT(tmt_jabatan, '%Y-%m-%d') AS tmt_jabatan,
                        status_aktif,
                        file_sk,
                        tanda_tangan,
                        keterangan,
                        created_at
                    FROM riwayat_jabatan
                    ORDER BY created_at DESC, tgl_sk_pengangkatan DESC, id_riwayat DESC
                ");
            } catch (\Throwable) {
                $riwayatRows = DB::select("
                    SELECT
                        id_riwayat,
                        id_anggota,
                        id_desa,
                        id_jabatan,
                        no_sk_pengangkatan,
                        DATE_FORMAT(tgl_sk_pengangkatan, '%Y-%m-%d') AS tgl_sk_pengangkatan,
                        DATE_FORMAT(tmt_jabatan, '%Y-%m-%d') AS tmt_jabatan,
                        status_aktif,
                        file_sk
                    FROM riwayat_jabatan
                    ORDER BY tgl_sk_pengangkatan DESC, id_riwayat DESC
                ");
            }

            $ktaRows = DB::select("
                SELECT
                    id_ppdi,
                    id_anggota,
                    no_kta,
                    DATE_FORMAT(tgl_bergabung, '%Y-%m-%d') AS tgl_bergabung,
                    jabatan_pengurus,
                    CASE
                        WHEN status_kta IN ('Approved', 'Verified_Kecamatan', 'Aktif') THEN 'Aktif'
                        WHEN status_kta IN ('Pending_Verifikasi', 'Draft', 'Pending') THEN 'Pending'
                        ELSE 'Non-Aktif'
                    END AS status_kta
                FROM keanggotaan_ppdi
            ");

            $formattedAnggota = array_map(function ($row) {
                $row->nipd = NipdFormatter::normalize($row->nipd ?? null) ?? $row->nipd;
                $row->nipd_formatted = NipdFormatter::format($row->nipd ?? null);
                return $row;
            }, $anggotaRows);

            return response()->json([
                'success'     => true,
                'anggota'     => $formattedAnggota,
                'riwayat'     => $riwayatRows,
                'keanggotaan' => $ktaRows,
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * GET /api/anggota/check-nik?nik=...&excludeId=...
     */
    public function checkNik(Request $request)
    {
        $rawNik = trim((string) preg_replace('/\D/', '', (string) $request->query('nik', '')));
        $excludeId = trim((string) $request->query('excludeId', ''));

        if (strlen($rawNik) !== 16) {
            return response()->json([
                'success'   => false,
                'available' => false,
                'message'   => 'NIK KTP harus terdiri dari tepat 16 digit angka.',
            ], 400);
        }

        try {
            $numericExcludeId = PpdiHelperService::isValidInt32Id($excludeId);

            $dupQuery = DB::table('anggota')
                ->select('id_anggota', 'nama_lengkap', 'nipd')
                ->where('nik', $rawNik);

            if ($numericExcludeId !== null) {
                $dupQuery->where('id_anggota', '!=', $numericExcludeId);
            }

            $duplicate = $dupQuery->first();

            $pending = DB::table('pendaftaran_perangkat_desa')
                ->select('id_pendaftaran', 'nama_lengkap', 'status_approval')
                ->where('nik', $rawNik)
                ->where('status_approval', 'Menunggu')
                ->first();

            return response()->json([
                'success'            => true,
                'available'          => $duplicate === null,
                'duplicateInAnggota' => $duplicate,
                'pendingPendaftaran' => $pending,
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * GET /api/anggota/{id}/activity
     */
    public function activity(Request $request, string $id)
    {
        $nikQuery = trim((string) $request->query('nik', ''));
        $limit = min(max((int) $request->query('limit', 100), 1), 300);

        try {
            $numericId = PpdiHelperService::isValidInt32Id($id);
            $memberRow = null;
            if ($numericId !== null) {
                $memberRow = DB::table('anggota')
                    ->select('id_anggota', 'nik', 'nama_lengkap', 'created_at', 'updated_at')
                    ->where('id_anggota', $numericId)
                    ->first();
            }

            $effectiveId = $memberRow ? (string) $memberRow->id_anggota : $id;
            $effectiveNik = $nikQuery !== '' ? $nikQuery : ($memberRow->nik ?? '');

            $rows = DB::table('activity_logs')
                ->where(function ($q) use ($effectiveId, $effectiveNik) {
                    $q->where('target_id', $effectiveId)
                        ->orWhere('keterangan', 'like', "%id_anggota={$effectiveId}%")
                        ->orWhere('keterangan', 'like', "%ID {$effectiveId}%")
                        ->orWhere('keterangan', 'like', "%#{$effectiveId}%");
                    if (strlen((string) $effectiveNik) >= 8) {
                        $q->orWhere('keterangan', 'like', "%{$effectiveNik}%");
                    }
                })
                ->orderByDesc('timestamp')
                ->orderByDesc('id')
                ->limit($limit)
                ->get();

            $logs = $rows->map(fn ($row) => [
                'id'          => 'db_' . $row->id,
                'timestamp'   => $row->timestamp ? date('c', strtotime((string) $row->timestamp)) : now()->toIso8601String(),
                'ip_address'  => $row->ip_address ?: '-',
                'user_id'     => $row->user_id ?? 0,
                'user_name'   => $row->user_name ?: 'Administrator',
                'user_role'   => $row->user_role ?: 'Admin',
                'modul'       => $row->modul ?: 'Data Induk Anggota',
                'aksi'        => $row->aksi ?: 'EDIT',
                'target_id'   => $row->target_id ?: $effectiveId,
                'target_nama' => $row->target_nama ?: ($memberRow->nama_lengkap ?? ''),
                'deskripsi'   => $row->keterangan ?: '',
                'source'      => 'database',
            ])->values();

            return response()->json([
                'success'     => true,
                'id_anggota'  => $effectiveId,
                'member_meta' => $memberRow ? [
                    'created_at' => $memberRow->created_at ? date('c', strtotime((string) $memberRow->created_at)) : null,
                    'updated_at' => $memberRow->updated_at ? date('c', strtotime((string) $memberRow->updated_at)) : null,
                ] : null,
                'logs'        => $logs,
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage(), 'logs' => []], 500);
        }
    }

    /**
     * POST /api/anggota
     * POST /api/anggota/store
     */
    public function store(StoreAnggotaRequest $request)
    {
        $validated = $request->validated();
        $anggota = $validated['anggota'];
        $riwayat = $validated['riwayat'] ?? null;
        $keanggotaan = $validated['keanggotaan'] ?? null;

        $cleanNik = trim((string) $anggota['nik']);
        $upperName = strtoupper(trim((string) $anggota['nama_lengkap']));

        try {
            $existingNik = DB::table('anggota')
                ->select('id_anggota', 'nama_lengkap')
                ->where('nik', $cleanNik)
                ->first();

            if ($existingNik) {
                return response()->json([
                    'success' => false,
                    'message' => "NIK {$cleanNik} sudah terdaftar atas nama \"{$existingNik->nama_lengkap}\". NIK perangkat desa bersifat unik dan tidak boleh duplikat!",
                ], 409);
            }

            $txResult = $this->ktaGenerator->executeWithUniqueRetry(function () use ($anggota, $riwayat, $keanggotaan, $cleanNik, $upperName) {
                $rawNipd = ($anggota['nipd'] ?? null)
                    ?: ($anggota['niap_nipd'] ?? null)
                    ?: ($anggota['niap'] ?? null);
                $nipdValue = NipdFormatter::normalize($rawNipd)
                    ?: PpdiHelperService::generateServerNIPD([
                        'tanggal_lahir' => $anggota['tanggal_lahir'] ?? null,
                        'tmt_jabatan'   => $riwayat['tmt_jabatan'] ?? null,
                        'jenis_kelamin' => $anggota['jenis_kelamin'] ?? 'L',
                        'id_jabatan'    => $riwayat['id_jabatan'] ?? 2,
                        'id_kecamatan'  => $riwayat['id_kecamatan'] ?? null,
                        'id_desa'       => $riwayat['id_desa'] ?? null,
                    ]);

                $safeFoto = PpdiHelperService::sanitizeVarcharPath(
                    $anggota['foto'] ?? null,
                    'foto',
                    'anggota_foto.jpg',
                    $cleanNik
                );

                $idAnggota = (int) DB::table('anggota')->insertGetId([
                    'nik'                 => $cleanNik,
                    'nipd'                => $nipdValue,
                    'nama_lengkap'        => $upperName,
                    'gelar_depan'         => ($anggota['gelar_depan'] ?? null) ?: null,
                    'gelar_belakang'      => ($anggota['gelar_belakang'] ?? null) ?: null,
                    'tempat_lahir'        => ($anggota['tempat_lahir'] ?? null) ?: 'Bandung',
                    'tanggal_lahir'       => ($anggota['tanggal_lahir'] ?? null) ?: '1990-01-01',
                    'jenis_kelamin'       => ($anggota['jenis_kelamin'] ?? 'L') === 'P' ? 'P' : 'L',
                    'agama'               => ($anggota['agama'] ?? null) ?: 'Islam',
                    'pendidikan_terakhir' => ($anggota['pendidikan_terakhir'] ?? null) ?: 'S1',
                    'no_hp_wa'            => ($anggota['no_hp_wa'] ?? null) ?: '081234567890',
                    'email'               => ($anggota['email'] ?? null) ?: null,
                    'foto'                => $safeFoto,
                    'alamat_rumah'        => ($anggota['alamat_rumah'] ?? null) ?: 'Kabupaten Bandung',
                    'status_pernikahan'   => ($anggota['status_pernikahan'] ?? null) ?: 'Kawin',
                ]);

                $validDesaId = null;
                $validJabatanId = 2;
                $generatedNoKta = null;

                if (is_array($riwayat)) {
                    $validDesaId = PpdiHelperService::resolveDesaId($riwayat['id_desa'] ?? null);
                    $validJabatanId = PpdiHelperService::resolveJabatanId($riwayat['id_jabatan'] ?? 2);
                    $safeFileSk = PpdiHelperService::sanitizeVarcharPath(
                        $riwayat['file_sk'] ?? null,
                        'sk',
                        'sk_pengangkatan.pdf',
                        $cleanNik
                    );

                    DB::table('riwayat_jabatan')->insert([
                        'id_anggota'          => $idAnggota,
                        'id_desa'             => $validDesaId,
                        'id_jabatan'          => $validJabatanId,
                        'no_sk_pengangkatan'  => ($riwayat['no_sk_pengangkatan'] ?? null) ?: ('141.1/Kep.01-Desa/' . date('Y')),
                        'tgl_sk_pengangkatan' => ($riwayat['tgl_sk_pengangkatan'] ?? null) ?: date('Y-m-d'),
                        'tmt_jabatan'         => ($riwayat['tmt_jabatan'] ?? null) ?: date('Y-m-d'),
                        'status_aktif'        => 'Aktif',
                        'file_sk'             => $safeFileSk,
                    ]);
                }

                if (is_array($keanggotaan)) {
                    $jabatanInfo = DB::table('ref_jabatan')
                        ->select('nama_jabatan', 'kategori_jabatan')
                        ->where('id_jabatan', $validJabatanId)
                        ->first();
                    $isKades = $jabatanInfo
                        ? PpdiHelperService::isKepalaDesa($jabatanInfo->kategori_jabatan, $jabatanInfo->nama_jabatan)
                        : false;

                    $effectiveJabPengurus = PpdiHelperService::sanitizeJabatanPengurus(
                        (string) ($keanggotaan['jabatan_pengurus'] ?? 'Anggota Biasa'),
                        $isKades
                    );

                    $ktaResult = $this->ktaGenerator->generateNextForKecamatan(
                        (string) ($riwayat['id_kecamatan'] ?? $validDesaId ?? '320405'),
                        (string) ($validDesaId ?? '3204052001'),
                        $keanggotaan['no_kta'] ?? null
                    );
                    $generatedNoKta = $ktaResult['noKta'];

                    $dbStatusKta = ($keanggotaan['status_kta'] ?? 'Aktif') === 'Aktif' ? 'Aktif' : 'Pending_Verifikasi';

                    DB::table('keanggotaan_ppdi')->insert([
                        'id_anggota'       => $idAnggota,
                        'no_kta'           => $generatedNoKta,
                        'tgl_bergabung'    => ($keanggotaan['tgl_bergabung'] ?? null) ?: date('Y-m-d'),
                        'jabatan_pengurus' => $effectiveJabPengurus,
                        'status_kta'       => $dbStatusKta,
                    ]);

                    try {
                        DB::table('anggota')->where('id_anggota', $idAnggota)->update([
                            'kode_kecamatan' => $ktaResult['kodeKecamatan'],
                            'nomor_urut'     => $ktaResult['nomorUrut'],
                            'no_kta'         => $generatedNoKta,
                        ]);
                    } catch (\Throwable) {
                    }
                }

                return [
                    'id_anggota' => $idAnggota,
                    'nipd'       => $nipdValue,
                    'no_kta'     => $generatedNoKta,
                ];
            });

            $newIdAnggota = $txResult['id_anggota'];
            $savedNipd = $txResult['nipd'];
            $generatedNoKta = $txResult['no_kta'];
            $ktaNote = $generatedNoKta ? ", No. KTA: {$generatedNoKta}" : '';

            ActivityLoggerService::logMemberActivity($request, [
                'idAnggota'  => $newIdAnggota,
                'targetNama' => $upperName,
                'modul'      => 'Data Induk Anggota',
                'aksi'       => 'TAMBAH',
                'keterangan' => "Mendaftarkan anggota baru \"{$upperName}\" (NIK: {$cleanNik}{$ktaNote}).",
            ]);

            $payload = [
                'success'        => true,
                'id_anggota'     => $newIdAnggota,
                'nipd'           => $savedNipd,
                'nipd_formatted' => NipdFormatter::format($savedNipd),
                'message'        => 'Perangkat desa berhasil didaftarkan ke database MySQL',
            ];
            if ($generatedNoKta !== null) {
                $payload['no_kta'] = $generatedNoKta;
            }

            return response()->json($payload, 200);
        } catch (KtaConflictException $e) {
            return response()->json([
                'success' => false,
                'error'   => 'KTA_CONFLICT',
                'message' => $e->getMessage(),
            ], 409);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * POST /api/anggota/batch-import
     */
    public function batchImport(Request $request)
    {
        $items = $request->input('items');
        if (!is_array($items) || count($items) === 0) {
            return response()->json([
                'success' => false,
                'message' => 'Data import kosong atau format salah',
            ], 400);
        }

        $inserted = 0;
        $skipped = 0;
        $errors = [];

        foreach ($items as $idx => $item) {
            $rowNum = $idx + 1;
            $nik = trim((string) preg_replace('/\D/', '', (string) ($item['nik'] ?? '')));
            $nama = strtoupper(trim((string) ($item['nama_lengkap'] ?? '')));

            if ($nik === '' || $nama === '') {
                $skipped++;
                $errors[] = "Baris {$rowNum}: NIK atau Nama Lengkap kosong.";
                continue;
            }

            if (DB::table('anggota')->where('nik', $nik)->exists()) {
                $skipped++;
                $errors[] = "Baris {$rowNum}: NIK {$nik} sudah terdaftar (dilewati).";
                continue;
            }

            try {
                DB::transaction(function () use ($item, $nik, $nama) {
                    $validDesaId = PpdiHelperService::resolveDesaId(
                        $item['id_desa'] ?? null,
                        $item['nama_desa'] ?? null
                    );
                    $validJabatanId = PpdiHelperService::resolveJabatanId($item['id_jabatan'] ?? 2);
                    $nipd = ($item['nipd'] ?? null) ?: PpdiHelperService::generateServerNIPD([
                        'tanggal_lahir' => $item['tanggal_lahir'] ?? '1990-01-01',
                        'tmt_jabatan'   => $item['tmt_jabatan'] ?? date('Y-m-d'),
                        'jenis_kelamin' => $item['jenis_kelamin'] ?? 'L',
                        'id_jabatan'    => $validJabatanId,
                        'id_kecamatan'  => $item['id_kecamatan'] ?? substr($validDesaId, 0, 6),
                        'id_desa'       => $validDesaId,
                    ]);

                    $idAnggota = (int) DB::table('anggota')->insertGetId([
                        'nik'                 => $nik,
                        'nipd'                => $nipd,
                        'nama_lengkap'        => $nama,
                        'gelar_depan'         => $item['gelar_depan'] ?? null,
                        'gelar_belakang'      => $item['gelar_belakang'] ?? null,
                        'tempat_lahir'        => ($item['tempat_lahir'] ?? null) ?: 'Bandung',
                        'tanggal_lahir'       => ($item['tanggal_lahir'] ?? null) ?: '1990-01-01',
                        'jenis_kelamin'       => strtoupper((string) ($item['jenis_kelamin'] ?? 'L')) === 'P' ? 'P' : 'L',
                        'agama'               => ($item['agama'] ?? null) ?: 'Islam',
                        'pendidikan_terakhir' => ($item['pendidikan_terakhir'] ?? null) ?: 'SMA',
                        'no_hp_wa'            => ($item['no_hp_wa'] ?? null) ?: '-',
                        'email'               => $item['email'] ?? null,
                        'alamat_rumah'        => ($item['alamat_rumah'] ?? null) ?: 'Kabupaten Bandung',
                        'status_pernikahan'   => ($item['status_pernikahan'] ?? null) ?: 'Kawin',
                    ]);

                    DB::table('riwayat_jabatan')->insert([
                        'id_anggota'          => $idAnggota,
                        'id_desa'             => $validDesaId,
                        'id_jabatan'          => $validJabatanId,
                        'no_sk_pengangkatan'  => ($item['no_sk_pengangkatan'] ?? null) ?: ('141.1/Kep.Imp/' . date('Y')),
                        'tgl_sk_pengangkatan' => ($item['tgl_sk_pengangkatan'] ?? null) ?: date('Y-m-d'),
                        'tmt_jabatan'         => ($item['tmt_jabatan'] ?? null) ?: date('Y-m-d'),
                        'status_aktif'        => 'Aktif',
                    ]);

                    $kta = PpdiHelperService::generateUniqueKTA(
                        (string) ($item['id_kecamatan'] ?? $validDesaId),
                        $validDesaId,
                        $item['no_kta'] ?? null
                    );

                    DB::table('keanggotaan_ppdi')->insert([
                        'id_anggota'       => $idAnggota,
                        'no_kta'           => $kta['noKta'],
                        'tgl_bergabung'    => date('Y-m-d'),
                        'jabatan_pengurus' => ($item['jabatan_pengurus'] ?? null) ?: 'Anggota Biasa',
                        'status_kta'       => 'Aktif',
                    ]);

                    DB::table('anggota')->where('id_anggota', $idAnggota)->update([
                        'kode_kecamatan' => $kta['kodeKecamatan'],
                        'nomor_urut'     => $kta['nomorUrut'],
                        'no_kta'         => $kta['noKta'],
                    ]);
                });
                $inserted++;
            } catch (\Throwable $e) {
                $skipped++;
                $errors[] = "Baris {$rowNum} ({$nama}): " . $e->getMessage();
            }
        }

        return response()->json([
            'success'  => true,
            'inserted' => $inserted,
            'skipped'  => $skipped,
            'errors'   => $errors,
            'message'  => "Import selesai: {$inserted} berhasil disimpan, {$skipped} dilewati.",
        ]);
    }

    /**
     * PUT /api/anggota/{id}
     */
    public function update(Request $request, string $id)
    {
        $numericId = PpdiHelperService::isValidInt32Id($id);
        if ($numericId === null) {
            return response()->json([
                'success' => false,
                'message' => 'ID anggota tidak valid (harus berupa integer)',
            ], 400);
        }

        $data = $request->all();

        try {
            if (!empty($data['nik'])) {
                $existingNik = DB::table('anggota')
                    ->select('id_anggota', 'nama_lengkap')
                    ->where('nik', $data['nik'])
                    ->where('id_anggota', '!=', $numericId)
                    ->first();
                if ($existingNik) {
                    return response()->json([
                        'success' => false,
                        'message' => "NIK {$data['nik']} sudah digunakan oleh anggota lain \"{$existingNik->nama_lengkap}\". NIK harus unik!",
                    ], 409);
                }
            }

            $beforeMember = DB::selectOne(
                'SELECT a.*, kp.jabatan_pengurus AS current_jabatan_pengurus
                 FROM anggota a
                 LEFT JOIN keanggotaan_ppdi kp ON kp.id_anggota = a.id_anggota
                 WHERE a.id_anggota = ? LIMIT 1',
                [$numericId]
            );

            $nipdVal = $data['nipd'] ?? ($data['niap_nipd'] ?? ($data['niap'] ?? null));
            $upperName = !empty($data['nama_lengkap']) ? strtoupper(trim((string) $data['nama_lengkap'])) : null;
            $safeFoto = isset($data['foto'])
                ? PpdiHelperService::sanitizeVarcharPath((string) $data['foto'], 'foto', 'anggota_foto.jpg', $data['nik'] ?? ($beforeMember->nik ?? null))
                : null;

            DB::update(
                'UPDATE anggota SET
                    nik = COALESCE(?, nik),
                    nipd = COALESCE(?, nipd),
                    nama_lengkap = COALESCE(?, nama_lengkap),
                    gelar_depan = ?,
                    gelar_belakang = ?,
                    tempat_lahir = COALESCE(?, tempat_lahir),
                    tanggal_lahir = COALESCE(?, tanggal_lahir),
                    jenis_kelamin = COALESCE(?, jenis_kelamin),
                    agama = COALESCE(?, agama),
                    pendidikan_terakhir = COALESCE(?, pendidikan_terakhir),
                    no_hp_wa = COALESCE(?, no_hp_wa),
                    email = ?,
                    alamat_rumah = COALESCE(?, alamat_rumah),
                    status_pernikahan = COALESCE(?, status_pernikahan),
                    foto = COALESCE(?, foto)
                 WHERE id_anggota = ?',
                [
                    $data['nik'] ?? null,
                    $nipdVal,
                    $upperName,
                    array_key_exists('gelar_depan', $data) ? $data['gelar_depan'] : ($beforeMember->gelar_depan ?? null),
                    array_key_exists('gelar_belakang', $data) ? $data['gelar_belakang'] : ($beforeMember->gelar_belakang ?? null),
                    $data['tempat_lahir'] ?? null,
                    $data['tanggal_lahir'] ?? null,
                    $data['jenis_kelamin'] ?? null,
                    $data['agama'] ?? null,
                    $data['pendidikan_terakhir'] ?? null,
                    $data['no_hp_wa'] ?? null,
                    array_key_exists('email', $data) ? $data['email'] : ($beforeMember->email ?? null),
                    $data['alamat_rumah'] ?? null,
                    $data['status_pernikahan'] ?? null,
                    $safeFoto,
                    $numericId,
                ]
            );

            $effectiveJabPengurus = $data['jabatan_pengurus'] ?? ($data['jabatanPengurus'] ?? null);
            if ($effectiveJabPengurus) {
                $existingPpdi = DB::table('keanggotaan_ppdi')->where('id_anggota', $numericId)->first();
                if ($existingPpdi) {
                    DB::table('keanggotaan_ppdi')
                        ->where('id_anggota', $numericId)
                        ->update(['jabatan_pengurus' => $effectiveJabPengurus]);
                } else {
                    $defaultKta = '32.04.PPDI.' . substr((string) round(microtime(true) * 1000), -6);
                    DB::table('keanggotaan_ppdi')->insert([
                        'id_anggota'       => $numericId,
                        'no_kta'           => $defaultKta,
                        'tgl_bergabung'    => date('Y-m-d'),
                        'jabatan_pengurus' => $effectiveJabPengurus,
                        'status_kta'       => 'Aktif',
                    ]);
                }
            }

            // Build field-by-field diff summary for activity_logs
            $changedParts = [];
            $norm = fn ($v) => trim((string) ($v ?? ''));
            if ($beforeMember) {
                $checks = [
                    ['Nama', $beforeMember->nama_lengkap ?? '', $upperName],
                    ['NIK', $beforeMember->nik ?? '', $data['nik'] ?? null],
                    ['NIAP/NIPD', $beforeMember->nipd ?? '', $nipdVal],
                    ['Gelar Depan', $beforeMember->gelar_depan ?? '', $data['gelar_depan'] ?? null],
                    ['Gelar Belakang', $beforeMember->gelar_belakang ?? '', $data['gelar_belakang'] ?? null],
                    ['Tempat Lahir', $beforeMember->tempat_lahir ?? '', $data['tempat_lahir'] ?? null],
                    ['Tanggal Lahir', substr((string) ($beforeMember->tanggal_lahir ?? ''), 0, 10), isset($data['tanggal_lahir']) ? substr((string) $data['tanggal_lahir'], 0, 10) : null],
                    ['Pendidikan', $beforeMember->pendidikan_terakhir ?? '', $data['pendidikan_terakhir'] ?? null],
                    ['No. HP/WA', $beforeMember->no_hp_wa ?? '', $data['no_hp_wa'] ?? null],
                    ['Email', $beforeMember->email ?? '', $data['email'] ?? null],
                    ['Alamat', $beforeMember->alamat_rumah ?? '', $data['alamat_rumah'] ?? null],
                    ['Status Pernikahan', $beforeMember->status_pernikahan ?? '', $data['status_pernikahan'] ?? null],
                    ['Jabatan Pengurus PPDI', $beforeMember->current_jabatan_pengurus ?? '', $effectiveJabPengurus],
                ];
                foreach ($checks as [$label, $oldVal, $newVal]) {
                    if ($newVal !== null && $norm($oldVal) !== $norm($newVal)) {
                        $changedParts[] = "{$label} (" . ($norm($oldVal) ?: '-') . ' → ' . ($norm($newVal) ?: '-') . ')';
                    }
                }
                if ($safeFoto && $norm($safeFoto) !== $norm($beforeMember->foto ?? '')) {
                    $changedParts[] = 'Foto Profil diperbarui';
                }
            }

            $targetName = $upperName ?: ($beforeMember->nama_lengkap ?? "Anggota #{$numericId}");
            $detail = count($changedParts) > 0
                ? "Perubahan profil anggota \"{$targetName}\": " . implode('; ', $changedParts) . '.'
                : "Memperbarui profil & biodata anggota \"{$targetName}\" (NIK: " . ($data['nik'] ?? ($beforeMember->nik ?? '-')) . ').';

            ActivityLoggerService::logMemberActivity($request, [
                'idAnggota'  => $numericId,
                'targetNama' => $targetName,
                'modul'      => 'Profil Anggota',
                'aksi'       => 'EDIT',
                'keterangan' => $detail,
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Data anggota dan jabatan kepengurusan PPDI berhasil diperbarui di MySQL',
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * DELETE /api/anggota/{id}
     * Safe cascade deletion with ID / NIK fallback matching.
     */
    public function destroy(string $id)
    {
        $numericParamId = PpdiHelperService::isValidInt32Id($id);

        try {
            $found = $numericParamId !== null
                ? DB::table('anggota')->select('id_anggota', 'nik', 'nama_lengkap')
                    ->where('id_anggota', $numericParamId)->orWhere('nik', $id)->first()
                : DB::table('anggota')->select('id_anggota', 'nik', 'nama_lengkap')
                    ->where('nik', $id)->first();

            $targetId = $found ? (int) $found->id_anggota : $numericParamId;
            $targetNik = $found ? (string) $found->nik : $id;
            $targetNama = $found ? (string) $found->nama_lengkap : 'Perangkat Desa';

            $affected = DB::transaction(function () use ($targetId, $targetNik) {
                if ($targetId !== null) {
                    foreach (['iuran_anggota', 'keanggotaan_ppdi', 'riwayat_jabatan', 'users'] as $childTbl) {
                        try {
                            DB::table($childTbl)->where('id_anggota', $targetId)->delete();
                        } catch (\Throwable) {
                        }
                    }

                    return DB::table('anggota')
                        ->where('id_anggota', $targetId)
                        ->orWhere('nik', $targetNik)
                        ->delete();
                }

                return DB::table('anggota')->where('nik', $targetNik)->delete();
            });

            return response()->json([
                'success'      => true,
                'affectedRows' => $affected,
                'message'      => "Data anggota \"{$targetNama}\" (NIK: {$targetNik}) berhasil dihapus dari database MySQL",
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }
}
