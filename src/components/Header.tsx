import React, { useState, useRef, useEffect, useMemo } from 'react';
import { usePPDI } from '../context/PPDIContext';
import {
  Shield,
  UserCheck,
  RefreshCw,
  Database,
  LogOut,
  Menu,
  X,
  ChevronDown,
  UserCog,
  Sliders,
  Check,
} from 'lucide-react';

export const Header: React.FC<{
  onOpenAddModal: () => void;
  onOpenVerifyModal: () => void;
  onOpenDbModal: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}> = ({ onOpenVerifyModal, onOpenDbModal, sidebarOpen, setSidebarOpen }) => {
  const {
    currentUser,
    switchUser,
    users,
    resetAllData,
    logout,
    dbStatus,
    isCheckingDb,
    checkDbStatus,
    refreshDataFromMySQL,
    isSyncing,
    appSettings,
    setActiveTab,
    kecamatanList,
    desaList,
  } = usePPDI();

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Close profile dropdown when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsProfileOpen(false);
      }
    };

    if (isProfileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isProfileOpen]);

  // Format initials for avatar
  const initials = useMemo(() => {
    if (!currentUser?.nama) return 'AD';
    const parts = currentUser.nama.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return currentUser.nama.slice(0, 2).toUpperCase();
  }, [currentUser?.nama]);

  // Format friendly role labels and styling
  const roleInfo = useMemo(() => {
    const role = currentUser?.role;
    switch (role) {
      case 'Superadmin_Kabupaten':
        return {
          shortLabel: 'Super Admin',
          fullLabel: 'Superadmin Kab. Bandung',
          badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        };
      case 'Admin_Kabupaten':
        return {
          shortLabel: 'Admin Kab.',
          fullLabel: 'Admin Kab. Bandung (PD)',
          badgeClass: 'bg-cyan-100 text-cyan-800 border-cyan-300',
        };
      case 'Admin_Kecamatan':
        return {
          shortLabel: 'Admin Kec.',
          fullLabel: 'Admin Kecamatan',
          badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
        };
      case 'Admin_Desa':
        return {
          shortLabel: 'Admin Desa',
          fullLabel: 'Admin Desa',
          badgeClass: 'bg-purple-100 text-purple-800 border-purple-300',
        };
      case 'Anggota':
        return {
          shortLabel: 'Anggota',
          fullLabel: 'Anggota PPDI',
          badgeClass: 'bg-neutral-100 text-neutral-800 border-neutral-300',
        };
      default:
        return {
          shortLabel: 'Admin',
          fullLabel: 'Administrator',
          badgeClass: 'bg-neutral-100 text-neutral-800 border-neutral-300',
        };
    }
  }, [currentUser?.role]);

  // Territory text (if admin kecamatan or desa)
  const territoryText = useMemo(() => {
    if (!currentUser) return null;
    if (currentUser.id_desa) {
      const desa = desaList?.find((d) => d.id_desa === currentUser.id_desa);
      if (desa) return `Desa ${desa.nama_desa}`;
    }
    if (currentUser.id_kecamatan) {
      const kec = kecamatanList?.find((k) => k.id_kecamatan === currentUser.id_kecamatan);
      if (kec) return `Kec. ${kec.nama_kecamatan}`;
    }
    return 'Kabupaten Bandung';
  }, [currentUser, desaList, kecamatanList]);

  return (
    <header className="sticky top-0 z-40 bg-[#F8F7F4]/95 backdrop-blur-md border-b border-[#111113]/10">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3 sm:gap-4">
          {/* Zone 1: Brand / Logo + Mobile Navigation Toggle */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 -ml-1 text-[#111113]/70 hover:text-[#064E3B] hover:bg-neutral-200/50 rounded-lg transition-colors md:hidden cursor-pointer"
              title="Buka / Sembunyikan Menu"
              aria-label="Toggle Navigation Menu"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            {appSettings?.logoUrl ? (
              <img
                src={appSettings.logoUrl}
                alt="Logo Organisasi"
                className="w-8 h-8 rounded-sm object-contain bg-white shadow-xs border border-neutral-200 p-0.5"
              />
            ) : (
              <div className="w-8 h-8 rounded-sm bg-[#064E3B] text-white flex items-center justify-center font-bold text-base shadow-xs">
                <Shield className="w-4 h-4 text-emerald-300" />
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-sm sm:text-base font-extrabold text-[#111113] tracking-tight whitespace-nowrap leading-tight uppercase">
                {appSettings?.appName || 'PPDI KABUPATEN BANDUNG'}
              </span>
              <span className="brand-meta text-[10px] text-[#111113]/60 whitespace-nowrap hidden sm:inline">
                {appSettings?.appSubtitle || 'SISTEM INFORMASI DATABASE & E-KTA PERANGKAT DESA'}
              </span>
            </div>
          </div>

          {/* Zone 2: Navigation Links & Database Status (Desktop) */}
          <div className="hidden lg:flex items-center gap-3 text-xs font-mono text-[#111113]/70">
            <button
              onClick={onOpenVerifyModal}
              className="flex items-center gap-1.5 hover:text-[#064E3B] transition-colors whitespace-nowrap cursor-pointer text-xs"
            >
              <UserCheck className="w-3.5 h-3.5 text-[#064E3B]" />
              <span>VERIFIKASI KTA</span>
            </button>

            <span className="text-[#111113]/20">/</span>

            {/* MySQL Status Chip with Live Latency & Diagnostic Trigger */}
            <div className="flex items-center gap-1">
              <button
                onClick={onOpenDbModal}
                title={
                  dbStatus?.success
                    ? `MySQL Terhubung (${dbStatus.latencyMs} ms · ${dbStatus.host}:${dbStatus.port || 3306}) - Klik untuk info tabel & diagnostik`
                    : 'MySQL Offline / Belum Terhubung - Klik untuk diagnosa & solusi hosting'
                }
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[11px] font-mono transition-colors cursor-pointer border ${
                  isCheckingDb
                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                    : dbStatus?.success
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
                    : 'bg-red-50 text-red-900 border-red-300 hover:bg-red-100 animate-pulse font-bold'
                }`}
              >
                <Database className="w-3 h-3 text-[#064E3B]" />
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isCheckingDb
                      ? 'bg-amber-500 animate-ping'
                      : dbStatus?.success
                      ? 'bg-emerald-600'
                      : 'bg-red-600'
                  }`}
                />
                <span>
                  {isCheckingDb
                    ? 'Cek DB...'
                    : dbStatus?.success
                    ? `MySQL (${dbStatus.latencyMs || 0}ms)`
                    : 'MySQL Offline'}
                </span>
              </button>

              <button
                onClick={() => checkDbStatus()}
                disabled={isCheckingDb}
                title="Picu uji ulang koneksi ke database sekarang"
                className="p-1 rounded-sm border border-[#111113]/15 text-[#111113]/70 hover:text-[#064E3B] hover:bg-white transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isCheckingDb ? 'animate-spin text-[#064E3B]' : ''}`} />
              </button>
            </div>

            {/* Sync from MySQL Button */}
            <button
              onClick={() => refreshDataFromMySQL()}
              title="Sinkronkan data langsung dari MySQL database"
              className="flex items-center gap-1 px-2 py-1 rounded-sm text-xs text-[#111113]/70 hover:text-[#064E3B] hover:bg-white transition-colors cursor-pointer border border-[#111113]/15 bg-white/50"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-[#064E3B]' : ''}`} />
              <span className="hidden xl:inline">{isSyncing ? 'Sinkron...' : 'Sync DB'}</span>
            </button>
          </div>

          {/* Zone 3: Compact User Profile & Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Quick Demo Data Reset (Subtle) */}
            <button
              onClick={() => {
                if (confirm('Reset seluruh data ke kondisi awal demo?')) {
                  resetAllData();
                }
              }}
              title="Reset data demo"
              className="p-1.5 text-[#111113]/30 hover:text-[#111113] hover:bg-neutral-200/50 rounded-sm transition-colors cursor-pointer hidden sm:inline-flex"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            {/* User Profile Capsule Trigger */}
            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setIsProfileOpen((prev) => !prev)}
                className={`flex items-center gap-2 pl-1.5 pr-2 sm:pr-2.5 py-1 rounded-full border transition-all cursor-pointer select-none ${
                  isProfileOpen
                    ? 'bg-white border-[#064E3B] shadow-sm ring-2 ring-[#064E3B]/10'
                    : 'bg-white/80 hover:bg-white border-[#111113]/15 hover:border-[#111113]/30 shadow-xs'
                }`}
                title={`Profil Pengguna: ${currentUser?.nama || 'Admin'}`}
                aria-expanded={isProfileOpen}
                aria-haspopup="true"
              >
                {/* Avatar with Status indicator */}
                <div className="relative shrink-0">
                  <div className="w-7 h-7 rounded-full bg-[#064E3B] text-amber-300 flex items-center justify-center font-bold text-xs shadow-xs border border-emerald-700/30">
                    {initials}
                  </div>
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white"
                    title="Online"
                  />
                </div>

                {/* Name & Role Text */}
                <div className="text-left hidden sm:flex flex-col leading-tight max-w-[120px] md:max-w-[170px]">
                  <span className="text-xs font-bold text-[#111113] truncate">
                    {currentUser?.nama || 'Administrator'}
                  </span>
                  <span className="text-[10px] text-[#111113]/60 font-mono truncate">
                    {roleInfo.shortLabel}
                  </span>
                </div>

                {/* Dropdown Chevron */}
                <ChevronDown
                  className={`w-3.5 h-3.5 text-[#111113]/50 transition-transform duration-200 ${
                    isProfileOpen ? 'rotate-180 text-[#064E3B]' : ''
                  }`}
                />
              </button>

              {/* Profile Dropdown Menu */}
              {isProfileOpen && (
                <div
                  className="absolute right-0 mt-2 w-72 sm:w-80 bg-white rounded-lg shadow-xl border border-[#111113]/10 py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                  role="menu"
                >
                  {/* Card Header: User Info */}
                  <div className="px-4 py-3 bg-[#F8F7F4] border-b border-[#111113]/10">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#064E3B] text-amber-300 flex items-center justify-center font-bold text-sm shadow-xs shrink-0 border border-emerald-700/30">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-[#111113] truncate">
                          {currentUser?.nama || 'Administrator'}
                        </p>
                        <p className="text-[11px] text-[#111113]/60 truncate font-mono">
                          @{currentUser?.username || 'admin'}
                        </p>
                        {currentUser?.email && (
                          <p className="text-[10px] text-[#111113]/50 truncate font-sans">
                            {currentUser.email}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between gap-1 text-[10px]">
                      <span className={`px-2 py-0.5 rounded-sm font-semibold border ${roleInfo.badgeClass}`}>
                        {roleInfo.fullLabel}
                      </span>
                      {territoryText && (
                        <span className="text-[#111113]/60 font-mono truncate max-w-[140px]" title={territoryText}>
                          {territoryText}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Options Menu */}
                  <div className="p-1.5 space-y-0.5">
                    {/* Akses Pengaturan Akun */}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('settings-user');
                        setIsProfileOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#111113]/80 hover:text-[#064E3B] hover:bg-emerald-50/70 rounded-md transition-colors cursor-pointer text-left group"
                      role="menuitem"
                    >
                      <UserCog className="w-4 h-4 text-[#111113]/50 group-hover:text-[#064E3B] shrink-0" />
                      <div className="flex-1 truncate">
                        <div className="font-semibold text-[#111113] group-hover:text-[#064E3B]">
                          Pengaturan Akun
                        </div>
                        <div className="text-[10px] text-[#111113]/50 truncate">
                          Kelola profil admin & pengguna
                        </div>
                      </div>
                    </button>

                    {/* Akses Pengaturan Aplikasi */}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('settings-app');
                        setIsProfileOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#111113]/80 hover:text-[#064E3B] hover:bg-emerald-50/70 rounded-md transition-colors cursor-pointer text-left group"
                      role="menuitem"
                    >
                      <Sliders className="w-4 h-4 text-[#111113]/50 group-hover:text-[#064E3B] shrink-0" />
                      <div className="flex-1 truncate">
                        <div className="font-semibold text-[#111113] group-hover:text-[#064E3B]">
                          Pengaturan Aplikasi
                        </div>
                        <div className="text-[10px] text-[#111113]/50 truncate">
                          Kustomisasi nama & logo sistem
                        </div>
                      </div>
                    </button>

                    {/* Quick Switch User (Hanya untuk Superadmin_Kabupaten jika ada > 1 user) */}
                    {currentUser?.role === 'Superadmin_Kabupaten' && users && users.length > 1 && (
                      <div className="pt-1.5 mt-1 border-t border-[#111113]/10">
                        <div className="px-3 py-1 text-[10px] font-mono text-[#111113]/40 uppercase tracking-wider">
                          Ganti Akun Cepat
                        </div>
                        <div className="max-h-32 overflow-y-auto space-y-0.5">
                          {users.map((u) => {
                            const isCurrent = u.id_user === currentUser?.id_user;
                            return (
                              <button
                                key={u.id_user}
                                type="button"
                                onClick={() => {
                                  switchUser(u.id_user);
                                  setIsProfileOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-3 py-1.5 text-xs rounded-md transition-colors cursor-pointer text-left ${
                                  isCurrent
                                    ? 'bg-emerald-50 text-[#064E3B] font-bold'
                                    : 'text-[#111113]/70 hover:bg-neutral-100'
                                }`}
                              >
                                <span className="truncate">{u.nama}</span>
                                {isCurrent && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Logout section */}
                  <div className="p-1.5 border-t border-[#111113]/10 bg-neutral-50/50">
                    <button
                      type="button"
                      onClick={() => {
                        setIsProfileOpen(false);
                        logout();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer text-left group"
                      role="menuitem"
                    >
                      <LogOut className="w-4 h-4 text-red-600 group-hover:translate-x-0.5 transition-transform shrink-0" />
                      <span>Keluar dari Sistem (Logout)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Logout Button (Rightmost) */}
            <button
              onClick={() => logout()}
              title="Keluar dari Sistem (Logout)"
              className="p-1.5 text-[#111113]/60 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer flex items-center gap-1 text-xs font-mono border border-transparent hover:border-red-200"
            >
              <LogOut className="w-3.5 h-3.5 text-red-600" />
              <span className="hidden md:inline">Keluar</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};


