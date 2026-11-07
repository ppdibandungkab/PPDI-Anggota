import React, { useState, useMemo } from 'react';
import { usePPDI } from '../context/PPDIContext';
import { ActivityLogEntry, AksiLog } from '../types/ppdi';
import {
  History,
  Search,
  Filter,
  Download,
  Trash2,
  RefreshCw,
  Eye,
  UserCheck,
  PlusCircle,
  Edit,
  AlertTriangle,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  UploadCloud,
  CreditCard,
  X,
  Calendar,
  ShieldAlert,
} from 'lucide-react';

export const LogAktivitasView: React.FC = () => {
  const { activityLogs, clearActivityLogs, currentUser, hasPermission } = usePPDI();

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAksi, setSelectedAksi] = useState<string>('all');
  const [selectedModul, setSelectedModul] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7days' | '30days'>('all');

  // Modal inspection
  const [selectedLog, setSelectedLog] = useState<ActivityLogEntry | null>(null);
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);

  const isSuperadmin = currentUser?.role === 'Superadmin_Kabupaten';

  // Filter logic
  const filteredLogs = useMemo(() => {
    let result = [...activityLogs];

    // Search query filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(
        (log) =>
          log.user_name.toLowerCase().includes(q) ||
          (log.target_nama && log.target_nama.toLowerCase().includes(q)) ||
          (log.target_id && log.target_id.toLowerCase().includes(q)) ||
          log.deskripsi.toLowerCase().includes(q) ||
          log.modul.toLowerCase().includes(q)
      );
    }

    // Aksi type filter
    if (selectedAksi !== 'all') {
      result = result.filter((log) => log.aksi === selectedAksi);
    }

    // Modul filter
    if (selectedModul !== 'all') {
      result = result.filter((log) => log.modul === selectedModul);
    }

    // Date range filter
    if (dateFilter !== 'all') {
      const now = new Date();
      result = result.filter((log) => {
        try {
          // Parse ISO or DD/MM/YYYY, HH:mm:ss format
          let logDate: Date;
          if (log.timestamp.includes('/')) {
            const parts = log.timestamp.split(',');
            const dateParts = parts[0].trim().split('/');
            logDate = new Date(Number(dateParts[2]), Number(dateParts[1]) - 1, Number(dateParts[0]));
          } else {
            logDate = new Date(log.timestamp);
          }

          const diffTime = Math.abs(now.getTime() - logDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (dateFilter === 'today') return diffDays <= 1;
          if (dateFilter === '7days') return diffDays <= 7;
          if (dateFilter === '30days') return diffDays <= 30;
        } catch (_) {
          return true;
        }
        return true;
      });
    }

    return result;
  }, [activityLogs, searchTerm, selectedAksi, selectedModul, dateFilter]);

  // Statistics breakdown
  const stats = useMemo(() => {
    const total = activityLogs.length;
    const tambah = activityLogs.filter((l) => l.aksi === 'TAMBAH' || l.aksi === 'APPROVE' || l.aksi === 'IMPORT').length;
    const edit = activityLogs.filter((l) => l.aksi === 'EDIT' || l.aksi === 'STATUS_KTA').length;
    const hapus = activityLogs.filter((l) => l.aksi === 'HAPUS' || l.aksi === 'REJECT').length;
    return { total, tambah, edit, hapus };
  }, [activityLogs]);

  // Unique list of modules for dropdown filter
  const modulOptions = useMemo(() => {
    const setMod = new Set<string>();
    activityLogs.forEach((l) => setMod.add(l.modul));
    return Array.from(setMod);
  }, [activityLogs]);

  // Badge render helper for Aksi
  const renderAksiBadge = (aksi: AksiLog) => {
    switch (aksi) {
      case 'TAMBAH':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <PlusCircle className="w-3 h-3 text-emerald-600" />
            <span>TAMBAH DATA</span>
          </span>
        );
      case 'APPROVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>APPROVAL</span>
          </span>
        );
      case 'IMPORT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
            <UploadCloud className="w-3 h-3 text-blue-600" />
            <span>IMPOR EXCEL</span>
          </span>
        );
      case 'EDIT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
            <Edit className="w-3 h-3 text-amber-700" />
            <span>EDIT DATA</span>
          </span>
        );
      case 'STATUS_KTA':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
            <CreditCard className="w-3 h-3 text-amber-700" />
            <span>STATUS KTA</span>
          </span>
        );
      case 'HAPUS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <Trash2 className="w-3 h-3 text-rose-600" />
            <span>HAPUS DATA</span>
          </span>
        );
      case 'REJECT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <XCircle className="w-3 h-3 text-rose-600" />
            <span>PENOLAKAN</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-800 border border-neutral-300">
            <span>{aksi}</span>
          </span>
        );
    }
  };

  // CSV Export for Audit Logs with full metadata & audit trail details
  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const handleExportCSV = () => {
    if (filteredLogs.length === 0) {
      alert('Tidak ada data log aktivitas yang cocok dengan filter untuk diekspor.');
      return;
    }

    try {
      setIsExporting(true);

      const headers = [
        'ID Log',
        'Waktu Timestamp',
        'User Admin',
        'User ID',
        'Peran User',
        'Tipe Aksi',
        'Modul Sistem',
        'Target ID',
        'Target Nama',
        'Deskripsi Lengkap',
        'Data Sebelum (Snapshot)',
        'Data Sesudah (Snapshot)',
        'IP Address',
      ];

      const rows = filteredLogs.map((log) => {
        const safeString = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;
        const dataSebelumStr = log.data_sebelum ? JSON.stringify(log.data_sebelum) : '-';
        const dataSesudahStr = log.data_sesudah ? JSON.stringify(log.data_sesudah) : '-';

        return [
          safeString(log.id),
          safeString(log.timestamp),
          safeString(log.user_name),
          safeString(log.user_id || '-'),
          safeString(log.user_role),
          safeString(log.aksi),
          safeString(log.modul),
          safeString(log.target_id || '-'),
          safeString(log.target_nama || '-'),
          safeString(log.deskripsi || '-'),
          safeString(dataSebelumStr),
          safeString(dataSesudahStr),
          safeString(log.ip_address || '-'),
        ];
      });

      const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\r\n');
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      link.setAttribute('download', `Audit_Log_Aktivitas_PPDI_Kab_Bandung_${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportNotice(`Berhasil mengekspor ${filteredLogs.length} entri log aktivitas audit ke format CSV.`);
      setTimeout(() => setExportNotice(null), 4000);
    } catch (err: any) {
      alert('Gagal mengekspor berkas CSV: ' + (err.message || 'Error'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-950 text-amber-400 flex items-center justify-center shrink-0 shadow-md border border-emerald-800">
            <History className="w-6 h-6 text-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-neutral-900 tracking-tight uppercase">
                Log Aktivitas & Audit Jejak Perubahan Data
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                AUDIT LOG ACTIVE
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-1 max-w-2xl">
              Histori resmi pencatatan audit setiap aksi penambahan, pengubahan, dan penghapusan data anggota
              oleh pengurus & administrator PPDI Kabupaten Bandung.
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={isExporting}
            className="px-4 py-2 text-xs font-bold text-neutral-700 bg-white hover:bg-neutral-50 border border-neutral-300 rounded-xl flex items-center gap-2 cursor-pointer transition-colors shadow-2xs disabled:opacity-60"
          >
            <Download className={`w-4 h-4 text-emerald-700 ${isExporting ? 'animate-bounce' : ''}`} />
            <span>{isExporting ? 'Mengekspor...' : 'Ekspor Audit (CSV)'}</span>
          </button>

          {isSuperadmin && (
            <button
              type="button"
              onClick={() => setIsConfirmClearOpen(true)}
              className="px-4 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>Bersihkan Log</span>
            </button>
          )}
        </div>
      </div>

      {/* Export Success Feedback Notification */}
      {exportNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-medium flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{exportNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setExportNotice(null)}
            className="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-neutral-100 text-neutral-800 flex items-center justify-center shrink-0 font-bold border border-neutral-200">
            <History className="w-5 h-5 text-neutral-700" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Total Jejak Audit</div>
            <div className="text-xl font-black text-neutral-900 font-mono mt-0.5">{stats.total}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-800 flex items-center justify-center shrink-0 font-bold border border-emerald-200">
            <PlusCircle className="w-5 h-5 text-emerald-700" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Penambahan & Approval</div>
            <div className="text-xl font-black text-emerald-950 font-mono mt-0.5">{stats.tambah}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-900 flex items-center justify-center shrink-0 font-bold border border-amber-200">
            <Edit className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-amber-900 uppercase tracking-wider">Perubahan Data</div>
            <div className="text-xl font-black text-amber-950 font-mono mt-0.5">{stats.edit}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-800 flex items-center justify-center shrink-0 font-bold border border-rose-200">
            <Trash2 className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-rose-800 uppercase tracking-wider">Penghapusan / Penolakan</div>
            <div className="text-xl font-black text-rose-950 font-mono mt-0.5">{stats.hapus}</div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Real-time Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari nama admin, nama anggota, NIK, KTA, atau deskripsi audit..."
              className="w-full pl-9 pr-8 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-600 transition-all font-mono"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter by Aksi */}
          <div className="w-full md:w-48">
            <select
              value={selectedAksi}
              onChange={(e) => setSelectedAksi(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-600 font-mono"
            >
              <option value="all">Semua Tipe Aksi</option>
              <option value="TAMBAH">Tambah Data</option>
              <option value="EDIT">Edit Data</option>
              <option value="HAPUS">Hapus Data</option>
              <option value="APPROVE">Approval Registrasi</option>
              <option value="REJECT">Penolakan Registrasi</option>
              <option value="IMPORT">Impor Massal Excel</option>
              <option value="STATUS_KTA">Update Status KTA</option>
            </select>
          </div>

          {/* Filter by Modul */}
          <div className="w-full md:w-48">
            <select
              value={selectedModul}
              onChange={(e) => setSelectedModul(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-600 font-mono"
            >
              <option value="all">Semua Modul Sistem</option>
              {modulOptions.map((mod) => (
                <option key={mod} value={mod}>
                  {mod}
                </option>
              ))}
            </select>
          </div>

          {/* Filter by Date Range */}
          <div className="w-full md:w-40">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="w-full px-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-600 font-mono"
            >
              <option value="all">Semua Periode</option>
              <option value="today">Hari Ini</option>
              <option value="7days">7 Hari Terakhir</option>
              <option value="30days">30 Hari Terakhir</option>
            </select>
          </div>

          {/* Reset Filters button */}
          {(searchTerm || selectedAksi !== 'all' || selectedModul !== 'all' || dateFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSelectedAksi('all');
                setSelectedModul('all');
                setDateFilter('all');
              }}
              className="px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl cursor-pointer transition-colors shrink-0"
            >
              Reset Filter
            </button>
          )}
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-neutral-200 bg-neutral-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-neutral-800 uppercase tracking-wider">
              Daftar Catatan Jejak Audit ({filteredLogs.length} Entri)
            </h2>
          </div>
          <div className="text-[11px] text-neutral-500 font-mono">
            Menampilkan data terbaru paling atas
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 space-y-3">
            <History className="w-10 h-10 mx-auto text-neutral-300 stroke-[1.5]" />
            <p className="text-sm font-semibold text-neutral-600">Tidak ada log aktivitas audit yang ditemukan.</p>
            <p className="text-xs text-neutral-400">Coba ubah kata kunci pencarian atau sesuaikan filter tipe aksi.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-100/80 border-b border-neutral-200 font-bold text-neutral-700 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4 w-40">Waktu Audit</th>
                  <th className="py-3 px-4 w-48">Pengguna Admin</th>
                  <th className="py-3 px-4 w-36">Tipe Aksi</th>
                  <th className="py-3 px-4 w-44">Modul Sistem</th>
                  <th className="py-3 px-4 w-48">Target Data</th>
                  <th className="py-3 px-4 min-w-[250px]">Rincian Audit</th>
                  <th className="py-3 px-4 w-20 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-mono text-[11px]">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-neutral-50/80 transition-colors">
                    {/* Timestamp */}
                    <td className="py-3 px-4 text-neutral-600 whitespace-nowrap font-bold">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        <span>{log.timestamp}</span>
                      </div>
                    </td>

                    {/* Admin User */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-neutral-900 truncate">{log.user_name}</div>
                      <div className="text-[10px] text-neutral-500 truncate font-sans">
                        {log.user_role === 'Superadmin_Kabupaten'
                          ? 'Superadmin Kab.'
                          : log.user_role === 'Admin_Kabupaten'
                          ? 'Admin Kab. (PD)'
                          : log.user_role === 'Admin_Kecamatan'
                          ? 'Admin Kecamatan'
                          : log.user_role === 'Admin_Desa'
                          ? 'Admin Desa'
                          : log.user_role}
                      </div>
                    </td>

                    {/* Aksi Badge */}
                    <td className="py-3 px-4">{renderAksiBadge(log.aksi)}</td>

                    {/* Modul */}
                    <td className="py-3 px-4">
                      <span className="font-semibold text-neutral-800 bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200 text-[10px]">
                        {log.modul}
                      </span>
                    </td>

                    {/* Target Data */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-neutral-900 truncate">
                        {log.target_nama || log.target_id || '-'}
                      </div>
                      {log.target_id && log.target_nama && (
                        <div className="text-[10px] text-neutral-400 font-mono">ID: {log.target_id}</div>
                      )}
                    </td>

                    {/* Deskripsi */}
                    <td className="py-3 px-4 font-sans text-neutral-700 leading-relaxed max-w-md truncate">
                      {log.deskripsi}
                    </td>

                    {/* Inspection Button */}
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedLog(log)}
                        className="p-1.5 text-neutral-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg cursor-pointer transition-colors inline-flex items-center justify-center"
                        title="Lihat Detail Log"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Detail Log Inspection */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-[#111113]/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-neutral-200 overflow-hidden text-neutral-900 animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-neutral-100 flex items-start gap-3 bg-neutral-50">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 border border-emerald-300">
                <History className="w-5 h-5 text-emerald-800" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-neutral-900 uppercase">
                  Rincian Detail Log Audit Aktivitas
                </h3>
                <p className="text-[11px] text-neutral-500 mt-0.5 font-mono">ID: {selectedLog.id}</p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-neutral-400 hover:text-neutral-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs font-sans">
              <div className="grid grid-cols-2 gap-3 p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                <div>
                  <span className="text-[10px] text-neutral-500 font-bold uppercase block">Waktu Catat:</span>
                  <span className="font-mono font-bold text-neutral-900 text-xs">{selectedLog.timestamp}</span>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-500 font-bold uppercase block">Tipe Aksi:</span>
                  <div className="mt-0.5">{renderAksiBadge(selectedLog.aksi)}</div>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-500 font-bold uppercase block">Pengguna Admin:</span>
                  <span className="font-bold text-neutral-900 text-xs">{selectedLog.user_name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-500 font-bold uppercase block">Role Akses:</span>
                  <span className="font-mono text-neutral-700 text-xs">{selectedLog.user_role}</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">
                  Modul & Target Data Terpengaruh:
                </label>
                <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-1">
                  <div className="font-bold text-emerald-950 uppercase text-xs">
                    Modul: {selectedLog.modul}
                  </div>
                  <div className="text-xs text-neutral-800 font-semibold">
                    Target: {selectedLog.target_nama || selectedLog.target_id || '-'}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">
                  Deskripsi Keterangan Audit:
                </label>
                <div className="p-3 bg-neutral-100 border border-neutral-200 rounded-xl text-neutral-800 leading-relaxed font-mono text-[11px] whitespace-pre-line">
                  {selectedLog.deskripsi}
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono border-t border-neutral-100 pt-3">
                <span>Alamat IP: {selectedLog.ip_address || '127.0.0.1'}</span>
                <span>User ID: #{selectedLog.user_id}</span>
              </div>
            </div>

            <div className="p-4 bg-neutral-50 border-t border-neutral-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-5 py-2 text-xs font-bold text-white bg-neutral-800 hover:bg-neutral-900 rounded-xl cursor-pointer transition-colors"
              >
                Tutup Rincian
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmation Clear Logs */}
      {isConfirmClearOpen && (
        <div className="fixed inset-0 z-50 bg-[#111113]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-neutral-200 overflow-hidden text-neutral-900 animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-neutral-100 flex items-center gap-3 bg-rose-50">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-800 flex items-center justify-center shrink-0 border border-rose-300">
                <ShieldAlert className="w-5 h-5 text-rose-700" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-rose-950 uppercase">
                  Konfirmasi Bersihkan Log Audit
                </h3>
                <p className="text-[11px] text-rose-700 mt-0.5">Tindakan ini memerlukan otorisasi Superadmin</p>
              </div>
            </div>

            <div className="p-5 space-y-3 text-xs text-neutral-700">
              <p>
                Apakah Anda yakin ingin menghapus seluruh histori catatan jejak audit aktivitas admin? Seluruh {activityLogs.length} catatan log akan dihapus secara permanen.
              </p>
            </div>

            <div className="p-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsConfirmClearOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-xl cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  clearActivityLogs();
                  setIsConfirmClearOpen(false);
                }}
                className="px-5 py-2 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-xl cursor-pointer shadow-md"
              >
                Ya, Bersihkan Log
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
