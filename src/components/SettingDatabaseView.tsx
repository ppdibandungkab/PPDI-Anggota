import React, { useState } from 'react';
import { usePPDI } from '../context/PPDIContext';
import {
  Database,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Copy,
  Check,
  Server,
  ShieldCheck,
} from 'lucide-react';

export const SettingDatabaseView: React.FC = () => {
  const { dbStatus, checkDbStatus, initDbTables } = usePPDI();
  const [isTesting, setIsTesting] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initMsg, setInitMsg] = useState('');
  const [copied, setCopied] = useState(false);

  const handleTestPing = async () => {
    setIsTesting(true);
    await checkDbStatus();
    setIsTesting(false);
  };

  const handleInit = async () => {
    setIsInitializing(true);
    setInitMsg('');
    const res = await initDbTables();
    if (res.success) {
      setInitMsg('Tabel database MySQL berhasil dibuat / diinisialisasi ulang!');
    } else {
      setInitMsg(`Gagal inisialisasi: ${res.message || 'Error koneksi database'}`);
    }
    setIsInitializing(false);
  };

  const connectionString = `mysql -h ${dbStatus?.host || 'localhost'} -u ${dbStatus?.user || 'root'} -p ${dbStatus?.database || 'db'}`;

  const copyCmd = () => {
    navigator.clipboard.writeText(connectionString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16 text-neutral-900">
      {/* Top Banner */}
      <div className="bg-[#064E3B] text-white p-6 rounded-xl shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Database className="w-6 h-6 text-amber-300" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight uppercase">
              Setting Database & Koneksi MySQL
            </h1>
          </div>
          <p className="text-emerald-100 text-xs sm:text-sm mt-1 max-w-3xl">
            Konfigurasi pangkalan data server, status koneksi port 3306, manajemen tabel, dan sinkronisasi live remote MySQL serverapp_db_anggota.
          </p>
        </div>
        <button
          onClick={handleTestPing}
          disabled={isTesting}
          className="flex items-center gap-2 px-4 py-2 bg-white text-[#064E3B] hover:bg-emerald-50 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer uppercase shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${isTesting ? 'animate-spin' : ''}`} />
          <span>{isTesting ? 'Menguji...' : 'Uji Koneksi Server'}</span>
        </button>
      </div>

      {/* Status Banner */}
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
              {dbStatus?.success ? 'MySQL Terhubung Aktif' : 'Status: ' + (dbStatus?.status || 'Terkonfigurasi')}
            </div>
            <div className="text-xs mt-1">
              {dbStatus?.success
                ? `Latensi: ${dbStatus.latencyMs} ms · Server Version: ${dbStatus.serverVersion} · Host: ${dbStatus.host}`
                : dbStatus?.error || 'Konfigurasi kredensial MySQL telah terpasang di file .env dan server.ts backend.'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="px-3 py-1 bg-white/80 border border-neutral-300 rounded-lg text-xs font-mono font-bold">
            {dbStatus?.tablesCount ? `${dbStatus.tablesCount} Tabel` : '17 Tabel Live'}
          </span>
        </div>
      </div>

      {/* Credentials Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-4 shadow-2xs">
          <div className="flex items-center gap-2 pb-3 border-b border-neutral-100 font-bold text-sm text-[#064E3B]">
            <Server className="w-4 h-4 text-emerald-700" />
            <span>Parameter Host & Kredensial MySQL</span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center p-2.5 bg-neutral-50 rounded-lg border border-neutral-100">
              <span className="text-neutral-500 font-medium">URL / IP Host Server</span>
              <span className="font-mono font-bold text-neutral-900">{dbStatus?.host || 'Dikonfigurasi di .env'}</span>
            </div>
            <div className="flex justify-between items-center p-2.5 bg-neutral-50 rounded-lg border border-neutral-100">
              <span className="text-neutral-500 font-medium">Port Koneksi</span>
              <span className="font-mono font-bold text-neutral-900">3306</span>
            </div>
            <div className="flex justify-between items-center p-2.5 bg-neutral-50 rounded-lg border border-neutral-100">
              <span className="text-neutral-500 font-medium">Nama Database</span>
              <span className="font-mono font-bold text-emerald-800">{dbStatus?.database || 'Dikonfigurasi di .env'}</span>
            </div>
            <div className="flex justify-between items-center p-2.5 bg-neutral-50 rounded-lg border border-neutral-100">
              <span className="text-neutral-500 font-medium">User Database</span>
              <span className="font-mono font-bold text-neutral-900">{dbStatus?.user || 'Dikonfigurasi di .env'}</span>
            </div>
            <div className="flex justify-between items-center p-2.5 bg-neutral-50 rounded-lg border border-neutral-100">
              <span className="text-neutral-500 font-medium">Password Kredensial</span>
              <span className="font-mono font-semibold text-neutral-700">•••••••• (Dikonfigurasi manual di .env)</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-4 shadow-2xs flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-neutral-100 font-bold text-sm text-[#064E3B]">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              <span>Perintah Terminal & Inisialisasi</span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-neutral-600">
                <span className="font-semibold">Perintah Koneksi CLI:</span>
                <button
                  onClick={copyCmd}
                  className="text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer font-medium"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Tersalin' : 'Salin Perintah'}</span>
                </button>
              </div>
              <div className="bg-neutral-900 text-emerald-300 font-mono p-3 rounded-lg text-xs overflow-x-auto">
                {connectionString}
              </div>
            </div>

            <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-[11px] text-neutral-600 space-y-1">
              <div className="font-bold text-neutral-800">Catatan Keamanan & Firewall:</div>
              <p>Pastikan IP server hosting mengizinkan sambungan port 3306 atau gunakan konfigurasi Remote MySQL cPanel jika diperlukan.</p>
            </div>
          </div>

          <div className="pt-4 border-t border-neutral-100 flex flex-col sm:flex-row items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleInit}
              disabled={isInitializing}
              className="w-full sm:w-auto px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-md"
            >
              <Layers className="w-4 h-4" />
              <span>{isInitializing ? 'Memproses...' : 'Inisialisasi Tabel Database'}</span>
            </button>
            {initMsg && (
              <span className="text-xs font-semibold text-emerald-800 text-center sm:text-right">
                {initMsg}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
