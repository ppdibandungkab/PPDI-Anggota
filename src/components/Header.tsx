import React, { useState, useRef, useEffect, useMemo } from 'react';
import { usePPDI } from '../context/PPDIContext';
import { AnggotaFullDetail } from '../types/ppdi';
import { getPhotoUrl, handleImageError } from '../utils/fileHelpers';
import {
  Shield,
  RefreshCw,
  Database,
  LogOut,
  Menu,
  X,
  ChevronDown,
  UserCog,
  Sliders,
  Check,
  Key,
  Search,
  MapPin,
  ArrowRight,
  UserCheck,
  Activity,
  MessageSquare,
  Bell,
  BellOff,
  BellRing,
} from 'lucide-react';

export const Header: React.FC<{
  onOpenAddModal: () => void;
  onOpenVerifyModal: () => void;
  onOpenDbModal: () => void;
  onSelectMemberProfile?: (member: AnggotaFullDetail) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}> = ({
  onOpenDbModal,
  onSelectMemberProfile,
  sidebarOpen,
  setSidebarOpen,
}) => {
  const {
    currentUser,
    switchUser,
    users,
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
    visibleMembers,
    openChangePasswordModal,
    hasPermission,
    browserNotifPermission,
    browserNotifEnabled,
    setBrowserNotifEnabled,
    requestBrowserNotifications,
    testBrowserNotification,
    pendingPendaftaranCount,
  } = usePPDI();

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifFeedback, setNotifFeedback] = useState<string | null>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const canMonitorRegistrations = currentUser?.role !== 'Anggota' && hasPermission('pendaftaran', 'view');

  // Global Member Search & Autocomplete State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const desktopSearchRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  // Close profile and notification dropdowns on outside click / Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsProfileOpen(false);
        setIsNotifOpen(false);
      }
    };

    if (isProfileOpen || isNotifOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isProfileOpen, isNotifOpen]);

  // Close autocomplete dropdown on outside click
  useEffect(() => {
    const handleClickOutsideSearch = (event: MouseEvent) => {
      const target = event.target as Node;
      const inDesktop = desktopSearchRef.current && desktopSearchRef.current.contains(target);
      const inMobile = mobileSearchRef.current && mobileSearchRef.current.contains(target);
      if (!inDesktop && !inMobile) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutsideSearch);
    return () => document.removeEventListener('mousedown', handleClickOutsideSearch);
  }, []);

  // Global Ctrl+K / Cmd+K shortcut to focus member search
  useEffect(() => {
    const handleGlobalShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (window.innerWidth < 768) {
          setIsMobileSearchOpen(true);
          setTimeout(() => mobileInputRef.current?.focus(), 40);
        } else {
          desktopInputRef.current?.focus();
          desktopInputRef.current?.select();
          setIsSearchOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handleGlobalShortcut);
    return () => window.removeEventListener('keydown', handleGlobalShortcut);
  }, []);

  // Compute matching members by Nama or NIK (plus KTA/NIPD bonus)
  const { searchResults, totalMatches } = useMemo(() => {
    const rawQ = searchQuery.trim();
    if (!rawQ) return { searchResults: [] as AnggotaFullDetail[], totalMatches: 0 };

    const q = rawQ.toLowerCase();
    const matches: { member: AnggotaFullDetail; score: number }[] = [];

    (visibleMembers || []).forEach((m) => {
      const nama = (m.anggota.nama_lengkap || '').toLowerCase();
      const nik = (m.anggota.nik || '').toLowerCase();
      const nipd = (m.anggota.nipd || '').toLowerCase();
      const kta = (m.keanggotaan?.no_kta || '').toLowerCase();
      const compactQ = q.replace(/\s+/g, '');

      let score = -1;
      if (nik === q || nama === q) {
        score = 100;
      } else if (nama.startsWith(q)) {
        score = 85;
      } else if (nik.startsWith(q)) {
        score = 80;
      } else if (nama.includes(q)) {
        score = 65;
      } else if (nik.includes(q)) {
        score = 60;
      } else if (
        nipd.includes(q) ||
        (compactQ.length > 0 && nipd.replace(/\s+/g, '').includes(compactQ)) ||
        kta.includes(q)
      ) {
        score = 40;
      }

      if (score >= 0) {
        matches.push({ member: m, score });
      }
    });

    matches.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.member.anggota.nama_lengkap || '').localeCompare(
        b.member.anggota.nama_lengkap || '',
        'id'
      );
    });

    return {
      searchResults: matches.slice(0, 8).map((item) => item.member),
      totalMatches: matches.length,
    };
  }, [searchQuery, visibleMembers]);

  // Reset highlighted index when results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchQuery]);

  const handleSelectMember = (member: AnggotaFullDetail) => {
    if (onSelectMemberProfile) {
      onSelectMemberProfile(member);
    } else {
      setActiveTab('anggota');
    }
    setSearchQuery('');
    setIsSearchOpen(false);
    setIsMobileSearchOpen(false);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsSearchOpen(false);
      setIsMobileSearchOpen(false);
      e.currentTarget.blur();
      return;
    }
    if (!isSearchOpen && searchQuery.trim()) {
      setIsSearchOpen(true);
    }
    if (searchResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % searchResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = searchResults[highlightedIndex] || searchResults[0];
      if (target) {
        handleSelectMember(target);
      }
    }
  };

  // Highlight matched query text helper
  const renderHighlightedText = (text: string, query: string) => {
    const cleanQ = query.trim();
    if (!cleanQ || !text) return text;
    const idx = text.toLowerCase().indexOf(cleanQ.toLowerCase());
    if (idx === -1) return text;

    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + cleanQ.length);
    const after = text.slice(idx + cleanQ.length);
    return (
      <>
        {before}
        <mark className="bg-amber-200/90 text-[#064E3B] font-bold rounded-[2px] px-0.5">
          {match}
        </mark>
        {after}
      </>
    );
  };

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

  // Shared Autocomplete Dropdown Renderer
  const renderAutocompleteDropdown = () => {
    if (!isSearchOpen || !searchQuery.trim()) return null;

    return (
      <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-xl shadow-2xl border border-[#111113]/15 overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150">
        <div className="px-3 py-2 bg-[#F8F7F4] border-b border-[#111113]/10 flex items-center justify-between text-[10px] font-mono text-[#111113]/60">
          <span className="uppercase tracking-wider font-bold text-[#064E3B] flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-[#064E3B]" />
            <span>Hasil Pencarian Cepat</span>
          </span>
          <span>
            {totalMatches > 0
              ? `${searchResults.length} dari ${totalMatches} anggota`
              : '0 hasil'}
          </span>
        </div>

        {searchResults.length === 0 ? (
          <div className="p-5 text-center text-xs text-neutral-500">
            <p className="font-semibold text-neutral-700">Anggota tidak ditemukan</p>
            <p className="text-[11px] mt-0.5">
              Tidak ada data dengan nama atau NIK "{searchQuery.trim()}"
            </p>
          </div>
        ) : (
          <ul role="listbox" className="max-h-80 overflow-y-auto divide-y divide-neutral-100">
            {searchResults.map((member, idx) => {
              const isHighlighted = idx === highlightedIndex;
              const statusKta = member.keanggotaan?.status_kta || 'Pending';
              const fullName = [
                member.anggota.gelar_depan,
                member.anggota.nama_lengkap,
                member.anggota.gelar_belakang,
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <li key={member.anggota.id_anggota} role="option" aria-selected={isHighlighted}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => handleSelectMember(member)}
                    className={`w-full px-3 py-2.5 flex items-center gap-3 text-left transition-colors cursor-pointer ${
                      isHighlighted ? 'bg-emerald-50/90' : 'hover:bg-neutral-50'
                    }`}
                  >
                    <img
                      src={getPhotoUrl(member.anggota.foto, member.anggota.jenis_kelamin)}
                      alt={member.anggota.nama_lengkap}
                      onError={(e) => handleImageError(e, member.anggota.jenis_kelamin)}
                      className="w-9 h-9 rounded-lg object-cover border border-neutral-200 bg-neutral-100 shrink-0"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-[#111113] truncate">
                          {renderHighlightedText(fullName, searchQuery)}
                        </span>
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.2 rounded-sm shrink-0 border ${
                            statusKta === 'Aktif'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : statusKta === 'Pending'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-neutral-100 text-neutral-600 border-neutral-200'
                          }`}
                        >
                          {statusKta}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-neutral-500 mt-0.5">
                        <span className="font-mono text-[#064E3B] font-semibold">
                          NIK: {renderHighlightedText(member.anggota.nik || '-', searchQuery)}
                        </span>
                        {member.jabatanRef?.nama_jabatan && (
                          <span className="truncate max-w-[140px]">
                            • {member.jabatanRef.nama_jabatan}
                          </span>
                        )}
                        {(member.desa?.nama_desa || member.kecamatan?.nama_kecamatan) && (
                          <span className="inline-flex items-center gap-0.5 truncate max-w-[160px]">
                            <MapPin className="w-2.5 h-2.5 shrink-0 text-neutral-400" />
                            <span className="truncate">
                              {member.desa?.nama_desa ? `Ds. ${member.desa.nama_desa}` : ''}
                              {member.kecamatan?.nama_kecamatan
                                ? `, Kec. ${member.kecamatan.nama_kecamatan}`
                                : ''}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-mono font-bold flex items-center gap-1 shrink-0 ${
                        isHighlighted ? 'text-[#064E3B]' : 'text-neutral-400'
                      }`}
                    >
                      <span className="hidden sm:inline">Profil</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="px-3 py-1.5 bg-neutral-50 border-t border-neutral-100 text-[10px] font-mono text-neutral-400 flex items-center justify-between">
          <span>↑↓ Navigasi · Enter Buka Profil</span>
          <span>Esc Tutup</span>
        </div>
      </div>
    );
  };

  return (
    <header className="sticky top-0 z-40 bg-[#F8F7F4]/95 backdrop-blur-md border-b border-[#111113]/10 no-print">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2 sm:gap-3 lg:gap-4">
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
              <span className="text-xs sm:text-sm lg:text-base font-extrabold text-[#111113] tracking-tight whitespace-nowrap leading-tight uppercase">
                {appSettings?.appName || 'PPDI KABUPATEN BANDUNG'}
              </span>
              <span className="brand-meta text-[10px] text-[#111113]/60 whitespace-nowrap hidden xl:inline">
                {appSettings?.appSubtitle || 'SISTEM INFORMASI DATABASE & E-KTA PERANGKAT DESA'}
              </span>
            </div>
          </div>

          {/* Zone 2: Global Member Search with Autocompletion (Desktop & Tablet) */}
          <div ref={desktopSearchRef} className="hidden md:block flex-1 max-w-md relative">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-[#111113]/45 absolute left-3 pointer-events-none" />
              <input
                ref={desktopInputRef}
                type="text"
                value={searchQuery}
                onFocus={() => setIsSearchOpen(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Cari anggota (Nama atau NIK)..."
                aria-label="Pencarian global anggota berdasarkan nama atau NIK"
                className="w-full pl-9 pr-16 py-2 text-xs bg-white/90 hover:bg-white focus:bg-white border border-[#111113]/15 focus:border-[#064E3B] rounded-lg text-[#111113] placeholder:text-[#111113]/45 shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#064E3B]/15 transition-all"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    desktopInputRef.current?.focus();
                  }}
                  title="Bersihkan pencarian"
                  className="absolute right-2.5 p-1 text-neutral-400 hover:text-neutral-700 rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <kbd className="hidden xl:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-[#111113]/45 bg-neutral-100 border border-neutral-200 rounded absolute right-2.5 pointer-events-none">
                  Ctrl+K
                </kbd>
              )}
            </div>

            {renderAutocompleteDropdown()}
          </div>

          {/* Zone 3: DB Sync + Compact User Profile & Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Mobile Search Toggle Button */}
            <button
              type="button"
              onClick={() => {
                const next = !isMobileSearchOpen;
                setIsMobileSearchOpen(next);
                if (next) {
                  setTimeout(() => mobileInputRef.current?.focus(), 40);
                }
              }}
              aria-label="Cari Anggota"
              title="Cari anggota berdasarkan Nama atau NIK"
              className={`md:hidden p-2 rounded-lg border transition-colors cursor-pointer ${
                isMobileSearchOpen
                  ? 'bg-[#064E3B] text-white border-[#064E3B]'
                  : 'bg-white/80 text-[#111113]/75 border-[#111113]/15 hover:bg-white'
              }`}
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Desktop DB Status & Sync Controls */}
            <div className="hidden lg:flex items-center gap-1.5 text-xs font-mono text-[#111113]/70">
              {isCheckingDb ? (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-sm text-[11px] font-mono bg-amber-50 text-amber-900 border border-amber-300">
                  <Database className="w-3 h-3 text-[#064E3B]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                  <span>Cek DB...</span>
                </div>
              ) : dbStatus?.success ? null : (
                <button
                  type="button"
                  onClick={onOpenDbModal}
                  title="Koneksi MySQL Terputus - Klik untuk membuka Setting Database"
                  className="flex items-center gap-1.5 px-2 py-1 rounded-sm text-[11px] font-mono transition-colors cursor-pointer border bg-red-100 text-red-950 border-red-400 hover:bg-red-200 animate-pulse font-bold"
                >
                  <Database className="w-3 h-3 text-red-700" />
                  <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping" />
                  <span>DB Offline</span>
                </button>
              )}

              <button
                onClick={() => checkDbStatus()}
                disabled={isCheckingDb}
                title="Picu uji ulang koneksi ke database sekarang"
                className="p-1.5 rounded-sm border border-[#111113]/15 text-[#111113]/70 hover:text-[#064E3B] hover:bg-white transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isCheckingDb ? 'animate-spin text-[#064E3B]' : ''}`} />
              </button>

              <button
                onClick={() => refreshDataFromMySQL({ force: true })}
                title="Sinkronkan data langsung dari MySQL database (perbarui cache lokal)"
                className="flex items-center gap-1 px-2 py-1 rounded-sm text-xs text-[#111113]/70 hover:text-[#064E3B] hover:bg-white transition-colors cursor-pointer border border-[#111113]/15 bg-white/50"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-[#064E3B]' : ''}`} />
                <span className="hidden xl:inline">{isSyncing ? 'Sinkron...' : 'Sync DB'}</span>
              </button>
            </div>

            {/* Browser Notifications Bell Trigger & Popover (Admins) */}
            {canMonitorRegistrations && (
              <div className="relative" ref={notifRef}>
                <button
                  type="button"
                  onClick={() => {
                    setNotifFeedback(null);
                    setIsNotifOpen((prev) => !prev);
                  }}
                  title={
                    browserNotifPermission === 'granted' && browserNotifEnabled
                      ? `Notifikasi Browser Aktif (${pendingPendaftaranCount} pendaftar menunggu)`
                      : 'Pengaturan Notifikasi Browser Pendaftaran Baru'
                  }
                  aria-expanded={isNotifOpen}
                  aria-haspopup="true"
                  className={`relative p-2 rounded-full border transition-all cursor-pointer select-none ${
                    isNotifOpen
                      ? 'bg-white border-[#064E3B] text-[#064E3B] shadow-sm ring-2 ring-[#064E3B]/10'
                      : 'bg-white/80 hover:bg-white text-[#111113]/75 border-[#111113]/15 hover:border-[#111113]/30 shadow-xs'
                  }`}
                >
                  {browserNotifPermission === 'granted' && browserNotifEnabled ? (
                    <BellRing className="w-4 h-4 text-[#064E3B]" />
                  ) : browserNotifPermission === 'denied' || !browserNotifEnabled ? (
                    <BellOff className="w-4 h-4 text-neutral-400" />
                  ) : (
                    <Bell className="w-4 h-4 text-amber-600" />
                  )}

                  {pendingPendaftaranCount > 0 ? (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold font-mono flex items-center justify-center ring-2 ring-white">
                      {pendingPendaftaranCount > 99 ? '99+' : pendingPendaftaranCount}
                    </span>
                  ) : (
                    <span
                      className={`absolute top-1 right-1 w-2 h-2 rounded-full ring-2 ring-white ${
                        browserNotifPermission === 'granted' && browserNotifEnabled
                          ? 'bg-emerald-500'
                          : browserNotifPermission === 'default'
                          ? 'bg-amber-400'
                          : 'bg-neutral-400'
                      }`}
                    />
                  )}
                </button>

                {isNotifOpen && (
                  <div
                    className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-[#111113]/10 z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
                    role="dialog"
                    aria-label="Pengaturan Notifikasi Browser Pendaftaran Baru"
                  >
                    <div className="px-4 py-3 bg-[#F8F7F4] border-b border-[#111113]/10 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <BellRing className="w-4 h-4 text-[#064E3B]" />
                        <div>
                          <div className="text-xs font-bold text-[#111113]">Notifikasi Pendaftaran</div>
                          <div className="text-[10px] text-[#111113]/60">Pemberitahuan langsung di perangkat</div>
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                          pendingPendaftaranCount > 0
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                        }`}
                      >
                        {pendingPendaftaranCount} Menunggu
                      </span>
                    </div>

                    <div className="p-3.5 space-y-3 text-xs">
                      {browserNotifPermission === 'unsupported' ? (
                        <div className="p-2.5 rounded-md bg-neutral-100 text-neutral-700 text-[11px] leading-relaxed">
                          Browser atau lingkungan preview saat ini tidak mendukung Web Notifications API.
                        </div>
                      ) : browserNotifPermission === 'denied' ? (
                        <div className="p-2.5 rounded-md bg-red-50 border border-red-200 text-red-900 text-[11px] leading-relaxed">
                          Izin notifikasi diblokir oleh browser. Klik ikon gembok/pengaturan situs di bilah alamat browser lalu ubah <b>Notifikasi</b> menjadi <b>Izinkan</b>.
                        </div>
                      ) : browserNotifPermission === 'default' ? (
                        <div className="space-y-2.5">
                          <p className="text-[11px] text-neutral-600 leading-relaxed">
                            Aktifkan notifikasi browser agar Anda langsung menerima peringatan perangkat saat ada perangkat desa baru mendaftar.
                          </p>
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await requestBrowserNotifications();
                              if (res === 'granted') {
                                setNotifFeedback('Notifikasi browser berhasil diaktifkan.');
                                testBrowserNotification();
                              } else if (res === 'denied') {
                                setNotifFeedback('Izin notifikasi ditolak di browser.');
                              }
                            }}
                            className="w-full py-2 px-3 rounded-md bg-[#064E3B] hover:bg-[#053e2f] text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <BellRing className="w-3.5 h-3.5" />
                            <span>Aktifkan Notifikasi Browser</span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between gap-2 p-2.5 rounded-md bg-emerald-50/70 border border-emerald-200">
                            <div>
                              <div className="font-semibold text-emerald-950 text-[11px]">
                                {browserNotifEnabled ? 'Status: Aktif Memantau' : 'Status: Dijeda Sementara'}
                              </div>
                              <div className="text-[10px] text-emerald-800/80">
                                {browserNotifEnabled
                                  ? 'Otomatis memberi tahu saat ada pendaftaran masuk'
                                  : 'Aktifkan kembali untuk menerima pop-up perangkat'}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setBrowserNotifEnabled(!browserNotifEnabled)}
                              className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors shrink-0 ${
                                browserNotifEnabled
                                  ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                                  : 'bg-neutral-200 text-neutral-800 hover:bg-neutral-300'
                              }`}
                            >
                              {browserNotifEnabled ? 'Aktif' : 'Nonaktif'}
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const ok = testBrowserNotification();
                              setNotifFeedback(
                                ok
                                  ? 'Notifikasi uji coba dikirim ke perangkat Anda.'
                                  : 'Gagal mengirim notifikasi uji coba.'
                              );
                            }}
                            className="w-full py-1.5 px-3 rounded-md border border-neutral-300 hover:bg-neutral-50 text-neutral-800 font-semibold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <Bell className="w-3.5 h-3.5 text-[#064E3B]" />
                            <span>Kirim Notifikasi Uji Coba</span>
                          </button>
                        </div>
                      )}

                      {notifFeedback && (
                        <div className="text-[11px] text-[#064E3B] bg-emerald-50 border border-emerald-200 rounded px-2.5 py-1.5 font-medium">
                          {notifFeedback}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('pendaftaran');
                          setIsNotifOpen(false);
                        }}
                        className="w-full py-2 px-3 rounded-md bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-xs flex items-center justify-between cursor-pointer transition-colors"
                      >
                        <span>Buka Registrasi & Approval</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

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
                <div className="text-left hidden sm:flex flex-col leading-tight max-w-[110px] lg:max-w-[150px]">
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

                    {/* Akses Ganti Password */}
                    <button
                      type="button"
                      onClick={() => {
                        openChangePasswordModal();
                        setIsProfileOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#111113]/80 hover:text-[#064E3B] hover:bg-emerald-50/70 rounded-md transition-colors cursor-pointer text-left group"
                      role="menuitem"
                    >
                      <Key className="w-4 h-4 text-[#111113]/50 group-hover:text-[#064E3B] shrink-0" />
                      <div className="flex-1 truncate">
                        <div className="font-semibold text-[#111113] group-hover:text-[#064E3B]">
                          Ganti Password
                        </div>
                        <div className="text-[10px] text-[#111113]/50 truncate">
                          Ubah kata sandi akun login Anda
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

                    {/* Quick Link to Setting WhatsApp (Fonnte) */}
                    {hasPermission('settings-whatsapp', 'view') && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('settings-whatsapp');
                          setIsProfileOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#111113]/80 hover:text-[#064E3B] hover:bg-emerald-50/70 rounded-md transition-colors cursor-pointer text-left group"
                        role="menuitem"
                      >
                        <MessageSquare className="w-4 h-4 text-[#111113]/50 group-hover:text-[#064E3B] shrink-0" />
                        <div className="flex-1 truncate">
                          <div className="font-semibold text-[#111113] group-hover:text-[#064E3B]">
                            Setting WhatsApp (Fonnte)
                          </div>
                          <div className="text-[10px] text-[#111113]/50 truncate">
                            Nomor pengirim, token & webhook
                          </div>
                        </div>
                      </button>
                    )}

                    {/* Quick Link to Telemetri & Diagnostik Live */}
                    {hasPermission('settings-telemetry', 'view') && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('settings-telemetry');
                          setIsProfileOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#111113]/80 hover:text-[#064E3B] hover:bg-emerald-50/70 rounded-md transition-colors cursor-pointer text-left group"
                        role="menuitem"
                      >
                        <Activity className="w-4 h-4 text-[#111113]/50 group-hover:text-[#064E3B] shrink-0" />
                        <div className="flex-1 truncate">
                          <div className="font-semibold text-[#111113] group-hover:text-[#064E3B]">
                            Telemetri & Diagnostik Live
                          </div>
                          <div className="text-[10px] text-[#111113]/50 truncate">
                            Pantau server Express & database
                          </div>
                        </div>
                      </button>
                    )}

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

        {/* Mobile Expandable Global Search Bar */}
        {isMobileSearchOpen && (
          <div
            ref={mobileSearchRef}
            className="md:hidden pb-3 pt-1 relative animate-in fade-in slide-in-from-top-1 duration-150"
          >
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-[#111113]/45 absolute left-3 pointer-events-none" />
              <input
                ref={mobileInputRef}
                type="text"
                value={searchQuery}
                onFocus={() => setIsSearchOpen(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Cari anggota berdasarkan Nama atau NIK..."
                aria-label="Pencarian global anggota mobile berdasarkan nama atau NIK"
                className="w-full pl-9 pr-9 py-2 text-xs bg-white border border-[#064E3B]/40 rounded-lg text-[#111113] placeholder:text-[#111113]/45 shadow-xs focus:outline-none focus:ring-2 focus:ring-[#064E3B]/20"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    mobileInputRef.current?.focus();
                  }}
                  title="Bersihkan pencarian"
                  className="absolute right-2.5 p-1 text-neutral-400 hover:text-neutral-700 rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {renderAutocompleteDropdown()}
          </div>
        )}
      </div>
    </header>
  );
};
