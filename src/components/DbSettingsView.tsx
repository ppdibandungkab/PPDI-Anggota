import React, { useState, useEffect, useMemo } from 'react';
import { usePPDI } from '../context/PPDIContext';
import { safeFetchJson } from '../utils/ppdiHelpers';
import { Database, RefreshCw, RotateCcw, CheckCircle2, AlertTriangle, Server, Layers, KeyRound, Plus, Edit2, Trash2, X, Search, Check } from 'lucide-react';

export const DbSettingsView: React.FC = () => {
  const { dbStatus, checkDbStatus, initDbTables, setIsDbModalOpen, resetAllData } = usePPDI();
  const [isTesting, setIsTesting] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [initMsg, setInitMsg] = useState<{ success: boolean; message: string } | null>(null);

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

      {/* Card: Reset Data Demo & Sandbox Simulation */}
      <div className="bg-white border border-rose-200/90 rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-gradient-to-r from-rose-50/40 via-white to-amber-50/20">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 bg-rose-100 text-rose-800 rounded-xl border border-rose-200 shrink-0">
            <RotateCcw className="w-5 h-5 text-rose-700" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xs font-bold text-neutral-900 uppercase font-mono tracking-wider">
                Reset Data Demo Sistem
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 font-mono">
                Dataset Simulasi
              </span>
            </div>
            <p className="text-xs text-neutral-600 mt-1 leading-relaxed max-w-2xl font-mono">
              Kembalikan seluruh data master (anggota perangkat desa, riwayat SK pengangkatan, formulir pendaftaran online, iuran kas, dan akun pengguna) ke kondisi awal demo simulasi PPDI Kabupaten Bandung.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleResetDemo}
          disabled={isResetting}
          className="flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-lg text-xs font-bold transition-all cursor-pointer uppercase shrink-0 shadow-xs disabled:opacity-50 font-mono"
        >
          <RotateCcw className={`w-4 h-4 ${isResetting ? 'animate-spin' : ''}`} />
          <span>{isResetting ? 'Sedang Mereset Data...' : 'Reset Data Demo'}</span>
        </button>
      </div>

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
