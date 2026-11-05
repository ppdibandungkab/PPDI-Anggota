import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { usePPDI } from '../context/PPDIContext';
import { AnggotaFullDetail, RefKecamatan } from '../types/ppdi';
import {
  MapPin,
  Users,
  Award,
  CreditCard,
  Building2,
  TrendingUp,
  Search,
  ArrowUpDown,
  BarChart3,
  ListFilter,
  CheckCircle2,
  Clock,
  ChevronRight,
  Maximize2,
  Table as TableIcon,
  Layers,
  Info,
} from 'lucide-react';

export interface StatistikWilayahViewProps {
  onSelectKecamatan?: (kecamatanId: string) => void;
  showCardWrapper?: boolean;
  className?: string;
}

interface KecamatanStatItem {
  id_kecamatan: string;
  nama_kecamatan: string;
  displayName: string;
  totalAnggota: number;
  ktaAktif: number;
  ktaPending: number;
  lakiLaki: number;
  perempuan: number;
  totalDesa: number;
  desaWithMembers: number;
  persentaseTotal: number;
  desaBreakdown: {
    id_desa: string;
    nama_desa: string;
    count: number;
    ktaAktif: number;
  }[];
}

// Custom Tooltip for Kecamatan Bar Chart
const WilayahChartTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data: KecamatanStatItem = payload[0].payload;
    return (
      <div className="bg-neutral-900/95 text-white p-3.5 rounded-xl shadow-2xl border border-neutral-700/80 text-xs backdrop-blur-md max-w-xs z-50">
        <div className="flex items-center justify-between border-b border-neutral-700/80 pb-2 mb-2 gap-3">
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-bold text-amber-300 truncate text-sm">
              Kec. {data.nama_kecamatan}
            </span>
          </div>
          <span className="font-mono text-[10px] text-neutral-400 shrink-0">
            {data.id_kecamatan}
          </span>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-neutral-300">Total Perangkat Desa:</span>
            <span className="font-mono font-bold text-white text-sm">
              {data.totalAnggota} orang
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-neutral-400">
            <span>Kontribusi Kabupaten:</span>
            <span className="font-mono font-semibold text-emerald-400">
              {data.persentaseTotal}%
            </span>
          </div>

          <div className="pt-2 border-t border-neutral-800 grid grid-cols-2 gap-2 text-[10px]">
            <div className="bg-neutral-800/80 p-1.5 rounded-lg border border-neutral-700/60">
              <span className="text-neutral-400 block text-[9px]">Status KTA:</span>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-emerald-400 font-mono">Aktif: {data.ktaAktif}</span>
                <span className="text-amber-400 font-mono">Pnd: {data.ktaPending}</span>
              </div>
            </div>
            <div className="bg-neutral-800/80 p-1.5 rounded-lg border border-neutral-700/60">
              <span className="text-neutral-400 block text-[9px]">Gender:</span>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-sky-400 font-mono">L: {data.lakiLaki}</span>
                <span className="text-rose-400 font-mono">P: {data.perempuan}</span>
              </div>
            </div>
          </div>

          <div className="pt-1 text-[10px] text-neutral-400 flex items-center justify-between">
            <span>Cakupan Desa Terdata:</span>
            <span className="font-mono text-neutral-200">
              {data.desaWithMembers} dari {data.totalDesa} Desa
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export const StatistikWilayahView: React.FC<StatistikWilayahViewProps> = ({
  onSelectKecamatan,
  showCardWrapper = true,
  className = '',
}) => {
  const {
    kecamatanList,
    desaList,
    fullMembers,
    visibleMembers,
    currentUser,
    setSelectedKecamatanFilter,
    setActiveTab,
  } = usePPDI();

  // Control state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'terbanyak' | 'tersedikit' | 'nama' | 'desa'>('terbanyak');
  const [displayLimit, setDisplayLimit] = useState<'all' | 'top10' | 'top15' | 'nonzero'>('all');
  const [chartOrientation, setChartOrientation] = useState<'vertical' | 'horizontal'>('vertical'); // 'vertical' = horizontal bars (best for 31 labels)
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const [selectedKecId, setSelectedKecId] = useState<string | null>(null);

  // Normalize ID helper (strips dots and whitespace)
  const cleanId = (id?: string | null) => (id ? String(id).replace(/\./g, '').trim() : '');

  // Aggregate member counts per Kecamatan
  const { kecamatanStats, totalAnggotaKabupaten, maxAnggotaCount, avgAnggotaPerKecamatan } = useMemo(() => {
    const list = kecamatanList || [];
    const members = visibleMembers || fullMembers || [];
    const totalCount = members.length;

    // Pre-group villages by clean kecamatan ID
    const desaByKec: Record<string, { id_desa: string; nama_desa: string }[]> = {};
    (desaList || []).forEach((d) => {
      const kId = cleanId(d.id_kecamatan);
      if (!desaByKec[kId]) desaByKec[kId] = [];
      desaByKec[kId].push({ id_desa: d.id_desa, nama_desa: d.nama_desa });
    });

    // Map each kecamatan to statistical data
    const stats: KecamatanStatItem[] = list.map((k) => {
      const kClean = cleanId(k.id_kecamatan);
      const kNameNorm = k.nama_kecamatan.toLowerCase().trim();

      // Find members belonging to this kecamatan
      const matchingMembers = members.filter((m: AnggotaFullDetail) => {
        const mKecClean = cleanId(m.kecamatan?.id_kecamatan || m.desa?.id_kecamatan);
        if (mKecClean && mKecClean === kClean) return true;
        const mKecName = m.kecamatan?.nama_kecamatan?.toLowerCase().trim();
        return mKecName && mKecName === kNameNorm;
      });

      const total = matchingMembers.length;
      const ktaAktif = matchingMembers.filter((m) => m.keanggotaan?.status_kta === 'Aktif').length;
      const ktaPending = matchingMembers.filter((m) => m.keanggotaan?.status_kta === 'Pending').length;
      const lakiLaki = matchingMembers.filter((m) => m.anggota.jenis_kelamin === 'L').length;
      const perempuan = matchingMembers.filter((m) => m.anggota.jenis_kelamin === 'P').length;

      // Group by desa within this kecamatan
      const desaListInKec = desaByKec[kClean] || [];
      const desaCounts: Record<string, { nama_desa: string; count: number; ktaAktif: number }> = {};
      desaListInKec.forEach((d) => {
        desaCounts[cleanId(d.id_desa)] = { nama_desa: d.nama_desa, count: 0, ktaAktif: 0 };
      });

      matchingMembers.forEach((m) => {
        const dId = cleanId(m.desa?.id_desa || m.jabatanTerkini?.id_desa);
        if (dId && desaCounts[dId]) {
          desaCounts[dId].count += 1;
          if (m.keanggotaan?.status_kta === 'Aktif') {
            desaCounts[dId].ktaAktif += 1;
          }
        } else if (m.desa?.nama_desa) {
          const fallbackKey = m.desa.nama_desa;
          if (!desaCounts[fallbackKey]) {
            desaCounts[fallbackKey] = { nama_desa: m.desa.nama_desa, count: 0, ktaAktif: 0 };
          }
          desaCounts[fallbackKey].count += 1;
          if (m.keanggotaan?.status_kta === 'Aktif') {
            desaCounts[fallbackKey].ktaAktif += 1;
          }
        }
      });

      const desaBreakdown = Object.entries(desaCounts)
        .map(([id, val]) => ({
          id_desa: id,
          nama_desa: val.nama_desa,
          count: val.count,
          ktaAktif: val.ktaAktif,
        }))
        .sort((a, b) => b.count - a.count);

      const desaWithMembers = desaBreakdown.filter((d) => d.count > 0).length;
      const persentaseTotal = totalCount > 0 ? Number(((total / totalCount) * 100).toFixed(1)) : 0;

      return {
        id_kecamatan: k.id_kecamatan,
        nama_kecamatan: k.nama_kecamatan,
        displayName: k.nama_kecamatan.startsWith('Kec.') ? k.nama_kecamatan : `Kec. ${k.nama_kecamatan}`,
        totalAnggota: total,
        ktaAktif,
        ktaPending,
        lakiLaki,
        perempuan,
        totalDesa: desaListInKec.length,
        desaWithMembers,
        persentaseTotal,
        desaBreakdown,
      };
    });

    const maxCount = Math.max(...stats.map((s) => s.totalAnggota), 1);
    const avg = stats.length > 0 ? Number((totalCount / stats.length).toFixed(1)) : 0;

    return {
      kecamatanStats: stats,
      totalAnggotaKabupaten: totalCount,
      maxAnggotaCount: maxCount,
      avgAnggotaPerKecamatan: avg,
    };
  }, [kecamatanList, desaList, visibleMembers, fullMembers]);

  // Filter and Sort the dataset
  const filteredAndSortedData = useMemo(() => {
    let result = [...kecamatanStats];

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (item) =>
          item.nama_kecamatan.toLowerCase().includes(q) ||
          item.id_kecamatan.toLowerCase().includes(q)
      );
    }

    // Limit filter
    if (displayLimit === 'nonzero') {
      result = result.filter((item) => item.totalAnggota > 0);
    }

    // Sorting
    if (sortBy === 'terbanyak') {
      result.sort((a, b) => b.totalAnggota - a.totalAnggota);
    } else if (sortBy === 'tersedikit') {
      result.sort((a, b) => a.totalAnggota - b.totalAnggota);
    } else if (sortBy === 'nama') {
      result.sort((a, b) => a.nama_kecamatan.localeCompare(b.nama_kecamatan));
    } else if (sortBy === 'desa') {
      result.sort((a, b) => b.desaWithMembers - a.desaWithMembers);
    }

    // Slice limit if requested
    if (displayLimit === 'top10') {
      return result.slice(0, 10);
    }
    if (displayLimit === 'top15') {
      return result.slice(0, 15);
    }

    return result;
  }, [kecamatanStats, searchQuery, sortBy, displayLimit]);

  // Selected Kecamatan Detail info
  const activeSelectedKec = useMemo(() => {
    if (!selectedKecId) return null;
    return kecamatanStats.find((k) => cleanId(k.id_kecamatan) === cleanId(selectedKecId)) || null;
  }, [selectedKecId, kecamatanStats]);

  // Dynamic Chart Height based on number of items in horizontal bar mode
  const dynamicChartHeight = useMemo(() => {
    if (chartOrientation === 'horizontal') {
      return 360; // vertical column chart fixed height
    }
    // In vertical mode (horizontal bars), allocate ~26px per bar
    return Math.max(380, filteredAndSortedData.length * 28 + 60);
  }, [chartOrientation, filteredAndSortedData.length]);

  // Color generator for bars: Highlights higher density
  const getBarColor = (value: number, max: number, isSelected: boolean) => {
    if (isSelected) return '#F59E0B'; // Amber highlight for active selection
    if (value === 0) return '#E5E7EB'; // Muted gray for zero
    const ratio = value / Math.max(max, 1);
    if (ratio > 0.75) return '#064E3B'; // Deepest emerald
    if (ratio > 0.5) return '#047857';
    if (ratio > 0.25) return '#059669';
    return '#10B981'; // Lighter emerald
  };

  const handleBarClick = (data: any) => {
    if (data && data.id_kecamatan) {
      const nextId = selectedKecId === data.id_kecamatan ? null : data.id_kecamatan;
      setSelectedKecId(nextId);
      if (onSelectKecamatan && nextId) {
        onSelectKecamatan(nextId);
      }
    }
  };

  const content = (
    <div className="space-y-5">
      {/* 1. Header & Title Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-900 text-amber-300 rounded-xl shadow-xs">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-900 tracking-tight">
                Statistik Sebaran Anggota Antar Kecamatan (Recharts)
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Visualisasi komparatif jumlah perangkat desa terdata pada 31 kecamatan di wilayah Kabupaten Bandung
              </p>
            </div>
          </div>
        </div>

        {/* View mode toggle (Chart vs Table) */}
        <div className="flex items-center gap-1.5 self-start lg:self-auto bg-neutral-100 p-1 rounded-lg text-xs font-semibold">
          <button
            onClick={() => setViewMode('chart')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'chart'
                ? 'bg-white text-emerald-950 font-bold shadow-2xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Grafik Batang</span>
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'table'
                ? 'bg-white text-emerald-950 font-bold shadow-2xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>Tabel Wilayah</span>
          </button>
        </div>
      </div>

      {/* 2. Top KPI Metric Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200">
          <div className="flex items-center justify-between text-neutral-500 text-xs mb-1">
            <span>Total Kecamatan</span>
            <Building2 className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-lg font-bold font-mono text-neutral-900 tabular-nums">
            {kecamatanStats.length} <span className="text-xs font-sans font-normal text-neutral-500">Kec.</span>
          </div>
          <div className="text-[11px] text-emerald-800 mt-0.5">
            {kecamatanStats.filter((k) => k.totalAnggota > 0).length} Aktif Terdata
          </div>
        </div>

        <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200">
          <div className="flex items-center justify-between text-neutral-500 text-xs mb-1">
            <span>Total Perangkat Desa</span>
            <Users className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-lg font-bold font-mono text-emerald-900 tabular-nums">
            {totalAnggotaKabupaten} <span className="text-xs font-sans font-normal text-neutral-500">Orang</span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-0.5">
            Rata-rata {avgAnggotaPerKecamatan} / kec.
          </div>
        </div>

        <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200">
          <div className="flex items-center justify-between text-neutral-500 text-xs mb-1">
            <span>Kecamatan Terbanyak</span>
            <Award className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-sm font-bold text-neutral-900 truncate">
            {kecamatanStats[0]?.nama_kecamatan || '-'}
          </div>
          <div className="text-[11px] font-mono text-amber-700 font-semibold mt-0.5">
            {kecamatanStats[0]?.totalAnggota || 0} Perangkat Desa
          </div>
        </div>

        <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200">
          <div className="flex items-center justify-between text-neutral-500 text-xs mb-1">
            <span>Kecamatan Pending</span>
            <Clock className="w-4 h-4 text-neutral-400" />
          </div>
          <div className="text-lg font-bold font-mono text-neutral-800 tabular-nums">
            {kecamatanStats.filter((k) => k.totalAnggota === 0).length}{' '}
            <span className="text-xs font-sans font-normal text-neutral-500">Kec.</span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-0.5">Belum input data</div>
        </div>
      </div>

      {/* 3. Interactive Toolbar: Search, Sort, Limit, & Orientation */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-50 p-3 rounded-xl border border-neutral-200 text-xs">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Cari nama kecamatan (misal: Soreang, Ciwidey)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-neutral-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-neutral-800 placeholder-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-700"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-xs cursor-pointer"
            >
              ×
            </button>
          )}
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Sorting Dropdown */}
          <div className="flex items-center gap-1.5 bg-white border border-neutral-300 rounded-lg px-2 py-1">
            <ArrowUpDown className="w-3.5 h-3.5 text-neutral-500" />
            <select
              aria-label="Urutkan data kecamatan"
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="bg-transparent border-none text-xs font-medium text-neutral-800 focus:outline-hidden cursor-pointer"
            >
              <option value="terbanyak">Urutkan: Anggota Terbanyak</option>
              <option value="tersedikit">Urutkan: Anggota Tersedikit</option>
              <option value="nama">Urutkan: Nama Kecamatan (A-Z)</option>
              <option value="desa">Urutkan: Cakupan Desa Terbanyak</option>
            </select>
          </div>

          {/* Limit Filter Dropdown */}
          <div className="flex items-center gap-1.5 bg-white border border-neutral-300 rounded-lg px-2 py-1">
            <ListFilter className="w-3.5 h-3.5 text-neutral-500" />
            <select
              aria-label="Filter jumlah kecamatan yang ditampilkan"
              value={displayLimit}
              onChange={(e: any) => setDisplayLimit(e.target.value)}
              className="bg-transparent border-none text-xs font-medium text-neutral-800 focus:outline-hidden cursor-pointer"
            >
              <option value="all">Tampilkan: Semua (31 Kecamatan)</option>
              <option value="top10">Tampilkan: Top 10 Kecamatan</option>
              <option value="top15">Tampilkan: Top 15 Kecamatan</option>
              <option value="nonzero">Tampilkan: Hanya yang Ada Data (&gt;0)</option>
            </select>
          </div>

          {/* Orientation Toggle (only in chart mode) */}
          {viewMode === 'chart' && (
            <div className="flex items-center bg-white border border-neutral-300 rounded-lg p-0.5">
              <button
                onClick={() => setChartOrientation('vertical')}
                title="Bagan Bar Horizontal (Rekomendasi untuk membaca nama 31 kecamatan)"
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                  chartOrientation === 'vertical'
                    ? 'bg-emerald-800 text-white shadow-2xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Horizontal Bar
              </button>
              <button
                onClick={() => setChartOrientation('horizontal')}
                title="Bagan Kolom Vertikal"
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                  chartOrientation === 'horizontal'
                    ? 'bg-emerald-800 text-white shadow-2xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Kolom Tegak
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4. Active Selection Banner / Hint */}
      <div className="flex items-center justify-between text-xs text-neutral-500 px-1">
        <div className="flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
          <span>
            Menampilkan <strong>{filteredAndSortedData.length}</strong> kecamatan. Klik pada diagram batang atau baris tabel untuk melihat rincian per desa.
          </span>
        </div>
        {selectedKecId && (
          <button
            onClick={() => setSelectedKecId(null)}
            className="text-xs text-amber-700 hover:text-amber-900 font-semibold cursor-pointer underline"
          >
            Reset Pilihan ({activeSelectedKec?.nama_kecamatan})
          </button>
        )}
      </div>

      {/* 5. Main Chart / Table View */}
      {viewMode === 'chart' ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-4">
          {filteredAndSortedData.length === 0 ? (
            <div className="p-12 text-center text-xs text-neutral-400">
              Tidak ada kecamatan yang cocok dengan kata kunci pencarian "{searchQuery}".
            </div>
          ) : chartOrientation === 'vertical' ? (
            /* Horizontal Bar Chart: Districts along Y-Axis (Easiest to read 31 districts without rotation) */
            <div style={{ height: `${dynamicChartHeight}px`, width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={filteredAndSortedData}
                  margin={{ top: 10, right: 30, left: 20, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: '#6B7280' }}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="nama_kecamatan"
                    tick={{ fontSize: 11, fill: '#374151', fontWeight: 500 }}
                    width={110}
                    interval={0}
                  />
                  <Tooltip content={<WilayahChartTooltip />} />
                  <Bar
                    dataKey="totalAnggota"
                    name="Jumlah Perangkat Desa"
                    radius={[0, 6, 6, 0]}
                    cursor="pointer"
                    onClick={(data: any) => {
                      const item = data?.payload || data;
                      if (item?.id_kecamatan) handleBarClick(item);
                    }}
                  >
                    {filteredAndSortedData.map((entry) => {
                      const isSelected = selectedKecId === entry.id_kecamatan;
                      return (
                        <Cell
                          key={`cell-${entry.id_kecamatan}`}
                          fill={getBarColor(entry.totalAnggota, maxAnggotaCount, isSelected)}
                          onClick={() => handleBarClick(entry)}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            /* Vertical Column Chart: Districts along X-Axis */
            <div style={{ height: '380px', width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={filteredAndSortedData}
                  margin={{ top: 15, right: 15, left: -10, bottom: 65 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis
                    dataKey="nama_kecamatan"
                    tick={{ fontSize: 10, fill: '#4B5563' }}
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                    height={65}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} allowDecimals={false} />
                  <Tooltip content={<WilayahChartTooltip />} />
                  <Bar
                    dataKey="totalAnggota"
                    name="Jumlah Perangkat Desa"
                    radius={[6, 6, 0, 0]}
                    cursor="pointer"
                    onClick={(data: any) => {
                      const item = data?.payload || data;
                      if (item?.id_kecamatan) handleBarClick(item);
                    }}
                  >
                    {filteredAndSortedData.map((entry) => {
                      const isSelected = selectedKecId === entry.id_kecamatan;
                      return (
                        <Cell
                          key={`cell-${entry.id_kecamatan}`}
                          fill={getBarColor(entry.totalAnggota, maxAnggotaCount, isSelected)}
                          onClick={() => handleBarClick(entry)}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      ) : (
        /* Tabular Breakdown View */
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-neutral-700">
              <thead className="bg-neutral-50 text-[11px] font-semibold text-neutral-600 uppercase border-b border-neutral-200">
                <tr>
                  <th className="py-2.5 px-3">No.</th>
                  <th className="py-2.5 px-3">Nama Kecamatan</th>
                  <th className="py-2.5 px-3 text-right">Perangkat Desa</th>
                  <th className="py-2.5 px-3">Visualisasi Bar</th>
                  <th className="py-2.5 px-3 text-center">Status KTA (Aktif/Pending)</th>
                  <th className="py-2.5 px-3 text-center">Gender (L/P)</th>
                  <th className="py-2.5 px-3 text-center">Cakupan Desa</th>
                  <th className="py-2.5 px-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filteredAndSortedData.map((item, idx) => {
                  const isSelected = selectedKecId === item.id_kecamatan;
                  const barWidth = maxAnggotaCount > 0 ? (item.totalAnggota / maxAnggotaCount) * 100 : 0;

                  return (
                    <tr
                      key={item.id_kecamatan}
                      onClick={() => handleBarClick(item)}
                      className={`hover:bg-neutral-50 transition-colors cursor-pointer ${
                        isSelected ? 'bg-amber-50/60 font-semibold' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono text-neutral-400">{idx + 1}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-neutral-900">{item.nama_kecamatan}</div>
                        <div className="text-[10px] text-neutral-400 font-mono">{item.id_kecamatan}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-neutral-900">
                        {item.totalAnggota}{' '}
                        <span className="text-[10px] text-neutral-400 font-normal">({item.persentaseTotal}%)</span>
                      </td>
                      <td className="py-2.5 px-3 w-40">
                        <div className="w-full bg-neutral-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.max(barWidth, item.totalAnggota > 0 ? 5 : 0)}%`,
                              backgroundColor: getBarColor(item.totalAnggota, maxAnggotaCount, isSelected),
                            }}
                          />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono">
                        <span className="text-emerald-700 font-bold">{item.ktaAktif}</span> /{' '}
                        <span className="text-amber-700">{item.ktaPending}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-neutral-600">
                        <span className="text-sky-700 font-semibold">{item.lakiLaki}L</span> ·{' '}
                        <span className="text-rose-700 font-semibold">{item.perempuan}P</span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono">
                        {item.desaWithMembers} / {item.totalDesa} Desa
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedKecamatanFilter(item.id_kecamatan);
                            setActiveTab('anggota');
                          }}
                          className="px-2 py-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded border border-emerald-200 transition-colors cursor-pointer"
                        >
                          Lihat Anggota
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. Drilldown / Detail Drawer for Selected Kecamatan */}
      {activeSelectedKec && (
        <div className="bg-amber-50/70 border border-amber-300 rounded-xl p-4 space-y-3 transition-all animate-fadeIn">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/80 pb-2">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-amber-800" />
              <h3 className="text-sm font-bold text-amber-950 uppercase tracking-wide">
                Rincian Sebaran Perangkat Desa: Kecamatan {activeSelectedKec.nama_kecamatan}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSelectedKecamatanFilter(activeSelectedKec.id_kecamatan);
                  setActiveTab('anggota');
                }}
                className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors cursor-pointer shadow-2xs"
              >
                Buka Data Induk Anggota Kec. {activeSelectedKec.nama_kecamatan}
              </button>
              <button
                onClick={() => setSelectedKecId(null)}
                className="px-2 py-1 text-xs text-amber-800 hover:text-amber-950 rounded-lg hover:bg-amber-200/60 transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-white/80 p-2.5 rounded-lg border border-amber-200">
              <span className="text-[11px] text-neutral-500 block">Total Perangkat Desa</span>
              <strong className="text-sm font-mono text-neutral-900">{activeSelectedKec.totalAnggota} orang</strong>
            </div>
            <div className="bg-white/80 p-2.5 rounded-lg border border-amber-200">
              <span className="text-[11px] text-neutral-500 block">KTA Aktif Terbit</span>
              <strong className="text-sm font-mono text-emerald-700">{activeSelectedKec.ktaAktif} KTA</strong>
            </div>
            <div className="bg-white/80 p-2.5 rounded-lg border border-amber-200">
              <span className="text-[11px] text-neutral-500 block">KTA Menunggu (Pending)</span>
              <strong className="text-sm font-mono text-amber-700">{activeSelectedKec.ktaPending} KTA</strong>
            </div>
            <div className="bg-white/80 p-2.5 rounded-lg border border-amber-200">
              <span className="text-[11px] text-neutral-500 block">Cakupan Desa Aktif</span>
              <strong className="text-sm font-mono text-neutral-900">
                {activeSelectedKec.desaWithMembers} dari {activeSelectedKec.totalDesa} Desa
              </strong>
            </div>
          </div>

          {/* Desa List breakdown */}
          <div>
            <h4 className="text-xs font-semibold text-amber-950 mb-1.5">
              Daftar Desa di Kecamatan {activeSelectedKec.nama_kecamatan}:
            </h4>
            {activeSelectedKec.desaBreakdown.length === 0 ? (
              <p className="text-xs text-neutral-500 italic">Belum ada desa yang terdata di sistem untuk kecamatan ini.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {activeSelectedKec.desaBreakdown.map((desa) => (
                  <div
                    key={desa.id_desa}
                    className={`p-2 rounded-lg border text-xs flex items-center justify-between ${
                      desa.count > 0
                        ? 'bg-white border-emerald-300 text-neutral-900 shadow-2xs'
                        : 'bg-neutral-50 border-neutral-200 text-neutral-400'
                    }`}
                  >
                    <span className="truncate pr-1 font-medium">{desa.nama_desa}</span>
                    <span
                      className={`font-mono text-[11px] font-bold px-1.5 py-0.5 rounded ${
                        desa.count > 0 ? 'bg-emerald-100 text-emerald-900' : 'bg-neutral-200 text-neutral-500'
                      }`}
                    >
                      {desa.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (!showCardWrapper) {
    return <div className={className}>{content}</div>;
  }

  return (
    <div className={`bg-white rounded-2xl border border-neutral-200 p-5 shadow-xs ${className}`}>
      {content}
    </div>
  );
};
