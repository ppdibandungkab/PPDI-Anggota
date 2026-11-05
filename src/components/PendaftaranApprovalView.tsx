import React, { useState, useMemo } from 'react';
import { usePPDI } from '../context/PPDIContext';
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  Eye,
  Trash2,
  UserPlus,
  RefreshCw,
  Building2,
  Calendar,
  Phone,
  Mail,
  MapPin,
  FileText,
  AlertCircle,
  X,
  Shield,
  Lock,
  MessageSquare,
  Send,
  ExternalLink,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  Layers,
} from 'lucide-react';
import { PendaftaranPerangkatDesa } from '../types/ppdi';
import { getWhatsAppApprovalUrl, formatPhoneForWhatsApp } from '../utils/ppdiHelpers';

interface PendaftaranApprovalViewProps {
  onOpenPublicForm?: () => void;
}

export const PendaftaranApprovalView: React.FC<PendaftaranApprovalViewProps> = ({ onOpenPublicForm }) => {
  const {
    pendaftaranList,
    approvePendaftaran,
    rejectPendaftaran,
    deletePendaftaran,
    refreshDataFromMySQL,
    kecamatanList,
    desaList,
    currentUser,
    setActiveTab,
    hasPermission,
    fullMembers,
  } = usePPDI();

  // Role detection
  const userRole = currentUser?.role || 'Superadmin_Kabupaten';
  const isSuperadmin = userRole === 'Superadmin_Kabupaten';
  const isAdminKabupaten = userRole === 'Admin_Kabupaten';
  const isKabupatenLevel = isSuperadmin || isAdminKabupaten;
  const isAdminKecamatan = userRole === 'Admin_Kecamatan';
  const isAdminDesa = userRole === 'Admin_Desa';
  const isAnggota = userRole === 'Anggota';

  // Permission rights strictly bound to centralized Role Permissions
  const canApprove = hasPermission('pendaftaran', 'edit') && (isKabupatenLevel || isAdminKecamatan);
  const canReject = hasPermission('pendaftaran', 'edit') && (isKabupatenLevel || isAdminKecamatan);
  const canDelete = hasPermission('pendaftaran', 'delete');
  const canInput = hasPermission('pendaftaran', 'add');

  // Territorial assignment
  const userKecClean = (currentUser?.id_kecamatan || '').replace(/\./g, '').trim();
  const userDesaClean = (currentUser?.id_desa || '').replace(/\./g, '').trim();

  const assignedKec = useMemo(() => {
    if (!userKecClean) return null;
    return kecamatanList.find((k) => k.id_kecamatan.replace(/\./g, '').trim() === userKecClean) || null;
  }, [kecamatanList, userKecClean]);

  const assignedDesa = useMemo(() => {
    if (!userDesaClean) return null;
    return desaList.find((d) => d.id_desa.replace(/\./g, '').trim() === userDesaClean) || null;
  }, [desaList, userDesaClean]);

  // Role-Scoped baseline list: ONLY data belonging to user's territorial jurisdiction
  const roleScopedList = useMemo(() => {
    if (!currentUser) return pendaftaranList;

    // 1. Superadmin & Admin Kabupaten: Melihat semua data pendaftaran se-Kabupaten Bandung
    if (isKabupatenLevel) {
      return pendaftaranList;
    }

    // 2. Admin Kecamatan: Terkunci HANYA formulir yang masuk di wilayah Kecamatannya
    if (isAdminKecamatan) {
      if (!userKecClean) return pendaftaranList;
      return pendaftaranList.filter((item) => {
        const itemKec = (item.id_kecamatan || '').replace(/\./g, '').trim();
        const itemDesa = (item.id_desa || '').replace(/\./g, '').trim();
        const matchKec = itemKec === userKecClean;
        const matchDesaPrefix = itemDesa.length >= 6 && itemDesa.startsWith(userKecClean);
        const matchName = assignedKec?.nama_kecamatan && item.nama_kecamatan
          ? item.nama_kecamatan.toUpperCase().trim() === assignedKec.nama_kecamatan.toUpperCase().trim()
          : false;
        return matchKec || matchDesaPrefix || matchName;
      });
    }

    // 3. Admin Desa: Terkunci HANYA formulir yang masuk di wilayah Desanya
    if (isAdminDesa) {
      return pendaftaranList.filter((item) => {
        const itemDesa = (item.id_desa || '').replace(/\./g, '').trim();
        if (userDesaClean && itemDesa === userDesaClean) return true;
        if (assignedDesa?.nama_desa && item.nama_desa) {
          if (item.nama_desa.toUpperCase().trim() === assignedDesa.nama_desa.toUpperCase().trim()) return true;
        }
        // Fallback jika id_desa belum diset spesifik tapi ada id_kecamatan
        if (!userDesaClean && userKecClean) {
          const itemKec = (item.id_kecamatan || '').replace(/\./g, '').trim();
          return itemKec === userKecClean || (itemDesa.length >= 6 && itemDesa.startsWith(userKecClean));
        }
        return false;
      });
    }

    // 4. Anggota: Hanya melihat pengajuan mandirinya (berdasarkan NIK / ID Anggota)
    if (isAnggota) {
      const userNik = currentUser.id_anggota || currentUser.username;
      return pendaftaranList.filter((item) => {
        if (userNik && item.nik === userNik) return true;
        if (currentUser.email && item.email && item.email.toLowerCase() === currentUser.email.toLowerCase()) return true;
        return false;
      });
    }

    return pendaftaranList;
  }, [pendaftaranList, isKabupatenLevel, isAdminKecamatan, isAdminDesa, isAnggota, userKecClean, userDesaClean, assignedKec, assignedDesa, currentUser]);

  const [activeFilterTab, setActiveFilterTab] = useState<'Semua' | 'Menunggu' | 'Disetujui' | 'Ditolak'>('Menunggu');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterKecamatan, setFilterKecamatan] = useState<string>('all');
  const [filterDesa, setFilterDesa] = useState<string>('all');
  const [selectedItem, setSelectedItem] = useState<PendaftaranPerangkatDesa | null>(null);

  // Sorting state for table columns
  const [sortBy, setSortBy] = useState<'tgl' | 'nama' | 'kecamatan' | 'status'>('tgl');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Count pendaftar per kecamatan for badge counters
  const kecamatanCounts = useMemo(() => {
    const map: Record<string, number> = {};
    roleScopedList.forEach((item) => {
      if (activeFilterTab !== 'Semua' && item.status_approval !== activeFilterTab) return;
      const cleanKec = (item.id_kecamatan || '').replace(/\./g, '').trim();
      if (cleanKec) {
        map[cleanKec] = (map[cleanKec] || 0) + 1;
      }
    });
    return map;
  }, [roleScopedList, activeFilterTab]);

  // List of kecamatan with active registrations in current status tab
  const activeKecamatanList = useMemo(() => {
    return kecamatanList.filter((k) => {
      const cleanKec = k.id_kecamatan.replace(/\./g, '').trim();
      return (kecamatanCounts[cleanKec] || 0) > 0;
    });
  }, [kecamatanList, kecamatanCounts]);

  // Available desa options based on active kecamatan
  const availableDesaList = useMemo(() => {
    let targetKec = '';
    if (isKabupatenLevel) {
      if (filterKecamatan === 'all') return [];
      targetKec = filterKecamatan.replace(/\./g, '').trim();
    } else if (isAdminKecamatan) {
      targetKec = userKecClean;
    }
    if (!targetKec) return [];
    return desaList.filter((d) => d.id_kecamatan.replace(/\./g, '').trim() === targetKec);
  }, [desaList, isKabupatenLevel, filterKecamatan, isAdminKecamatan, userKecClean]);

  // Modal Approve confirmation
  const [approvingItem, setApprovingItem] = useState<PendaftaranPerangkatDesa | null>(null);
  const [customKta, setCustomKta] = useState('');
  const [isApproving, setIsApproving] = useState(false);

  // Modal Reject confirmation
  const [rejectingItem, setRejectingItem] = useState<PendaftaranPerangkatDesa | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal Notifikasi WA setelah approval berhasil
  const [approvedSuccessData, setApprovedSuccessData] = useState<{
    nama: string;
    phone: string;
    noKta: string;
    desa?: string;
    kecamatan?: string;
  } | null>(null);

  // Statistik ringkasan scoped to current user's role
  const stats = useMemo(() => {
    const total = roleScopedList.length;
    const pending = roleScopedList.filter((p) => p.status_approval === 'Menunggu').length;
    const approved = roleScopedList.filter((p) => p.status_approval === 'Disetujui').length;
    const rejected = roleScopedList.filter((p) => p.status_approval === 'Ditolak').length;
    return { total, pending, approved, rejected };
  }, [roleScopedList]);

  // Handle Sort header toggle
  const handleSortToggle = (field: 'tgl' | 'nama' | 'kecamatan' | 'status') => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // Filter & Sort list
  const filteredList = useMemo(() => {
    const list = roleScopedList.filter((item) => {
      // Status filter
      if (activeFilterTab !== 'Semua' && item.status_approval !== activeFilterTab) {
        return false;
      }
      // Kecamatan filter (only for Kabupaten level since other roles are already pre-scoped)
      if (isKabupatenLevel && filterKecamatan !== 'all') {
        const cleanFilter = filterKecamatan.replace(/\./g, '').trim();
        const cleanItemKec = (item.id_kecamatan || '').replace(/\./g, '').trim();
        const cleanItemDesa = (item.id_desa || '').replace(/\./g, '').trim();
        if (cleanItemKec !== cleanFilter && !cleanItemDesa.startsWith(cleanFilter)) return false;
      }
      // Desa filter
      if (filterDesa !== 'all') {
        const cleanFilterDesa = filterDesa.replace(/\./g, '').trim();
        const cleanItemDesa = (item.id_desa || '').replace(/\./g, '').trim();
        if (cleanItemDesa !== cleanFilterDesa) return false;
      }
      // Search term (Nama, NIK, No HP, Desa, Kecamatan, Jabatan)
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const nama = (item.nama_lengkap || '').toLowerCase();
        const nik = (item.nik || '').toLowerCase();
        const noHp = (item.no_hp_wa || '').toLowerCase();
        const desa = (item.nama_desa || '').toLowerCase();
        const kec = (item.nama_kecamatan || '').toLowerCase();
        const jab = (item.nama_jabatan || '').toLowerCase();
        return nama.includes(q) || nik.includes(q) || noHp.includes(q) || desa.includes(q) || kec.includes(q) || jab.includes(q);
      }
      return true;
    });

    // Sort list
    return [...list].sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'nama') {
        comparison = (a.nama_lengkap || '').localeCompare(b.nama_lengkap || '');
      } else if (sortBy === 'kecamatan') {
        const kecA = (a.nama_kecamatan || a.id_kecamatan || '').toLowerCase();
        const kecB = (b.nama_kecamatan || b.id_kecamatan || '').toLowerCase();
        const desaA = (a.nama_desa || a.id_desa || '').toLowerCase();
        const desaB = (b.nama_desa || b.id_desa || '').toLowerCase();
        comparison = kecA.localeCompare(kecB) || desaA.localeCompare(desaB);
      } else if (sortBy === 'status') {
        comparison = (a.status_approval || '').localeCompare(b.status_approval || '');
      } else {
        // 'tgl' - default by registration date or ID
        const tglA = a.tgl_pendaftaran || String(a.id_pendaftaran);
        const tglB = b.tgl_pendaftaran || String(b.id_pendaftaran);
        comparison = tglA.localeCompare(tglB);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [roleScopedList, activeFilterTab, isKabupatenLevel, filterKecamatan, filterDesa, searchTerm, sortBy, sortOrder]);

  // Handle Approve
  const handleConfirmApprove = async () => {
    if (!approvingItem) return;
    if (!canApprove) {
      setActionMessage({ type: 'error', text: 'Akses Ditolak: Anda tidak memiliki wewenang menyetujui pendaftaran.' });
      return;
    }
    setIsApproving(true);
    try {
      const result = await approvePendaftaran(approvingItem.id_pendaftaran, customKta.trim() || undefined);
      const assignedNoKta = result.no_kta || customKta.trim() || 'KTA PPDI REGISTERED';

      setActionMessage({
        type: 'success',
        text: result.message || `Pendaftaran atas nama ${approvingItem.nama_lengkap.toUpperCase()} berhasil disetujui!`,
      });

      // Pemicu modal notifikasi WhatsApp
      setApprovedSuccessData({
        nama: approvingItem.nama_lengkap,
        phone: approvingItem.no_hp_wa,
        noKta: assignedNoKta,
        desa: approvingItem.nama_desa || approvingItem.id_desa || '',
        kecamatan: approvingItem.nama_kecamatan || approvingItem.id_kecamatan || '',
      });

      setApprovingItem(null);
      setCustomKta('');
      if (selectedItem?.id_pendaftaran === approvingItem.id_pendaftaran) {
        setSelectedItem(null);
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Gagal menyetujui pendaftaran' });
    } finally {
      setIsApproving(false);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  // Handle Reject
  const handleConfirmReject = async () => {
    if (!rejectingItem) return;
    if (!canReject) {
      setActionMessage({ type: 'error', text: 'Akses Ditolak: Anda tidak memiliki wewenang menolak pendaftaran.' });
      return;
    }
    setIsRejecting(true);
    try {
      await rejectPendaftaran(rejectingItem.id_pendaftaran, rejectReason.trim() || 'Berkas belum memenuhi persyaratan');
      setActionMessage({
        type: 'success',
        text: `Pendaftaran atas nama ${rejectingItem.nama_lengkap.toUpperCase()} telah ditolak.`,
      });
      setRejectingItem(null);
      setRejectReason('');
      if (selectedItem?.id_pendaftaran === rejectingItem.id_pendaftaran) {
        setSelectedItem(null);
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Gagal menolak pendaftaran' });
    } finally {
      setIsRejecting(false);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  // Handle Delete
  const handleDelete = async (item: PendaftaranPerangkatDesa) => {
    if (!canDelete) {
      setActionMessage({
        type: 'error',
        text: 'Akses Ditolak: Hanya Akun Tingkat Kabupaten yang diizinkan menghapus formulir pendaftaran.',
      });
      return;
    }
    if (!confirm(`Hapus data formulir registrasi atas nama ${item.nama_lengkap.toUpperCase()}?`)) return;
    try {
      await deletePendaftaran(item.id_pendaftaran);
      setActionMessage({ type: 'success', text: 'Data formulir registrasi berhasil dihapus.' });
      if (selectedItem?.id_pendaftaran === item.id_pendaftaran) {
        setSelectedItem(null);
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Gagal menghapus data' });
    } finally {
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 text-neutral-900">
      {/* Top Banner */}
      <div className="bg-[#064E3B] text-white p-6 rounded-xl shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <ClipboardCheck className="w-6 h-6 text-amber-300" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight uppercase">
              Registrasi & Approval Formulir Induk Perangkat Desa
            </h1>
          </div>
          <p className="text-emerald-100 text-xs sm:text-sm mt-1 max-w-3xl">
            Tabel verifikasi formulir registrasi mandiri perangkat desa. Setelah disetujui (Approval),
            data langsung otomatis diterbitkan ke Data Induk Anggota serta dibuatkan Nomor E-KTA resmi.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onOpenPublicForm && canInput && (
            <button
              onClick={onOpenPublicForm}
              className="flex items-center gap-2 px-4 py-2 bg-white text-[#064E3B] hover:bg-emerald-50 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer uppercase"
            >
              <UserPlus className="w-4 h-4 text-[#064E3B]" />
              <span>Input Formulir Baru</span>
            </button>
          )}
          <button
            onClick={() => refreshDataFromMySQL()}
            className="p-2.5 bg-emerald-800/80 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer"
            title="Segarkan Data dari MySQL"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Role & Territorial Scope Indicator Banner */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-neutral-500 font-semibold text-[11px] uppercase">Tingkatan Role Pengguna:</span>
          <span
            className={`px-2.5 py-0.5 rounded-md font-bold text-xs uppercase border ${
              isSuperadmin
                ? 'bg-purple-100 text-purple-900 border-purple-300'
                : isAdminKabupaten
                ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                : isAdminKecamatan
                ? 'bg-amber-100 text-amber-900 border-amber-300'
                : isAdminDesa
                ? 'bg-blue-100 text-blue-900 border-blue-300'
                : 'bg-neutral-100 text-neutral-800 border-neutral-300'
            }`}
          >
            {userRole.replace(/_/g, ' ')}
          </span>
          <span className="text-neutral-300">|</span>
          <div className="flex items-center gap-1.5 text-neutral-800">
            {isKabupatenLevel ? (
              <Shield className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            )}
            <span className="font-semibold">
              {isKabupatenLevel
                ? 'Cakupan: Seluruh Kabupaten Bandung (31 Kecamatan & 270+ Desa)'
                : isAdminKecamatan
                ? `Wilayah Teritorial: Kecamatan ${assignedKec?.nama_kecamatan || userKecClean} (Terkunci Auto-Filter)`
                : isAdminDesa
                ? `Wilayah Teritorial: Desa ${assignedDesa?.nama_desa || userDesaClean}, Kec. ${assignedKec?.nama_kecamatan || userKecClean} (Terkunci)`
                : 'Akses Mandiri: Hanya melihat berkas pengajuan pribadi'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-neutral-600 shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>
            Data Terbaca: <b>{roleScopedList.length} Formulir</b> dalam wewenang Anda
          </span>
        </div>
      </div>

      {/* Notification Banner */}
      {actionMessage && (
        <div
          className={`p-4 rounded-lg flex items-center justify-between gap-3 text-xs sm:text-sm font-medium border shadow-xs ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
              : 'bg-red-50 text-red-900 border-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {actionMessage.type === 'success' && (
              <button
                onClick={() => setActiveTab('anggota')}
                className="px-3 py-1 bg-[#064E3B] hover:bg-[#043d2e] text-white rounded-md text-xs font-bold cursor-pointer transition-colors shadow-xs flex items-center gap-1"
              >
                <span>Lihat di Data Induk</span>
                <span>&rarr;</span>
              </button>
            )}
            <button onClick={() => setActionMessage(null)} className="text-neutral-500 hover:text-neutral-900 p-1 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Summary KPI Cards - Scoped to User's Role Jurisdiction */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-2xs">
          <div className="flex items-center justify-between text-neutral-500 mb-2">
            <span className="text-xs font-medium uppercase font-mono">Total Registrasi</span>
            <FileText className="w-4 h-4 text-neutral-400" />
          </div>
          <div className="text-2xl font-extrabold text-neutral-900 font-mono">{stats.total}</div>
          <div className="text-[11px] text-neutral-500 mt-1">
            {isKabupatenLevel ? 'Seluruh formulir pendaftaran masuk se-Kabupaten' : `Formulir di wilayah ${assignedKec?.nama_kecamatan || 'tugas Anda'}`}
          </div>
        </div>

        <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-300 shadow-2xs">
          <div className="flex items-center justify-between text-amber-800 mb-2">
            <span className="text-xs font-bold uppercase font-mono">Menunggu Approval</span>
            <Clock className="w-4 h-4 text-amber-600 animate-spin" style={{ animationDuration: '6s' }} />
          </div>
          <div className="text-2xl font-extrabold text-amber-900 font-mono">{stats.pending}</div>
          <div className="text-[11px] text-amber-700 font-medium mt-1">Perlu ditinjau dan diverifikasi</div>
        </div>

        <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-300 shadow-2xs">
          <div className="flex items-center justify-between text-emerald-800 mb-2">
            <span className="text-xs font-bold uppercase font-mono">Telah Disetujui</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-900 font-mono">{stats.approved}</div>
          <div className="text-[11px] text-emerald-700 font-medium mt-1">Tercatat aktif di Data Induk Anggota</div>
        </div>

        <div className="bg-red-50/60 p-4 rounded-xl border border-red-200 shadow-2xs">
          <div className="flex items-center justify-between text-red-800 mb-2">
            <span className="text-xs font-medium uppercase font-mono">Ditolak</span>
            <XCircle className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-extrabold text-red-900 font-mono">{stats.rejected}</div>
          <div className="text-[11px] text-red-700 font-medium mt-1">Berkas belum lengkap / tidak sah</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-2xs space-y-4">
        {/* Status Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 pb-3">
          {(['Menunggu', 'Semua', 'Disetujui', 'Ditolak'] as const).map((tab) => {
            const isActive = activeFilterTab === tab;
            const count =
              tab === 'Semua'
                ? stats.total
                : tab === 'Menunggu'
                ? stats.pending
                : tab === 'Disetujui'
                ? stats.approved
                : stats.rejected;
            return (
              <button
                key={tab}
                onClick={() => setActiveFilterTab(tab)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
                  isActive
                    ? 'bg-[#064E3B] text-white shadow-xs'
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                }`}
              >
                <span>{tab === 'Menunggu' ? 'Menunggu Approval' : tab}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isActive ? 'bg-emerald-900 text-emerald-200' : 'bg-neutral-200 text-neutral-800'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Inputs Filter & Search & Sort */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari berdasarkan NIK, Nama Lengkap, Desa, atau No. HP..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-neutral-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-[#064E3B] focus:border-transparent outline-none bg-neutral-50/50"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Filter className="w-4 h-4 text-neutral-400" />

            {/* Filter Kecamatan: Dropdown untuk Kabupaten dengan Hitung Pendaftar */}
            {isKabupatenLevel ? (
              <select
                value={filterKecamatan}
                onChange={(e) => {
                  setFilterKecamatan(e.target.value);
                  setFilterDesa('all');
                }}
                className="border border-neutral-200 rounded-lg text-xs font-mono py-2 px-3 focus:ring-2 focus:ring-[#064E3B] outline-none bg-white font-semibold"
              >
                <option value="all">Semua Kecamatan ({kecamatanList.length} Kec)</option>
                {kecamatanList.map((k) => {
                  const cleanKec = k.id_kecamatan.replace(/\./g, '').trim();
                  const count = kecamatanCounts[cleanKec] || 0;
                  return (
                    <option key={k.id_kecamatan} value={k.id_kecamatan}>
                      Kec. {k.nama_kecamatan} {count > 0 ? `(${count})` : ''}
                    </option>
                  );
                })}
              </select>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 border border-amber-300 rounded-lg text-xs font-mono font-bold text-amber-900 shadow-2xs">
                <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span>Kec. {assignedKec?.nama_kecamatan || userKecClean || 'Penugasan'}</span>
              </div>
            )}

            {/* Filter Desa: Tersedia jika Kecamatan terpilih atau untuk Admin_Kecamatan */}
            {(isKabupatenLevel ? filterKecamatan !== 'all' : isAdminKecamatan) && availableDesaList.length > 0 && (
              <select
                value={filterDesa}
                onChange={(e) => setFilterDesa(e.target.value)}
                className="border border-emerald-300 bg-emerald-50/50 text-emerald-950 font-semibold rounded-lg text-xs font-mono py-2 px-3 focus:ring-2 focus:ring-[#064E3B] outline-none"
              >
                <option value="all">Semua Desa ({availableDesaList.length} Desa)</option>
                {availableDesaList.map((d) => (
                  <option key={d.id_desa} value={d.id_desa}>
                    Desa {d.nama_desa}
                  </option>
                ))}
              </select>
            )}

            {/* Sort Controls */}
            <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-lg border border-neutral-200 text-xs font-mono">
              <SlidersHorizontal className="w-3.5 h-3.5 text-neutral-500 ml-1" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent border-none text-xs font-mono font-semibold text-neutral-800 focus:outline-none cursor-pointer py-1"
              >
                <option value="tgl">Tgl Pendaftaran</option>
                <option value="nama">Nama Lengkap (A-Z)</option>
                <option value="kecamatan">Kecamatan & Desa</option>
                <option value="status">Status Verifikasi</option>
              </select>
              <button
                type="button"
                onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                className="p-1 hover:bg-neutral-200 rounded text-neutral-700 cursor-pointer flex items-center justify-center transition-colors"
                title={sortOrder === 'asc' ? 'Urutan Naik (Ascending)' : 'Urutan Turun (Descending)'}
              >
                {sortOrder === 'asc' ? (
                  <ArrowUp className="w-3.5 h-3.5 text-emerald-700 font-bold" />
                ) : (
                  <ArrowDown className="w-3.5 h-3.5 text-emerald-700 font-bold" />
                )}
              </button>
            </div>

            {/* Lock Indicator untuk Admin Desa */}
            {isAdminDesa && assignedDesa && (
              <div className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 border border-blue-300 rounded-lg text-xs font-mono font-bold text-blue-900 shadow-2xs">
                <Lock className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                <span>Desa {assignedDesa.nama_desa}</span>
              </div>
            )}
          </div>
        </div>

        {/* Quick Kecamatan Filter Chips Bar */}
        {isKabupatenLevel && activeKecamatanList.length > 0 && (
          <div className="pt-2 border-t border-neutral-100 flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-mono text-neutral-500 font-semibold mr-1 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-emerald-600" />
              <span>Quick Filter Kecamatan:</span>
            </span>
            <button
              onClick={() => {
                setFilterKecamatan('all');
                setFilterDesa('all');
              }}
              className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer font-semibold ${
                filterKecamatan === 'all'
                  ? 'bg-[#064E3B] text-white shadow-2xs'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              Semua ({roleScopedList.filter((p) => activeFilterTab === 'Semua' || p.status_approval === activeFilterTab).length})
            </button>
            {activeKecamatanList.map((k) => {
              const cleanKec = k.id_kecamatan.replace(/\./g, '').trim();
              const count = kecamatanCounts[cleanKec] || 0;
              const isSelected = filterKecamatan === k.id_kecamatan;
              return (
                <button
                  key={k.id_kecamatan}
                  onClick={() => {
                    setFilterKecamatan(isSelected ? 'all' : k.id_kecamatan);
                    setFilterDesa('all');
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono transition-all cursor-pointer flex items-center gap-1 font-semibold ${
                    isSelected
                      ? 'bg-[#064E3B] text-white shadow-2xs'
                      : 'bg-emerald-50 text-emerald-900 border border-emerald-200/60 hover:bg-emerald-100'
                  }`}
                >
                  <span>Kec. {k.nama_kecamatan}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[9.5px] ${isSelected ? 'bg-emerald-900 text-emerald-100' : 'bg-emerald-200 text-emerald-950 font-bold'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Table of Registrations */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-2xs overflow-hidden">
        <div className="p-4 bg-neutral-50/80 border-b border-neutral-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-neutral-800 uppercase tracking-wider font-mono">
              Daftar Formulir Induk Perangkat Desa ({filteredList.length} Data)
            </h2>
            <span className="text-[11px] px-2 py-0.5 bg-neutral-200/80 rounded font-mono font-semibold text-neutral-700">
              Role: {userRole}
            </span>
          </div>
          <span className="text-[11px] text-neutral-500 font-mono">
            Tersimpan di tabel: <code className="bg-neutral-200/60 px-1 py-0.5 rounded text-neutral-800 font-semibold">pendaftaran_perangkat_desa</code>
          </span>
        </div>

        {filteredList.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-neutral-100 flex items-center justify-center mx-auto text-neutral-400">
              <ClipboardCheck className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-bold text-neutral-800">Tidak ada data formulir pendaftaran</h3>
            <p className="text-xs text-neutral-500 max-w-md mx-auto">
              {isAdminKecamatan
                ? `Tidak ada pengajuan pendaftaran untuk wilayah Kecamatan ${assignedKec?.nama_kecamatan || ''} dengan kriteria yang dipilih.`
                : isAdminDesa
                ? `Tidak ada pengajuan pendaftaran untuk Desa ${assignedDesa?.nama_desa || ''}.`
                : activeFilterTab === 'Menunggu'
                ? 'Semua pengajuan pendaftaran telah diproses atau belum ada formulir baru yang masuk.'
                : 'Tidak ada data registrasi dengan kriteria pencarian yang dipilih.'}
            </p>
            {onOpenPublicForm && canInput && (
              <button
                onClick={onOpenPublicForm}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#064E3B] text-white rounded-lg text-xs font-bold hover:bg-emerald-900 transition-colors cursor-pointer mt-2"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Buka Formulir Pendaftaran</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-neutral-100 text-neutral-700 border-b border-neutral-200 uppercase tracking-wider font-bold">
                <tr>
                  <th className="p-3 w-12 text-center">No</th>
                  <th
                    onClick={() => handleSortToggle('tgl')}
                    className="p-3 cursor-pointer hover:bg-neutral-200/80 transition-colors group select-none"
                    title="Klik untuk menyortir berdasarkan Tanggal Pendaftaran"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>NIK & Tgl Daftar</span>
                      {sortBy === 'tgl' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-[#064E3B]" /> : <ArrowDown className="w-3.5 h-3.5 text-[#064E3B]" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSortToggle('nama')}
                    className="p-3 cursor-pointer hover:bg-neutral-200/80 transition-colors group select-none"
                    title="Klik untuk menyortir berdasarkan Nama Lengkap"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Nama Lengkap</span>
                      {sortBy === 'nama' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-[#064E3B]" /> : <ArrowDown className="w-3.5 h-3.5 text-[#064E3B]" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSortToggle('kecamatan')}
                    className="p-3 cursor-pointer hover:bg-neutral-200/80 transition-colors group select-none"
                    title="Klik untuk menyortir berdasarkan Wilayah Kecamatan & Desa"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Wilayah Tugas</span>
                      {sortBy === 'kecamatan' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-[#064E3B]" /> : <ArrowDown className="w-3.5 h-3.5 text-[#064E3B]" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                  </th>
                  <th className="p-3">Jabatan</th>
                  <th className="p-3">Kontak</th>
                  <th
                    onClick={() => handleSortToggle('status')}
                    className="p-3 text-center cursor-pointer hover:bg-neutral-200/80 transition-colors group select-none"
                    title="Klik untuk menyortir berdasarkan Status Approval"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Status</span>
                      {sortBy === 'status' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-[#064E3B]" /> : <ArrowDown className="w-3.5 h-3.5 text-[#064E3B]" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                  </th>
                  <th className="p-3 text-center">Aksi Verifikasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filteredList.map((item, index) => {
                  const isPending = item.status_approval === 'Menunggu';
                  const isApproved = item.status_approval === 'Disetujui';
                  const isRejected = item.status_approval === 'Ditolak';

                  return (
                    <tr
                      key={item.id_pendaftaran}
                      className={`hover:bg-neutral-50 transition-colors ${
                        isPending ? 'bg-amber-50/20' : ''
                      }`}
                    >
                      <td className="p-3 text-center text-neutral-400 font-bold">{index + 1}</td>
                      <td className="p-3">
                        <div className="font-bold text-neutral-900">{item.nik}</div>
                        <div className="text-[10px] text-neutral-500 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3 text-neutral-400" />
                          <span>{item.tgl_pendaftaran ? item.tgl_pendaftaran.split(' ')[0] : '-'}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-neutral-900 tracking-wide">
                          {item.gelar_depan ? `${item.gelar_depan} ` : ''}
                          <span className="uppercase">{item.nama_lengkap}</span>
                          {item.gelar_belakang ? `, ${item.gelar_belakang}` : ''}
                        </div>
                        <div className="text-[10px] text-neutral-500">
                          {item.tempat_lahir}, {item.tanggal_lahir} ({item.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'})
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-neutral-900 flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span>Desa {item.nama_desa || item.id_desa}</span>
                        </div>
                        <div className="text-[10px] text-neutral-500 ml-4">
                          Kec. {item.nama_kecamatan || item.id_kecamatan}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 bg-neutral-100 text-neutral-800 rounded font-semibold text-[11px]">
                          {item.nama_jabatan || `Jabatan ID: ${item.id_jabatan}`}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1 text-neutral-700">
                          <Phone className="w-3 h-3 text-neutral-400" />
                          <span>{item.no_hp_wa}</span>
                        </div>
                        {item.email && (
                          <div className="flex items-center gap-1 text-[10px] text-neutral-500 mt-0.5 truncate max-w-[150px]">
                            <Mail className="w-3 h-3 text-neutral-400 shrink-0" />
                            <span className="truncate">{item.email}</span>
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {isPending && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-900 rounded-full font-bold text-[10px]">
                            <Clock className="w-3 h-3 animate-spin" style={{ animationDuration: '4s' }} />
                            <span>Menunggu</span>
                          </span>
                        )}
                        {isApproved && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-900 rounded-full font-bold text-[10px]">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Disetujui</span>
                          </span>
                        )}
                        {isRejected && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-900 rounded-full font-bold text-[10px]">
                            <XCircle className="w-3 h-3 text-red-600" />
                            <span>Ditolak</span>
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Detail Button */}
                          <button
                            onClick={() => setSelectedItem(item)}
                            className="p-1.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-md transition-colors cursor-pointer"
                            title="Lihat Formulir Lengkap"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Approval Actions (Hanya untuk Role yang memiliki wewenang: Superadmin, Admin Kabupaten, Admin Kecamatan) */}
                          {isPending && canApprove && (
                            <>
                              <button
                                onClick={() => {
                                  setApprovingItem(item);
                                  setCustomKta('');
                                }}
                                className="px-2.5 py-1 bg-[#064E3B] hover:bg-[#043d2e] text-white rounded font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                                title="Setujui dan Terbitkan KTA"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Setujui</span>
                              </button>
                              <button
                                onClick={() => {
                                  setRejectingItem(item);
                                  setRejectReason('');
                                }}
                                className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                                title="Tolak Pendaftaran"
                              >
                                <XCircle className="w-3 h-3" />
                                <span>Tolak</span>
                              </button>
                            </>
                          )}

                          {/* Indicator jika tidak memiliki hak approval (misal Admin Desa / Anggota) */}
                          {isPending && !canApprove && (
                            <span className="text-[10px] text-neutral-400 italic">Verifikasi PK/Kabupaten</span>
                          )}

                          {/* Tombol Kirim Notifikasi WA untuk Pendaftaran Disetujui */}
                          {isApproved && item.no_hp_wa && (
                            <button
                              onClick={() => {
                                const member = fullMembers.find((m) => m.anggota.nik === item.nik);
                                const ktaStr = member?.keanggotaan?.no_kta || 'KTA PPDI REGISTERED';
                                const waUrl = getWhatsAppApprovalUrl({
                                  phone: item.no_hp_wa,
                                  name: item.nama_lengkap,
                                  noKta: ktaStr,
                                  desa: item.nama_desa || item.id_desa,
                                  kecamatan: item.nama_kecamatan || item.id_kecamatan,
                                });
                                window.open(waUrl, '_blank');
                              }}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                              title="Kirim Notifikasi WA Pengesahan Keanggotaan"
                            >
                              <MessageSquare className="w-3 h-3 text-emerald-100" />
                              <span>Notif WA</span>
                            </button>
                          )}

                          {/* Delete Button (Hanya Superadmin & Admin Kabupaten) */}
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(item)}
                              className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                              title="Hapus Formulir Pendaftaran"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Detail Pendaftaran */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full overflow-hidden text-neutral-900">
            <div className="px-6 py-4 bg-[#064E3B] text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold uppercase">Detail Formulir Induk Pendaftaran</h3>
                <p className="text-xs text-emerald-200">ID Registrasi #{selectedItem.id_pendaftaran}</p>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-white/80 hover:text-white p-1 rounded-md hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto font-mono text-xs">
              {/* Status Header */}
              <div className="p-3 rounded-lg border flex items-center justify-between bg-neutral-50">
                <span className="font-semibold text-neutral-600">Status Pengajuan:</span>
                <span
                  className={`font-bold px-2.5 py-1 rounded-full ${
                    selectedItem.status_approval === 'Menunggu'
                      ? 'bg-amber-100 text-amber-900'
                      : selectedItem.status_approval === 'Disetujui'
                      ? 'bg-emerald-100 text-emerald-900'
                      : 'bg-red-100 text-red-900'
                  }`}
                >
                  {selectedItem.status_approval}
                </span>
              </div>

              {/* Biodata Section */}
              <div className="space-y-2 border-t pt-3">
                <h4 className="font-bold text-neutral-700 uppercase tracking-wider text-[11px]">Biodata Perangkat Desa</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2.5 bg-neutral-50 rounded border border-neutral-100">
                    <span className="text-neutral-500 block text-[10px]">Nama Lengkap (Tanpa Gelar)</span>
                    <span className="font-bold text-neutral-900 text-sm uppercase">
                      {selectedItem.nama_lengkap.toUpperCase()}
                    </span>
                    {(selectedItem.gelar_depan || selectedItem.gelar_belakang) && (
                      <div className="text-[11px] text-emerald-800 font-semibold mt-1 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {selectedItem.gelar_depan ? `${selectedItem.gelar_depan} ` : ''}
                        {selectedItem.nama_lengkap.toUpperCase()}
                        {selectedItem.gelar_belakang ? `, ${selectedItem.gelar_belakang}` : ''}
                      </div>
                    )}
                  </div>
                  <div className="p-2.5 bg-neutral-50 rounded border border-neutral-100">
                    <span className="text-neutral-500 block text-[10px]">NIK KTP (16 Digit)</span>
                    <span className="font-bold text-neutral-900 text-sm">{selectedItem.nik}</span>
                    <div className="flex gap-2 mt-1 text-[10px] text-neutral-600">
                      <span>Gelar Depan: <b>{selectedItem.gelar_depan || '-'}</b></span>
                      <span>•</span>
                      <span>Gelar Belakang: <b>{selectedItem.gelar_belakang || '-'}</b></span>
                    </div>
                  </div>
                  <div className="p-2.5 bg-neutral-50 rounded border border-neutral-100">
                    <span className="text-neutral-500 block text-[10px]">Tempat, Tanggal Lahir</span>
                    <span className="font-semibold text-neutral-800">
                      {selectedItem.tempat_lahir}, {selectedItem.tanggal_lahir}
                    </span>
                  </div>
                  <div className="p-2.5 bg-neutral-50 rounded border border-neutral-100">
                    <span className="text-neutral-500 block text-[10px]">Jenis Kelamin</span>
                    <span className="font-semibold text-neutral-800">
                      {selectedItem.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'}
                    </span>
                  </div>
                  <div className="p-2.5 bg-neutral-50 rounded border border-neutral-100">
                    <span className="text-neutral-500 block text-[10px]">No. HP / WhatsApp</span>
                    <span className="font-semibold text-neutral-800">{selectedItem.no_hp_wa}</span>
                  </div>
                  <div className="p-2.5 bg-neutral-50 rounded border border-neutral-100">
                    <span className="text-neutral-500 block text-[10px]">Email</span>
                    <span className="font-semibold text-neutral-800">{selectedItem.email || '-'}</span>
                  </div>
                </div>
              </div>

              {/* Penempatan Wilayah & Jabatan */}
              <div className="space-y-2 border-t pt-3">
                <h4 className="font-bold text-neutral-700 uppercase tracking-wider text-[11px]">Penempatan & Formasi</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2.5 bg-emerald-50/50 rounded border border-emerald-200">
                    <span className="text-emerald-800 block text-[10px]">Kecamatan</span>
                    <span className="font-bold text-emerald-950">
                      Kec. {selectedItem.nama_kecamatan || selectedItem.id_kecamatan}
                    </span>
                  </div>
                  <div className="p-2.5 bg-emerald-50/50 rounded border border-emerald-200">
                    <span className="text-emerald-800 block text-[10px]">Desa</span>
                    <span className="font-bold text-emerald-950">
                      Desa {selectedItem.nama_desa || selectedItem.id_desa}
                    </span>
                  </div>
                  <div className="col-span-2 p-2.5 bg-neutral-50 rounded border border-neutral-100">
                    <span className="text-neutral-500 block text-[10px]">Jabatan Formasi</span>
                    <span className="font-bold text-neutral-900 text-sm">
                      {selectedItem.nama_jabatan || `Jabatan ID: ${selectedItem.id_jabatan}`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Approval Log */}
              {selectedItem.tgl_approval && (
                <div className="p-3 bg-neutral-100 rounded border border-neutral-200 space-y-1">
                  <span className="text-[10px] text-neutral-500 block">Riwayat Verifikasi:</span>
                  <div className="text-neutral-800">
                    Diproses pada: <b>{selectedItem.tgl_approval}</b> oleh <b>{selectedItem.approved_by || 'Admin'}</b>
                  </div>
                  {selectedItem.catatan_approval && (
                    <div className="text-neutral-600 mt-1 italic">
                      Catatan: "{selectedItem.catatan_approval}"
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-neutral-50 border-t flex justify-end gap-2">
              <button
                onClick={() => setSelectedItem(null)}
                className="px-4 py-2 bg-neutral-200 hover:bg-neutral-300 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Tutup
              </button>
              {selectedItem.status_approval === 'Disetujui' && selectedItem.no_hp_wa && (
                <button
                  onClick={() => {
                    const member = fullMembers.find((m) => m.anggota.nik === selectedItem.nik);
                    const ktaStr = member?.keanggotaan?.no_kta || 'KTA PPDI REGISTERED';
                    const waUrl = getWhatsAppApprovalUrl({
                      phone: selectedItem.no_hp_wa,
                      name: selectedItem.nama_lengkap,
                      noKta: ktaStr,
                      desa: selectedItem.nama_desa || selectedItem.id_desa,
                      kecamatan: selectedItem.nama_kecamatan || selectedItem.id_kecamatan,
                    });
                    window.open(waUrl, '_blank');
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <MessageSquare className="w-4 h-4 text-emerald-100" />
                  <span>Kirim Notifikasi WA</span>
                </button>
              )}
              {selectedItem.status_approval === 'Menunggu' && canApprove && (
                <button
                  onClick={() => {
                    setApprovingItem(selectedItem);
                    setCustomKta('');
                  }}
                  className="px-4 py-2 bg-[#064E3B] hover:bg-[#043d2e] text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Proses Approval</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Approval */}
      {approvingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden text-neutral-900 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6 text-emerald-700" />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-900">Setujui Pendaftaran Anggota?</h3>
                <p className="text-xs text-neutral-500">
                  Data akan diterbitkan ke Data Induk Anggota dan dibuatkan E-KTA resmi.
                </p>
              </div>
            </div>

            <div className="p-3 bg-neutral-50 rounded-lg border text-xs font-mono space-y-1">
              <div>
                Nama: <span className="font-bold text-neutral-900">{approvingItem.nama_lengkap.toUpperCase()}</span>
              </div>
              <div>
                NIK: <span className="font-bold text-neutral-900">{approvingItem.nik}</span>
              </div>
              <div>
                Wilayah: Desa {approvingItem.nama_desa || approvingItem.id_desa}, Kec. {approvingItem.nama_kecamatan}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-neutral-700 block">
                Nomor KTA PPDI (Opsional / Otomatis jika dikosongkan):
              </label>
              <input
                type="text"
                placeholder="Contoh: 32.04.05.2001.0008 (atau kosongkan)"
                value={customKta}
                onChange={(e) => setCustomKta(e.target.value)}
                className="w-full p-2.5 border border-neutral-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-[#064E3B] outline-none"
              />
              <span className="text-[10px] text-neutral-500">
                Sistem akan membuatkan nomor KTA otomatis sesuai kode wilayah jika kolom ini dibiarkan kosong.
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setApprovingItem(null)}
                disabled={isApproving}
                className="px-4 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 rounded-lg text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmApprove}
                disabled={isApproving}
                className="px-5 py-2 bg-[#064E3B] hover:bg-[#043d2e] text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-md disabled:opacity-50"
              >
                {isApproving ? 'Menyetujui...' : 'Ya, Setujui & Simpan ke Anggota'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Penolakan */}
      {rejectingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden text-neutral-900 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <XCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-900">Tolak Pengajuan Pendaftaran?</h3>
                <p className="text-xs text-neutral-500">
                  Pengajuan atas nama <b className="uppercase">{rejectingItem.nama_lengkap}</b> akan ditolak.
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-neutral-700 block">Alasan Penolakan / Catatan:</label>
              <textarea
                rows={3}
                placeholder="Contoh: NIK tidak valid atau SK Pengangkatan Kepala Desa belum dilampirkan..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full p-2.5 border border-neutral-300 rounded-lg text-xs focus:ring-2 focus:ring-red-500 outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectingItem(null)}
                disabled={isRejecting}
                className="px-4 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 rounded-lg text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={isRejecting}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-md disabled:opacity-50"
              >
                {isRejecting ? 'Menolak...' : 'Konfirmasi Tolak'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Notifikasi WhatsApp Pasca Approval */}
      {approvedSuccessData && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden text-neutral-900 p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 border border-emerald-300">
                <MessageSquare className="w-6 h-6 text-emerald-700" />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-900">Pendaftaran Berhasil Disetujui!</h3>
                <p className="text-xs text-neutral-500">
                  Data telah diterbitkan ke Data Induk Anggota dan E-KTA resmi telah aktif.
                </p>
              </div>
            </div>

            <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-lg text-xs font-mono space-y-1.5">
              <div className="flex justify-between">
                <span className="text-neutral-500">Nama Anggota:</span>
                <span className="font-bold text-emerald-950 uppercase">{approvedSuccessData.nama}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Nomor KTA Digital:</span>
                <span className="font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">{approvedSuccessData.noKta}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">No. WhatsApp:</span>
                <span className="font-bold text-neutral-900">{approvedSuccessData.phone}</span>
              </div>
            </div>

            <p className="text-xs text-neutral-600 leading-relaxed">
              Kirimkan pesan konfirmasi resmi pengesahan keanggotaan dan nomor E-KTA langsung ke nomor WhatsApp anggota ini.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setApprovedSuccessData(null)}
                className="px-4 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 rounded-lg text-xs font-bold cursor-pointer"
              >
                Nanti Saja
              </button>
              <button
                type="button"
                onClick={() => {
                  const waUrl = getWhatsAppApprovalUrl({
                    phone: approvedSuccessData.phone,
                    name: approvedSuccessData.nama,
                    noKta: approvedSuccessData.noKta,
                    desa: approvedSuccessData.desa,
                    kecamatan: approvedSuccessData.kecamatan,
                  });
                  window.open(waUrl, '_blank');
                  setApprovedSuccessData(null);
                }}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-md flex items-center gap-1.5"
              >
                <Send className="w-4 h-4 text-emerald-100" />
                <span>Kirim Notifikasi WA</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
