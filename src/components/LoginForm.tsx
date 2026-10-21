import React, { useState, useEffect } from 'react';
import { usePPDI } from '../context/PPDIContext';
import { updateFaviconAndTitle } from '../utils/ppdiHelpers';
import {
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  QrCode,
  Database,
  CheckCircle2,
  AlertTriangle,
  Server,
  Shield,
  HelpCircle,
} from 'lucide-react';
import { DbConnectionModal } from './DbConnectionModal';

interface LoginFormProps {
  onOpenPublicVerify: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onOpenPublicVerify }) => {
  const {
    login,
    appSettings,
    kecamatanList,
    fullMembers,
    dbStatus,
    isCheckingDb,
    checkDbStatus,
    isDbModalOpen,
    setIsDbModalOpen,
    dbAlertVisible,
    setDbAlertVisible,
  } = usePPDI();

  // Dynamically update document title & favicon based on uploaded logo & title settings
  useEffect(() => {
    const title = `${appSettings?.appName || 'PPDI KAB. BANDUNG'}${
      appSettings?.appSubtitle ? ` - ${appSettings.appSubtitle}` : ' - Portal Keanggotaan'
    }`;
    updateFaviconAndTitle(appSettings?.logoUrl, title);
  }, [appSettings?.logoUrl, appSettings?.appName, appSettings?.appSubtitle]);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoginPopupOpen, setIsLoginPopupOpen] = useState(false);

  // Rekapitulasi anggota perkecamatan sorted descending by member count
  const kecamatanRecap = React.useMemo(() => {
    const counts: { [kecId: string]: { nama: string; count: number } } = {};
    (kecamatanList || []).forEach(k => {
      counts[k.id_kecamatan] = { nama: k.nama_kecamatan, count: 0 };
    });
    (fullMembers || []).forEach(m => {
      const kecId = m.desa?.id_kecamatan || m.kecamatan?.id_kecamatan;
      if (kecId && counts[kecId]) {
        counts[kecId].count += 1;
      }
    });
    return Object.entries(counts)
      .map(([id, data]) => ({ id_kecamatan: id, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [kecamatanList, fullMembers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      const result = await login(username, password);
      if (!result.success) {
        setErrorMsg(result.message || 'Login gagal. Periksa NIPD/Username dan password.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan saat proses login.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setErrorMsg('');
  };

  // Determine background style based on appSettings
  const getBackgroundStyle = () => {
    const bgType = appSettings?.loginBackgroundType || 'preset_emerald';
    if (bgType === 'custom_image' && appSettings?.loginBackgroundImage) {
      return {
        backgroundImage: `linear-gradient(rgba(6, 78, 59, ${appSettings.loginOverlayOpacity || '0.6'}), rgba(17, 17, 19, ${appSettings.loginOverlayOpacity || '0.7'})), url("${appSettings.loginBackgroundImage}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      };
    }
    if (bgType === 'gradient_mesh') {
      return {
        background: 'radial-gradient(at 0% 0%, #064E3B 0px, transparent 50%), radial-gradient(at 100% 0%, #047857 0px, transparent 50%), radial-gradient(at 100% 100%, #15803d 0px, transparent 50%), radial-gradient(at 0% 100%, #0f172a 0px, transparent 50%), #064E3B',
      };
    }
    if (bgType === 'dark_slate') {
      return {
        background: 'radial-gradient(circle at 50% 20%, #1e293b 0%, #090d16 100%)',
      };
    }
    return {
      backgroundColor: 'var(--bg)',
    };
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center p-4 sm:p-6 pt-20 sm:pt-24 relative overflow-hidden transition-all duration-300"
      style={{
        ...getBackgroundStyle(),
        color: 'var(--ink)',
        fontFamily: "'Geist', 'Plus Jakarta Sans', sans-serif",
      }}
    >
      {/* Top Navbar with live Database Connection Status Trigger */}
      <header className="absolute top-0 left-0 right-0 z-20 px-4 sm:px-8 py-3.5 flex items-center justify-between border-b border-white/10 bg-black/25 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          {appSettings?.logoUrl ? (
            <img
              src={appSettings.logoUrl}
              alt="Logo"
              className="w-7 h-7 rounded-lg object-contain bg-white/10 p-0.5 border border-white/15 shadow-xs"
            />
          ) : (
            <div className="w-7 h-7 rounded-lg bg-[#064E3B] text-amber-300 flex items-center justify-center font-bold text-xs shadow-xs border border-white/15">
              <Shield className="w-3.5 h-3.5" />
            </div>
          )}
          <span className="text-xs font-mono tracking-widest uppercase text-emerald-300/80">
                PORTAL RESMI KEANGGOTAAN
          </span>
          <span className="text-xs sm:text-sm font-bold tracking-tight text-white uppercase font-mono">
            {appSettings?.appName || 'PPDI KAB. BANDUNG'}
          </span>
          

        </div>

        {/* Database Status Trigger Pill */}
        <div className="flex items-center gap-2">
          {isCheckingDb ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/40 backdrop-blur-md border border-amber-400/40 text-amber-300 text-xs font-mono shadow-xs">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
              <span className="hidden sm:inline">Mengecek Koneksi MySQL...</span>
              <span className="sm:hidden">Cek DB...</span>
            </div>
          ) : dbStatus?.success ? (
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/70 backdrop-blur-md border border-emerald-500/50 text-emerald-200 text-xs font-mono shadow-sm select-none"
              title="Status: Database MySQL Terhubung Aktif"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline font-semibold">MySQL Terhubung ({dbStatus.latencyMs}ms)</span>
              <span className="sm:hidden font-semibold">MySQL Aktif</span>
            </div>
          ) : (
            <button
              onClick={() => setIsDbModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-950/90 hover:bg-red-900 backdrop-blur-md border border-red-500/70 text-red-200 text-xs font-mono transition-all cursor-pointer shadow-md animate-pulse"
              title="Database MySQL belum terhubung di hosting. Klik untuk membuka diagnostik & panduan cPanel."
            >
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />
              <span className="hidden sm:inline font-semibold">MySQL Belum Konek (Klik Cek)</span>
              <span className="sm:hidden font-semibold">MySQL Offline</span>
            </button>
          )}

          <button
            onClick={() => checkDbStatus()}
            disabled={isCheckingDb}
            title="Picu Cek Ulang Koneksi Database Sekarang"
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white/90 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingDb ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Subtle radial ambient glow in the background */}
      <div
        className="absolute pointer-events-none -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-25 blur-3xl"
        style={{ background: 'radial-gradient(circle, #10b981 0%, transparent 70%)' }}
      />
      <div
        className="absolute pointer-events-none -bottom-40 -right-40 w-[600px] h-[600px] rounded-full opacity-20 blur-3xl"
        style={{ background: 'radial-gradient(circle, #FDE047 0%, transparent 70%)' }}
      />

      <div
        className="w-full max-w-[1200px] grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-8 lg:gap-16 items-center relative z-10"
      >
        {/* Startup Alert Banner if Disconnected in Hosting */}
        {dbAlertVisible && !dbStatus?.success && !isCheckingDb && (
          <div className="col-span-1 lg:col-span-2 p-4 rounded-xl bg-red-950/85 border border-red-500/60 backdrop-blur-md text-white shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-900/60 border border-red-700/50 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="w-4 h-4 text-amber-300" />
              </div>
              <div>
                <div className="font-bold text-sm text-red-200 flex flex-wrap items-center gap-2">
                  <span>
                    {dbStatus?.code === 'HTTP_404' || dbStatus?.error?.includes('404')
                      ? 'Server Backend Node.js Belum Berjalan (404)'
                      : 'Database MySQL Belum Tersambung'}
                  </span>
                  {dbStatus?.code && (
                    <span className="font-mono text-[10px] bg-red-900 px-2 py-0.5 rounded text-red-200 border border-red-700">
                      {dbStatus.code}
                    </span>
                  )}
                  <span className="text-[11px] font-mono text-red-300/80">
                    ({dbStatus?.host ? `${dbStatus.host}:${dbStatus.port || 3306}` : 'Port 3000 / 3306'})
                  </span>
                </div>
                <p className="text-xs text-red-100/90 mt-1 max-w-3xl leading-relaxed">
                  {dbStatus?.diagnosis || (dbStatus?.code === 'HTTP_404' || dbStatus?.error?.includes('404')
                    ? 'Setelah "npm run build", backend Express harus dijalankan: jalankan "npm start" (atau "node server.js") di terminal lalu buka http://localhost:3000.'
                    : 'Aplikasi tidak dapat menghubungi database MySQL.')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end pt-2 md:pt-0">
              <button
                onClick={() => checkDbStatus()}
                disabled={isCheckingDb}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-xs font-mono text-white flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isCheckingDb ? 'animate-spin' : ''}`} />
                <span>Cek Ulang</span>
              </button>
              <button
                onClick={() => setIsDbModalOpen(true)}
                className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-neutral-950 rounded-lg text-xs font-bold font-mono uppercase tracking-wide cursor-pointer transition-colors shadow-sm flex items-center gap-1"
              >
                <span>Solusi Hosting cPanel</span>
              </button>
              <button
                onClick={() => setDbAlertVisible(false)}
                className="p-1.5 text-white/60 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer ml-1"
                title="Tutup Peringatan (Aplikasi berjalan dalam mode offline)"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Left Column: Hero */}
        <div className="hero">
          {/* Logo display if configured in Setting Aplikasi */}
          <div className="mb-6 flex items-center gap-3.5">
            {appSettings?.logoUrl ? (
              <img
                src={appSettings.logoUrl}
                alt="Logo Organisasi"
                className="w-16 h-16 sm:w-20 sm:h-20 object-contain drop-shadow-md rounded-xl p-1.5 bg-white/10 backdrop-blur-md border border-white/20"
              />
            ) : (
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-[#064E3B] text-amber-300 flex items-center justify-center font-bold shadow-md border border-white/20">
                <Shield className="w-8 h-8 text-emerald-300" />
              </div>
            )}
            <div>
              <span className="text-xs font-mono tracking-widest uppercase text-emerald-300/90 font-bold block">
                PORTAL RESMI KEANGGOTAAN
              </span>
              <span className="text-[11px] font-mono text-white/70 block uppercase">
                {appSettings?.appName || 'PPDI KABUPATEN BANDUNG'}
              </span>
            </div>
          </div>

          <h1
            className="uppercase tracking-tight font-extrabold"
            style={{
              color: 'var(--accent)',
              fontSize: 'clamp(2.75rem, 7vw, 5.5rem)',
              lineHeight: 0.9,
              letterSpacing: '-0.04em',
              marginBottom: '1.5rem',
            }}
          >
            {appSettings?.appName ? appSettings.appName : (
              <>
                PPDI
                <br />
                KAB. BANDUNG
              </>
            )}
          </h1>

          <p
            style={{
              fontSize: '1.15rem',
              opacity: 0.85,
              maxWidth: '520px',
              marginBottom: '2.5rem',
              lineHeight: 1.6,
            }}
          >
            {appSettings?.appSubtitle ||
              'Portal Keanggotaan Persatuan Perangkat Desa Indonesia (PPDI) Kabupaten Bandung: E-KTA QR Code, Rekap Wilayah, Purna Tugas, & e-Arsip SK.'}
          </p>

          {/* Public Action & Login Popup Trigger */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <button
              type="button"
              onClick={onOpenPublicVerify}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg text-xs font-mono uppercase tracking-wider text-[#F8F7F4] bg-white/10 hover:bg-white/15 border border-white/15 transition-all cursor-pointer backdrop-blur-md shadow-sm"
            >
              <QrCode className="w-4 h-4 text-[#FDE047]" />
              <span>Registrasi Perangkat Desa (Formulir Induk)</span>
            </button>

            <button
              type="button"
              onClick={() => setIsLoginPopupOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg text-xs font-mono uppercase tracking-wider text-neutral-900 bg-[#FDE047] hover:bg-[#fcc800] transition-all cursor-pointer shadow-md font-bold"
            >
              <span>Login Sistem</span>
            </button>
          </div>

          {/* Rekapitulasi Anggota Per Kecamatan Table */}
          <div className="mt-8 bg-black/30 backdrop-blur-md rounded-xl border border-white/10 p-4 max-w-xl text-white">
            <h3 className="text-xs font-mono uppercase tracking-wider text-emerald-300 mb-3 flex items-center justify-between">
              <span>Rekapitulasi Anggota Per Kecamatan</span>
              <span className="text-[10px] bg-emerald-900/60 px-2 py-0.5 rounded text-emerald-200">
                Total: {(fullMembers || []).length} Anggota Terdaftar
              </span>
            </h3>
            <div className="max-h-52 overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
              {kecamatanRecap.map((item, idx) => (
                <div key={item.id_kecamatan} className="flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs transition-colors">
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono text-emerald-400 text-[10px] w-5">{idx + 1}.</span>
                    <span className="truncate font-medium">{item.nama.toUpperCase().startsWith('KEC.') ? item.nama : `Kecamatan ${item.nama}`}</span>
                  </div>
                  <span className="font-mono font-bold bg-[#064E3B] text-emerald-200 px-2.5 py-0.5 rounded text-[11px]">
                    {item.count} Anggota
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column / Empty spacer on desktop */}
        <div className="hidden lg:block"></div>
      </div>

      {/* Login Popup Modal */}
      {isLoginPopupOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className="w-full max-w-md relative animate-in fade-in zoom-in-95 duration-200"
            style={{
              background: 'var(--panel)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid var(--border)',
              padding: '2.5rem',
              borderRadius: '1rem',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
              color: 'var(--ink)',
            }}
          >
            <button
              type="button"
              onClick={() => setIsLoginPopupOpen(false)}
              className="absolute top-4 right-4 text-white/70 hover:text-white p-1 rounded-md hover:bg-white/10 cursor-pointer"
            >
              ✕
            </button>
          <div className="flex items-center gap-3.5 mb-6 pb-4 border-b border-white/10">
            {appSettings?.logoUrl ? (
              <img
                src={appSettings.logoUrl}
                alt="Logo"
                className="w-12 h-12 rounded-xl object-contain bg-white/10 p-1 border border-white/20 shrink-0 shadow-sm"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-[#064E3B] text-amber-300 flex items-center justify-center shrink-0 border border-white/20 shadow-sm">
                <Shield className="w-6 h-6 text-emerald-300" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold text-white tracking-tight leading-tight truncate">
                {appSettings?.appName || 'Akses Sistem'}
              </h2>
              <span className="font-mono text-[10px] text-amber-300 tracking-wider uppercase block truncate mt-0.5">
                {appSettings?.appSubtitle || 'Auth Gateway · Portal Keanggotaan'}
              </span>
            </div>
          </div>

          {errorMsg && (
            <div
              style={{
                marginBottom: '1.25rem',
                padding: '0.75rem 1rem',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '0.5rem',
                color: '#fee2e2',
                fontSize: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <AlertCircle style={{ width: '1rem', height: '1rem', flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="input-group" style={{ marginBottom: '1.5rem' }}>
              <label
                style={{
                  display: 'block',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.7rem',
                  marginBottom: '0.5rem',
                  textTransform: 'uppercase',
                  color: 'rgba(248, 247, 244, 0.8)',
                  letterSpacing: '0.05em',
                }}
              >
                Nomor Induk Perangkat
              </label>
              <input
                className="input-field"
                type="text"
                placeholder="Masukkan NIPD / Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                style={{
                  width: '100%',
                  background: 'rgba(0, 0, 0, 0.25)',
                  border: '1px solid var(--border)',
                  padding: '0.9rem 1rem',
                  color: 'var(--ink)',
                  borderRadius: '0.5rem',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.875rem',
                  outline: 'none',
                  transition: 'all 0.2s',
                }}
              />
            </div>

            <div className="input-group" style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.7rem',
                    textTransform: 'uppercase',
                    color: 'rgba(248, 247, 244, 0.8)',
                    letterSpacing: '0.05em',
                  }}
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'rgba(248, 247, 244, 0.6)',
                    fontSize: '0.65rem',
                    fontFamily: "'JetBrains Mono', monospace",
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                >
                  {showPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                  <span>{showPassword ? 'Hide' : 'Show'}</span>
                </button>
              </div>
              <input
                className="input-field"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  background: 'rgba(0, 0, 0, 0.25)',
                  border: '1px solid var(--border)',
                  padding: '0.9rem 1rem',
                  color: 'var(--ink)',
                  borderRadius: '0.5rem',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.875rem',
                  outline: 'none',
                  transition: 'all 0.2s',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '1rem',
                borderRadius: '0.5rem',
                fontWeight: 800,
                cursor: 'pointer',
                border: 'none',
                textTransform: 'uppercase',
                fontSize: '0.8rem',
                letterSpacing: '0.05em',
                transition: '0.3s',
                backgroundColor: 'var(--accent)',
                color: 'var(--bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
            >
              {loading ? (
                <>
                  <RefreshCw className="animate-spin" size={14} />
                  <span>Memverifikasi...</span>
                </>
              ) : (
                <span>Masuk ke Portal</span>
              )}
            </button>
          </form>

          <div
            className="meta"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.7rem',
              opacity: 0.5,
              marginTop: '1.5rem',
              textAlign: 'center',
              letterSpacing: '0.05em',
            }}
          >
            © 2026 PPDI KABUPATEN BANDUNG
          </div>
        </div>
        </div>
      )}


    </div>
  );
};
