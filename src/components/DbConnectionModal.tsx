import React, { useState } from 'react';
import { usePPDI } from '../context/PPDIContext';
import { getApiBaseUrl, setApiBaseUrl } from '../utils/ppdiHelpers';
import {
  Database,
  X,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Server,
  Layers,
  KeyRound,
  ShieldCheck,
  Check,
  Copy,
  Terminal,
  FileCode,
  HelpCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Settings,
  Flame,
  Laptop,
  Globe,
} from 'lucide-react';

interface DbConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DbConnectionModal: React.FC<DbConnectionModalProps> = ({ isOpen, onClose }) => {
  const {
    dbStatus,
    isCheckingDb,
    checkDbStatus,
    testCustomDbConnection,
    reconnectDb,
    saveDbEnvConfig,
    initDbTables,
  } = usePPDI();

  const [activeTab, setActiveTab] = useState<'status' | 'localguide' | 'guide' | 'config'>('status');
  const [isTesting, setIsTesting] = useState(false);
  const [isTestingLocalhost, setIsTestingLocalhost] = useState(false);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initMsg, setInitMsg] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedEnv, setCopiedEnv] = useState(false);
  const [copiedLocalEnv, setCopiedLocalEnv] = useState(false);

  // Form state for config editing
  const [cfgHost, setCfgHost] = useState(dbStatus?.host || '');
  const [cfgPort, setCfgPort] = useState(String(dbStatus?.port || '3306'));
  const [cfgDatabase, setCfgDatabase] = useState(dbStatus?.database || '');
  const [cfgUser, setCfgUser] = useState(dbStatus?.user || '');
  const [cfgPassword, setCfgPassword] = useState('');
  const [isSavingCfg, setIsSavingCfg] = useState(false);
  const [cfgSaveMsg, setCfgSaveMsg] = useState<{ success: boolean; message: string } | null>(null);

  // Accordion state in guide tab
  const [openGuideIndex, setOpenGuideIndex] = useState<number | null>(0);
  const [openLocalGuideIndex, setOpenLocalGuideIndex] = useState<number | null>(0);

  // Custom API Backend URL state
  const [customApiUrl, setCustomApiUrl] = useState(getApiBaseUrl() || '');
  const [apiUrlMsg, setApiUrlMsg] = useState<{ success: boolean; message: string } | null>(null);

  const handleApplyApiUrl = (url: string) => {
    setApiBaseUrl(url);
    setCustomApiUrl(url);
    setApiUrlMsg({
      success: true,
      message: url ? `URL Backend diatur ke: ${url}` : 'URL Backend dikembalikan ke default (relatif / terintegrasi)',
    });
    // Trigger immediate ping
    checkDbStatus();
  };

  // Preset handlers
  const handlePresetLocalhost = () => {
    setCfgHost('localhost');
    setCfgPort('3306');
    setCfgDatabase('');
    setCfgUser('root');
    setCfgPassword('');
    setCfgSaveMsg({
      success: true,
      message: 'Preset XAMPP / Localhost telah dimuat! Silakan isi nama database Anda lalu klik "Simpan & Terapkan Konfigurasi".',
    });
  };

  const handlePresetClear = () => {
    setCfgHost('');
    setCfgPort('3306');
    setCfgDatabase('');
    setCfgUser('');
    setCfgPassword('');
    setCfgSaveMsg({
      success: true,
      message: 'Form konfigurasi dikosongkan. Silakan isi kredensial MySQL baru Anda.',
    });
  };

  if (!isOpen) return null;

  const handleTestPing = async () => {
    setIsTesting(true);
    setTestResult(null);
    const res = await checkDbStatus();
    setIsTesting(false);
    setTestResult({
      success: res.success,
      message: res.success
        ? `Tersambung ke ${res.host}:${res.port || 3306} (${res.latencyMs} ms · ${res.tablesCount || 0} tabel)`
        : `Gagal: ${res.error || res.status} (Kode: ${res.code || 'TIMEOUT'})`,
    });
  };

  const handleTestLocalhost = async () => {
    setIsTestingLocalhost(true);
    setTestResult(null);
    const res = await testCustomDbConnection({
      host: 'localhost',
      port: 3306,
      database: cfgDatabase,
      user: cfgUser,
      password: cfgPassword,
    });
    setIsTestingLocalhost(false);
    setTestResult({
      isLocalhostTest: true,
      success: res.success,
      message: res.success
        ? `BERHASIL! Host "localhost" dapat tersambung (${res.latencyMs} ms). Anda dapat mengubah DB_HOST menjadi localhost.`
        : `Gagal ke localhost: ${res.error || 'Connection failed'}.`,
    });
  };

  const handleApplyLocalhost = async () => {
    setIsSavingCfg(true);
    const res = await saveDbEnvConfig({
      host: 'localhost',
      port: 3306,
      database: cfgDatabase,
      user: cfgUser,
      password: cfgPassword,
    });
    setIsSavingCfg(false);
    setCfgHost('localhost');
    if (res.success) {
      setCfgSaveMsg({ success: true, message: 'DB_HOST berhasil diubah ke "localhost" dan file .env diperbarui!' });
    } else {
      setCfgSaveMsg({ success: false, message: res.error || 'Gagal menyimpan .env' });
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingCfg(true);
    setCfgSaveMsg(null);
    const res = await saveDbEnvConfig({
      host: cfgHost.trim(),
      port: Number(cfgPort) || 3306,
      database: cfgDatabase.trim(),
      user: cfgUser.trim(),
      password: cfgPassword,
    });
    setIsSavingCfg(false);
    if (res.success) {
      setCfgSaveMsg({ success: true, message: 'Konfigurasi berhasil disimpan ke .env dan koneksi dimuat ulang!' });
    } else {
      setCfgSaveMsg({ success: false, message: res.error || 'Gagal menyimpan konfigurasi' });
    }
  };

  const handleInit = async () => {
    setIsInitializing(true);
    setInitMsg(null);
    const res = await initDbTables();
    if (res.success) {
      setInitMsg({ success: true, message: 'Tabel PPDI berhasil dibuat & disinkronkan ke database MySQL!' });
    } else {
      setInitMsg({ success: false, message: `Gagal inisialisasi: ${res.message || 'Error koneksi database'}` });
    }
    setIsInitializing(false);
  };

  const connectionString = `mysql -h ${dbStatus?.host || 'localhost'} -u ${dbStatus?.user || 'root'} -p ${dbStatus?.database || 'nama_database'}`;

  const envSample = `# Konfigurasi Database MySQL PPDI Kab. Bandung
DB_HOST="${dbStatus?.host || 'localhost'}"
DB_PORT="${dbStatus?.port || '3306'}"
DB_USER="${dbStatus?.user || ''}"
DB_PASSWORD=""
DB_NAME="${dbStatus?.database || ''}"
`;

  const copyCmd = () => {
    navigator.clipboard.writeText(connectionString);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const copyEnv = () => {
    navigator.clipboard.writeText(envSample);
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 2000);
  };

  const copyLocalEnv = () => {
    navigator.clipboard.writeText(localEnvSample);
    setCopiedLocalEnv(true);
    setTimeout(() => setCopiedLocalEnv(false), 2000);
  };

  const localEnvSample = `# Konfigurasi Database MySQL Server Lokal (XAMPP / Laragon / Localhost)
PORT="3000"
NODE_ENV="production"
DB_HOST="localhost"
DB_PORT="3306"
DB_USER="root"
DB_PASSWORD=""
DB_NAME=""
`;

  const localGuideItems = [
    {
      title: '1. Mengapa Muncul Error "HTTP_404 / Endpoint API Tidak Ditemukan"?',
      desc: 'Setelah Anda menjalankan "npm run build", aplikasi menghasilkan folder dist (frontend) dan server.js (backend Express):',
      steps: [
        'Aplikasi ini adalah Full-Stack Web App (React di frontend + Node.js Express di backend).',
        'Jika Anda membuka folder dist langsung di browser, atau menjalankannya via XAMPP Apache / Live Server tanpa Node.js, backend belum aktif.',
        'Akibatnya saat browser memanggil rute API (/api/db/status atau /api/anggota), server statis merespons dengan 404 (Not Found).',
        'Solusinya: Buka Terminal / Command Prompt di folder proyek Anda, lalu jalankan: "npm start" (atau "node server.js").',
        'Buka browser Anda di alamat: http://localhost:3000.',
      ],
    },
    {
      title: '2. Cara Menyiapkan Database MySQL Lokal di XAMPP / Laragon',
      desc: 'Jika Anda ingin menyimpan data ke MySQL di laptop/komputer server lokal Anda sendiri:',
      steps: [
        'Buka XAMPP Control Panel, pastikan service "MySQL" dan "Apache" sudah berstatus Running (Start).',
        'Buka browser dan akses phpMyAdmin di: http://localhost/phpmyadmin.',
        'Klik menu "Databases" / "Basis Data", ketikkan nama database baru (misal: db_ppdi) dengan Collation: utf8mb4_general_ci, lalu klik "Create".',
        'Buka tab "Ubah Konfigurasi (.env)" di modal ini, lalu klik tombol "Preset XAMPP/Localhost".',
        'Ketikkan nama database yang telah Anda buat di kolom DB_NAME.',
        'Klik "Simpan & Terapkan Konfigurasi". Sistem akan otomatis tersambung ke MySQL lokal Anda.',
        'Buka kembali tab "Status & Uji Koneksi", lalu klik tombol "Inisialisasi Seluruh Tabel SQL". Semua tabel PPDI akan dibuat otomatis!',
      ],
    },
    {
      title: '3. Langkah Lengkap Build & Menjalankan di Server Lokal',
      desc: 'Panduan baris perintah (CLI) lengkap di Command Prompt atau Terminal:',
      steps: [
        '1. npm install   (memastikan semua dependensi terpasang)',
        '2. npm run build (mengompilasi frontend ke folder dist dan backend ke server.js)',
        '3. npm start     (menjalankan server produksi di http://localhost:3000)',
        '4. Akses http://localhost:3000 pada Google Chrome / Firefox / Edge.',
      ],
    },
    {
      title: '4. Menghubungkan ke MySQL Remote Hosting dari Komputer Lokal',
      desc: 'Jika komputer lokal Anda ingin langsung terhubung ke database server hosting:',
      steps: [
        'Buka cPanel server database di domain atau IP server hosting Anda (port 2083).',
        'Pilih menu "Remote MySQL" di bagian Databases.',
        'Masukkan tanda "%" pada Access Host lalu klik "Add Host" agar firewall hosting mengizinkan koneksi dari IP lokal Anda.',
        'Pastikan host, user, dan password database diisi dengan benar di tab "Ubah Konfigurasi (.env)".',
      ],
    },
  ];

  const guideItems = [
    {
      title: '1. Masalah ETIMEDOUT / Firewall Port 3306 (Paling Sering)',
      desc: 'Jika Anda melihat error ETIMEDOUT (Connection timed out) saat membuka website di hosting:',
      steps: [
        'Buka cPanel server database di domain hosting Anda (port 2083).',
        'Cari dan klik menu "Remote MySQL" di bagian DATABASES.',
        'Pada kotak "Add Access Host", masukkan tanda "%" (tanda persen, artinya izinkan semua host) atau masukkan IP publik server tempat aplikasi Anda di-hosting.',
        'Klik tombol "Add Host". Port 3306 sekarang akan menerima koneksi dari hosting Anda.',
      ],
    },
    {
      title: '2. Website dan Database Berada di Server Hosting cPanel yang SAMA',
      desc: 'Jika Anda mengunggah aplikasi Node.js ke cPanel yang sama dengan database MySQL:',
      steps: [
        'Firewall internal cPanel (CSF/iptables) seringkali memblokir koneksi ke IP publiknya sendiri.',
        'Solusinya: Gunakan "localhost" atau "127.0.0.1" pada DB_HOST jika web dan DB berada di server yang sama.',
        'Klik tombol "Uji Koneksi ke localhost" di atas atau ubah DB_HOST di tab "Ubah .env".',
      ],
    },
    {
      title: '3. File .env Tidak Ditemukan atau Tersembunyi di cPanel',
      desc: 'Secara default, File Manager cPanel menyembunyikan file berawalan titik (.env):',
      steps: [
        'Buka cPanel -> File Manager.',
        'Klik tombol "Settings" (Pengaturan) di pojok kanan atas layar File Manager.',
        'Beri tanda centang pada "Show Hidden Files (dotfiles)" lalu klik "Save".',
        'Pastikan file .env berada di root folder aplikasi Anda (sejajar dengan server.js dan folder dist).',
        'Jika belum ada, buat file baru bernama .env lalu salin format konfigurasi dari tombol di bawah.',
      ],
    },
    {
      title: '4. Hak Akses (Privileges) User MySQL ke Database',
      desc: 'Jika muncul error ER_ACCESS_DENIED_ERROR:',
      steps: [
        'Buka cPanel -> "MySQL Databases".',
        'Di bagian "Add User To Database", pilih User dan Database yang telah Anda buat.',
        'Klik "Add", lalu beri centang pada "ALL PRIVILEGES" dan klik "Make Changes".',
      ],
    },
    {
      title: '5. Restart Node.js Application di cPanel',
      desc: 'Setelah mengubah file .env di cPanel:',
      steps: [
        'Buka cPanel -> menu "Setup Node.js App".',
        'Cari aplikasi Anda, lalu klik tombol icon "Restart" (putar) agar server Node.js membaca file .env yang baru.',
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col my-6 border border-neutral-200 text-xs overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              dbStatus?.success ? 'bg-emerald-800 text-amber-300' : 'bg-amber-600 text-white'
            }`}>
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-neutral-900">
                  Diagnostik Koneksi Database MySQL
                </h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                  dbStatus?.success ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                }`}>
                  {dbStatus?.success ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
              <p className="text-[11px] text-neutral-500">
                Pangkalan Data: <span className="font-mono font-semibold text-neutral-800">{dbStatus?.database || '-'}</span> · Host: <span className="font-mono font-semibold text-neutral-800">{dbStatus?.host || '-'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200 rounded-lg cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-neutral-200 bg-neutral-100/70 px-4 text-xs font-semibold overflow-x-auto">
          <button
            onClick={() => setActiveTab('status')}
            className={`py-2.5 px-3 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'status'
                ? 'border-emerald-800 text-emerald-900 font-bold bg-white'
                : 'border-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Status & Uji Koneksi</span>
          </button>

          <button
            onClick={() => setActiveTab('localguide')}
            className={`py-2.5 px-3 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'localguide'
                ? 'border-emerald-800 text-emerald-900 font-bold bg-white'
                : 'border-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Laptop className="w-3.5 h-3.5 text-emerald-700" />
            <span>Panduan Server Lokal</span>
          </button>

          <button
            onClick={() => setActiveTab('guide')}
            className={`py-2.5 px-3 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'guide'
                ? 'border-emerald-800 text-emerald-900 font-bold bg-white'
                : 'border-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Panduan cPanel</span>
          </button>

          <button
            onClick={() => setActiveTab('config')}
            className={`py-2.5 px-3 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'config'
                ? 'border-emerald-800 text-emerald-900 font-bold bg-white'
                : 'border-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Ubah Konfigurasi (.env)</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto max-h-[72vh]">
          {/* TAB 1: STATUS & UJI KONEKSI */}
          {activeTab === 'status' && (
            <div className="space-y-4">
              {/* Critical Alert if HTTP_404 or backend not running */}
              {(dbStatus?.code === 'HTTP_404' || dbStatus?.error?.includes('404') || dbStatus?.status?.includes('HTML')) && (
                <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl text-neutral-900 text-xs space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 bg-amber-200 text-amber-900 rounded-lg shrink-0 mt-0.5">
                      <Laptop className="w-5 h-5 text-amber-900" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-amber-950 text-xs sm:text-sm">
                        Penyebab Utama: Backend Node.js (server.js) Belum Dijalankan di Server Lokal
                      </h3>
                      <p className="text-[11px] text-amber-900 mt-1 leading-relaxed">
                        Error <strong>HTTP_404 (Endpoint API Tidak Ditemukan)</strong> terjadi karena browser mengakses halaman web statis, namun backend Node.js belum aktif untuk melayani rute API database (<code className="bg-amber-100 font-mono px-1 rounded">/api/db/status</code>).
                      </p>
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-amber-200 font-mono text-[11px] space-y-1.5">
                    <div className="font-sans font-bold text-[10px] text-neutral-500 uppercase tracking-wide">
                      Langkah Menjalankan di Komputer / Server Lokal:
                    </div>
                    <div className="text-emerald-800 font-bold flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span>1. Buka Terminal / CMD di folder proyek Anda</span>
                    </div>
                    <div className="text-emerald-900 font-bold bg-neutral-100 p-2 rounded flex items-center justify-between">
                      <span>npm start</span>
                      <span className="text-[10px] text-neutral-500 font-sans font-normal">(atau: node server.js)</span>
                    </div>
                    <div className="text-neutral-800 text-[11px]">
                      2. Buka browser di alamat: <strong className="text-emerald-800 font-bold">http://localhost:3000</strong>
                    </div>
                    <div className="text-neutral-500 text-[10px] font-sans">
                      * Jangan membuka file dari folder dist via XAMPP htdocs atau Live Server tanpa menyalakan server.js.
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-amber-200">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleApplyApiUrl(`http://${typeof window !== 'undefined' ? (window.location.hostname || 'localhost') : 'localhost'}:3000`)}
                        className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-amber-300 rounded text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Laptop className="w-3.5 h-3.5" />
                        <span>Hubungkan ke Backend Port 3000</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('localguide')}
                        className="text-[11px] font-bold text-amber-900 hover:text-amber-950 underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>Panduan Server Lokal</span>
                        <ChevronDown className="w-3 h-3 -rotate-90" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handlePresetLocalhost();
                        setActiveTab('config');
                      }}
                      className="px-3 py-1 bg-amber-700 hover:bg-amber-800 text-white rounded text-xs font-semibold cursor-pointer"
                    >
                      Gunakan DB Localhost
                    </button>
                  </div>
                </div>
              )}

              {/* Primary Status Card */}
              <div
                className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                  dbStatus?.success
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-red-50 border-red-300 text-red-950'
                }`}
              >
                <div className="flex items-start gap-3">
                  {dbStatus?.success ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-red-700 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-bold text-sm">
                      {dbStatus?.success ? 'MySQL Terhubung Aktif di Hosting' : 'Koneksi ke MySQL Hosting Terputus / Gagal'}
                    </div>
                    <div className="text-[11px] mt-0.5 leading-relaxed">
                      {dbStatus?.success ? (
                        <>
                          Latensi: <strong className="font-mono text-emerald-800">{dbStatus.latencyMs} ms</strong> · Server Version:{' '}
                          <span className="font-mono">{dbStatus.serverVersion}</span> ·{' '}
                          <span className="font-semibold text-emerald-800">{dbStatus.tablesCount || 0} Tabel SQL Aktif</span>
                        </>
                      ) : (
                        <>
                          <span className="font-semibold text-red-900">Penyebab: </span>
                          {dbStatus?.diagnosis || dbStatus?.hint || dbStatus?.error || 'Koneksi gagal'}
                          {dbStatus?.code && (
                            <span className="ml-1 font-mono text-[10px] bg-red-200/80 px-1.5 py-0.5 rounded text-red-950">
                              Kode: {dbStatus.code}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                  <button
                    onClick={handleTestPing}
                    disabled={isTesting || isCheckingDb}
                    className="px-3 py-1.5 bg-white hover:bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-semibold text-neutral-800 transition-all cursor-pointer flex items-center gap-1.5 shadow-xs shrink-0 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTesting || isCheckingDb ? 'animate-spin' : ''}`} />
                    <span>{isTesting ? 'Menguji...' : 'Uji Koneksi Sekarang'}</span>
                  </button>
                </div>
              </div>

              {/* Instant Test Feedback if any */}
              {testResult && (
                <div
                  className={`p-3 rounded-xl text-xs font-medium border flex items-start justify-between gap-2 ${
                    testResult.success
                      ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                      : 'bg-amber-100 text-amber-900 border-amber-300'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    )}
                    <span>{testResult.message}</span>
                  </div>
                  {testResult.isLocalhostTest && testResult.success && (
                    <button
                      onClick={handleApplyLocalhost}
                      disabled={isSavingCfg}
                      className="px-2.5 py-1 bg-emerald-800 hover:bg-emerald-900 text-white rounded font-bold text-[11px] shrink-0 cursor-pointer"
                    >
                      {isSavingCfg ? 'Menerapkan...' : 'Ganti ke localhost'}
                    </button>
                  )}
                </div>
              )}

              {/* Quick Action: Coba Host Alternatif (localhost) */}
              {!dbStatus?.success && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="font-bold text-amber-900 flex items-center gap-1.5">
                      <Flame className="w-4 h-4 text-amber-700" />
                      <span>Solusi Cepat untuk Server cPanel:</span>
                    </div>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Jika web dan database di hosting yang sama, gunakan "localhost" pada DB_HOST untuk menghindari blokir firewall.
                    </p>
                  </div>
                  <button
                    onClick={handleTestLocalhost}
                    disabled={isTestingLocalhost}
                    className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1 shrink-0 text-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTestingLocalhost ? 'animate-spin' : ''}`} />
                    <span>{isTestingLocalhost ? 'Menguji localhost...' : 'Uji Koneksi ke localhost'}</span>
                  </button>
                </div>
              )}

              {/* Status File .env & Parameter Table */}
              <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                  <span className="font-bold text-neutral-800 text-[11px] uppercase tracking-wider">
                    Parameter Koneksi MySQL Aktif
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-neutral-500">File .env:</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        dbStatus?.envDetected
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {dbStatus?.envDetected ? 'Terdeteksi di Hosting' : 'Tidak Ditemukan / Hilang'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-neutral-400 text-[10px] block">URL / IP Server</span>
                    <span className="font-mono font-bold text-neutral-900">{dbStatus?.host || '-'}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 text-[10px] block">Port MySQL</span>
                    <span className="font-mono font-bold text-neutral-900">{dbStatus?.port || 3306}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 text-[10px] block">User MySQL</span>
                    <span className="font-mono font-bold text-neutral-900">{dbStatus?.user || '-'}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 text-[10px] block">Nama Database</span>
                    <span className="font-mono font-bold text-emerald-800">{dbStatus?.database || '-'}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 text-[10px] block">Password</span>
                    <span className="font-mono text-neutral-700 bg-white px-1.5 py-0.5 rounded border border-neutral-200">
                      ••••••••
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-400 text-[10px] block">Mode Penyimpanan</span>
                    <span className="font-semibold text-neutral-800">
                      {dbStatus?.success ? 'MySQL Remote Live' : 'Offline / Cache Lokal'}
                    </span>
                  </div>
                </div>
              </div>

              {/* CLI Command */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-neutral-600">
                  <span className="font-semibold flex items-center gap-1">
                    <Terminal className="w-3.5 h-3.5 text-neutral-500" />
                    <span>Uji Melalui Terminal SSH Hosting:</span>
                  </span>
                  <button
                    onClick={copyCmd}
                    className="text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer font-medium"
                  >
                    {copiedCmd ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCmd ? 'Tersalin' : 'Salin Perintah'}</span>
                  </button>
                </div>
                <div className="bg-neutral-950 text-emerald-300 font-mono p-2.5 rounded-lg text-[11px] overflow-x-auto select-all">
                  {connectionString}
                </div>
              </div>

              {/* Action buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-neutral-100">
                <button
                  onClick={handleInit}
                  disabled={isInitializing}
                  className="px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <Layers className="w-4 h-4" />
                  <span>{isInitializing ? 'Membuat Tabel...' : 'Inisialisasi Seluruh Tabel ke DB'}</span>
                </button>

                <button
                  onClick={() => setActiveTab('guide')}
                  className="px-3.5 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-semibold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <HelpCircle className="w-4 h-4 text-neutral-600" />
                  <span>Buka Panduan Solusi Hosting cPanel</span>
                </button>
              </div>

              {initMsg && (
                <div
                  className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 ${
                    initMsg.success
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      : 'bg-red-100 text-red-900 border border-red-300'
                  }`}
                >
                  {initMsg.success ? <CheckCircle2 className="w-4 h-4 text-emerald-700" /> : <AlertTriangle className="w-4 h-4 text-red-700" />}
                  <span>{initMsg.message}</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PANDUAN SERVER LOKAL */}
          {activeTab === 'localguide' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900">
                <div className="font-bold flex items-center gap-1.5 text-emerald-950 mb-1">
                  <Laptop className="w-4 h-4 text-emerald-700" />
                  <span>Panduan Menjalankan di Server Lokal (Localhost / XAMPP / Laragon)</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Setelah menjalankan perintah <code>npm run build</code>, aplikasi menghasilkan file frontend di <code>dist/</code> dan backend di <code>server.js</code>.
                  Pastikan Anda menyalakan backend Express melalui <code>npm start</code> agar endpoint database (<code>/api/db/*</code>) dapat diakses.
                </p>
              </div>

              {/* Accordion Local Guide Items */}
              <div className="space-y-2">
                {localGuideItems.map((item, idx) => (
                  <div key={idx} className="border border-neutral-200 rounded-xl overflow-hidden bg-white">
                    <button
                      onClick={() => setOpenLocalGuideIndex(openLocalGuideIndex === idx ? null : idx)}
                      className="w-full px-4 py-3 text-left font-bold text-neutral-800 hover:bg-neutral-50 flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <Terminal className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        <span>{item.title}</span>
                      </span>
                      {openLocalGuideIndex === idx ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
                    </button>
                    {openLocalGuideIndex === idx && (
                      <div className="px-4 pb-4 pt-1 border-t border-neutral-100 text-neutral-700 bg-neutral-50/50 space-y-2">
                        <p className="text-xs text-neutral-600">{item.desc}</p>
                        <ol className="list-decimal pl-5 space-y-1.5 text-xs text-neutral-800">
                          {item.steps.map((s, sIdx) => (
                            <li key={sIdx} className="leading-relaxed">
                              {s}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Quick Copy Localhost .env Box */}
              <div className="p-4 bg-neutral-900 rounded-xl text-white space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold flex items-center gap-1.5 text-amber-300">
                    <FileCode className="w-4 h-4" />
                    <span>Konfigurasi .env untuk Server Lokal (XAMPP / Laragon):</span>
                  </span>
                  <button
                    onClick={copyLocalEnv}
                    className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-xs font-mono flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    {copiedLocalEnv ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedLocalEnv ? 'Tersalin' : 'Salin .env Lokal'}</span>
                  </button>
                </div>
                <pre className="font-mono text-[11px] text-amber-200/90 overflow-x-auto p-2 bg-black/40 rounded border border-white/10 select-all">
                  {localEnvSample}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 3: PANDUAN HOSTING CPANEL */}
          {activeTab === 'guide' && (
            <div className="space-y-4">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900">
                <div className="font-bold flex items-center gap-1.5 text-emerald-950 mb-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span>Mengapa setelah build di hosting tidak dapat tersambung ke database?</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Pada lingkungan hosting cPanel / VPS, kendala koneksi 90% disebabkan oleh pembatasan firewall port 3306,
                  Remote MySQL yang belum di-whitelist, atau file <code>.env</code> yang belum diunggah ke root folder hosting.
                  Ikuti langkah-langkah di bawah untuk mengatasinya dengan cepat:
                </p>
              </div>

              {/* Accordion Guide Items */}
              <div className="space-y-2">
                {guideItems.map((item, idx) => (
                  <div key={idx} className="border border-neutral-200 rounded-xl overflow-hidden bg-white">
                    <button
                      onClick={() => setOpenGuideIndex(openGuideIndex === idx ? null : idx)}
                      className="w-full px-4 py-3 text-left font-bold text-neutral-800 hover:bg-neutral-50 flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span>{item.title}</span>
                      {openGuideIndex === idx ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
                    </button>
                    {openGuideIndex === idx && (
                      <div className="px-4 pb-4 pt-1 border-t border-neutral-100 text-neutral-700 bg-neutral-50/50 space-y-2">
                        <p className="text-xs text-neutral-600">{item.desc}</p>
                        <ol className="list-decimal pl-5 space-y-1.5 text-xs text-neutral-800">
                          {item.steps.map((s, sIdx) => (
                            <li key={sIdx} className="leading-relaxed">
                              {s}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Quick Copy .env Box */}
              <div className="p-4 bg-neutral-900 rounded-xl text-white space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold flex items-center gap-1.5 text-emerald-300">
                    <FileCode className="w-4 h-4" />
                    <span>Template File .env Standar untuk Hosting:</span>
                  </span>
                  <button
                    onClick={copyEnv}
                    className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-xs font-mono flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    {copiedEnv ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedEnv ? 'Tersalin' : 'Salin .env'}</span>
                  </button>
                </div>
                <pre className="font-mono text-[11px] text-emerald-200/90 overflow-x-auto p-2 bg-black/40 rounded border border-white/10 select-all">
                  {envSample}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 4: UBAH KONFIGURASI (.ENV) */}
          {activeTab === 'config' && (
            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div className="p-3 bg-neutral-100 rounded-xl text-neutral-700 text-xs">
                Perubahan pada form ini akan langsung ditulis ke file <code>.env</code> dan koneksi database MySQL akan segera dihubungkan ulang.
              </div>

              {/* Presets Selector */}
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl space-y-2">
                <div className="text-[11px] font-bold text-neutral-800 flex items-center justify-between">
                  <span>Pilih Preset Konfigurasi Cepat:</span>
                  <span className="text-[10px] text-neutral-500 font-normal">Klik untuk mengisi otomatis form</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handlePresetLocalhost}
                    className="p-2.5 bg-white hover:bg-emerald-50 border border-neutral-300 hover:border-emerald-500 rounded-lg text-left transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-1.5 font-bold text-neutral-800 group-hover:text-emerald-900 text-xs">
                      <Laptop className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Preset XAMPP / Localhost</span>
                    </div>
                    <div className="text-[10px] text-neutral-500 mt-0.5 font-mono">
                      Host: localhost · User: root
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={handlePresetClear}
                    className="p-2.5 bg-white hover:bg-neutral-50 border border-neutral-300 hover:border-neutral-500 rounded-lg text-left transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-1.5 font-bold text-neutral-800 group-hover:text-neutral-900 text-xs">
                      <RefreshCw className="w-3.5 h-3.5 text-neutral-600" />
                      <span>Kosongkan / Reset Form</span>
                    </div>
                    <div className="text-[10px] text-neutral-500 mt-0.5 font-mono">
                      Reset seluruh input konfigurasi
                    </div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-neutral-700 uppercase text-[10px]">DB_HOST (URL / IP Host)</label>
                  <input
                    type="text"
                    value={cfgHost}
                    onChange={(e) => setCfgHost(e.target.value)}
                    required
                    placeholder="localhost atau IP server hosting"
                    className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg font-mono text-neutral-900 focus:ring-2 focus:ring-[#064E3B] outline-none"
                  />
                  <span className="text-[10px] text-neutral-500 block">
                    Gunakan <strong>localhost</strong> jika app & db di hosting yang sama.
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-neutral-700 uppercase text-[10px]">DB_PORT (Port MySQL)</label>
                  <input
                    type="number"
                    value={cfgPort}
                    onChange={(e) => setCfgPort(e.target.value)}
                    required
                    placeholder="3306"
                    className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg font-mono text-neutral-900 focus:ring-2 focus:ring-[#064E3B] outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-neutral-700 uppercase text-[10px]">DB_NAME (Nama Database)</label>
                  <input
                    type="text"
                    value={cfgDatabase}
                    onChange={(e) => setCfgDatabase(e.target.value)}
                    required
                    placeholder="nama_database_mysql"
                    className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg font-mono text-neutral-900 focus:ring-2 focus:ring-[#064E3B] outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-neutral-700 uppercase text-[10px]">DB_USER (Username MySQL)</label>
                  <input
                    type="text"
                    value={cfgUser}
                    onChange={(e) => setCfgUser(e.target.value)}
                    required
                    placeholder="username_mysql"
                    className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg font-mono text-neutral-900 focus:ring-2 focus:ring-[#064E3B] outline-none"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="font-bold text-neutral-700 uppercase text-[10px]">DB_PASSWORD (Password MySQL)</label>
                  <input
                    type="password"
                    value={cfgPassword}
                    onChange={(e) => setCfgPassword(e.target.value)}
                    placeholder="Password database MySQL (biarkan kosong jika tanpa password)"
                    className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg font-mono text-neutral-900 focus:ring-2 focus:ring-[#064E3B] outline-none"
                  />
                </div>
              </div>

              {cfgSaveMsg && (
                <div
                  className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 ${
                    cfgSaveMsg.success
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      : 'bg-red-100 text-red-900 border border-red-300'
                  }`}
                >
                  {cfgSaveMsg.success ? <CheckCircle2 className="w-4 h-4 text-emerald-700" /> : <AlertTriangle className="w-4 h-4 text-red-700" />}
                  <span>{cfgSaveMsg.message}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => {
                    setCfgHost('localhost');
                  }}
                  className="px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold rounded-lg cursor-pointer"
                >
                  Set ke localhost
                </button>
                <button
                  type="submit"
                  disabled={isSavingCfg}
                  className="px-5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-lg cursor-pointer shadow-sm transition-all disabled:opacity-50"
                >
                  {isSavingCfg ? 'Menyimpan & Menghubungkan...' : 'Simpan ke .env & Hubungkan Ulang'}
                </button>
              </div>

              {/* Custom API Base URL Setting (For separate frontend/backend or custom port) */}
              <div className="mt-4 p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-emerald-800" />
                    <span className="font-bold text-neutral-800 text-xs">URL Server Backend (API Node.js)</span>
                  </div>
                  <span className="text-[10px] text-neutral-500 font-mono">
                    {customApiUrl ? customApiUrl : 'Default: Terintegrasi (Port 3000)'}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-600 leading-relaxed">
                  Jika aplikasi frontend dibuka di server terpisah (misal XAMPP Apache di port 80 atau Vite di port 5173/4173), tentukan alamat backend Express Anda di bawah ini:
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customApiUrl}
                    onChange={(e) => setCustomApiUrl(e.target.value)}
                    placeholder="http://localhost:3000 atau https://domain-hosting-anda.com"
                    className="flex-1 p-2 bg-white border border-neutral-300 rounded-lg font-mono text-xs text-neutral-900 focus:ring-2 focus:ring-[#064E3B] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleApplyApiUrl(customApiUrl)}
                    className="px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 text-amber-300 font-bold text-xs rounded-lg cursor-pointer whitespace-nowrap shadow-xs"
                  >
                    Terapkan & Uji
                  </button>
                  {customApiUrl && (
                    <button
                      type="button"
                      onClick={() => handleApplyApiUrl('')}
                      className="px-2.5 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 text-xs rounded-lg cursor-pointer whitespace-nowrap"
                      title="Kembalikan ke default terintegrasi"
                    >
                      Reset
                    </button>
                  )}
                </div>
                {apiUrlMsg && (
                  <div className={`p-2 rounded text-[11px] ${apiUrlMsg.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium' : 'bg-red-50 text-red-800'}`}>
                    {apiUrlMsg.message}
                  </div>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between">
          <span className="text-[11px] text-neutral-500 font-mono hidden sm:inline">
            Status: {dbStatus?.success ? '🟢 Terhubung ke MariaDB / MySQL' : '🔴 Belum Terhubung'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-neutral-700 bg-neutral-200 hover:bg-neutral-300 rounded-lg cursor-pointer transition-colors ml-auto"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
