<?php

namespace App\Services;

use App\Support\NipdFormatter;
use DateTimeInterface;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Service resmi pembentuk Nomor Induk Perangkat Desa (NIPD) 28 digit.
 *
 * Struktur 28 digit:
 * 1. Kepala Desa (id_jabatan = 10):
 *    [YYYYMMDD lahir (8)] [YYYYMM pelantikan (6)] [JK 1|2 (1)] [01 (2)] [Periode 1|2|3 (1)] [Kode Wilayah 10 digit]
 * 2. Perangkat Desa (id_jabatan = 1..8):
 *    [YYYYMMDD lahir (8)] [YYYYMM pelantikan (6)] [JK 1|2 (1)] [02 (2)] [Kode Jabatan 1..4 (1)] [Kode Wilayah 10 digit]
 *    - 1 = Sekretaris Desa
 *    - 2 = Kepala Seksi (Kasi)
 *    - 3 = Kepala Urusan (Kaur)
 *    - 4 = Kepala Kewilayahan (Kepala Dusun)
 * 3. Staf Perangkat Desa (id_jabatan = 9):
 *    [YYYYMMDD lahir (8)] [YYYYMM pelantikan (6)] [JK 1|2 (1)] [03 (2)] [1 (1)] [Kode Wilayah 10 digit]
 *
 * 10 digit terakhir Kode Wilayah Administrasi Pemerintahan Daerah:
 * - 2 digit Kode Provinsi
 * - 2 digit Kode Kabupaten/Kota
 * - 2 digit Kode Kecamatan
 * - 4 digit Kode Desa
 */
class NipdGeneratorService
{
    public const TYPE_KEPALA_DESA = 'kepala_desa';
    public const TYPE_PERANGKAT_DESA = 'perangkat_desa';
    public const TYPE_STAF_PERANGKAT_DESA = 'staf_perangkat_desa';

    public const ID_JABATAN_KEPALA_DESA = 10;
    public const ID_JABATAN_STAF_PERANGKAT_DESA = 9;

    public const DEFAULT_KODE_PROVINSI = '32';
    public const DEFAULT_KODE_KABUPATEN = '04';

    /**
     * Memvalidasi dan menormalkan kolom `periode` (INT 11):
     * - id_jabatan === 10 (Kepala Desa): wajib bernilai 1, 2, atau 3
     * - id_jabatan lainnya: selalu null
     *
     * @return array{valid: bool, value: ?int, message?: string}
     */
    public function validateAndNormalizePeriode(mixed $idJabatan, mixed $rawPeriode): array
    {
        $jId = (int) ($idJabatan ?? 0);
        if ($jId !== self::ID_JABATAN_KEPALA_DESA) {
            return ['valid' => true, 'value' => null];
        }

        if ($rawPeriode === null || trim((string) $rawPeriode) === '') {
            return [
                'valid'   => false,
                'value'   => null,
                'message' => 'Field periode wajib diisi (1, 2, atau 3) untuk jabatan Kepala Desa (id_jabatan = 10).',
            ];
        }

        if (!is_numeric($rawPeriode) || (int) $rawPeriode != $rawPeriode) {
            return [
                'valid'   => false,
                'value'   => null,
                'message' => 'Field periode Kepala Desa hanya boleh bernilai 1 (periode pertama), 2 (periode kedua), atau 3 (periode ketiga).',
            ];
        }

        $parsed = (int) $rawPeriode;
        if ($parsed < 1 || $parsed > 3) {
            return [
                'valid'   => false,
                'value'   => null,
                'message' => 'Field periode Kepala Desa hanya boleh bernilai 1 (periode pertama), 2 (periode kedua), atau 3 (periode ketiga).',
            ];
        }

        return ['valid' => true, 'value' => $parsed];
    }

    /**
     * Membentuk string NIPD 28 digit dari parameter terstruktur.
     *
     * @param  string|DateTimeInterface|null  $birthDate        Tanggal lahir (YYYY-MM-DD / DateTime)
     * @param  string|DateTimeInterface|null  $appointmentDate  Tanggal pengangkatan / TMT jabatan (YYYY-MM-DD / DateTime)
     * @param  string                         $gender           Jenis kelamin ('L'/'P'/'Laki-laki'/'Perempuan'/'1'/'2')
     * @param  string|null                    $userType         'Kepala Desa' | 'Perangkat' | 'Staf' (opsional, otomatis dideteksi dari $jabatanId)
     * @param  int|array{
     *     id_jabatan?: int|string|null,
     *     nama_jabatan?: string|null,
     *     kategori_jabatan?: string|null,
     *     periode?: int|string|null,
     *     kode_jabatan?: int|string|null
     * }|null $jabatanId                                        ID jabatan (int) atau array metadata jabatan
     * @param  string|array{
     *     provinsi?: string|null,
     *     kabupaten?: string|null,
     *     kecamatan?: string|null,
     *     desa?: string|null,
     *     kode_provinsi?: string|null,
     *     kode_kabupaten?: string|null,
     *     kode_kecamatan?: string|null,
     *     kode_desa?: string|null,
     *     id_kecamatan?: string|null,
     *     id_desa?: string|null
     * } $locationCodes                                         Kode wilayah 10 digit (string), array [prov, kab, kec, desa], atau associative array
     * @param  int|null                       $periode          Periodisasi Kepala Desa (1, 2, atau 3) — wajib bagi Kepala Desa
     * @param  bool                           $strictPeriode    Jika true, melempar InvalidArgumentException saat Kepala Desa tidak memiliki periode 1/2/3
     */
    public function generate(
        string|DateTimeInterface|null $birthDate,
        string|DateTimeInterface|null $appointmentDate,
        string $gender,
        ?string $userType = null,
        int|array|null $jabatanId = null,
        string|array $locationCodes = [],
        ?int $periode = null,
        bool $strictPeriode = false
    ): string {
        $jabatanInfo = is_array($jabatanId)
            ? $jabatanId
            : ($jabatanId !== null ? ['id_jabatan' => $jabatanId] : []);

        if ($periode !== null) {
            $jabatanInfo['periode'] = $periode;
        }

        $normalizedLocationCodes = is_array($locationCodes)
            ? $locationCodes
            : ['id_desa' => $locationCodes];

        // a. 8 digit pertama: Tahun, Bulan, Tanggal Lahir (YYYYMMDD)
        $lahirStr = $this->formatBirthDateSegment($birthDate);

        // b. 6 digit berikutnya: Tahun dan Bulan Pengangkatan/Pelantikan (YYYYMM)
        $tmtStr = $this->formatAppointmentSegment($appointmentDate);

        // c. 1 digit berikutnya: Jenis Kelamin (1 = Laki-laki, 2 = Perempuan)
        $jkCode = $this->resolveGenderCode($gender);

        // d & e. 2 digit kode unsur (01/02/03) + 1 digit periode / kode jabatan
        $resolvedType = $this->resolveUserType($userType, $jabatanInfo);
        [$unsurCode, $subCode] = $this->resolveUnsurAndSubCode($resolvedType, $jabatanInfo, $strictPeriode);

        // f. 10 digit terakhir: 2 Prov + 2 Kab/Kota + 2 Kec + 4 Desa
        $wilayahCode = $this->formatAdministrativeCode($normalizedLocationCodes);

        $nipd = "{$lahirStr}{$tmtStr}{$jkCode}{$unsurCode}{$subCode}{$wilayahCode}";

        if (strlen($nipd) !== 28 || !ctype_digit($nipd)) {
            throw new InvalidArgumentException("Hasil generate NIPD tidak valid (harus 28 digit angka): {$nipd}");
        }

        return $nipd;
    }

    /**
     * Menghasilkan NIPD 28 digit berjarak spasi siap tampil.
     */
    public function generateFormatted(
        string|DateTimeInterface|null $birthDate,
        string|DateTimeInterface|null $appointmentDate,
        string $gender,
        ?string $userType = null,
        int|array|null $jabatanId = null,
        string|array $locationCodes = [],
        ?int $periode = null,
        bool $strictPeriode = false
    ): string {
        $raw = $this->generate(
            $birthDate,
            $appointmentDate,
            $gender,
            $userType,
            $jabatanId,
            $locationCodes,
            $periode,
            $strictPeriode
        );

        return NipdFormatter::format($raw) ?? $raw;
    }

    /**
     * Adapter berbasis array asosiatif (kompatibel dengan PpdiHelperService::generateServerNIPD).
     */
    public function generateFromArray(array $params, bool $strictPeriode = false): string
    {
        $rawPeriode = $params['periode'] ?? null;
        $parsedPeriode = ($rawPeriode !== null && $rawPeriode !== '' && is_numeric($rawPeriode))
            ? (int) $rawPeriode
            : null;

        return $this->generate(
            birthDate: $params['tanggal_lahir'] ?? ($params['birth_date'] ?? null),
            appointmentDate: $params['tmt_jabatan'] ?? ($params['appointment_date'] ?? null),
            gender: (string) ($params['jenis_kelamin'] ?? ($params['gender'] ?? 'L')),
            userType: isset($params['user_type']) ? (string) $params['user_type'] : null,
            jabatanId: [
                'id_jabatan'       => $params['id_jabatan'] ?? null,
                'nama_jabatan'     => $params['nama_jabatan'] ?? null,
                'kategori_jabatan' => $params['kategori_jabatan'] ?? null,
                'periode'          => $parsedPeriode,
                'kode_jabatan'     => $params['kode_jabatan'] ?? null,
            ],
            locationCodes: [
                'provinsi'       => $params['provinsi'] ?? ($params['kode_provinsi'] ?? null),
                'kabupaten'      => $params['kabupaten'] ?? ($params['kode_kabupaten'] ?? null),
                'kecamatan'      => $params['kecamatan'] ?? ($params['kode_kecamatan'] ?? null),
                'desa'           => $params['desa'] ?? ($params['kode_desa'] ?? null),
                'id_kecamatan'   => $params['id_kecamatan'] ?? null,
                'id_desa'        => $params['id_desa'] ?? null,
            ],
            periode: $parsedPeriode,
            strictPeriode: $strictPeriode
        );
    }

    /**
     * Generate Massal NIPD 28 digit untuk seluruh atau sebagian data anggota.
     *
     * @param  array{
     *     mode?: 'only_empty'|'non_standard'|'all',
     *     member_ids?: array<int|string>,
     *     id_kecamatan?: string|null,
     *     id_desa?: string|null,
     *     id_jabatan?: int|string|null,
     *     default_kades_periode?: int|null,
     *     dry_run?: bool
     * } $options
     * @return array{
     *     dry_run: bool,
     *     mode: string,
     *     summary: array{total_scanned: int, eligible: int, updated: int, unchanged: int, skipped: int},
     *     items: array<int, array<string, mixed>>
     * }
     */
    public function generateBatch(array $options = []): array
    {
        $mode = in_array($options['mode'] ?? 'non_standard', ['only_empty', 'non_standard', 'all'], true)
            ? (string) ($options['mode'] ?? 'non_standard')
            : 'non_standard';
        $dryRun = (bool) ($options['dry_run'] ?? false);
        $memberIds = is_array($options['member_ids'] ?? null)
            ? array_values(array_filter(array_map('intval', $options['member_ids']), fn ($id) => $id > 0))
            : [];
        $idKecamatan = trim((string) ($options['id_kecamatan'] ?? ''));
        $idDesa = trim((string) ($options['id_desa'] ?? ''));
        $idJabatan = !empty($options['id_jabatan']) && strtolower((string) $options['id_jabatan']) !== 'all'
            ? (int) $options['id_jabatan']
            : null;
        $defaultKadesPeriode = isset($options['default_kades_periode']) && in_array((int) $options['default_kades_periode'], [1, 2, 3], true)
            ? (int) $options['default_kades_periode']
            : null;

        // Ambil daftar anggota beserta riwayat jabatan aktif (atau terbaru jika tidak ada yang aktif)
        $query = DB::table('anggota as a')
            ->leftJoin('riwayat_jabatan as r', function ($join) {
                $join->on('r.id_riwayat', '=', DB::raw(
                    "(SELECT r2.id_riwayat FROM riwayat_jabatan r2
                      WHERE r2.id_anggota = a.id_anggota
                      ORDER BY (r2.status_aktif = 'Aktif') DESC, r2.tmt_jabatan DESC, r2.id_riwayat DESC
                      LIMIT 1)"
                ));
            })
            ->leftJoin('ref_jabatan as j', 'j.id_jabatan', '=', 'r.id_jabatan')
            ->leftJoin('ref_desa as d', 'd.id_desa', '=', 'r.id_desa')
            ->leftJoin('ref_kecamatan as k', 'k.id_kecamatan', '=', 'd.id_kecamatan')
            ->select([
                'a.id_anggota',
                'a.nik',
                'a.nipd',
                'a.nama_lengkap',
                DB::raw("DATE_FORMAT(a.tanggal_lahir, '%Y-%m-%d') AS tanggal_lahir"),
                'a.jenis_kelamin',
                'r.id_riwayat',
                'r.id_desa',
                'r.id_jabatan',
                'r.periode',
                DB::raw("DATE_FORMAT(r.tmt_jabatan, '%Y-%m-%d') AS tmt_jabatan"),
                'j.nama_jabatan',
                'j.kategori_jabatan',
                'd.nama_desa',
                'd.id_kecamatan',
                'k.nama_kecamatan',
            ])
            ->orderBy('a.id_anggota');

        if (count($memberIds) > 0) {
            $query->whereIn('a.id_anggota', $memberIds);
        }

        if ($idDesa !== '' && strtolower($idDesa) !== 'all') {
            $cleanDesa = str_replace('.', '', $idDesa);
            $query->where(function ($q) use ($idDesa, $cleanDesa) {
                $q->where('r.id_desa', $idDesa)
                    ->orWhereRaw("REPLACE(r.id_desa, '.', '') = ?", [$cleanDesa]);
            });
        } elseif ($idKecamatan !== '' && strtolower($idKecamatan) !== 'all') {
            $cleanKec = str_replace('.', '', $idKecamatan);
            $query->where(function ($q) use ($idKecamatan, $cleanKec) {
                $q->where('d.id_kecamatan', $idKecamatan)
                    ->orWhereRaw("REPLACE(d.id_kecamatan, '.', '') = ?", [$cleanKec])
                    ->orWhereRaw("REPLACE(r.id_desa, '.', '') LIKE CONCAT(?, '%')", [$cleanKec]);
            });
        }

        if ($idJabatan !== null) {
            $query->where('r.id_jabatan', $idJabatan);
        }

        $rows = $query->get();

        $totalScanned = $rows->count();
        $eligible = 0;
        $updated = 0;
        $unchanged = 0;
        $skipped = 0;
        $items = [];
        $pendingUpdates = [];

        foreach ($rows as $row) {
            $currentNipdRaw = trim((string) ($row->nipd ?? ''));
            $currentNipdDigits = NipdFormatter::normalize($currentNipdRaw) ?? '';
            $isCurrentValid28 = strlen($currentNipdDigits) === 28 && ctype_digit($currentNipdDigits);

            if (empty($row->id_riwayat) || empty($row->id_jabatan) || empty($row->id_desa)) {
                $skipped++;
                $items[] = [
                    'id_anggota'         => (int) $row->id_anggota,
                    'nik'                => (string) $row->nik,
                    'nama_lengkap'       => (string) $row->nama_lengkap,
                    'id_jabatan'         => $row->id_jabatan ? (int) $row->id_jabatan : null,
                    'nama_jabatan'       => $row->nama_jabatan ?: '-',
                    'periode'            => $row->periode !== null ? (int) $row->periode : null,
                    'nama_desa'          => $row->nama_desa ?: '-',
                    'nama_kecamatan'     => $row->nama_kecamatan ?: '-',
                    'old_nipd'           => $currentNipdRaw,
                    'new_nipd'           => null,
                    'new_nipd_formatted' => null,
                    'status'             => 'skipped',
                    'reason'             => 'Riwayat jabatan atau desa penempatan belum lengkap.',
                ];
                continue;
            }

            $jId = (int) $row->id_jabatan;
            $effectivePeriode = $row->periode !== null ? (int) $row->periode : null;
            $needBackfillPeriode = false;

            if ($jId === self::ID_JABATAN_KEPALA_DESA) {
                $pCheck = $this->validateAndNormalizePeriode($jId, $effectivePeriode);
                if (!$pCheck['valid']) {
                    if ($defaultKadesPeriode !== null) {
                        $effectivePeriode = $defaultKadesPeriode;
                        $needBackfillPeriode = true;
                    } else {
                        $skipped++;
                        $items[] = [
                            'id_anggota'         => (int) $row->id_anggota,
                            'nik'                => (string) $row->nik,
                            'nama_lengkap'       => (string) $row->nama_lengkap,
                            'id_jabatan'         => $jId,
                            'nama_jabatan'       => $row->nama_jabatan ?: 'Kepala Desa',
                            'periode'            => null,
                            'nama_desa'          => $row->nama_desa ?: '-',
                            'nama_kecamatan'     => $row->nama_kecamatan ?: '-',
                            'old_nipd'           => $currentNipdRaw,
                            'new_nipd'           => null,
                            'new_nipd_formatted' => null,
                            'status'             => 'skipped',
                            'reason'             => 'Kepala Desa belum memiliki nilai periode (1/2/3). Isi periode pada riwayat jabatan atau aktifkan periode bawaan.',
                        ];
                        continue;
                    }
                } else {
                    $effectivePeriode = $pCheck['value'];
                }
            } else {
                $effectivePeriode = null;
            }

            $newNipd = $this->generateFromArray([
                'tanggal_lahir'    => $row->tanggal_lahir,
                'tmt_jabatan'      => $row->tmt_jabatan,
                'jenis_kelamin'    => $row->jenis_kelamin ?: 'L',
                'id_jabatan'       => $jId,
                'nama_jabatan'     => $row->nama_jabatan,
                'kategori_jabatan' => $row->kategori_jabatan,
                'periode'          => $effectivePeriode,
                'id_kecamatan'     => $row->id_kecamatan,
                'id_desa'          => $row->id_desa,
            ]);

            $shouldUpdate = match ($mode) {
                'only_empty'   => !$isCurrentValid28,
                'non_standard' => !$isCurrentValid28 || $currentNipdDigits !== $newNipd || $currentNipdRaw !== $newNipd,
                'all'          => true,
            };

            if (!$shouldUpdate) {
                $unchanged++;
                $items[] = [
                    'id_anggota'         => (int) $row->id_anggota,
                    'nik'                => (string) $row->nik,
                    'nama_lengkap'       => (string) $row->nama_lengkap,
                    'id_jabatan'         => $jId,
                    'nama_jabatan'       => $row->nama_jabatan ?: '-',
                    'periode'            => $effectivePeriode,
                    'nama_desa'          => $row->nama_desa ?: '-',
                    'nama_kecamatan'     => $row->nama_kecamatan ?: '-',
                    'old_nipd'           => $currentNipdRaw,
                    'new_nipd'           => $newNipd,
                    'new_nipd_formatted' => NipdFormatter::format($newNipd),
                    'status'             => 'unchanged',
                    'reason'             => 'NIPD sudah sesuai ketentuan 28 digit terbaru.',
                ];
                continue;
            }

            $eligible++;
            $pendingUpdates[] = [
                'id_anggota'       => (int) $row->id_anggota,
                'id_riwayat'       => (int) $row->id_riwayat,
                'new_nipd'         => $newNipd,
                'backfill_periode' => $needBackfillPeriode ? $effectivePeriode : null,
            ];

            $items[] = [
                'id_anggota'         => (int) $row->id_anggota,
                'nik'                => (string) $row->nik,
                'nama_lengkap'       => (string) $row->nama_lengkap,
                'id_jabatan'         => $jId,
                'nama_jabatan'       => $row->nama_jabatan ?: '-',
                'periode'            => $effectivePeriode,
                'nama_desa'          => $row->nama_desa ?: '-',
                'nama_kecamatan'     => $row->nama_kecamatan ?: '-',
                'old_nipd'           => $currentNipdRaw,
                'new_nipd'           => $newNipd,
                'new_nipd_formatted' => NipdFormatter::format($newNipd),
                'status'             => $dryRun ? 'will_update' : 'updated',
                'reason'             => $needBackfillPeriode
                    ? "NIPD diperbarui + periode Kepala Desa ditetapkan ke-{$effectivePeriode}."
                    : (!$isCurrentValid28 ? 'NIPD kosong/belum 28 digit.' : 'Penyesuaian ke aturan NIPD 28 digit terbaru.'),
            ];
        }

        if (!$dryRun && count($pendingUpdates) > 0) {
            DB::transaction(function () use ($pendingUpdates, &$updated) {
                foreach ($pendingUpdates as $upd) {
                    DB::table('anggota')
                        ->where('id_anggota', $upd['id_anggota'])
                        ->update(['nipd' => $upd['new_nipd']]);

                    if ($upd['backfill_periode'] !== null) {
                        DB::table('riwayat_jabatan')
                            ->where('id_riwayat', $upd['id_riwayat'])
                            ->update(['periode' => $upd['backfill_periode']]);
                    }

                    $updated++;
                }
            });
        }

        return [
            'dry_run' => $dryRun,
            'mode'    => $mode,
            'summary' => [
                'total_scanned' => $totalScanned,
                'eligible'      => $eligible,
                'updated'       => $updated,
                'unchanged'     => $unchanged,
                'skipped'       => $skipped,
            ],
            'items' => $items,
        ];
    }

    private function formatBirthDateSegment(string|DateTimeInterface|null $birthDate): string
    {
        if ($birthDate instanceof DateTimeInterface) {
            return $birthDate->format('Ymd');
        }
        if ($birthDate !== null && trim($birthDate) !== '') {
            $clean = (string) preg_replace('/[^0-9]/', '', $birthDate);
            if (strlen($clean) >= 8) {
                return substr($clean, 0, 8);
            }
            if (strlen($clean) === 6) {
                return $clean . '01';
            }
        }
        return '19900101';
    }

    private function formatAppointmentSegment(string|DateTimeInterface|null $appointmentDate): string
    {
        if ($appointmentDate instanceof DateTimeInterface) {
            return $appointmentDate->format('Ym');
        }
        if ($appointmentDate !== null && trim($appointmentDate) !== '') {
            $clean = (string) preg_replace('/[^0-9]/', '', $appointmentDate);
            if (strlen($clean) >= 6) {
                return substr($clean, 0, 6);
            }
            if (strlen($clean) >= 4) {
                return substr($clean, 0, 4) . '01';
            }
        }
        return '202001';
    }

    private function resolveGenderCode(string $gender): string
    {
        $g = strtoupper(trim($gender));
        return ($g === 'P' || $g === 'PEREMPUAN' || $g === '2') ? '2' : '1';
    }

    private function resolveUserType(?string $userType, array $jabatanInfo): string
    {
        if ($userType !== null && trim($userType) !== '') {
            $norm = strtolower(str_replace([' ', '-'], '_', trim($userType)));
            if (in_array($norm, [self::TYPE_KEPALA_DESA, 'kades', '01'], true)) {
                return self::TYPE_KEPALA_DESA;
            }
            if (in_array($norm, [self::TYPE_STAF_PERANGKAT_DESA, 'staf', 'staf_desa', '03'], true)) {
                return self::TYPE_STAF_PERANGKAT_DESA;
            }
            if (in_array($norm, [self::TYPE_PERANGKAT_DESA, 'perangkat', '02'], true)) {
                return self::TYPE_PERANGKAT_DESA;
            }
        }

        $jId = (int) ($jabatanInfo['id_jabatan'] ?? 0);
        $namaLower = strtolower((string) ($jabatanInfo['nama_jabatan'] ?? ''));
        $katLower = strtolower((string) ($jabatanInfo['kategori_jabatan'] ?? ''));

        if (
            $jId === self::ID_JABATAN_KEPALA_DESA
            || $katLower === 'kepala desa'
            || str_contains($namaLower, 'kepala desa')
            || str_contains($namaLower, 'kades')
        ) {
            return self::TYPE_KEPALA_DESA;
        }

        if (
            $jId === self::ID_JABATAN_STAF_PERANGKAT_DESA
            || $katLower === 'staf desa'
            || str_contains($namaLower, 'staf')
        ) {
            return self::TYPE_STAF_PERANGKAT_DESA;
        }

        return self::TYPE_PERANGKAT_DESA;
    }

    /**
     * @return array{0: string, 1: string} [2-digit unsur code, 1-digit sub code]
     */
    private function resolveUnsurAndSubCode(string $userType, array $jabatanInfo, bool $strictPeriode): array
    {
        if ($userType === self::TYPE_KEPALA_DESA) {
            $rawPeriode = $jabatanInfo['periode'] ?? null;
            $check = $this->validateAndNormalizePeriode(self::ID_JABATAN_KEPALA_DESA, $rawPeriode);
            if (!$check['valid']) {
                if ($strictPeriode) {
                    throw new InvalidArgumentException($check['message']);
                }
                return ['01', '1'];
            }
            return ['01', (string) $check['value']];
        }

        if ($userType === self::TYPE_STAF_PERANGKAT_DESA) {
            return ['03', '1'];
        }

        // Perangkat Desa (02): 1=Sekdes, 2=Kepala Seksi, 3=Kepala Urusan, 4=Kepala Kewilayahan
        if (isset($jabatanInfo['kode_jabatan']) && in_array((string) $jabatanInfo['kode_jabatan'], ['1', '2', '3', '4'], true)) {
            return ['02', (string) $jabatanInfo['kode_jabatan']];
        }

        $jId = (int) ($jabatanInfo['id_jabatan'] ?? 0);
        $namaLower = strtolower((string) ($jabatanInfo['nama_jabatan'] ?? ''));
        $katLower = strtolower((string) ($jabatanInfo['kategori_jabatan'] ?? ''));

        if ($jId === 1 || str_contains($namaLower, 'sekretaris desa') || str_contains($namaLower, 'sekdes')) {
            return ['02', '1'];
        }
        if (
            in_array($jId, [2, 3, 4], true)
            || $katLower === 'pelaksana teknis'
            || str_contains($namaLower, 'kepala seksi')
            || str_contains($namaLower, 'kasi')
        ) {
            return ['02', '2'];
        }
        if (
            in_array($jId, [5, 6, 7], true)
            || str_contains($namaLower, 'kepala urusan')
            || str_contains($namaLower, 'kaur')
        ) {
            return ['02', '3'];
        }
        if (
            $jId === 8
            || $katLower === 'pelaksana kewilayahan'
            || str_contains($namaLower, 'kepala dusun')
            || str_contains($namaLower, 'kadus')
            || str_contains($namaLower, 'kewilayahan')
        ) {
            return ['02', '4'];
        }

        return ['02', '2'];
    }

    private function formatAdministrativeCode(array $locationCodes): string
    {
        $lowerMap = [];
        foreach ($locationCodes as $key => $val) {
            if (is_string($key)) {
                $lowerMap[strtolower(trim($key))] = $val;
            }
        }

        $isPositionalList = array_is_list($locationCodes) && count($locationCodes) >= 4;

        $rawProv = $lowerMap['provinsi'] ?? $lowerMap['kode_provinsi'] ?? ($isPositionalList ? $locationCodes[0] : '');
        $rawKab = $lowerMap['kabupaten'] ?? $lowerMap['kode_kabupaten'] ?? ($isPositionalList ? $locationCodes[1] : '');
        $rawKec = $lowerMap['kecamatan'] ?? $lowerMap['kode_kecamatan'] ?? $lowerMap['id_kecamatan'] ?? ($isPositionalList ? $locationCodes[2] : '');
        $rawDesa = $lowerMap['desa'] ?? $lowerMap['kode_desa'] ?? $lowerMap['id_desa'] ?? ($isPositionalList ? $locationCodes[3] : '');

        $cleanProv = (string) preg_replace('/[^0-9]/', '', (string) $rawProv);
        $cleanKab = (string) preg_replace('/[^0-9]/', '', (string) $rawKab);
        $cleanKec = (string) preg_replace('/[^0-9]/', '', (string) $rawKec);
        $cleanDesa = (string) preg_replace('/[^0-9]/', '', (string) $rawDesa);

        // 2 digit Provinsi
        if (strlen($cleanProv) >= 2) {
            $prov = substr($cleanProv, 0, 2);
        } elseif (strlen($cleanDesa) >= 10) {
            $prov = substr($cleanDesa, 0, 2);
        } elseif (strlen($cleanKec) >= 6) {
            $prov = substr($cleanKec, 0, 2);
        } else {
            $prov = self::DEFAULT_KODE_PROVINSI;
        }

        // 2 digit Kabupaten/Kota
        if (strlen($cleanKab) >= 4) {
            $kab = substr($cleanKab, 2, 2);
        } elseif (strlen($cleanKab) >= 2) {
            $kab = substr($cleanKab, 0, 2);
        } elseif (strlen($cleanDesa) >= 10) {
            $kab = substr($cleanDesa, 2, 2);
        } elseif (strlen($cleanKec) >= 6) {
            $kab = substr($cleanKec, 2, 2);
        } else {
            $kab = self::DEFAULT_KODE_KABUPATEN;
        }

        // 2 digit Kecamatan
        if (strlen($cleanKec) >= 6) {
            $kec = substr($cleanKec, 4, 2);
        } elseif (strlen($cleanDesa) >= 10) {
            $kec = substr($cleanDesa, 4, 2);
        } elseif (strlen($cleanKec) >= 2) {
            $kec = substr($cleanKec, -2);
        } elseif (strlen($cleanKec) === 1) {
            $kec = str_pad($cleanKec, 2, '0', STR_PAD_LEFT);
        } else {
            $kec = '01';
        }

        // 4 digit Desa
        if (strlen($cleanDesa) >= 10) {
            $desa = substr($cleanDesa, 6, 4);
        } elseif (strlen($cleanDesa) >= 4) {
            $desa = substr($cleanDesa, -4);
        } elseif (strlen($cleanDesa) > 0) {
            $desa = str_pad($cleanDesa, 4, '0', STR_PAD_LEFT);
        } else {
            $desa = '0001';
        }

        return "{$prov}{$kab}{$kec}{$desa}";
    }
}
