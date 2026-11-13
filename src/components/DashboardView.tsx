import React, { useState, useMemo } from 'react';
import { usePPDI } from '../context/PPDIContext';
import { formatRupiah, formatDateIndo } from '../utils/ppdiHelpers';
import { AnggotaFullDetail } from '../types/ppdi';
import {
  Users,
  CreditCard,
  Wallet,
  ClockAlert,
  Building,
  GraduationCap,
  Calendar,
  ArrowRight,
  TrendingUp,
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  FileText,
  Filter,
  MapPin,
  Bell,
  BellRing,
  ChevronDown,
  ChevronUp,
  Phone,
  Briefcase,
  Award,
  Layers,
  Sparkles,
  BarChart3,
  PieChartIcon,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { StatistikWilayahView } from './StatistikWilayahView';

// Custom Tooltip for Recharts
const CustomChartTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-neutral-900/95 text-white p-3 rounded-xl shadow-2xl border border-neutral-700/80 text-xs backdrop-blur-md">
        <p className="font-bold text-amber-300 mb-1 border-b border-neutral-800 pb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-1.5 text-neutral-300">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color || entry.fill }} />
              <span>{entry.name || 'Total'}:</span>
            </span>
            <span className="font-mono font-bold text-emerald-400">{entry.value} orang</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export const DashboardView: React.FC = () => {
  const {
    visibleMembers,
    fullMembers,
    visiblePendaftaran,
    currentUser,
    kecamatanList,
    desaList,
    iuranList,
    setActiveTab,
  } = usePPDI();

  // Regional Filter State for Recharts Data Visualization
  const [selectedKecamatanId, setSelectedKecamatanId] = useState<string>('');
  const [selectedDesaId, setSelectedDesaId] = useState<string>('');
  const [activeChartTab, setActiveChartTab] = useState<'jabatan' | 'masakerja' | 'pensiun' | 'wilayah'>('jabatan');
  
  // Toggle for 18-Month Retirement Notification Banner
  const [showRetirementNotif, setShowRetirementNotif] = useState<boolean>(true);
  const [retirmentUrgencyFilter, setRetirmentUrgencyFilter] = useState<'all' | 'kritis' | 'siaga' | 'waspada'>('all');

  // Filtered desa list based on selected kecamatan
  const filteredDesaList = useMemo(() => {
    if (!selectedKecamatanId) return desaList;
    const cleanKec = selectedKecamatanId.replace(/\./g, '');
    return desaList.filter(d => d.id_kecamatan.replace(/\./g, '') === cleanKec);
  }, [desaList, selectedKecamatanId]);

  // Scoped members for charts & metrics based on filter selection
  const chartFilteredMembers = useMemo(() => {
    return visibleMembers.filter(m => {
      if (selectedKecamatanId) {
        const kecId = m.kecamatan?.id_kecamatan || m.desa?.id_kecamatan;
        if (!kecId || kecId.replace(/\./g, '') !== selectedKecamatanId.replace(/\./g, '')) {
          return false;
        }
      }
      if (selectedDesaId) {
        const desaId = m.desa?.id_desa || m.jabatanTerkini?.id_desa;
        if (!desaId || String(desaId).replace(/\./g, '') !== selectedDesaId.replace(/\./g, '')) {
          return false;
        }
      }
      return true;
    });
  }, [visibleMembers, selectedKecamatanId, selectedDesaId]);

  // Reset filter helper
  const handleResetFilter = () => {
    setSelectedKecamatanId('');
    setSelectedDesaId('');
  };

  // Helper to calculate Masa Kerja in Years from TMT
  const getMasaKerjaYears = (m: AnggotaFullDetail): number => {
    const tmtStr = m.jabatanTerkini?.tmt_jabatan || m.keanggotaan?.tgl_bergabung;
    if (!tmtStr) return 0;
    const tmt = new Date(tmtStr);
    if (isNaN(tmt.getTime())) return 0;
    const now = new Date();
    let years = now.getFullYear() - tmt.getFullYear();
    const monthDiff = now.getMonth() - tmt.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < tmt.getDate())) {
      years--;
    }
    return Math.max(0, years);
  };

  // -------------------------------------------------------------
  // NOTIFIKASI OTOMATIS PURNA TUGAS 18 BULAN KE DEPAN
  // -------------------------------------------------------------
  const retirement18MonthsMembers = useMemo(() => {
    return visibleMembers.filter(m => {
      const isKades = 
        m.jabatanRef?.kategori_jabatan === 'Kepala Desa' ||
        m.jabatanRef?.nama_jabatan?.toLowerCase().includes('kepala desa') ||
        m.jabatanRef?.nama_jabatan?.toLowerCase().includes('kades');
      if (isKades) return false;
      if (m.statusPensiun === 'Sudah Purna Tugas') return false;
      const totalSisaBulan = m.sisaMasaPensiunTahun * 12 + m.sisaMasaPensiunBulan;
      return totalSisaBulan > 0 && totalSisaBulan <= 18;
    }).sort((a, b) => {
      const aMonths = a.sisaMasaPensiunTahun * 12 + a.sisaMasaPensiunBulan;
      const bMonths = b.sisaMasaPensiunTahun * 12 + b.sisaMasaPensiunBulan;
      return aMonths - bMonths;
    });
  }, [visibleMembers]);

  // Breakdown for 18 months urgency
  const retirementBreakdown = useMemo(() => {
    const kritis = retirement18MonthsMembers.filter(m => (m.sisaMasaPensiunTahun * 12 + m.sisaMasaPensiunBulan) <= 6);
    const siaga = retirement18MonthsMembers.filter(m => {
      const b = m.sisaMasaPensiunTahun * 12 + m.sisaMasaPensiunBulan;
      return b > 6 && b <= 12;
    });
    const waspada = retirement18MonthsMembers.filter(m => {
      const b = m.sisaMasaPensiunTahun * 12 + m.sisaMasaPensiunBulan;
      return b > 12 && b <= 18;
    });
    return { kritis, siaga, waspada };
  }, [retirement18MonthsMembers]);

  // Filtered notification list
  const filteredRetirementNotifList = useMemo(() => {
    if (retirmentUrgencyFilter === 'kritis') return retirementBreakdown.kritis;
    if (retirmentUrgencyFilter === 'siaga') return retirementBreakdown.siaga;
    if (retirmentUrgencyFilter === 'waspada') return retirementBreakdown.waspada;
    return retirement18MonthsMembers;
  }, [retirmentUrgencyFilter, retirementBreakdown, retirement18MonthsMembers]);

  // -------------------------------------------------------------
  // RECHARTS DATA COMPUTATIONS
  // -------------------------------------------------------------

  // 1. Data Jabatan Chart (Counts by Jabatan Name)
  const jabatanChartData = useMemo(() => {
    const counts: { [name: string]: number } = {};
    chartFilteredMembers.forEach(m => {
      const jName = m.jabatanRef?.nama_jabatan || 'Lainnya / Staf';
      counts[jName] = (counts[jName] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([nama, jumlah]) => ({ nama, jumlah }))
      .sort((a, b) => b.jumlah - a.jumlah)
      .slice(0, 10); // Top 10 jabatan
  }, [chartFilteredMembers]);

  // 2. Data Masa Kerja Chart (Counts by Masa Kerja Bracket)
  const masaKerjaChartData = useMemo(() => {
    const brackets = {
      '< 3 Tahun': 0,
      '3 - 5 Tahun': 0,
      '6 - 10 Tahun': 0,
      '11 - 15 Tahun': 0,
      '16 - 20 Tahun': 0,
      '> 20 Tahun': 0,
    };

    chartFilteredMembers.forEach(m => {
      const years = getMasaKerjaYears(m);
      if (years < 3) brackets['< 3 Tahun']++;
      else if (years <= 5) brackets['3 - 5 Tahun']++;
      else if (years <= 10) brackets['6 - 10 Tahun']++;
      else if (years <= 15) brackets['11 - 15 Tahun']++;
      else if (years <= 20) brackets['16 - 20 Tahun']++;
      else brackets['> 20 Tahun']++;
    });

    return Object.entries(brackets).map(([kategori, jumlah]) => ({ kategori, jumlah }));
  }, [chartFilteredMembers]);

  // 3. Data Wilayah (Per Desa or Per Kecamatan)
  const wilayahChartData = useMemo(() => {
    if (selectedKecamatanId) {
      // Group by Desa
      const desaCounts: { [namaDesa: string]: { nama: string; jumlah: number; avgMasaKerja: number; sumMasaKerja: number } } = {};
      filteredDesaList.forEach(d => {
        desaCounts[d.nama_desa] = { nama: d.nama_desa, jumlah: 0, avgMasaKerja: 0, sumMasaKerja: 0 };
      });

      chartFilteredMembers.forEach(m => {
        const dName = m.desa?.nama_desa;
        if (dName && desaCounts[dName]) {
          desaCounts[dName].jumlah += 1;
          desaCounts[dName].sumMasaKerja += getMasaKerjaYears(m);
        }
      });

      return Object.values(desaCounts)
        .map(d => ({
          nama: d.nama.length > 16 ? d.nama.slice(0, 14) + '...' : d.nama,
          fullname: d.nama,
          jumlah: d.jumlah,
          avgMasaKerja: d.jumlah > 0 ? Number((d.sumMasaKerja / d.jumlah).toFixed(1)) : 0,
        }))
        .sort((a, b) => b.jumlah - a.jumlah)
        .slice(0, 12);
    } else {
      // Group by Kecamatan
      const kecCounts: { [namaKec: string]: { nama: string; jumlah: number; avgMasaKerja: number; sumMasaKerja: number } } = {};
      kecamatanList.forEach(k => {
        kecCounts[k.nama_kecamatan] = { nama: k.nama_kecamatan, jumlah: 0, avgMasaKerja: 0, sumMasaKerja: 0 };
      });

      visibleMembers.forEach(m => {
        const kName = m.kecamatan?.nama_kecamatan;
        if (kName && kecCounts[kName]) {
          kecCounts[kName].jumlah += 1;
          kecCounts[kName].sumMasaKerja += getMasaKerjaYears(m);
        }
      });

      return Object.values(kecCounts)
        .map(k => ({
          nama: k.nama.startsWith('Kec.') ? k.nama : `Kec. ${k.nama}`,
          fullname: k.nama,
          jumlah: k.jumlah,
          avgMasaKerja: k.jumlah > 0 ? Number((k.sumMasaKerja / k.jumlah).toFixed(1)) : 0,
        }))
        .sort((a, b) => b.jumlah - a.jumlah)
        .slice(0, 12);
    }
  }, [selectedKecamatanId, filteredDesaList, kecamatanList, chartFilteredMembers, visibleMembers]);

  // 4. Data Pie Chart Purna Tugas & Usia Pensiun
  const pensiunPieData = useMemo(() => {
    let kritis = 0; // <6 Bln
    let siaga = 0; // 6-12 Bln
    let waspada = 0; // 12-18 Bln
    let aktifNormal = 0; // >18 Bln / Masa Aktif Normal
    let purnaTugas = 0; // Sudah Purna Tugas

    chartFilteredMembers.forEach((m) => {
      const isKades = 
        m.jabatanRef?.kategori_jabatan === 'Kepala Desa' ||
        m.jabatanRef?.nama_jabatan?.toLowerCase().includes('kepala desa') ||
        m.jabatanRef?.nama_jabatan?.toLowerCase().includes('kades');
      if (isKades) return; // Kepala Desa tidak masuk ke dalam kalkulasi masa pensiun perangkat desa

      if (m.statusPensiun === 'Sudah Purna Tugas') {
        purnaTugas++;
      } else {
        const totalSisaBulan = m.sisaMasaPensiunTahun * 12 + m.sisaMasaPensiunBulan;
        if (totalSisaBulan <= 6) {
          kritis++;
        } else if (totalSisaBulan <= 12) {
          siaga++;
        } else if (totalSisaBulan <= 18) {
          waspada++;
        } else {
          aktifNormal++;
        }
      }
    });

    return [
      { name: 'Kritis (<6 Bln)', value: kritis, color: '#dc2626' },
      { name: 'Siaga (6-12 Bln)', value: siaga, color: '#d97706' },
      { name: 'Waspada (12-18 Bln)', value: waspada, color: '#2563eb' },
      { name: 'Usia Aktif Normal', value: aktifNormal, color: '#059669' },
      { name: 'Sudah Purna Tugas', value: purnaTugas, color: '#6b7280' },
    ].filter((item) => item.value > 0);
  }, [chartFilteredMembers]);

  // Color Palette for Recharts Bars
  const BAR_COLORS = [
    '#064E3B', '#047857', '#059669', '#10B981', '#34D399',
    '#D97706', '#F59E0B', '#FBBF24', '#2563EB', '#3B82F6',
  ];

  // Primary Metrics
  const totalAnggota = visibleMembers.length;
  const ktaAktifCount = visibleMembers.filter((m) => m.keanggotaan?.status_kta === 'Aktif').length;
  const ktaPendingCount = visibleMembers.filter((m) => m.keanggotaan?.status_kta === 'Pending').length;
  const ktaPercentage = totalAnggota > 0 ? Math.round((ktaAktifCount / totalAnggota) * 100) : 0;

  // Registration Metrics
  const scopedPendaftaran = visiblePendaftaran || [];
  const totalRegistrasi = scopedPendaftaran.length;
  const pendingApprovalCount = scopedPendaftaran.filter((p) => p.status_approval === 'Menunggu').length;
  const approvedPendaftaranCount = scopedPendaftaran.filter((p) => p.status_approval === 'Disetujui').length;
  const rejectedPendaftaranCount = scopedPendaftaran.filter((p) => p.status_approval === 'Ditolak').length;

  // Scope label
  const roleScopeLabel = (() => {
    if (currentUser.role === 'Superadmin_Kabupaten' || currentUser.role === 'Admin_Kabupaten') {
      return 'Tingkat Kabupaten (Seluruh 31 Kecamatan)';
    }
    if (currentUser.role === 'Admin_Kecamatan') {
      const kec = kecamatanList.find((k) => k.id_kecamatan.replace(/\./g, '') === (currentUser.id_kecamatan || '').replace(/\./g, ''));
      return `Kecamatan ${kec?.nama_kecamatan || currentUser.id_kecamatan || '-'}`;
    }
    if (currentUser.role === 'Admin_Desa') {
      const desa = desaList.find((d) => String(d.id_desa).replace(/\./g, '') === String(currentUser.id_desa || '').replace(/\./g, ''));
      return `Desa ${desa?.nama_desa || currentUser.id_desa || '-'}`;
    }
    return `Akun Anggota Mandiri (${currentUser.nama})`;
  })();

  // Iuran Summary
  const visibleMemberIds = new Set(visibleMembers.map((m) => m.anggota.id_anggota));
  const totalIuranTerkumpul = iuranList
    .filter((i) => visibleMemberIds.has(i.id_anggota) && i.status_verifikasi === 'Lunas')
    .reduce((sum, item) => sum + item.jumlah, 0);

  const pendingIuranCount = iuranList.filter(
    (i) => visibleMemberIds.has(i.id_anggota) && i.status_verifikasi === 'Pending'
  ).length;

  const purnaTugasCount = visibleMembers.filter((m) => m.statusPensiun === 'Sudah Purna Tugas').length;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Banner & Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 sm:pb-4 border-b border-neutral-200 gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-neutral-900 tracking-tight flex flex-wrap items-center gap-2 leading-snug">
            <span>Dashboard Statistik & Visualisasi Data Wilayah</span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              Recharts Live
            </span>
          </h1>
          <p className="text-xs sm:text-[13px] text-neutral-500 mt-1 leading-relaxed">
            Monitoring data induk perangkat desa, sebaran KTA digital, visualisasi jabatan & masa kerja se-Kabupaten Bandung
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              const el = document.getElementById('sebaran-wilayah-chart');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
            title="Lihat Visualisasi Bar Chart Sebaran 31 Kecamatan"
          >
            <BarChart3 className="w-3.5 h-3.5 text-emerald-700" />
            <span>Grafik Wilayah (31 Kec)</span>
          </button>
          <button
            onClick={() => setActiveTab('pensiun')}
            className="px-3 py-1.5 text-xs font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
          >
            <ClockAlert className="w-3.5 h-3.5 text-amber-700" />
            <span>{retirement18MonthsMembers.length} Purna Tugas (18 Bln)</span>
          </button>
          <button
            onClick={() => setActiveTab('ekta')}
            className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
          >
            <CreditCard className="w-3.5 h-3.5 text-emerald-700" />
            <span>Cetak E-KTA Masal</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* NOTIFIKASI OTOMATIS: PERANGKAT PURNA TUGAS DALAM 18 BULAN      */}
      {/* ------------------------------------------------------------- */}
      {retirement18MonthsMembers.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-400/5 to-transparent border-l-4 border-amber-600 bg-amber-50/70 p-3.5 sm:p-4 rounded-r-xl border border-amber-200 shadow-sm transition-all">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 sm:gap-3">
              <div className="p-2 sm:p-2.5 bg-amber-500 text-white rounded-xl shadow-xs shrink-0 mt-0.5">
                <BellRing className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xs sm:text-sm font-bold text-amber-950 uppercase tracking-wide flex items-center gap-1.5 leading-snug">
                    <span>Notifikasi Otomatis Purna Tugas (18 Bulan Ke Depan)</span>
                  </h2>
                  <span className="px-2.5 py-0.5 bg-amber-200 text-amber-950 rounded-full text-[11px] font-mono font-bold border border-amber-300">
                    {retirement18MonthsMembers.length} Perangkat Desa
                  </span>
                </div>
                <p className="text-xs text-amber-900/90 mt-1 leading-relaxed">
                  Terdapat <strong>{retirement18MonthsMembers.length} perangkat desa</strong> yang akan mencapai batas usia pensiun (60 tahun) dalam waktu 18 bulan ke depan.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-start md:self-auto">
              <button
                onClick={() => setShowRetirementNotif(!showRetirementNotif)}
                className="px-3 py-1.5 bg-white/90 hover:bg-white text-amber-900 text-xs font-semibold rounded-lg border border-amber-300 transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
              >
                <span>{showRetirementNotif ? 'Sembunyikan Daftar' : 'Tampilkan Daftar'}</span>
                {showRetirementNotif ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setActiveTab('pensiun')}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <span>Modul Purna Tugas</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Interactive Filter Pills & Expandable Notification Panel */}
          {showRetirementNotif && (
            <div className="mt-4 pt-3 border-t border-amber-200/80 space-y-3">
              {/* Urgency Filter Tabs */}
              <div className="flex items-center gap-2 text-xs font-medium overflow-x-auto pb-1">
                <span className="text-amber-900/80 text-[11px] font-mono font-bold uppercase shrink-0">Filter Urgensi:</span>
                <button
                  onClick={() => setRetirmentUrgencyFilter('all')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer text-xs font-semibold shrink-0 ${
                    retirmentUrgencyFilter === 'all'
                      ? 'bg-amber-900 text-white shadow-2xs'
                      : 'bg-white/80 text-amber-900 hover:bg-white border border-amber-200'
                  }`}
                >
                  Semua ({retirement18MonthsMembers.length})
                </button>
                <button
                  onClick={() => setRetirmentUrgencyFilter('kritis')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer text-xs font-semibold shrink-0 flex items-center gap-1 ${
                    retirmentUrgencyFilter === 'kritis'
                      ? 'bg-red-700 text-white shadow-2xs'
                      : 'bg-red-50 text-red-800 hover:bg-red-100 border border-red-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                  <span>Kritis &lt;6 Bln ({retirementBreakdown.kritis.length})</span>
                </button>
                <button
                  onClick={() => setRetirmentUrgencyFilter('siaga')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer text-xs font-semibold shrink-0 flex items-center gap-1 ${
                    retirmentUrgencyFilter === 'siaga'
                      ? 'bg-amber-700 text-white shadow-2xs'
                      : 'bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300'
                  }`}
                >
                  <span>Siaga 6-12 Bln ({retirementBreakdown.siaga.length})</span>
                </button>
                <button
                  onClick={() => setRetirmentUrgencyFilter('waspada')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer text-xs font-semibold shrink-0 flex items-center gap-1 ${
                    retirmentUrgencyFilter === 'waspada'
                      ? 'bg-blue-700 text-white shadow-2xs'
                      : 'bg-blue-50 text-blue-900 hover:bg-blue-100 border border-blue-200'
                  }`}
                >
                  <span>Waspada 12-18 Bln ({retirementBreakdown.waspada.length})</span>
                </button>
              </div>

              {/* Grid of Retiring Devices */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                {filteredRetirementNotifList.map((m) => {
                  const sisaTotalBulan = m.sisaMasaPensiunTahun * 12 + m.sisaMasaPensiunBulan;
                  const isKritis = sisaTotalBulan <= 6;
                  const isSiaga = sisaTotalBulan > 6 && sisaTotalBulan <= 12;

                  return (
                    <div
                      key={m.anggota.id_anggota}
                      className={`p-3 rounded-xl border transition-all hover:shadow-md flex flex-col justify-between ${
                        isKritis
                          ? 'bg-red-50/90 border-red-300 text-red-950'
                          : isSiaga
                          ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                          : 'bg-white border-neutral-200 text-neutral-900'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-bold text-xs sm:text-[13px] truncate">{m.anggota.nama_lengkap}</span>
                          <span
                            className={`px-2 py-0.5 rounded-xs font-mono text-[11px] font-bold shrink-0 ${
                              isKritis
                                ? 'bg-red-200 text-red-900 border border-red-300'
                                : isSiaga
                                ? 'bg-amber-200 text-amber-900 border border-amber-300'
                                : 'bg-blue-100 text-blue-900 border border-blue-200'
                            }`}
                          >
                            {sisaTotalBulan} Bln Lagi
                          </span>
                        </div>
                        <div className="text-xs text-neutral-600 mt-1 flex items-center gap-1.5 font-medium">
                          <Briefcase className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                          <span className="truncate">{m.jabatanRef?.nama_jabatan || 'Perangkat Desa'}</span>
                        </div>
                        <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                          <span className="truncate">
                            {m.desa?.nama_desa || '-'}, Kec. {m.kecamatan?.nama_kecamatan || '-'}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-neutral-200/60 flex items-center justify-between text-[11px] text-neutral-600 font-mono">
                        <span>Purna: {formatDateIndo(m.anggota.tanggal_lahir ? new Date(new Date(m.anggota.tanggal_lahir).setFullYear(new Date(m.anggota.tanggal_lahir).getFullYear() + 60)).toISOString() : undefined)}</span>
                        {m.anggota.no_hp_wa && (
                          <a
                            href={`https://wa.me/${m.anggota.no_hp_wa.replace(/\D/g, '')}?text=${encodeURIComponent(`Halo ${m.anggota.nama_lengkap}, pemberitahuan resmi PPDI Kab. Bandung mengenai persiapan berkas purna tugas (${sisaTotalBulan} bulan ke depan).`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-700 font-bold hover:underline flex items-center gap-1 font-sans"
                            title="Kirim Pesan WhatsApp Pengingat"
                          >
                            <Phone className="w-3 h-3 text-emerald-600" />
                            <span>WA</span>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4 Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Metric 1 */}
        <div className="bg-white p-3.5 sm:p-4 lg:p-5 rounded-xl border border-neutral-200 shadow-2xs">
          <div className="flex items-center justify-between text-neutral-600 text-xs sm:text-[13px] font-semibold mb-1.5 sm:mb-2">
            <span>Total Perangkat Terdata</span>
            <Users className="w-4 h-4 text-emerald-700 shrink-0" />
          </div>
          <div className="text-2xl sm:text-[26px] font-extrabold text-neutral-900 tabular-nums tracking-tight leading-tight">
            {totalAnggota} <span className="text-xs sm:text-sm font-medium text-neutral-500">Anggota</span>
          </div>
          <div className="text-xs text-neutral-500 mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-snug">
            <span>{visibleMembers.filter((m) => m.jabatanTerkini?.status_aktif === 'Aktif').length} Berstatus Aktif</span>
            <span>·</span>
            <span>{purnaTugasCount} Purna</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white p-3.5 sm:p-4 lg:p-5 rounded-xl border border-neutral-200 shadow-2xs">
          <div className="flex items-center justify-between text-neutral-600 text-xs sm:text-[13px] font-semibold mb-1.5 sm:mb-2">
            <span>E-KTA Diterbitkan</span>
            <CreditCard className="w-4 h-4 text-emerald-700 shrink-0" />
          </div>
          <div className="text-2xl sm:text-[26px] font-extrabold text-neutral-900 tabular-nums tracking-tight leading-tight">
            {ktaAktifCount} <span className="text-xs sm:text-sm font-medium text-neutral-500">({ktaPercentage}%)</span>
          </div>
          <div className="text-xs text-neutral-500 mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-snug">
            <span>{ktaPendingCount} Menunggu Validasi</span>
            <span>·</span>
            <span>QR Code Siap</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white p-3.5 sm:p-4 lg:p-5 rounded-xl border border-neutral-200 shadow-2xs">
          <div className="flex items-center justify-between text-neutral-600 text-xs sm:text-[13px] font-semibold mb-1.5 sm:mb-2">
            <span>Kas Iuran Terkumpul</span>
            <Wallet className="w-4 h-4 text-emerald-700 shrink-0" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-neutral-900 tabular-nums tracking-tight leading-tight break-words">
            {formatRupiah(totalIuranTerkumpul)}
          </div>
          <div className="text-xs text-neutral-500 mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-snug">
            <span>{pendingIuranCount} Verifikasi Pending</span>
            <span>·</span>
            <span>Rp 35.000 / bln</span>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white p-3.5 sm:p-4 lg:p-5 rounded-xl border border-neutral-200 shadow-2xs">
          <div className="flex items-center justify-between text-neutral-600 text-xs sm:text-[13px] font-semibold mb-1.5 sm:mb-2">
            <span>Purna Tugas (&lt; 18 Bln)</span>
            <ClockAlert className="w-4 h-4 text-amber-700 shrink-0" />
          </div>
          <div className="text-2xl sm:text-[26px] font-extrabold text-neutral-900 tabular-nums tracking-tight leading-tight">
            {retirement18MonthsMembers.length} <span className="text-xs sm:text-sm font-medium text-amber-700">Perangkat</span>
          </div>
          <div className="text-xs text-neutral-500 mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-snug">
            <span>{retirementBreakdown.kritis.length} Kritis &lt;6 Bln</span>
            <span>·</span>
            <span>Batas Usia 60 Th</span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SEKSI VISUALISASI DATA DENGAN RECHARTS                        */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white border border-neutral-200 rounded-2xl p-3.5 sm:p-5 shadow-xs space-y-4 sm:space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4 pb-3.5 sm:pb-4 border-b border-neutral-200">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-800 shrink-0" />
              <h2 className="text-sm sm:text-base font-bold text-neutral-900 tracking-tight">
                Visualisasi Data Interaktif (Recharts)
              </h2>
            </div>
            <p className="text-xs sm:text-[13px] text-neutral-500 mt-0.5 leading-relaxed">
              Grafik distribusi jumlah anggota berdasarkan Jabatan, Masa Kerja, dan Sebaran Teritorial Per Desa / Kecamatan
            </p>
          </div>

          {/* Filter Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 bg-neutral-50 p-2.5 sm:p-2 rounded-xl border border-neutral-200">
            <div className="flex items-center gap-1.5 text-xs text-neutral-600 font-semibold px-0.5 sm:px-1">
              <Filter className="w-3.5 h-3.5 text-emerald-700" />
              <span>Filter Wilayah:</span>
            </div>

            {/* Kecamatan Filter Dropdown */}
            <select
              value={selectedKecamatanId}
              onChange={(e) => {
                setSelectedKecamatanId(e.target.value);
                setSelectedDesaId('');
              }}
              className="w-full sm:w-auto text-xs bg-white border border-neutral-300 rounded-lg px-2.5 py-2 sm:py-1.5 text-neutral-800 font-medium focus:ring-2 focus:ring-[#064E3B] outline-none"
            >
              <option value="">Semua Kecamatan ({kecamatanList.length})</option>
              {kecamatanList.map((k) => (
                <option key={k.id_kecamatan} value={k.id_kecamatan}>
                  Kec. {k.nama_kecamatan}
                </option>
              ))}
            </select>

            {/* Desa Filter Dropdown */}
            <select
              value={selectedDesaId}
              onChange={(e) => setSelectedDesaId(e.target.value)}
              disabled={!selectedKecamatanId}
              className="w-full sm:w-auto text-xs bg-white border border-neutral-300 rounded-lg px-2.5 py-2 sm:py-1.5 text-neutral-800 font-medium focus:ring-2 focus:ring-[#064E3B] outline-none disabled:opacity-50"
            >
              <option value="">
                {selectedKecamatanId ? `Semua Desa in Kec (${filteredDesaList.length})` : 'Pilih Kec Dulu'}
              </option>
              {filteredDesaList.map((d) => (
                <option key={d.id_desa} value={d.id_desa}>
                  {d.nama_desa}
                </option>
              ))}
            </select>

            {(selectedKecamatanId || selectedDesaId) && (
              <button
                onClick={handleResetFilter}
                className="text-xs px-3 py-1.5 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 rounded-lg font-medium transition-colors cursor-pointer self-start sm:self-auto"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Chart View Selector Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-200 pb-2.5">
          <div className="w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            <div className="inline-flex items-center gap-1 bg-neutral-100 p-1 rounded-lg text-xs font-semibold min-w-max">
              <button
                onClick={() => setActiveChartTab('jabatan')}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeChartTab === 'jabatan'
                    ? 'bg-white text-emerald-950 font-bold shadow-2xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <Briefcase className="w-3.5 h-3.5" />
                <span>Berdasarkan Jabatan</span>
              </button>
              <button
                onClick={() => setActiveChartTab('masakerja')}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeChartTab === 'masakerja'
                    ? 'bg-white text-emerald-950 font-bold shadow-2xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <Award className="w-3.5 h-3.5" />
                <span>Berdasarkan Masa Kerja</span>
              </button>
              <button
                onClick={() => setActiveChartTab('pensiun')}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeChartTab === 'pensiun'
                    ? 'bg-white text-emerald-950 font-bold shadow-2xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <PieChartIcon className="w-3.5 h-3.5 text-amber-600" />
                <span>Pie Chart Masa Purna Tugas</span>
              </button>
              <button
                onClick={() => setActiveChartTab('wilayah')}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeChartTab === 'wilayah'
                    ? 'bg-white text-emerald-950 font-bold shadow-2xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>{selectedKecamatanId ? 'Per Desa' : 'Per Kecamatan'}</span>
              </button>
            </div>
          </div>

          <span className="text-xs text-neutral-500 font-mono shrink-0">
            Sampel Data: <strong className="text-neutral-800">{chartFilteredMembers.length} Perangkat</strong>
          </span>
        </div>

        {/* CHART TAB 1: BERDASARKAN JABATAN */}
        {activeChartTab === 'jabatan' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs text-neutral-600">
              <span>Distribusi Jabatan Perangkat Desa di Wilayah Terpilih (Top 10 Jabatan)</span>
              <span className="font-mono text-[11px] text-emerald-800 font-semibold shrink-0">
                {jabatanChartData.length} Jenis Formasi
              </span>
            </div>

            {jabatanChartData.length > 0 ? (
              <div className="h-64 sm:h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={jabatanChartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis
                      dataKey="nama"
                      tick={{ fontSize: 10, fill: '#4B5563' }}
                      angle={-25}
                      textAnchor="end"
                      interval={0}
                      height={50}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#4B5563' }} allowDecimals={false} />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Bar dataKey="jumlah" name="Jumlah Anggota" radius={[6, 6, 0, 0]}>
                      {jabatanChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-neutral-400 bg-neutral-50 rounded-xl border border-dashed border-neutral-300">
                Tidak ada data perangkat desa pada filter wilayah yang dipilih.
              </div>
            )}
          </div>
        )}

        {/* CHART TAB 2: BERDASARKAN MASA KERJA */}
        {activeChartTab === 'masakerja' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs text-neutral-600">
              <span>Distribusi Anggota Berdasarkan Kelompok Masa Kerja (TMT Terhitung Mulai Tanggal)</span>
              <span className="font-mono text-[11px] text-emerald-800 font-semibold shrink-0">
                6 Rentang Pengalaman
              </span>
            </div>

            {chartFilteredMembers.length > 0 ? (
              <div className="h-64 sm:h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={masaKerjaChartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis dataKey="kategori" tick={{ fontSize: 11, fill: '#4B5563' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#4B5563' }} allowDecimals={false} />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Bar dataKey="jumlah" name="Jumlah Anggota" fill="#064E3B" radius={[6, 6, 0, 0]}>
                      {masaKerjaChartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            index === 0
                              ? '#34D399'
                              : index === 1
                              ? '#10B981'
                              : index === 2
                              ? '#059669'
                              : index === 3
                              ? '#047857'
                              : index === 4
                              ? '#064E3B'
                              : '#F59E0B'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-neutral-400 bg-neutral-50 rounded-xl border border-dashed border-neutral-300">
                Tidak ada data masa kerja pada filter wilayah yang dipilih.
              </div>
            )}
          </div>
        )}

        {/* CHART TAB 3: SEBARAN WILAYAH (DESA / KECAMATAN) */}
        {activeChartTab === 'wilayah' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs text-neutral-600">
              <span>
                {selectedKecamatanId
                  ? 'Jumlah Anggota & Rata-rata Masa Kerja Per Desa'
                  : 'Jumlah Anggota & Rata-rata Masa Kerja Per Kecamatan (Top 12)'}
              </span>
              <span className="font-mono text-[11px] text-emerald-800 font-semibold shrink-0">
                {wilayahChartData.length} Lokasi Terdata
              </span>
            </div>

            {wilayahChartData.length > 0 ? (
              <div className="h-64 sm:h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={wilayahChartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis
                      dataKey="nama"
                      tick={{ fontSize: 10, fill: '#4B5563' }}
                      angle={-25}
                      textAnchor="end"
                      interval={0}
                      height={50}
                    />
                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#4B5563' }} allowDecimals={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#D97706' }} />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <Bar yAxisId="left" dataKey="jumlah" name="Jumlah Anggota" fill="#064E3B" radius={[6, 6, 0, 0]} />
                    <Bar yAxisId="right" dataKey="avgMasaKerja" name="Rata-rata Masa Kerja (Thn)" fill="#F59E0B" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-neutral-400 bg-neutral-50 rounded-xl border border-dashed border-neutral-300">
                Tidak ada data wilayah pada filter terpilih.
              </div>
            )}
          </div>
        )}

        {/* CHART TAB 4: PIE CHART MASA PURNA TUGAS */}
        {activeChartTab === 'pensiun' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs text-neutral-600">
              <span>Visualisasi Distribusi Anggota Berdasarkan Periode Masa Tugas & Persiapan Purna Tugas (Usia 60 Thn)</span>
              <span className="font-mono text-[11px] text-amber-800 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200 shrink-0">
                {pensiunPieData.length} Kategori Status Usia
              </span>
            </div>

            {pensiunPieData.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 items-center pt-2">
                <div className="h-64 sm:h-72 md:col-span-2 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip content={<CustomChartTooltip />} />
                      <Pie
                        data={pensiunPieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={78}
                        paddingAngle={4}
                        label={({ value, percent }) => `${value} (${((percent || 0) * 100).toFixed(0)}%)`}
                      >
                        {pensiunPieData.map((entry, index) => (
                          <Cell key={`pie-cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-2 bg-neutral-50 p-3 sm:p-4 rounded-xl border border-neutral-200 text-xs">
                  <h4 className="font-bold text-neutral-800 text-xs uppercase tracking-wider pb-2 border-b border-neutral-200 flex items-center justify-between">
                    <span>Ringkasan Masa Purna Tugas</span>
                    <PieChartIcon className="w-3.5 h-3.5 text-amber-600" />
                  </h4>
                  {pensiunPieData.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 sm:p-2 rounded-lg bg-white border border-neutral-200/80 shadow-2xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="font-semibold text-neutral-800 text-xs truncate">{item.name}</span>
                      </div>
                      <span className="font-mono font-bold text-neutral-900 bg-neutral-100 px-2 py-0.5 rounded text-xs shrink-0">
                        {item.value} Orang
                      </span>
                    </div>
                  ))}
                  <div className="pt-2 text-[11px] text-neutral-500 font-mono italic text-center">
                    Berdasarkan Batas Usia Pensiun 60 Tahun (UU Desa)
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-neutral-400 bg-neutral-50 rounded-xl border border-dashed border-neutral-300">
                Tidak ada data pensiun pada filter wilayah yang dipilih.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Registrasi & Approval Scoped KPI Section */}
      <div className="bg-white border border-neutral-200 rounded-xl p-3.5 sm:p-4 shadow-2xs space-y-3 sm:space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-neutral-100 gap-2.5">
          <div className="flex items-start sm:items-center gap-2.5">
            <ClipboardCheck className="w-5 h-5 text-emerald-800 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h2 className="text-sm sm:text-base font-bold text-neutral-900 tracking-tight">
                  Status Registrasi & Approval Perangkat Desa
                </h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-neutral-100 text-neutral-700 border border-neutral-200">
                  {roleScopeLabel}
                </span>
              </div>
              <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                Rekapitulasi berkas formulir induk pendaftaran mandiri perangkat desa sesuai kewenangan wilayah role pengguna
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('pendaftaran')}
            className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
          >
            <span>Buka Registrasi & Approval</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
          {/* Card 1: Total Registrasi */}
          <div className="bg-neutral-50/70 p-3 sm:p-3.5 rounded-xl border border-neutral-200 flex flex-col justify-between gap-1.5">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-xs text-neutral-600 font-semibold leading-tight">Total Registrasi</span>
              <FileText className="w-4 h-4 text-neutral-400 shrink-0" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-extrabold text-neutral-900 font-mono leading-tight">{totalRegistrasi}</div>
              <div className="text-[11px] sm:text-xs text-neutral-500 mt-0.5 leading-snug">Formulir di wilayah tugas</div>
            </div>
          </div>

          {/* Card 2: Menunggu Approval */}
          <div className="bg-amber-50/70 p-3 sm:p-3.5 rounded-xl border border-amber-200 flex flex-col justify-between gap-1.5">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-xs text-amber-800 font-bold flex items-center gap-1.5 leading-tight">
                <span>Menunggu</span>
                {pendingApprovalCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0" />
                )}
              </span>
              <ClockAlert className="w-4 h-4 text-amber-600 shrink-0" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-extrabold text-amber-900 font-mono leading-tight">
                {pendingApprovalCount}
              </div>
              <div className="text-[11px] sm:text-xs text-amber-700 font-medium mt-0.5 leading-snug">Perlu diverifikasi</div>
            </div>
          </div>

          {/* Card 3: Telah Disetujui */}
          <div className="bg-emerald-50/70 p-3 sm:p-3.5 rounded-xl border border-emerald-200 flex flex-col justify-between gap-1.5">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-xs text-emerald-800 font-bold leading-tight">Disetujui</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-extrabold text-emerald-900 font-mono leading-tight">
                {approvedPendaftaranCount}
              </div>
              <div className="text-[11px] sm:text-xs text-emerald-700 font-medium mt-0.5 leading-snug">Tercatat di Data Induk</div>
            </div>
          </div>

          {/* Card 4: Ditolak */}
          <div className="bg-red-50/70 p-3 sm:p-3.5 rounded-xl border border-red-200 flex flex-col justify-between gap-1.5">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-xs text-red-800 font-semibold leading-tight">Ditolak</span>
              <XCircle className="w-4 h-4 text-red-600 shrink-0" />
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-extrabold text-red-900 font-mono leading-tight">
                {rejectedPendaftaranCount}
              </div>
              <div className="text-[11px] sm:text-xs text-red-700 mt-0.5 leading-snug">Perlu perbaikan berkas</div>
            </div>
          </div>
        </div>
      </div>

      {/* Visualisasi Statistik Sebaran Wilayah Kecamatan se-Kabupaten Bandung (Recharts) */}
      <div id="sebaran-wilayah-chart">
        <StatistikWilayahView showCardWrapper={true} />
      </div>
    </div>
  );
};
