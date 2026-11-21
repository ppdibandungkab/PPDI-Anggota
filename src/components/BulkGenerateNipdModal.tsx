import React, { useState, useMemo, useEffect } from 'react';
import ExcelJS from 'exceljs';
import {
  X,
  Hash,
  Sparkles,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Download,
  Search,
  Play,
  Eye,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { usePPDI } from '../context/PPDIContext';
import { AnggotaFullDetail } from '../types/ppdi';
import { formatNIPDDisplay } from '../utils/ppdiHelpers';

interface BulkGenerateNipdModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedMembers?: AnggotaFullDetail[];
  initialKecamatan?: string;
  initialDesa?: string;
  initialJabatan?: string;
  onComplete?: (summary: { updated: number; unchanged: number; skipped: number }) => void;
}

type BulkMode = 'non_standard' | 'only_empty' | 'all';
type StatusFilter = 'all' | 'actionable' | 'unchanged' | 'skipped';

interface BulkPreviewItem {
  id_anggota: number;
  nik: string;
  nama_lengkap: string;
  id_jabatan: number | null;
  nama_jabatan: string;
  periode: number | null;
  nama_desa: string;
  nama_kecamatan: string;
  old_nipd: string;
  new_nipd: string | null;
  new_nipd_formatted: string | null;
  status: 'will_update' | 'updated' | 'unchanged' | 'skipped';
  reason: string;
}

interface BulkResultState {
  dryRun: boolean;
  mode: string;
  summary: {
    totalScanned: number;
    eligible: number;
    updated: number;
    unchanged: number;
    skipped: number;
  };
  items: BulkPreviewItem[];
  message: string;
}

export const BulkGenerateNipdModal: React.FC<BulkGenerateNipdModalProps> = ({
  isOpen,
  onClose,
  selectedMembers = [],
  initialKecamatan = 'all',
  initialDesa = 'all',
  initialJabatan = 'all',
  onComplete,
}) => {
  const { kecamatanList, desaList, jabatanList, currentUser, bulkGenerateNipd } = usePPDI();

  const [scope, setScope] = useState<'selected' | 'filter'>(
    selectedMembers.length > 0 ? 'selected' : 'filter'
  );
  const [filterKecamatan, setFilterKecamatan] = useState<string>(initialKecamatan);
  const [filterDesa, setFilterDesa] = useState<string>(initialDesa);
  const [filterJabatan, setFilterJabatan] = useState<string>(initialJabatan);
  const [mode, setMode] = useState<BulkMode>('non_standard');
  const [defaultKadesPeriode, setDefaultKadesPeriode] = useState<string>('');

  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<BulkResultState | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [tableSearch, setTableSearch] = useState('');

  // Sync defaults whenever modal opens
  useEffect(() => {
    if (!isOpen) return;
    setScope(selectedMembers.length > 0 ? 'selected' : 'filter');
    setFilterKecamatan(
      currentUser.role === 'Admin_Kecamatan' && currentUser.id_kecamatan
        ? currentUser.id_kecamatan
        : initialKecamatan
    );
    setFilterDesa(
      currentUser.role === 'Admin_Desa' && currentUser.id_desa
        ? currentUser.id_desa
        : initialDesa
    );
    setFilterJabatan(initialJabatan);
    setErrorMsg(null);
    setResult(null);
    setStatusFilter('all');
    setTableSearch('');
  }, [isOpen, selectedMembers.length, initialKecamatan, initialDesa, initialJabatan, currentUser]);

  const filteredDesaOptions = useMemo(() => {
    if (filterKecamatan === 'all') return desaList;
    return desaList.filter((d) => d.id_kecamatan === filterKecamatan);
  }, [desaList, filterKecamatan]);

  const buildRequestPayload = (dryRun: boolean) => {
    const parsedDefault =
      defaultKadesPeriode === '1' || defaultKadesPeriode === '2' || defaultKadesPeriode === '3'
        ? (Number(defaultKadesPeriode) as 1 | 2 | 3)
        : null;

    if (scope === 'selected' && selectedMembers.length > 0) {
      return {
        mode,
        memberIds: selectedMembers.map((m) => m.anggota.id_anggota),
        defaultKadesPeriode: parsedDefault,
        dryRun,
      };
    }

    return {
      mode,
      id_kecamatan: filterKecamatan !== 'all' ? filterKecamatan : undefined,
      id_desa: filterDesa !== 'all' ? filterDesa : undefined,
      id_jabatan: filterJabatan !== 'all' ? filterJabatan : undefined,
      defaultKadesPeriode: parsedDefault,
      dryRun,
    };
  };

  const handleRunPreview = async () => {
    setErrorMsg(null);
    setIsLoadingPreview(true);
    try {
      const res = await bulkGenerateNipd(buildRequestPayload(true));
      setResult(res);
      setStatusFilter(res.summary.eligible > 0 ? 'actionable' : 'all');
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal melakukan simulasi Generate Massal NIPD.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleExecuteCommit = async () => {
    setErrorMsg(null);
    setIsExecuting(true);
    try {
      const res = await bulkGenerateNipd(buildRequestPayload(false));
      setResult(res);
      setStatusFilter('all');
      if (onComplete) {
        onComplete({
          updated: res.summary.updated,
          unchanged: res.summary.unchanged,
          skipped: res.summary.skipped,
        });
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan hasil Generate Massal NIPD ke database.');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleExportReport = async () => {
    if (!result || result.items.length === 0) return;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Hasil Generate Massal NIPD');

    sheet.columns = [
      { header: 'ID Anggota', key: 'id_anggota', width: 12 },
      { header: 'NIK', key: 'nik', width: 20 },
      { header: 'Nama Lengkap', key: 'nama_lengkap', width: 28 },
      { header: 'Jabatan', key: 'nama_jabatan', width: 24 },
      { header: 'Periode Kades', key: 'periode', width: 14 },
      { header: 'Desa', key: 'nama_desa', width: 20 },
      { header: 'Kecamatan', key: 'nama_kecamatan', width: 20 },
      { header: 'NIPD Lama', key: 'old_nipd', width: 32 },
      { header: 'NIPD Baru (28 Digit)', key: 'new_nipd', width: 32 },
      { header: 'NIPD Baru (Format Spasi)', key: 'new_nipd_formatted', width: 36 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Keterangan', key: 'reason', width: 42 },
    ];

    result.items.forEach((item) => {
      sheet.addRow({
        id_anggota: item.id_anggota,
        nik: item.nik,
        nama_lengkap: item.nama_lengkap,
        nama_jabatan: item.nama_jabatan,
        periode: item.periode ?? '-',
        nama_desa: item.nama_desa,
        nama_kecamatan: item.nama_kecamatan,
        old_nipd: item.old_nipd || '-',
        new_nipd: item.new_nipd || '-',
        new_nipd_formatted: item.new_nipd_formatted || '-',
        status:
          item.status === 'updated'
            ? 'Diperbarui'
            : item.status === 'will_update'
              ? 'Siap Diperbarui'
              : item.status === 'unchanged'
                ? 'Sudah Sesuai'
                : 'Dilewati',
        reason: item.reason,
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateSlug = new Date().toISOString().split('T')[0];
    a.download = `LAPORAN_GENERATE_MASSAL_NIPD_${dateSlug}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const displayedItems = useMemo(() => {
    if (!result) return [];
    const q = tableSearch.trim().toLowerCase();
    return result.items.filter((item) => {
      if (statusFilter === 'actionable' && item.status !== 'will_update' && item.status !== 'updated') {
        return false;
      }
      if (statusFilter === 'unchanged' && item.status !== 'unchanged') {
        return false;
      }
      if (statusFilter === 'skipped' && item.status !== 'skipped') {
        return false;
      }
      if (q) {
        const hay = `${item.nama_lengkap} ${item.nik} ${item.nama_desa} ${item.nama_kecamatan} ${item.nama_jabatan} ${item.old_nipd} ${item.new_nipd || ''}`.toLowerCase();
        return hay.includes(q);
      }
      return true;
    });
  }, [result, statusFilter, tableSearch]);

  if (!isOpen) return null;

  const isBusy = isLoadingPreview || isExecuting;
  const actionableCount = result ? (result.dryRun ? result.summary.eligible : result.summary.updated) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-[#111113]/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[92vh] flex flex-col my-4 border border-[#111113]/15 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#F8F7F4] border-b border-[#111113]/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#064E3B] text-amber-300 flex items-center justify-center shadow-xs">
              <Hash className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[#064E3B] font-bold text-[11px] uppercase tracking-wider">
                GENERATOR MASSAL NIPD 28 DIGIT
              </div>
              <h2 className="text-base sm:text-lg font-bold text-[#111113] tracking-tight">
                Generate & Standarisasi Massal NIPD Perangkat Desa
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="p-1.5 text-[#111113]/50 hover:text-[#111113] hover:bg-neutral-200/50 rounded-lg transition-colors cursor-pointer disabled:opacity-40"
            title="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-xs">
          {/* Rules Info Banner */}
          <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-emerald-950">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>Ketentuan Struktur NIPD 28 Digit Resmi</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] text-emerald-900">
              <div className="bg-white/80 rounded-lg px-2.5 py-1.5 border border-emerald-200/70">
                <strong className="text-emerald-950">1. Kepala Desa (01P):</strong>
                <div className="font-mono text-[10px] text-emerald-800 mt-0.5">
                  YYYYMMDD · YYYYMM · JK · 01[1/2/3] · 10-Wilayah
                </div>
              </div>
              <div className="bg-white/80 rounded-lg px-2.5 py-1.5 border border-emerald-200/70">
                <strong className="text-emerald-950">2. Perangkat Desa (02X):</strong>
                <div className="font-mono text-[10px] text-emerald-800 mt-0.5">
                  021 Sekdes · 022 Kasi · 023 Kaur · 024 Kewilayahan
                </div>
              </div>
              <div className="bg-white/80 rounded-lg px-2.5 py-1.5 border border-emerald-200/70">
                <strong className="text-emerald-950">3. Staf Perangkat Desa (031):</strong>
                <div className="font-mono text-[10px] text-emerald-800 mt-0.5">
                  YYYYMMDD · YYYYMM · JK · 031 · 10-Wilayah
                </div>
              </div>
            </div>
          </div>

          {/* Configuration Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-[#F8F7F4] p-4 rounded-xl border border-neutral-200">
            {/* Target Scope */}
            <div className="lg:col-span-5 space-y-2.5">
              <label className="block font-bold text-neutral-800 text-[11px] uppercase tracking-wider">
                1. Cakupan Target Anggota
              </label>
              <div className="flex gap-2">
                {selectedMembers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setScope('selected');
                      setResult(null);
                    }}
                    className={`flex-1 px-3 py-2 rounded-lg border font-semibold text-xs cursor-pointer transition-colors ${
                      scope === 'selected'
                        ? 'bg-[#064E3B] text-white border-[#064E3B]'
                        : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
                    }`}
                  >
                    Tercentang ({selectedMembers.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setScope('filter');
                    setResult(null);
                  }}
                  className={`flex-1 px-3 py-2 rounded-lg border font-semibold text-xs cursor-pointer transition-colors ${
                    scope === 'filter'
                      ? 'bg-[#064E3B] text-white border-[#064E3B]'
                      : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
                  }`}
                >
                  Berdasarkan Filter Wilayah & Jabatan
                </button>
              </div>

              {scope === 'filter' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  <select
                    value={filterKecamatan}
                    disabled={currentUser.role === 'Admin_Kecamatan' || currentUser.role === 'Admin_Desa'}
                    onChange={(e) => {
                      setFilterKecamatan(e.target.value);
                      setFilterDesa('all');
                      setResult(null);
                    }}
                    className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs disabled:bg-neutral-100"
                  >
                    <option value="all">Semua Kecamatan</option>
                    {kecamatanList.map((k) => (
                      <option key={k.id_kecamatan} value={k.id_kecamatan}>
                        {k.nama_kecamatan}
                      </option>
                    ))}
                  </select>

                  <select
                    value={filterDesa}
                    disabled={currentUser.role === 'Admin_Desa'}
                    onChange={(e) => {
                      setFilterDesa(e.target.value);
                      setResult(null);
                    }}
                    className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs disabled:bg-neutral-100"
                  >
                    <option value="all">Semua Desa</option>
                    {filteredDesaOptions.map((d) => (
                      <option key={d.id_desa} value={d.id_desa}>
                        {d.nama_desa}
                      </option>
                    ))}
                  </select>

                  <select
                    value={filterJabatan}
                    onChange={(e) => {
                      setFilterJabatan(e.target.value);
                      setResult(null);
                    }}
                    className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs"
                  >
                    <option value="all">Semua Jabatan</option>
                    {jabatanList.map((j) => (
                      <option key={j.id_jabatan} value={String(j.id_jabatan)}>
                        {j.nama_jabatan}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Mode Pembaruan */}
            <div className="lg:col-span-4 space-y-2">
              <label className="block font-bold text-neutral-800 text-[11px] uppercase tracking-wider">
                2. Mode Pembaruan NIPD
              </label>
              <select
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value as BulkMode);
                  setResult(null);
                }}
                className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-xs font-medium text-neutral-900"
              >
                <option value="non_standard">
                  Sesuaikan ke Format 28 Digit Resmi Terbaru (Rekomendasi)
                </option>
                <option value="only_empty">
                  Hanya NIPD Kosong atau Belum 28 Digit
                </option>
                <option value="all">
                  Regenerate Paksa Semua Data Target
                </option>
              </select>
              <p className="text-[11px] text-neutral-500 leading-snug">
                {mode === 'non_standard' &&
                  'Memperbarui NIPD yang kosong, bukan 28 digit, maupun format lama yang belum sesuai aturan 01P/02X/031.'}
                {mode === 'only_empty' &&
                  'Hanya mengisi anggota yang belum memiliki NIPD 28 digit; NIPD 28 digit eksisting dibiarkan.'}
                {mode === 'all' &&
                  'Menghitung ulang dan menimpa NIPD seluruh anggota dalam cakupan target.'}
              </p>
            </div>

            {/* Periode Kades Fallback */}
            <div className="lg:col-span-3 space-y-2">
              <label className="block font-bold text-neutral-800 text-[11px] uppercase tracking-wider">
                3. Kades Tanpa Periode
              </label>
              <select
                value={defaultKadesPeriode}
                onChange={(e) => {
                  setDefaultKadesPeriode(e.target.value);
                  setResult(null);
                }}
                className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-xs font-medium text-neutral-900"
              >
                <option value="">Lewati jika periode kosong (Aman)</option>
                <option value="1">Tetapkan Periode Ke-1 otomatis</option>
                <option value="2">Tetapkan Periode Ke-2 otomatis</option>
                <option value="3">Tetapkan Periode Ke-3 otomatis</option>
              </select>
              <p className="text-[11px] text-neutral-500 leading-snug">
                Khusus Kepala Desa (<code className="font-mono">id_jabatan = 10</code>) yang kolom periodenya masih kosong.
              </p>
            </div>
          </div>

          {/* Action Trigger Row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleRunPreview}
              disabled={isBusy}
              className="px-4 py-2 bg-[#064E3B] hover:bg-[#043d2e] disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center gap-2 shadow-xs cursor-pointer transition-colors"
            >
              {isLoadingPreview ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Eye className="w-4 h-4 text-amber-300" />
              )}
              <span>
                {isLoadingPreview ? 'Memindai Data Anggota...' : 'Jalankan Simulasi & Pratinjau'}
              </span>
            </button>

            {result && result.items.length > 0 && (
              <button
                type="button"
                onClick={handleExportReport}
                className="px-3.5 py-2 bg-white hover:bg-neutral-50 text-neutral-800 border border-neutral-300 font-semibold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-emerald-700" />
                <span>Unduh Laporan Excel (.xlsx)</span>
              </button>
            )}
          </div>

          {/* Error Alert */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span className="font-medium">{errorMsg}</span>
            </div>
          )}

          {/* Result Section */}
          {result && (
            <div className="space-y-4">
              {/* Status Banner */}
              <div
                className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                  result.dryRun
                    ? 'bg-amber-50/80 border-amber-300 text-amber-950'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-950'
                }`}
              >
                <div className="flex items-center gap-2">
                  {result.dryRun ? (
                    <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  )}
                  <span className="font-semibold">{result.message}</span>
                </div>
                <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold uppercase bg-white/80 border border-current/20 shrink-0">
                  {result.dryRun ? 'Mode Pratinjau' : 'Tersimpan di MySQL'}
                </span>
              </div>

              {/* KPI Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl border border-neutral-200 bg-white">
                  <div className="text-[11px] text-neutral-500 font-medium">Total Dipindai</div>
                  <div className="text-xl font-extrabold text-neutral-900 mt-0.5">
                    {result.summary.totalScanned}
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/60">
                  <div className="text-[11px] text-emerald-800 font-medium">
                    {result.dryRun ? 'Akan Diperbarui' : 'Berhasil Diperbarui'}
                  </div>
                  <div className="text-xl font-extrabold text-emerald-800 mt-0.5">
                    {actionableCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50">
                  <div className="text-[11px] text-neutral-600 font-medium">Sudah Sesuai</div>
                  <div className="text-xl font-extrabold text-neutral-700 mt-0.5">
                    {result.summary.unchanged}
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/60">
                  <div className="text-[11px] text-amber-800 font-medium">Dilewati</div>
                  <div className="text-xl font-extrabold text-amber-800 mt-0.5">
                    {result.summary.skipped}
                  </div>
                </div>
              </div>

              {/* Filter & Search Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="inline-flex rounded-lg border border-neutral-200 p-0.5 bg-neutral-100 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                      statusFilter === 'all' ? 'bg-white text-neutral-900 shadow-2xs' : 'text-neutral-600'
                    }`}
                  >
                    Semua ({result.items.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('actionable')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                      statusFilter === 'actionable'
                        ? 'bg-emerald-700 text-white shadow-2xs'
                        : 'text-emerald-800'
                    }`}
                  >
                    {result.dryRun ? 'Akan Diperbarui' : 'Diperbarui'} ({actionableCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('unchanged')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                      statusFilter === 'unchanged'
                        ? 'bg-neutral-700 text-white shadow-2xs'
                        : 'text-neutral-600'
                    }`}
                  >
                    Sesuai ({result.summary.unchanged})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('skipped')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                      statusFilter === 'skipped'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'text-amber-800'
                    }`}
                  >
                    Dilewati ({result.summary.skipped})
                  </button>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    placeholder="Cari nama, NIK, desa, NIPD..."
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-neutral-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              {/* Preview Table */}
              <div className="border border-neutral-200 rounded-xl overflow-hidden">
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-[#F8F7F4] border-b border-neutral-200 sticky top-0 z-10 text-[11px] text-neutral-700">
                      <tr>
                        <th className="py-2.5 px-3 font-bold">Anggota & Jabatan</th>
                        <th className="py-2.5 px-3 font-bold">Desa / Kec</th>
                        <th className="py-2.5 px-3 font-bold">NIPD Lama</th>
                        <th className="py-2.5 px-3 font-bold">NIPD Baru (28 Digit)</th>
                        <th className="py-2.5 px-3 font-bold">Status & Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {displayedItems.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-neutral-400">
                            Tidak ada data untuk filter ini.
                          </td>
                        </tr>
                      ) : (
                        displayedItems.slice(0, 200).map((item) => (
                          <tr
                            key={item.id_anggota}
                            className={`hover:bg-neutral-50 ${
                              item.status === 'skipped' ? 'bg-amber-50/40' : ''
                            }`}
                          >
                            <td className="py-2 px-3">
                              <div className="font-bold text-neutral-900">{item.nama_lengkap}</div>
                              <div className="text-[10px] text-neutral-500 flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono">{item.nik}</span>
                                <span>·</span>
                                <span className="font-medium text-neutral-700">{item.nama_jabatan}</span>
                                {item.id_jabatan === 10 && item.periode && (
                                  <span className="px-1.5 py-0.2 bg-amber-100 text-amber-900 rounded font-semibold">
                                    Periode Ke-{item.periode}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-neutral-700">
                              <div className="font-medium">{item.nama_desa}</div>
                              <div className="text-[10px] text-neutral-400">{item.nama_kecamatan}</div>
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-neutral-500">
                              {item.old_nipd ? formatNIPDDisplay(item.old_nipd) : <span className="italic text-neutral-400">(Kosong)</span>}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] font-semibold text-emerald-900">
                              {item.new_nipd_formatted ? (
                                <span className="inline-flex items-center gap-1">
                                  {(item.status === 'will_update' || item.status === 'updated') && (
                                    <ArrowRight className="w-3 h-3 text-emerald-600 shrink-0" />
                                  )}
                                  <span>{item.new_nipd_formatted}</span>
                                </span>
                              ) : (
                                <span className="text-neutral-400">-</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-[11px]">
                              {item.status === 'updated' && (
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  Diperbarui
                                </span>
                              )}
                              {item.status === 'will_update' && (
                                <span className="inline-flex items-center gap-1 text-emerald-800 font-bold">
                                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                  Siap Diperbarui
                                </span>
                              )}
                              {item.status === 'unchanged' && (
                                <span className="text-neutral-500 font-semibold">Sudah Sesuai</span>
                              )}
                              {item.status === 'skipped' && (
                                <span className="inline-flex items-center gap-1 text-amber-800 font-bold">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                  Dilewati
                                </span>
                              )}
                              <div className="text-[10px] text-neutral-500 mt-0.5">{item.reason}</div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {displayedItems.length > 200 && (
                  <div className="px-3 py-2 bg-neutral-50 border-t border-neutral-200 text-[11px] text-neutral-500 text-center">
                    Menampilkan 200 dari {displayedItems.length} baris. Unduh Laporan Excel untuk melihat seluruh daftar.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#F8F7F4] border-t border-[#111113]/10">
          <div className="text-[11px] text-neutral-500">
            {result ? (
              <span>
                Dipindai: <strong>{result.summary.totalScanned}</strong> ·{' '}
                {result.dryRun ? 'Siap Update' : 'Diperbarui'}:{' '}
                <strong className="text-emerald-700">{actionableCount}</strong> · Dilewati:{' '}
                <strong className="text-amber-700">{result.summary.skipped}</strong>
              </span>
            ) : (
              <span>Klik &ldquo;Jalankan Simulasi &amp; Pratinjau&rdquo; terlebih dahulu sebelum menyimpan ke database.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              className="px-4 py-2 text-xs font-semibold text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg cursor-pointer transition-colors"
            >
              {result && !result.dryRun ? 'Selesai & Tutup' : 'Batal'}
            </button>

            {result && result.dryRun && result.summary.eligible > 0 && (
              <button
                type="button"
                disabled={isBusy}
                onClick={handleExecuteCommit}
                className="px-5 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 rounded-lg shadow-sm flex items-center gap-2 cursor-pointer transition-colors"
              >
                {isExecuting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Menyimpan {result.summary.eligible} NIPD...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Terapkan &amp; Simpan {result.summary.eligible} NIPD ke MySQL</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
