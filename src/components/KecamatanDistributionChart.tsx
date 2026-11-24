import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
} from 'recharts';
import { BarChart3, ArrowRight, Search, X } from 'lucide-react';
import { AnggotaFullDetail, RefDesa, RefKecamatan } from '../types/ppdi';

interface KecamatanDistributionChartProps {
  members: AnggotaFullDetail[];
  kecamatanList: RefKecamatan[];
  desaList: RefDesa[];
  onNavigateToKecamatan?: (idKecamatan: string) => void;
}

interface KecamatanBarDatum {
  id_kecamatan: string;
  nama: string;
  shortName: string;
  jumlah: number;
  ktaAktif: number;
  ktaPending: number;
  desaTerdata: number;
  totalDesa: number;
  persentase: number;
}

const KecamatanTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0]?.payload as KecamatanBarDatum | undefined;
  if (!item) return null;

  return (
    <div className="bg-neutral-900/95 text-white p-3 rounded-xl shadow-2xl border border-neutral-700/80 text-xs min-w-[210px]">
      <div className="font-bold text-amber-300 pb-1.5 mb-1.5 border-b border-neutral-800">
        Kec. {item.nama}
      </div>
      <div className="space-y-1 font-mono tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="text-neutral-300 font-sans">Jumlah Anggota</span>
          <span className="font-bold text-emerald-400">
            {item.jumlah} orang ({item.persentase}%)
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-neutral-300 font-sans">E-KTA Aktif</span>
          <span className="text-white font-semibold">{item.ktaAktif}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-neutral-300 font-sans">E-KTA Pending</span>
          <span className="text-amber-300 font-semibold">{item.ktaPending}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-neutral-300 font-sans">Cakupan Desa</span>
          <span className="text-neutral-200">
            {item.desaTerdata} / {item.totalDesa} desa
          </span>
        </div>
      </div>
    </div>
  );
};

export const KecamatanDistributionChart: React.FC<KecamatanDistributionChartProps> = ({
  members,
  kecamatanList,
  desaList,
  onNavigateToKecamatan,
}) => {
  const [viewLimit, setViewLimit] = useState<'top15' | 'all' | 'active'>('all');
  const [sortMode, setSortMode] = useState<'desc' | 'asc' | 'alpha'>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBar, setSelectedBar] = useState<KecamatanBarDatum | null>(null);

  const allKecamatanData = useMemo<KecamatanBarDatum[]>(() => {
    const cleanId = (id?: string | null) => (id ? String(id).replace(/\./g, '').trim() : '');

    const totalDesaByKec: Record<string, Set<string>> = {};
    (desaList || []).forEach((d) => {
      const kId = cleanId(d.id_kecamatan);
      if (!kId) return;
      if (!totalDesaByKec[kId]) totalDesaByKec[kId] = new Set();
      totalDesaByKec[kId].add(cleanId(d.id_desa));
    });

    const totalMembers = members.length;

    return (kecamatanList || []).map((k) => {
      const kClean = cleanId(k.id_kecamatan);
      const kNameNorm = k.nama_kecamatan.toLowerCase().trim();

      const matched = members.filter((m) => {
        const mKecClean = cleanId(m.kecamatan?.id_kecamatan || m.desa?.id_kecamatan);
        if (mKecClean && mKecClean === kClean) return true;
        const mKecName = m.kecamatan?.nama_kecamatan?.toLowerCase().trim();
        return Boolean(mKecName && mKecName === kNameNorm);
      });

      const activeDesas = new Set<string>();
      let ktaAktif = 0;
      let ktaPending = 0;
      matched.forEach((m) => {
        const dId = cleanId(m.desa?.id_desa || m.jabatanTerkini?.id_desa);
        if (dId) activeDesas.add(dId);
        if (m.keanggotaan?.status_kta === 'Aktif') ktaAktif++;
        else if (m.keanggotaan?.status_kta === 'Pending') ktaPending++;
      });

      const jumlah = matched.length;
      const shortName =
        k.nama_kecamatan.length > 13
          ? `${k.nama_kecamatan.slice(0, 12)}…`
          : k.nama_kecamatan;

      return {
        id_kecamatan: k.id_kecamatan,
        nama: k.nama_kecamatan,
        shortName,
        jumlah,
        ktaAktif,
        ktaPending,
        desaTerdata: activeDesas.size,
        totalDesa: totalDesaByKec[kClean]?.size || 0,
        persentase: totalMembers > 0 ? Number(((jumlah / totalMembers) * 100).toFixed(1)) : 0,
      };
    });
  }, [members, kecamatanList, desaList]);

  const summary = useMemo(() => {
    const totalAnggota = members.length;
    const totalKec = allKecamatanData.length;
    const kecTerisi = allKecamatanData.filter((k) => k.jumlah > 0).length;
    const rataRata = totalKec > 0 ? Number((totalAnggota / totalKec).toFixed(1)) : 0;
    const tertinggi = allKecamatanData.reduce<KecamatanBarDatum | null>(
      (best, cur) => (!best || cur.jumlah > best.jumlah ? cur : best),
      null
    );
    return { totalAnggota, totalKec, kecTerisi, rataRata, tertinggi };
  }, [allKecamatanData, members.length]);

  const displayedData = useMemo(() => {
    let rows = [...allKecamatanData];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter((r) => r.nama.toLowerCase().includes(q));
    }

    if (viewLimit === 'active') {
      rows = rows.filter((r) => r.jumlah > 0);
    }

    if (sortMode === 'desc') {
      rows.sort((a, b) => b.jumlah - a.jumlah || a.nama.localeCompare(b.nama));
    } else if (sortMode === 'asc') {
      rows.sort((a, b) => a.jumlah - b.jumlah || a.nama.localeCompare(b.nama));
    } else {
      rows.sort((a, b) => a.nama.localeCompare(b.nama));
    }

    if (viewLimit === 'top15') {
      rows = rows.slice(0, 15);
    }

    return rows;
  }, [allKecamatanData, searchQuery, viewLimit, sortMode]);

  const chartMinWidth = Math.max(640, displayedData.length * 36);

  return (
    <section
      aria-label="Grafik Distribusi Anggota per Kecamatan"
      className="bg-white border border-neutral-200 rounded-2xl p-4 sm:p-5 space-y-4"
    >
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3 pb-3.5 border-b border-neutral-200">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#064E3B] shrink-0" />
            <h2 className="text-sm sm:text-base font-bold text-neutral-900 tracking-tight">
              Grafik Distribusi Anggota Berdasarkan Kecamatan
            </h2>
          </div>
          <p className="text-xs text-neutral-500 leading-relaxed">
            Visualisasi sebaran jumlah perangkat desa terdata di setiap kecamatan untuk pemantauan pemerataan keanggotaan.
          </p>
          {/* Quiet unboxed summary metadata with typographic separators */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-1 text-xs text-neutral-600 font-mono tabular-nums">
            <span>
              Total: <strong className="text-neutral-900">{summary.totalAnggota}</strong> anggota
            </span>
            <span aria-hidden="true" className="text-neutral-300">·</span>
            <span>
              Terdata: <strong className="text-emerald-800">{summary.kecTerisi}</strong> / {summary.totalKec} kecamatan
            </span>
            <span aria-hidden="true" className="text-neutral-300">·</span>
            <span>
              Rata-rata: <strong className="text-neutral-900">{summary.rataRata}</strong> / kec
            </span>
            {summary.tertinggi && summary.tertinggi.jumlah > 0 && (
              <>
                <span aria-hidden="true" className="text-neutral-300">·</span>
                <span>
                  Tertinggi: <strong className="text-[#064E3B]">{summary.tertinggi.nama}</strong> ({summary.tertinggi.jumlah})
                </span>
              </>
            )}
          </div>
        </div>

        {/* Interactive Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Search kecamatan */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari kecamatan..."
              aria-label="Cari kecamatan pada grafik"
              className="w-40 sm:w-44 pl-8 pr-7 py-1.5 text-xs bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-800 focus:bg-white focus:ring-2 focus:ring-[#064E3B] outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Bersihkan pencarian kecamatan"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Segmented View Toggle */}
          <div className="inline-flex items-center p-0.5 bg-neutral-100 rounded-lg border border-neutral-200 text-xs font-medium">
            <button
              type="button"
              onClick={() => setViewLimit('all')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                viewLimit === 'all'
                  ? 'bg-white text-neutral-900 font-semibold shadow-2xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Semua ({allKecamatanData.length})
            </button>
            <button
              type="button"
              onClick={() => setViewLimit('top15')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                viewLimit === 'top15'
                  ? 'bg-white text-neutral-900 font-semibold shadow-2xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Top 15
            </button>
            <button
              type="button"
              onClick={() => setViewLimit('active')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                viewLimit === 'active'
                  ? 'bg-white text-neutral-900 font-semibold shadow-2xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Terisi ({summary.kecTerisi})
            </button>
          </div>

          {/* Sort Select */}
          <select
            aria-label="Urutkan grafik kecamatan"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as 'desc' | 'asc' | 'alpha')}
            className="text-xs bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-neutral-800 font-medium focus:ring-2 focus:ring-[#064E3B] outline-none cursor-pointer"
          >
            <option value="desc">Terbanyak</option>
            <option value="asc">Tersedikit</option>
            <option value="alpha">Nama A–Z</option>
          </select>
        </div>
      </div>

      {/* Selected Kecamatan Quick Detail Bar */}
      {selectedBar && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-neutral-700 font-mono tabular-nums">
            <span className="font-sans font-bold text-[#064E3B]">Kec. {selectedBar.nama}</span>
            <span aria-hidden="true" className="text-emerald-300">·</span>
            <span>
              <strong>{selectedBar.jumlah}</strong> anggota ({selectedBar.persentase}%)
            </span>
            <span aria-hidden="true" className="text-emerald-300">·</span>
            <span>E-KTA Aktif: <strong>{selectedBar.ktaAktif}</strong></span>
            <span aria-hidden="true" className="text-emerald-300">·</span>
            <span>Desa terdata: <strong>{selectedBar.desaTerdata}/{selectedBar.totalDesa}</strong></span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onNavigateToKecamatan && (
              <button
                type="button"
                onClick={() => onNavigateToKecamatan(selectedBar.id_kecamatan)}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#064E3B] hover:bg-[#043d2e] text-white rounded-lg text-[11px] font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0"
              >
                <span>Lihat Data Anggota</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedBar(null)}
              aria-label="Tutup ringkasan kecamatan terpilih"
              className="p-1 text-neutral-500 hover:text-neutral-800 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Recharts BarChart Container */}
      {displayedData.length > 0 ? (
        <div className="w-full overflow-x-auto pb-1">
          <div style={{ minWidth: `${chartMinWidth}px`, height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={displayedData}
                margin={{ top: 14, right: 16, left: -12, bottom: 56 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis
                  dataKey="shortName"
                  tick={{ fontSize: 10.5, fill: '#374151', fontWeight: 500 }}
                  angle={-38}
                  textAnchor="end"
                  interval={0}
                  height={62}
                  tickLine={false}
                  axisLine={{ stroke: '#D1D5DB' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#4B5563' }}
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<KecamatanTooltip />} cursor={{ fill: 'rgba(6, 78, 59, 0.06)' }} />
                {summary.rataRata > 0 && (
                  <ReferenceLine
                    y={summary.rataRata}
                    stroke="#D97706"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{
                      value: `Rata-rata: ${summary.rataRata}`,
                      position: 'insideTopRight',
                      fill: '#B45309',
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  />
                )}
                <Bar
                  dataKey="jumlah"
                  name="Jumlah Anggota"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={34}
                  className="cursor-pointer"
                  onClick={(barData: any) => {
                    const payload = barData?.payload as KecamatanBarDatum | undefined;
                    if (payload) {
                      setSelectedBar((prev) =>
                        prev?.id_kecamatan === payload.id_kecamatan ? null : payload
                      );
                    }
                  }}
                >
                  {displayedData.map((entry) => {
                    const isSelected = selectedBar?.id_kecamatan === entry.id_kecamatan;
                    const fill = isSelected
                      ? '#D97706'
                      : entry.jumlah === 0
                      ? '#E5E7EB'
                      : entry.jumlah >= summary.rataRata
                      ? '#064E3B'
                      : '#10B981';
                    return <Cell key={entry.id_kecamatan} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="py-10 px-4 text-center text-xs text-neutral-500 bg-neutral-50 rounded-xl border border-dashed border-neutral-300 space-y-2">
          <p>Tidak ada kecamatan yang sesuai dengan filter atau pencarian saat ini.</p>
          {(searchQuery || viewLimit !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setViewLimit('all');
              }}
              className="px-3 py-1.5 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg text-xs font-semibold text-neutral-800 cursor-pointer"
            >
              Tampilkan Semua Kecamatan
            </button>
          )}
        </div>
      )}

      {/* Subtle Chart Legend Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-100 text-[11px] text-neutral-500">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#064E3B] shrink-0" />
            <span>Di atas / sama dengan rata-rata</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#10B981] shrink-0" />
            <span>Di bawah rata-rata</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 border-t-2 border-dashed border-amber-600 shrink-0" />
            <span>Garis rata-rata kabupaten</span>
          </span>
        </div>
        <span className="text-neutral-400">Klik batang grafik untuk melihat rincian kecamatan</span>
      </div>
    </section>
  );
};
