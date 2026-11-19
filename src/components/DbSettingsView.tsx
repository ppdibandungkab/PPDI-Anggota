import React, { useState, useEffect, useMemo } from 'react';
import { usePPDI } from '../context/PPDIContext';
import { safeFetchJson } from '../utils/ppdiHelpers';
import { Database, RefreshCw, RotateCcw, CheckCircle2, AlertTriangle, Server, Layers, KeyRound, Plus, Edit2, Trash2, X, Search, Check, HardDrive, Download, ShieldCheck } from 'lucide-react';

export const DbSettingsView: React.FC = () => {
  const { dbStatus, checkDbStatus, initDbTables, setIsDbModalOpen, resetAllData } = usePPDI();
  const [isTesting, setIsTesting] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [initMsg, setInitMsg] = useState<{ success: boolean; message: string } | null>(null);

  // Database Backup Status State
  const [backupLog, setBackupLog] = useState<{
    timestamp: string;
    filename: string;
    fileSize: number;
    status: 'SUCCESS' | 'ERROR' | string;
    message: string;
  } | null>(null);
  const [backupFilesCount, setBackupFilesCount] = useState<number>(0);
  const [isLoadingBackupStatus, setIsLoadingBackupStatus] = useState<boolean>(false);
  const [isTriggeringBackup, setIsTriggeringBackup] = useState<boolean>(false);
  const [backupActionMsg, setBackupActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Schema & Foreign Key Diagnostic State
  const [schemaDiag, setSchemaDiag] = useState<any | null>(null);
  const [isLoadingDiag, setIsLoadingDiag] = useState<boolean>(false);
  const [diagError, setDiagError] = useState<string | null>(null);

  // CRUD State for Database Tables
  const [selectedTable, setSelectedTable] = useState<string>('ref_kecamatan');
  const [tableData, setTableData] = useState<{ rows: any[]; fields: string[] }>({ rows: [], fields: [] });
  const [isLoadingTable, setIsLoadingTable] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Modal State for Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<any | null>(null);
  const [formData, setFormData] = useState<{ [key: string]: string }>({});

  const fetchBackupStatus = async () => {
    try {
      setIsLoadingBackupStatus(true);
      const res = await safeFetchJson('/api/database/backup/status');
      const data = res.data;
      if (res.ok && data?.success) {
        setBackupLog(data.lastLog || null);
        setBackupFilesCount(data.filesCount || 0);
      }
    } catch (err) {
      console.error('Failed to fetch backup status:', err);
    } finally {
      setIsLoadingBackupStatus(false);
    }
  };

  const handleTriggerBackupNow = async () => {
    try {
      setIsTriggeringBackup(true);
      setBackupActionMsg(null);
      const res = await safeFetchJson('/api/database/backup', { method: 'POST' });
      const data = res.data;
      if (res.ok && data?.success) {
        setBackupActionMsg({
          type: 'success',
          text: `Backup database berhasil dibuat! File: ${data.filename} (${(data.fileSize / 1024 / 1024).toFixed(2)} MB)`,
        });
        await fetchBackupStatus();
      } else {
        setBackupActionMsg({
          type: 'error',
          text: data?.error || data?.message || res.error || 'Gagal memproses backup database',
        });
      }
    } catch (err: any) {
      setBackupActionMsg({
        type: 'error',
        text: err.message || 'Koneksi gagal saat memproses backup',
      });
    } finally {
      setIsTriggeringBackup(false);
    }
  };

  const fetchSchemaDiagnostic = async () => {
    try {
      setIsLoadingDiag(true);
      setDiagError(null);
      const res = await safeFetchJson('/api/db/schema-diagnostic');
      const data = res.data;
      if (res.ok && data?.success) {
        setSchemaDiag(data);
      } else {
        setDiagError(data?.error || data?.message || res.error || 'Gagal menjalankan diagnostik skema');
      }
    } catch (err: any) {
      setDiagError(err.message || 'Gagal menghubungi endpoint diagnostik');
    } finally {
      setIsLoadingDiag(false);
    }
  };

  useEffect(() => {
    fetchBackupStatus();
    fetchSchemaDiagnostic();
  }, []);

  const tablesList = [
    { name: 'ref_kecamatan', label: 'Master Kecamatan (ref_kecamatan)', isView: false },
    { name: 'ref_desa', label: 'Master Desa (ref_desa)', isView: false },
    { name: 'ref_jabatan', label: 'Master Jabatan (ref_jabatan)', isView: false },
    { name: 'roles', label: 'Master Hak Akses (roles)', isView: false },
    { name: 'users', label: 'Pengguna Sistem (users)', isView: false },
    { name: 'anggota', label: 'Data Induk Anggota (anggota)', isView: false },
    { name: 'riwayat_jabatan', label: 'Riwayat Jabatan & SK (riwayat_jabatan)', isView: false },
    { name: 'keanggotaan_ppdi', label: 'Keanggotaan & E-KTA (keanggotaan_ppdi)', isView: false },
    { name: 'iuran_anggota', label: 'Iuran Kas Anggota (iuran_anggota)', isView: false },
    { name: 'pendaftaran_perangkat_desa', label: 'Pendaftaran Online (pendaftaran_perangkat_desa)', isView: false },
    // Database Views
    { name: 'v_anggota_aktif_kabupaten', label: 'View: Anggota Aktif Teritorial (v_anggota_aktif_kabupaten)', isView: true },
    { name: 'v_purna_tugas_alert', label: 'View: Peringatan Purna Tugas 60 Thn (v_purna_tugas_alert)', isView: true },
    { name: 'v_monitoring_pensiun_perangkat', label: 'View: Monitoring Pensiun (v_monitoring_pensiun_perangkat)', isView: true },
    { name: 'v_rekap_ppdi_kecamatan', label: 'View: Rekap PPDI per Kecamatan (v_rekap_ppdi_kecamatan)', isView: true },
    { name: 'v_rekap_ppdi_desa', label: 'View: Rekap PPDI per Desa (v_rekap_ppdi_desa)', isView: true },
    { name: 'v_rekap_iuran_kecamatan', label: 'View: Rekap Iuran per Kecamatan (v_rekap_iuran_kecamatan)', isView: true },
    { name: 'v_rekap_iuran_desa', label: 'View: Rekap Iuran per Desa (v_rekap_iuran_desa)', isView: true },
    { name: 'v_antrean_verifikasi_kecamatan', label: 'View: Antrean Verifikasi (v_antrean_verifikasi_kecamatan)', isView: true },
  ];

  const isViewSelected = selectedTable.startsWith('v_');

  const fetchTableData = async (tableName: string) => {
    setIsLoadingTable(true);
    setFeedback(null);
    try {
      const res = await safeFetchJson(`/api/db/table/${tableName}`);
      const json = res.data;
      if (res.ok && json?.success) {
        setTableData({ rows: json.rows || [], fields: json.fields || [] });
      } else {
        setFeedback({ success: false, message: json?.message || res.error || 'Gagal memuat data tabel' });
      }
    } catch (err: any) {
      setFeedback({ success: false, message: err.message || 'Error koneksi ke server' });
    } finally {
      setIsLoadingTable(false);
    }
  };

  useEffect(() => {
    fetchTableData(selectedTable);
  }, [selectedTable]);

  const handleTestPing = async () => {
    setIsTesting(true);
    await checkDbStatus();
    setIsTesting(false);
  };

  const handleInit = async () => {
    setIsInitializing(true);
    setInitMsg(null);
    const res = await initDbTables();
    if (res.success) {
      setInitMsg({ success: true, message: 'Tabel PPDI berhasil dibuat & disinkronkan di MySQL database remote!' });
      fetchTableData(selectedTable);
    } else {
      setInitMsg({ success: false, message: `Gagal inisialisasi: ${res.message || 'Error koneksi database'}` });
    }
    setIsInitializing(false);
  };

  const handleResetDemo = async () => {
    if (
      !confirm(
        'PERINGATAN RESET DATA DEMO:\n\nApakah Anda yakin ingin mengembalikan seluruh data simulasi (anggota, SK, pendaftaran, iuran kas, dan akun) ke kondisi awal demo PPDI Kabupaten Bandung?\n\nTindakan ini akan mengosongkan cache lokal browser dan menyinkronkan ulang dataset awal.'
      )
    ) {
      return;
    }

    setIsResetting(true);
    setFeedback(null);
    try {
      await resetAllData();
      setFeedback({
        success: true,
        message: 'Data demo simulasi berhasil direset ke dataset awal!',
      });
      fetchTableData(selectedTable);
    } catch (err: any) {
      setFeedback({
        success: false,
        message: 'Gagal mereset data: ' + (err.message || 'Terjadi kesalahan sistem'),
      });
    } finally {
      setIsResetting(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const handleOpenAdd = () => {
    setEditingRow(null);
    const initial: { [key: string]: string } = {};
    tableData.fields.forEach(f => {
      initial[f] = '';
    });
    setFormData(initial);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (row: any) => {
    setEditingRow(row);
    const initial: { [key: string]: string } = {};
    tableData.fields.forEach(f => {
      initial[f] = row[f] !== null && row[f] !== undefined ? String(row[f]) : '';
    });
    setFormData(initial);
    setIsModalOpen(true);
  };

  const handleSaveRow = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const primaryKey = tableData.fields[0]; // Assume first field is primary key or identifier
      let url = `/api/db/table/${selectedTable}`;
      let method = 'POST';

      if (editingRow) {
        const pkVal = editingRow[primaryKey];
        url = `/api/db/table/${selectedTable}/${primaryKey}/${pkVal}`;
        method = 'PUT';
      }

      const res = await safeFetchJson(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const json = res.data;
      if (res.ok && json?.success) {
        setFeedback({ success: true, message: json.message || 'Berhasil menyimpan perubahan' });
        setIsModalOpen(false);
        fetchTableData(selectedTable);
      } else {
        setFeedback({ success: false, message: 'Gagal menyimpan: ' + (json?.error || json?.message || res.error) });
      }
    } catch (err: any) {
      setFeedback({ success: false, message: 'Error: ' + err.message });
    }
  };

  const handleDeleteRow = async (row: any) => {
    const primaryKey = tableData.fields[0];
    const pkVal = row[primaryKey];

    try {
      const res = await safeFetchJson(`/api/db/table/${selectedTable}/${primaryKey}/${pkVal}`, {
        method: 'DELETE',
      });
      const json = res.data;
      if (res.ok && json?.success) {
        setFeedback({ success: true, message: json.message || 'Baris berhasil dihapus' });
        fetchTableData(selectedTable);
      } else {
        setFeedback({ success: false, message: 'Gagal menghapus: ' + (json?.error || json?.message || res.error) });
      }
    } catch (err: any) {
      setFeedback({ success: false, message: 'Error: ' + err.message });
    }
  };

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return tableData.rows;
    const q = searchQuery.toLowerCase();
    return tableData.rows.filter(row =>
      Object.values(row).some(val => String(val || '').toLowerCase().includes(q))
    );
  }, [tableData.rows, searchQuery]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 text-neutral-900">
      {/* Top Banner */}
      <div className="bg-[#064E3B] text-white p-6 rounded-xl shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-amber-300" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight uppercase">
              Pengaturan & CRUD Database MySQL
            </h1>
          </div>
          <p className="text-emerald-100 text-xs sm:text-sm mt-1">
            Kelola koneksi basis data kepegawaian PPDI Kabupaten Bandung dan akses CRUD lengkap (Create, Read, Update, Delete) untuk seluruh tabel database.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleResetDemo}
            disabled={isResetting}
            title="Reset seluruh data ke kondisi awal demo simulasi"
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer uppercase shrink-0 disabled:opacity-50"
          >
            <RotateCcw className={`w-4 h-4 ${isResetting ? 'animate-spin' : ''}`} />
            <span>{isResetting ? 'Mereset...' : 'Reset Data Demo'}</span>
          </button>
          <button
            onClick={() => setIsDbModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-amber-400 hover:bg-amber-300 text-neutral-900 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer uppercase shrink-0"
          >
            <Server className="w-4 h-4" />
            <span>Diagnostik & Panduan Hosting</span>
          </button>
          <button
            onClick={handleTestPing}
            disabled={isTesting}
            className="flex items-center gap-2 px-4 py-2.5 bg-white text-[#064E3B] hover:bg-emerald-50 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer uppercase shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isTesting ? 'animate-spin' : ''}`} />
            <span>{isTesting ? 'Menguji...' : 'Uji Koneksi'}</span>
          </button>
        </div>
      </div>

      {/* Status Alert */}
      <div
        className={`p-5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
          dbStatus?.success
            ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
            : 'bg-amber-50 border-amber-300 text-amber-900'
        }`}
      >
        <div className="flex items-start gap-3">
          {dbStatus?.success ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" />
          )}
          <div>
            <div className="font-bold text-base">
              {dbStatus?.success ? 'MySQL Terhubung & Aktif Normal' : 'Status: ' + (dbStatus?.status || 'Terkonfigurasi')}
            </div>
            <div className="text-xs mt-1 leading-relaxed">
              {dbStatus?.success
                ? `Latensi: ${dbStatus.latencyMs} ms · Server: ${dbStatus.serverVersion} · Host: ${dbStatus.host}:${dbStatus.port || 3306} · Database: ${dbStatus.database}`
                : (dbStatus?.diagnosis || dbStatus?.hint || 'Koneksi database ke hosting belum terhubung. Buka tab Diagnostik Hosting untuk solusi cPanel.')}
            </div>
          </div>
        </div>
        <button
          onClick={handleInit}
          disabled={isInitializing}
          className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0 shadow-sm disabled:opacity-50"
        >
          {isInitializing ? 'Membuat Tabel...' : 'Inisialisasi / Sinkronisasi Tabel SQL'}
        </button>
      </div>

      {initMsg && (
        <div className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2 ${initMsg.success ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-red-100 text-red-900 border border-red-300'}`}>
          {initMsg.success ? <CheckCircle2 className="w-4 h-4 text-emerald-700" /> : <AlertTriangle className="w-4 h-4 text-red-700" />}
          <span>{initMsg.message}</span>
        </div>
      )}

      {feedback && (
        <div className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2 ${feedback.success ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-red-100 text-red-900 border border-red-300'}`}>
          {feedback.success ? <CheckCircle2 className="w-4 h-4 text-emerald-700" /> : <AlertTriangle className="w-4 h-4 text-red-700" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* PANEL STATUS LOG BACKUP DATABASE OTOMATIS HARIAN             */}
      {/* ------------------------------------------------------------- */}
      <section
        aria-label="Status Backup Database"
        className="bg-white border border-neutral-200 rounded-2xl p-3.5 sm:p-4.5 shadow-xs space-y-3.5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-100">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-neutral-900 tracking-tight">
                  Status Backup Database Otomatis Harian
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 font-mono text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                  Auto-Scheduler Aktif
                </span>
                {backupLog?.status === 'SUCCESS' && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono text-[10px] font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Dump Terakhir Sukses
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">
                Pencadangan harian otomatis skema &amp; seluruh data tabel MySQL/MariaDB ke server lokal dengan dump SQL aman.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={fetchBackupStatus}
              disabled={isLoadingBackupStatus}
              title="Perbarui status log backup"
              className="p-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-600 hover:text-neutral-900 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBackupStatus ? 'animate-spin text-blue-600' : ''}`} />
            </button>
            <button
              type="button"
              onClick={handleTriggerBackupNow}
              disabled={isTriggeringBackup}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-300 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed shadow-2xs"
            >
              {isTriggeringBackup ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Mencadangkan...</span>
                </>
              ) : (
                <>
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>Backup Sekarang</span>
                </>
              )}
            </button>
            <a
              href="/api/database/backup/download"
              download
              className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-800 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Unduh file dump SQL terakhir langsung ke perangkat Anda"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>Unduh Dump SQL</span>
            </a>
          </div>
        </div>

        {backupActionMsg && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center justify-between gap-2 border ${
              backupActionMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : 'bg-red-50 text-red-900 border-red-200'
            }`}
          >
            <span>{backupActionMsg.text}</span>
            <button
              type="button"
              onClick={() => setBackupActionMsg(null)}
              className="text-neutral-400 hover:text-neutral-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200/80">
            <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider block">Waktu Backup Terakhir</span>
            <span className="text-xs sm:text-[13px] font-bold text-neutral-900 mt-1 block">
              {backupLog?.timestamp
                ? new Date(backupLog.timestamp).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB'
                : 'Belum Pernah'}
            </span>
          </div>

          <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200/80">
            <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider block">File Dump SQL</span>
            <span className="text-xs sm:text-[13px] font-mono font-semibold text-neutral-900 mt-1 block truncate" title={backupLog?.filename || '-'}>
              {backupLog?.filename || '-'}
            </span>
          </div>

          <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200/80">
            <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider block">Ukuran File Dump</span>
            <span className="text-xs sm:text-[13px] font-bold text-neutral-900 mt-1 block">
              {backupLog?.fileSize
                ? `${(backupLog.fileSize / 1024 / 1024).toFixed(2)} MB (${backupLog.fileSize.toLocaleString('id-ID')} bytes)`
                : '-'}
            </span>
          </div>

          <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200/80">
            <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider block">Total Arsip Tersimpan</span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs sm:text-[13px] font-bold text-neutral-900">
                {backupFilesCount} File SQL
              </span>
              <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                Tersinkron
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* PANEL DIAGNOSTIK SKEMA INT(11), FOREIGN KEY & LOG APPROVAL    */}
      {/* ------------------------------------------------------------- */}
      <section
        aria-label="Diagnostik Skema Database"
        className="bg-white border border-neutral-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-100">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#064E3B] text-amber-300 flex items-center justify-center shrink-0 shadow-2xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-neutral-900 tracking-tight">
                  Diagnostik Skema INT(11), Foreign Key &amp; Approval
                </h2>
                {schemaDiag && (
                  <span
                    className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold border ${
                      schemaDiag.healthy
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-red-50 text-red-800 border-red-200'
                    }`}
                  >
                    {schemaDiag.healthy ? 'Skema Valid & Konsisten' : 'Perlu Perbaikan Skema'}
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                Verifikasi tipe data INT(11) AUTO_INCREMENT pada id_anggota, id_riwayat, dan id_ppdi serta relasi Foreign Key saat proses approval pendaftaran.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchSchemaDiagnostic}
            disabled={isLoadingDiag}
            className="px-3.5 py-2 rounded-lg bg-[#064E3B] hover:bg-[#043d2e] disabled:bg-neutral-300 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer self-start sm:self-auto shrink-0 shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDiag ? 'animate-spin' : ''}`} />
            <span>{isLoadingDiag ? 'Memeriksa...' : 'Cek Diagnostik Skema'}</span>
          </button>
        </div>

        {diagError && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{diagError}</span>
          </div>
        )}

        {schemaDiag && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(schemaDiag.autoIncChecks || []).map((item: any) => (
                <div key={item.table} className="bg-neutral-50 p-3 rounded-xl border border-neutral-200/80 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono font-bold text-neutral-800 truncate">{item.table}</span>
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        item.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {item.ok ? 'OK' : 'WARN'}
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-600 font-mono">
                    PK: <b>{item.pk}</b> · Baris: <b>{item.totalRows}</b>
                  </div>
                  <div className="text-[10px] text-neutral-500 font-mono">
                    MAX: {item.maxId} · NEXT AI: {item.autoIncrementNext ?? '-'}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Key Columns INT(11) Status */}
              <div className="border border-neutral-200 rounded-xl overflow-hidden">
                <div className="px-3.5 py-2 bg-neutral-50 border-b border-neutral-200 text-xs font-bold text-neutral-800 flex items-center justify-between">
                  <span>Verifikasi Kolom Kunci INT(11)</span>
                  <span className="font-mono text-[10px] text-neutral-500">
                    {(schemaDiag.keyColumnsCheck || []).filter((c: any) => c.ok).length}/{(schemaDiag.keyColumnsCheck || []).length} Valid
                  </span>
                </div>
                <div className="divide-y divide-neutral-100 text-xs">
                  {(schemaDiag.keyColumnsCheck || []).map((col: any) => (
                    <div key={`${col.table}.${col.column}`} className="px-3.5 py-2 flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-neutral-800">
                        {col.table}.<b>{col.column}</b>
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-neutral-500">
                          {col.columnType || 'MISSING'} {col.extra ? `(${col.extra})` : ''}
                        </span>
                        {col.ok ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Foreign Keys & Orphan Check */}
              <div className="border border-neutral-200 rounded-xl overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="px-3.5 py-2 bg-neutral-50 border-b border-neutral-200 text-xs font-bold text-neutral-800 flex items-center justify-between">
                    <span>Relasi Foreign Key &amp; Integritas Data</span>
                    <span className="font-mono text-[10px] text-emerald-700">
                      {schemaDiag.foreignKeysCount || 0} FK · {(schemaDiag.fkIssues || []).length} Konflik
                    </span>
                  </div>
                  <div className="divide-y divide-neutral-100 text-xs">
                    {(schemaDiag.foreignKeys || []).map((fk: any) => (
                      <div key={fk.CONSTRAINT_NAME} className="px-3.5 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <span className="font-mono text-[11px] text-neutral-800">
                          {fk.child_table}.{fk.child_column} &rarr; {fk.parent_table}.{fk.parent_column}
                        </span>
                        <span className="font-mono text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 w-fit">
                          {fk.child_column_type} = {fk.parent_column_type}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="px-3.5 py-2.5 bg-neutral-50 border-t border-neutral-200 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-neutral-600">
                  <span>Orphan Riwayat: <b>{schemaDiag.orphanChecks?.riwayat_missing_anggota ?? 0}</b></span>
                  <span>Orphan KTA: <b>{schemaDiag.orphanChecks?.keanggotaan_missing_anggota ?? 0}</b></span>
                  <span>Orphan Desa: <b>{schemaDiag.orphanChecks?.riwayat_missing_desa ?? 0}</b></span>
                  <span>Orphan Jabatan: <b>{schemaDiag.orphanChecks?.riwayat_missing_jabatan ?? 0}</b></span>
                </div>
              </div>
            </div>

            {Array.isArray(schemaDiag.recentApprovalLogs) && schemaDiag.recentApprovalLogs.length > 0 && (
              <div className="border border-neutral-200 rounded-xl overflow-hidden">
                <div className="px-3.5 py-2 bg-neutral-50 border-b border-neutral-200 text-xs font-bold text-neutral-800">
                  Log Transaksi Approval Pendaftaran Terbaru
                </div>
                <div className="divide-y divide-neutral-100 max-h-44 overflow-y-auto text-[11px]">
                  {schemaDiag.recentApprovalLogs.map((log: any) => (
                    <div key={log.id} className="px-3.5 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold shrink-0 ${
                            String(log.aksi || '').includes('ERROR')
                              ? 'bg-red-100 text-red-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {log.aksi}
                        </span>
                        <span className="text-neutral-700 truncate" title={log.keterangan}>
                          {log.keterangan}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-neutral-400 shrink-0">
                        {log.timestamp ? new Date(log.timestamp).toLocaleString('id-ID') : '-'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* CRUD Database Table Explorer Section */}
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="p-5 bg-neutral-50 border-b border-neutral-200 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-800 text-amber-300 flex items-center justify-center shadow-xs">
              <Layers className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-neutral-900 uppercase">Manajemen Tabel & Data (CRUD)</h2>
              <p className="text-[11px] text-neutral-500">Pilih tabel database untuk melihat, menambah, mengubah, atau menghapus data</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <select
              value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
              className="p-2.5 bg-white border border-neutral-300 rounded-lg text-xs font-bold text-neutral-900 focus:ring-2 focus:ring-[#064E3B] outline-none"
            >
              {tablesList.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.label}
                </option>
              ))}
            </select>

            {!isViewSelected ? (
              <button
                onClick={handleOpenAdd}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-[#064E3B] hover:bg-[#043d2e] text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer uppercase"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Baris Baru</span>
              </button>
            ) : (
              <span className="px-3 py-2 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-2xs">
                <Database className="w-3.5 h-3.5 text-emerald-600" />
                View Database (Read-Only)
              </span>
            )}
          </div>
        </div>

        {/* Search & Table Count Bar */}
        <div className="p-4 border-b border-neutral-200 bg-neutral-50/50 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder={`Cari di tabel ${selectedTable}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-neutral-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-[#064E3B] text-neutral-900"
            />
          </div>
          <div className="text-xs font-semibold text-neutral-600">
            Menampilkan <span className="font-bold text-[#064E3B]">{filteredRows.length}</span> baris
          </div>
        </div>

        {/* Data Table View */}
        <div className="overflow-x-auto">
          {isLoadingTable ? (
            <div className="text-center py-16 text-neutral-500 text-xs">Memuat data dari database MySQL...</div>
          ) : filteredRows.length === 0 ? (
            <div className="text-center py-16 text-neutral-500 text-xs">Tidak ada data ditemukan pada tabel ini.</div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-neutral-100 text-neutral-700 uppercase font-mono text-[10px] border-b border-neutral-200">
                  {!isViewSelected && <th className="p-3 w-16 text-center">Aksi</th>}
                  {tableData.fields.map((field) => (
                    <th key={field} className="p-3 whitespace-nowrap">
                      {field}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 text-neutral-800">
                {filteredRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-neutral-50/80 transition-colors">
                    {!isViewSelected && (
                      <td className="p-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(row)}
                            title="Edit"
                            className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-md transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteRow(row)}
                            title="Hapus"
                            className="p-1.5 bg-red-50 hover:bg-red-100 text-red-800 rounded-md transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                    {tableData.fields.map((field) => (
                      <td key={field} className="p-3 max-w-xs truncate font-mono text-[11px] text-neutral-700">
                        {row[field] !== null && row[field] !== undefined ? String(row[field]) : <span className="text-neutral-300 italic">NULL</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add / Edit Row Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full flex flex-col my-8 overflow-hidden text-xs">
            <div className="px-6 py-4 bg-[#064E3B] text-white flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase">
                {editingRow ? `Edit Baris (${selectedTable})` : `Tambah Baris Baru (${selectedTable})`}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-white/80 hover:text-white cursor-pointer p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRow} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {tableData.fields.map((field) => {
                const isPrimaryKey = field === tableData.fields[0];
                return (
                  <div key={field} className="space-y-1">
                    <label className="font-bold uppercase text-[10px] text-neutral-700 flex items-center justify-between">
                      <span>{field}</span>
                      {isPrimaryKey && <span className="text-amber-700 font-mono">Primary Key</span>}
                    </label>
                    <input
                      type="text"
                      disabled={Boolean(editingRow && isPrimaryKey)}
                      value={formData[field] || ''}
                      onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}
                      className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg font-mono text-neutral-900 focus:ring-2 focus:ring-[#064E3B] outline-none disabled:bg-neutral-100 disabled:text-neutral-500"
                      placeholder={`Masukkan nilai ${field}...`}
                    />
                  </div>
                );
              })}

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 rounded-lg font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#064E3B] hover:bg-[#043d2e] text-white rounded-lg font-bold cursor-pointer shadow-md"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
