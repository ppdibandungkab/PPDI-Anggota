import React, { useState, useEffect, useRef } from 'react';
import { usePPDI } from '../context/PPDIContext';
import { DEFAULT_ROLE_PERMISSIONS } from '../types/ppdi';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  ClockAlert,
  FileText,
  Wallet,
  CheckCircle,
  Database,
  Building2,
  MapPin,
  UserCheck,
  Settings,
  ChevronDown,
  ChevronRight,
  Sliders,
  Shield,
  ClipboardCheck,
  History,
  Pin,
  PinOff,
  Menu,
} from 'lucide-react';

interface SidebarProps {
  onOpenVerifyModal: () => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  isPinned?: boolean;
  setIsPinned?: (pinned: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  onOpenVerifyModal,
  isOpen,
  setIsOpen,
  isPinned = false,
  setIsPinned,
}) => {
  const {
    activeTab,
    setActiveTab,
    currentUser,
    selectedKecamatanFilter,
    setSelectedKecamatanFilter,
    kecamatanList,
    fullMembers,
    visibleMembers,
    pendaftaranList,
    visiblePendaftaran,
    appSettings,
    hasPermission,
  } = usePPDI();

  const userRole = currentUser?.role || 'Superadmin_Kabupaten';
  const isSuperadmin = userRole === 'Superadmin_Kabupaten';

  const hasViewPermission = (moduleId: string): boolean => {
    return hasPermission(moduleId, 'view');
  };

  // Settings childmenu items
  const settingsSubmenu = [
    { id: 'settings-app', label: 'Setting Aplikasi', icon: Sliders },
    { id: 'settings-user', label: 'Daftar Akun Pengguna', icon: Users },
    { id: 'settings-role', label: 'Tingkatan (Role)', icon: UserCheck },
    { id: 'settings-db', label: 'Setting Database', icon: Database },
    { id: 'skema', label: 'Skema Database & SQL', icon: FileText },
  ].filter((sub) => hasViewPermission(sub.id));

  // Check if current tab is any of the settings submenus
  const isSettingsActive = [
    'settings',
    'settings-app',
    'settings-user',
    'settings-role',
    'settings-db',
    'skema',
  ].includes(activeTab);

  // Settings submenu expansion state
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(true);

  // Desktop autohide hover & focus-within state
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [isFocusedWithin, setIsFocusedWithin] = useState<boolean>(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnterSidebar = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setIsHovered(true);
  };

  const handleMouseLeaveSidebar = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 180);
  };

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  const isDesktopVisible = isPinned || isHovered || isFocusedWithin;

  // Keep submenu open if user navigates to any settings child page
  useEffect(() => {
    if (isSettingsActive) {
      setIsSettingsOpen(true);
    }
  }, [isSettingsActive]);

  // Count pending retirement alerts scoped to visible members
  const criticalRetirementCount = visibleMembers.filter(
    (m) => m.statusPensiun === 'Kritis (<6 Bln)' || m.statusPensiun === 'Siaga (<1 Thn)'
  ).length;

  // Count pending registration approvals strictly scoped to user role
  const pendingPendaftaranCount = (visiblePendaftaran || []).filter(
    (p) => p.status_approval === 'Menunggu'
  ).length;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard & Statistik', icon: LayoutDashboard },
    {
      id: 'pendaftaran',
      label: 'Registrasi & Approval',
      icon: ClipboardCheck,
      badge: pendingPendaftaranCount > 0 ? pendingPendaftaranCount : undefined,
      badgeColor: 'text-amber-900 bg-amber-200/90 font-bold',
    },
    { id: 'anggota', label: 'Data Induk Anggota', icon: Users, badge: visibleMembers.length },
    { id: 'ekta', label: 'E-KTA Digital & Cetak', icon: CreditCard },
    {
      id: 'pensiun',
      label: 'Peringatan Purna Tugas',
      icon: ClockAlert,
      badge: criticalRetirementCount > 0 ? criticalRetirementCount : undefined,
      badgeColor: 'text-amber-700 bg-amber-50',
    },
    { id: 'arsip', label: 'e-Arsip Berkas SK', icon: FileText },
    { id: 'iuran', label: 'Kas & Iuran Anggota', icon: Wallet },
    { id: 'log-aktivitas', label: 'Log Aktivitas Admin', icon: History },
  ].filter((item) => hasViewPermission(item.id));

  // Helper renderer for Nav Links & Submenu
  const renderNavLinks = (isMobile: boolean = false) => {
    return (
      <nav className="space-y-1">
        <div className="brand-meta px-2 py-1 text-[#111113]/50">MENU UTAMA</div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                if (isMobile) setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-md transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#064E3B] text-white shadow-xs font-semibold'
                  : 'text-[#111113]/80 hover:bg-[#111113]/5 hover:text-[#111113]'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-amber-300' : 'text-[#111113]/50'}`} />
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded-sm ${
                    isActive
                      ? 'bg-[#043d2e] text-emerald-200'
                      : item.badgeColor || 'bg-neutral-100 text-[#111113]/70 border border-[#111113]/10'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        {/* Separator before Settings */}
        {settingsSubmenu.length > 0 && (
          <div className="pt-2">
            <div className="brand-meta px-2 py-1 text-[#111113]/50">PENGATURAN & SISTEM</div>

            {/* Pengaturan Parent Button with Dropdown Chevron */}
            <button
              type="button"
              onClick={() => {
                setIsSettingsOpen((prev) => !prev);
                if (!isSettingsOpen && !isSettingsActive) {
                  setActiveTab(settingsSubmenu[0].id);
                  if (isMobile) setIsOpen(false);
                }
              }}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-md transition-all cursor-pointer ${
                isSettingsActive
                  ? 'bg-[#064E3B]/10 text-[#064E3B] font-bold border border-[#064E3B]/20'
                  : 'text-[#111113]/80 hover:bg-[#111113]/5 hover:text-[#111113]'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <Settings className={`w-4 h-4 shrink-0 ${isSettingsActive ? 'text-[#064E3B]' : 'text-[#111113]/50'}`} />
                <span className="truncate">Pengaturan</span>
              </div>
              <div className="flex items-center gap-1.5">
                {isSettingsActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#064E3B]" />
                )}
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    isSettingsOpen ? 'rotate-180 text-[#064E3B]' : 'text-[#111113]/40'
                  }`}
                />
              </div>
            </button>

            {/* Childmenu Submenu List (Desktop, Tablet & Mobile) */}
            {isSettingsOpen && (
              <div className="mt-1 pl-3.5 ml-3 border-l-2 border-[#064E3B]/25 space-y-0.5">
                {settingsSubmenu.map((sub) => {
                  const SubIcon = sub.icon;
                  const isSubActive = activeTab === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(sub.id);
                        if (isMobile) setIsOpen(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 text-[11px] rounded-md transition-all cursor-pointer ${
                        isSubActive
                          ? 'bg-[#064E3B] text-white font-semibold shadow-2xs'
                          : 'text-[#111113]/70 hover:bg-[#111113]/5 hover:text-[#111113]'
                      }`}
                    >
                      <SubIcon className={`w-3.5 h-3.5 shrink-0 ${isSubActive ? 'text-amber-300' : 'text-[#111113]/40'}`} />
                      <span className="truncate">{sub.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </nav>
    );
  };

  return (
    <>
      {/* Mobile Slide-out Drawer & Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-xs z-40 md:hidden transition-opacity"
          onClick={() => setIsOpen(false)}
          aria-label="Tutup Menu"
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out md:hidden flex flex-col justify-between p-4 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="space-y-6 overflow-y-auto flex-1 pb-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-sm bg-[#064E3B] text-white flex items-center justify-center font-bold text-sm">
                <Building2 className="w-4 h-4 text-emerald-300" />
              </div>
              <span className="text-xs font-bold uppercase tracking-tight text-[#111113]">Menu Navigasi PPDI</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 text-neutral-500 hover:text-neutral-900 rounded-lg hover:bg-neutral-100 cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Active Role Indicator */}
          <div className="p-3 rounded-sm bg-neutral-50 border border-[#111113]/10 text-xs shadow-2xs">
            <div className="brand-meta mb-1 text-[#111113]/50">HAK AKSES TERPASANG</div>
            <div className="font-bold text-[#111113] truncate">{currentUser.nama}</div>
            <div className="text-[#111113]/60 text-[11px] mt-1 flex items-center gap-1.5 font-mono">
              <span className="inline-block w-2 h-2 rounded-full bg-[#064E3B]"></span>
              <span>
                {currentUser.role === 'Superadmin_Kabupaten'
                  ? 'Superadmin Kab.'
                  : currentUser.role === 'Admin_Kabupaten'
                  ? 'Admin Kab. (PD)'
                  : currentUser.role === 'Admin_Kecamatan'
                  ? 'Admin Kecamatan'
                  : currentUser.role === 'Admin_Desa'
                  ? 'Admin Desa'
                  : 'Perangkat Desa'}
              </span>
            </div>
          </div>

          {/* Kecamatan Filter for Superadmin & Admin Kabupaten */}
          {(currentUser.role === 'Superadmin_Kabupaten' || currentUser.role === 'Admin_Kabupaten') && (
            <div>
              <label className="brand-meta block mb-1.5 text-[#111113]/60">WILAYAH KERJA (TERITORIAL)</label>
              <div className="relative">
                <select
                  aria-label="Filter Wilayah Kecamatan"
                  value={selectedKecamatanFilter}
                  onChange={(e) => setSelectedKecamatanFilter(e.target.value)}
                  className="w-full text-xs font-mono bg-white border border-[#111113]/20 rounded-sm px-2.5 py-2 text-[#111113] focus:outline-hidden focus:ring-1 focus:ring-[#064E3B]"
                >
                  <option value="all">Seluruh Kab. Bandung (31 Kec)</option>
                  {kecamatanList.map((k) => (
                    <option key={k.id_kecamatan} value={k.id_kecamatan}>
                      Kec. {k.nama_kecamatan}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Primary Navigation Menu (Mobile) */}
          {renderNavLinks(true)}
        </div>

        {/* Footer Branding Info */}
        <div className="pt-4 border-t border-[#111113]/10 text-[10px] font-mono text-[#111113]/50 space-y-1">
          <div className="font-bold text-[#111113]/80 uppercase">PPDI KAB. BANDUNG</div>
          <div className="flex items-center gap-1">
            <MapPin className="w-3 h-3 text-[#111113]/40" />
            <span>Soreang, Kab. Bandung (32.04)</span>
          </div>
        </div>
      </div>

      {/* Desktop & Tablet Auto-Hide Left-Edge Trigger Zone + Floating Tab (when not pinned & hidden) */}
      {!isPinned && (
        <div
          onMouseEnter={handleMouseEnterSidebar}
          onMouseLeave={handleMouseLeaveSidebar}
          onClick={handleMouseEnterSidebar}
          aria-label="Arahkan kursor untuk membuka sidebar navigasi"
          title="Arahkan kursor ke sini untuk menampilkan Sidebar"
          className={`hidden md:flex fixed top-16 bottom-0 left-0 z-30 w-4 items-center cursor-pointer transition-opacity duration-200 ${
            isDesktopVisible ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          {/* Subtle vertical edge line */}
          <div className="w-1 h-full bg-gradient-to-b from-[#064E3B]/20 via-[#064E3B]/40 to-[#064E3B]/20" />
          {/* Floating Handle Pill */}
          <div className="bg-[#064E3B] text-white shadow-lg rounded-r-lg py-3 px-1.5 flex flex-col items-center gap-1.5 border border-l-0 border-emerald-400/30 hover:bg-[#043d2e] transition-all">
            <Menu className="w-3.5 h-3.5 text-amber-300" />
            <span className="[writing-mode:vertical-rl] rotate-180 text-[9px] font-mono font-bold tracking-widest uppercase">
              MENU
            </span>
            <ChevronRight className="w-3 h-3 text-emerald-200" />
          </div>
        </div>
      )}

      {/* Desktop & Tablet Sidebar (Auto-Hide Overlay by Default, or Docked when Pinned) */}
      <aside
        onMouseEnter={handleMouseEnterSidebar}
        onMouseLeave={handleMouseLeaveSidebar}
        onFocusCapture={() => setIsFocusedWithin(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setIsFocusedWithin(false);
          }
        }}
        className={
          isPinned
            ? 'hidden md:flex w-64 shrink-0 bg-white/85 backdrop-blur-md border-r border-[#111113]/10 md:sticky md:top-16 md:h-[calc(100vh-4rem)] overflow-y-auto flex-col justify-between p-4'
            : `hidden md:flex fixed top-16 bottom-0 left-0 z-40 w-64 bg-white/95 backdrop-blur-md border-r border-[#111113]/15 shadow-2xl overflow-y-auto flex-col justify-between p-4 transform transition-transform duration-300 ease-out ${
                isDesktopVisible ? 'translate-x-0' : '-translate-x-full pointer-events-none'
              }`
        }
      >
        <div className="space-y-5">
          {/* Auto-Hide / Pin Status Bar */}
          <div className="flex items-center justify-between pb-2 border-b border-[#111113]/10">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#064E3B] flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isPinned ? 'bg-[#064E3B]' : 'bg-amber-500 animate-pulse'}`} />
              <span>{isPinned ? 'Sidebar Terkunci' : 'Auto-Hide Aktif'}</span>
            </span>
            {setIsPinned && (
              <button
                type="button"
                onClick={() => {
                  const nextPinned = !isPinned;
                  setIsPinned(nextPinned);
                  if (!nextPinned) {
                    setIsHovered(false);
                    setIsFocusedWithin(false);
                  }
                }}
                title={isPinned ? 'Aktifkan Auto-Hide (sembunyikan otomatis saat tidak diarahkan kursor)' : 'Kunci Sidebar agar tetap terbuka'}
                className={`p-1 rounded-sm text-[10px] font-mono flex items-center gap-1 transition-colors cursor-pointer ${
                  isPinned
                    ? 'bg-[#064E3B] text-white hover:bg-[#043d2e]'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900'
                }`}
              >
                {isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
              </button>
            )}
          </div>

          {/* Active Role Indicator */}
          <div className="p-3 rounded-sm bg-white border border-[#111113]/10 text-xs shadow-2xs">
            <div className="brand-meta mb-1 text-[#111113]/50">HAK AKSES TERPASANG</div>
            <div className="font-bold text-[#111113] truncate">{currentUser.nama}</div>
            <div className="text-[#111113]/60 text-[11px] mt-1 flex items-center gap-1.5 font-mono">
              <span className="inline-block w-2 h-2 rounded-full bg-[#064E3B]"></span>
              <span>
                {currentUser.role === 'Superadmin_Kabupaten'
                  ? 'Superadmin Kab.'
                  : currentUser.role === 'Admin_Kabupaten'
                  ? 'Admin Kab. (PD)'
                  : currentUser.role === 'Admin_Kecamatan'
                  ? 'Admin Kecamatan'
                  : currentUser.role === 'Admin_Desa'
                  ? 'Admin Desa'
                  : 'Perangkat Desa'}
              </span>
            </div>
          </div>

          {/* Kecamatan Filter for Superadmin & Admin Kabupaten */}
          {(currentUser.role === 'Superadmin_Kabupaten' || currentUser.role === 'Admin_Kabupaten') && (
            <div>
              <label className="brand-meta block mb-1.5 text-[#111113]/60">WILAYAH KERJA (TERITORIAL)</label>
              <div className="relative">
                <select
                  aria-label="Filter Wilayah Kecamatan"
                  value={selectedKecamatanFilter}
                  onChange={(e) => setSelectedKecamatanFilter(e.target.value)}
                  className="w-full text-xs font-mono bg-white border border-[#111113]/20 rounded-sm px-2.5 py-2 text-[#111113] focus:outline-hidden focus:ring-1 focus:ring-[#064E3B]"
                >
                  <option value="all">Seluruh Kab. Bandung (31 Kec)</option>
                  {kecamatanList.map((k) => (
                    <option key={k.id_kecamatan} value={k.id_kecamatan}>
                      Kec. {k.nama_kecamatan}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Primary Navigation Menu (Desktop & Tablet with Childmenu) */}
          {renderNavLinks(false)}

          {/* Quick Verification Button */}
          <div className="pt-2">
            <button
              onClick={onOpenVerifyModal}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-mono text-[#064E3B] bg-white hover:bg-emerald-50/50 border border-[#064E3B]/30 rounded-sm transition-colors cursor-pointer shadow-2xs"
            >
              <CheckCircle className="w-3.5 h-3.5 text-[#064E3B]" />
              <span>CEK KEABSAHAN KTA</span>
            </button>
          </div>
        </div>

        {/* Footer Branding Info */}
        <div className="pt-4 mt-4 border-t border-[#111113]/10 text-[10px] font-mono text-[#111113]/50 space-y-1">
          <div className="font-bold text-[#111113]/80 uppercase">PPDI KAB. BANDUNG</div>
          <div className="flex items-center gap-1">
            <MapPin className="w-3 h-3 text-[#111113]/40" />
            <span>Soreang, Kab. Bandung (32.04)</span>
          </div>
        </div>
      </aside>
    </>
  );
};
