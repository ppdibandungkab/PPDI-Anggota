import React from 'react';
import { usePPDI } from '../context/PPDIContext';
import { formatRupiah } from '../utils/ppdiHelpers';
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
} from 'lucide-react';

export const DashboardView: React.FC = () => {
  const { visibleMembers, fullMembers, kecamatanList, desaList, iuranList, setActiveTab } = usePPDI();

  // Primary Metrics
  const totalAnggota = visibleMembers.length;
  const ktaAktifCount = visibleMembers.filter((m) => m.keanggotaan?.status_kta === 'Aktif').length;
  const ktaPendingCount = visibleMembers.filter((m) => m.keanggotaan?.status_kta === 'Pending').length;
  const ktaPercentage = totalAnggota > 0 ? Math.round((ktaAktifCount / totalAnggota) * 100) : 0;

  // Iuran Summary
  const visibleMemberIds = new Set(visibleMembers.map((m) => m.anggota.id_anggota));
  const totalIuranTerkumpul = iuranList
    .filter((i) => visibleMemberIds.has(i.id_anggota) && i.status_verifikasi === 'Lunas')
    .reduce((sum, item) => sum + item.jumlah, 0);

  const pendingIuranCount = iuranList.filter(
    (i) => visibleMemberIds.has(i.id_anggota) && i.status_verifikasi === 'Pending'
  ).length;

  // Retirement stats
  const criticalRetirement = visibleMembers.filter(
    (m) => m.statusPensiun === 'Kritis (<6 Bln)' || m.statusPensiun === 'Siaga (<1 Thn)'
  );
  const waspadaRetirement = visibleMembers.filter((m) => m.statusPensiun === 'Waspada (<2 Thn)');
  const purnaTugasCount = visibleMembers.filter((m) => m.statusPensiun === 'Sudah Purna Tugas').length;

  // Age bracket demographic
  const ageBrackets = {
    under30: visibleMembers.filter((m) => m.usia < 30).length,
    age30to40: visibleMembers.filter((m) => m.usia >= 30 && m.usia <= 40).length,
    age41to50: visibleMembers.filter((m) => m.usia >= 41 && m.usia <= 50).length,
    age51to59: visibleMembers.filter((m) => m.usia >= 51 && m.usia <= 59).length,
    over60: visibleMembers.filter((m) => m.usia >= 60).length,
  };

  // Education distribution
  const educationCounts = {
    'SMA/SMK': visibleMembers.filter((m) => m.anggota.pendidikan_terakhir === 'SMA/SMK').length,
    D3: visibleMembers.filter((m) => m.anggota.pendidikan_terakhir === 'D3').length,
    S1: visibleMembers.filter((m) => m.anggota.pendidikan_terakhir === 'S1').length,
    S2: visibleMembers.filter((m) => m.anggota.pendidikan_terakhir === 'S2').length,
  };

  // Job category composition
  const jobCategoryCounts = {
    Sekretariat: visibleMembers.filter((m) => m.jabatanRef?.kategori_jabatan === 'Sekretariat').length,
    'Pelaksana Teknis': visibleMembers.filter((m) => m.jabatanRef?.kategori_jabatan === 'Pelaksana Teknis').length,
    'Pelaksana Kewilayahan': visibleMembers.filter((m) => m.jabatanRef?.kategori_jabatan === 'Pelaksana Kewilayahan').length,
    'Kepala Desa': visibleMembers.filter((m) => m.jabatanRef?.kategori_jabatan === 'Kepala Desa').length,
  };

  // Kecamatan Breakdown table sorted by memberCount descending (terbanyak ke tersedikit)
  const kecamatanData = kecamatanList.map((kec) => {
    const desaInKec = desaList.filter((d) => d.id_kecamatan === kec.id_kecamatan);
    const membersInKec = fullMembers.filter((m) => m.kecamatan?.id_kecamatan === kec.id_kecamatan);
    const activeKTA = membersInKec.filter((m) => m.keanggotaan?.status_kta === 'Aktif').length;
    const retiringSoon = membersInKec.filter(
      (m) => m.statusPensiun === 'Kritis (<6 Bln)' || m.statusPensiun === 'Siaga (<1 Thn)'
    ).length;

    return {
      kecamatan: kec,
      desaCount: desaInKec.length,
      memberCount: membersInKec.length,
      activeKTA,
      retiringSoon,
    };
  }).sort((a, b) => b.memberCount - a.memberCount);

  return (
    <div className="space-y-6">
      {/* Top Banner & Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-neutral-200 gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 tracking-tight">
            Dashboard Statistik & Rekapitulasi Wilayah
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Monitoring data induk perangkat desa, sebaran KTA digital, dan masa kerja se-Kabupaten Bandung
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('pensiun')}
            className="px-3 py-1.5 text-xs font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <ClockAlert className="w-3.5 h-3.5 text-amber-700" />
            <span>{criticalRetirement.length} Purna Tugas Siaga</span>
          </button>
          <button
            onClick={() => setActiveTab('ekta')}
            className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <CreditCard className="w-3.5 h-3.5 text-emerald-700" />
            <span>Cetak E-KTA Masal</span>
          </button>
        </div>
      </div>

      {/* Upcoming Retirements (< 6 months) Alert Component */}
      {visibleMembers.filter(
        (m) => m.statusPensiun === 'Kritis (<6 Bln)' || (m.sisaMasaPensiunTahun === 0 && m.sisaMasaPensiunBulan <= 6)
      ).length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-400/5 to-transparent border-l-4 border-amber-600 bg-amber-50/60 p-4 rounded-r-xl border border-amber-200 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-500 text-white rounded-lg shadow-xs shrink-0 mt-0.5">
                <ClockAlert className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-amber-900 uppercase tracking-wide">
                    Peringatan Purna Tugas (&lt; 6 Bulan)
                  </h2>
                  <span className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded-full text-[11px] font-mono font-bold">
                    {visibleMembers.filter((m) => m.statusPensiun === 'Kritis (<6 Bln)' || (m.sisaMasaPensiunTahun === 0 && m.sisaMasaPensiunBulan <= 6)).length} Perangkat
                  </span>
                </div>
                <p className="text-xs text-amber-800/90 mt-0.5">
                  Terdapat {visibleMembers.filter((m) => m.statusPensiun === 'Kritis (<6 Bln)' || (m.sisaMasaPensiunTahun === 0 && m.sisaMasaPensiunBulan <= 6)).length} perangkat desa yang akan mencapai batas usia pensiun (60 tahun) dalam waktu 6 bulan ke depan.
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('pensiun')}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
            >
              <span>Lihat Detail Pensiun</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Mini preview list of top retiring members */}
          <div className="mt-3 pt-3 border-t border-amber-200/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {visibleMembers
              .filter((m) => m.statusPensiun === 'Kritis (<6 Bln)' || (m.sisaMasaPensiunTahun === 0 && m.sisaMasaPensiunBulan <= 6))
              .slice(0, 3)
              .map((m) => (
                <div key={m.anggota.id_anggota} className="bg-white/80 p-2.5 rounded-lg border border-amber-200 text-xs flex items-center justify-between">
                  <div>
                    <div className="font-bold text-neutral-900 truncate max-w-[180px]">{m.anggota.nama_lengkap}</div>
                    <div className="text-[11px] text-neutral-600 truncate">{m.desa?.nama_desa || '-'}, Kec. {m.kecamatan?.nama_kecamatan || '-'}</div>
                  </div>
                  <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded-xs font-mono text-[10px] font-bold">
                    {m.sisaMasaPensiunBulan} Bln Lagi
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 4 Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-white p-4 rounded-xl border border-neutral-200">
          <div className="flex items-center justify-between text-neutral-500 text-xs mb-2">
            <span>Total Perangkat Terdata</span>
            <Users className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-2xl font-bold text-neutral-900 tabular-nums">
            {totalAnggota} <span className="text-xs font-normal text-neutral-500">Anggota</span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-2 flex items-center gap-2">
            <span>{visibleMembers.filter((m) => m.jabatanTerkini?.status_aktif === 'Aktif').length} Berstatus Aktif</span>
            <span>·</span>
            <span>{purnaTugasCount} Purna</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white p-4 rounded-xl border border-neutral-200">
          <div className="flex items-center justify-between text-neutral-500 text-xs mb-2">
            <span>E-KTA Diterbitkan</span>
            <CreditCard className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-2xl font-bold text-neutral-900 tabular-nums">
            {ktaAktifCount} <span className="text-xs font-normal text-neutral-500">({ktaPercentage}%)</span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-2 flex items-center gap-2">
            <span>{ktaPendingCount} Menunggu Validasi</span>
            <span>·</span>
            <span>QR Code Siap</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white p-4 rounded-xl border border-neutral-200">
          <div className="flex items-center justify-between text-neutral-500 text-xs mb-2">
            <span>Kas Iuran Terkumpul</span>
            <Wallet className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-2xl font-bold text-neutral-900 tabular-nums">
            {formatRupiah(totalIuranTerkumpul)}
          </div>
          <div className="text-[11px] text-neutral-500 mt-2 flex items-center gap-2">
            <span>{pendingIuranCount} Verifikasi Pending</span>
            <span>·</span>
            <span>Rp 35.000 / bln</span>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white p-4 rounded-xl border border-neutral-200">
          <div className="flex items-center justify-between text-neutral-500 text-xs mb-2">
            <span>Purna Tugas (&lt; 1 Thn)</span>
            <ClockAlert className="w-4 h-4 text-amber-700" />
          </div>
          <div className="text-2xl font-bold text-neutral-900 tabular-nums">
            {criticalRetirement.length} <span className="text-xs font-normal text-amber-700">Perangkat</span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-2 flex items-center gap-2">
            <span>{waspadaRetirement.length} Siaga &lt;2 Thn</span>
            <span>·</span>
            <span>Batas Usia 60 Th</span>
          </div>
        </div>
      </div>

      {/* Grid: Demografi Usia & Pendidikan */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sebaran Usia */}
        <div className="bg-white p-5 rounded-xl border border-neutral-200 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-neutral-900">Demografi Usia Perangkat Desa</h2>
            <Calendar className="w-4 h-4 text-neutral-400" />
          </div>
          <p className="text-[11px] text-neutral-500">
            Kalkulasi usia real-time dari NIK & tanggal lahir untuk regenerasi aparatur desa
          </p>
          <div className="space-y-3 pt-1">
            {[
              { label: '< 30 Tahun (Muda)', count: ageBrackets.under30 },
              { label: '30 - 40 Tahun (Produktif)', count: ageBrackets.age30to40 },
              { label: '41 - 50 Tahun (Matang)', count: ageBrackets.age41to50 },
              { label: '51 - 59 Tahun (Senior)', count: ageBrackets.age51to59 },
              { label: '≥ 60 Tahun (Purna Tugas)', count: ageBrackets.over60 },
            ].map((bracket, idx) => {
              const pct = totalAnggota > 0 ? Math.round((bracket.count / totalAnggota) * 100) : 0;
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs text-neutral-700">
                    <span>{bracket.label}</span>
                    <span className="font-semibold tabular-nums">
                      {bracket.count} orang ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-neutral-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full ${
                        idx === 4
                          ? 'bg-amber-600'
                          : idx === 3
                          ? 'bg-amber-500'
                          : 'bg-emerald-700'
                      }`}
                      style={{ width: `${Math.max(pct, bracket.count > 0 ? 6 : 0)}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Jenjang Pendidikan */}
        <div className="bg-white p-5 rounded-xl border border-neutral-200 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-neutral-900">Jenjang Pendidikan Terakhir</h2>
            <GraduationCap className="w-4 h-4 text-neutral-400" />
          </div>
          <p className="text-[11px] text-neutral-500">
            Kualifikasi kompetensi administrasi desa berdasarkan ijazah terdaftar
          </p>
          <div className="space-y-3 pt-1">
            {Object.entries(educationCounts).map(([level, count], idx) => {
              const pct = totalAnggota > 0 ? Math.round((count / totalAnggota) * 100) : 0;
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs text-neutral-700">
                    <span className="font-medium">{level}</span>
                    <span className="font-semibold tabular-nums">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-neutral-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-emerald-800"
                      style={{ width: `${Math.max(pct, count > 0 ? 6 : 0)}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Komposisi Jabatan */}
        <div className="bg-white p-5 rounded-xl border border-neutral-200 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-neutral-900">Kategori Formasi Jabatan</h2>
            <Building className="w-4 h-4 text-neutral-400" />
          </div>
          <p className="text-[11px] text-neutral-500">
            Sesuai Permendagri No. 84 Th 2015 tentang SOTK Pemerintah Desa
          </p>
          <div className="space-y-3 pt-1">
            {Object.entries(jobCategoryCounts).map(([cat, count], idx) => {
              const pct = totalAnggota > 0 ? Math.round((count / totalAnggota) * 100) : 0;
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs text-neutral-700">
                    <span className="font-medium">{cat}</span>
                    <span className="font-semibold tabular-nums">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-neutral-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-neutral-800"
                      style={{ width: `${Math.max(pct, count > 0 ? 6 : 0)}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tabel Rekapitulasi Wilayah Kecamatan se-Kabupaten Bandung */}
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        <div className="p-4 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-neutral-900">
              Rekapitulasi Keanggotaan Teritorial Kecamatan
            </h2>
            <p className="text-xs text-neutral-500">
              Pemetaan jumlah perangkat desa terdaftar, desa binaan, dan keaktifan KTA
            </p>
          </div>
          <button
            onClick={() => setActiveTab('anggota')}
            className="text-xs font-semibold text-emerald-800 hover:text-emerald-900 flex items-center gap-1 cursor-pointer"
          >
            <span>Buka Data Lengkap</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold">
                <th className="py-2.5 px-4">Kode Wilayah</th>
                <th className="py-2.5 px-4">Nama Kecamatan</th>
                <th className="py-2.5 px-4 text-center">Jml Desa Sampel</th>
                <th className="py-2.5 px-4 text-center">Anggota Terdaftar</th>
                <th className="py-2.5 px-4 text-center">KTA Terbit</th>
                <th className="py-2.5 px-4 text-center">Siaga Purna Tugas</th>
                <th className="py-2.5 px-4 text-right">Rasio Terdaftar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200/70 text-neutral-800">
              {kecamatanData.map((row) => (
                <tr key={row.kecamatan.id_kecamatan} className="hover:bg-neutral-50/80 transition-colors">
                  <td className="py-2.5 px-4 font-mono text-neutral-500">{row.kecamatan.id_kecamatan}</td>
                  <td className="py-2.5 px-4 font-semibold text-neutral-900">
                    Kec. {row.kecamatan.nama_kecamatan}
                  </td>
                  <td className="py-2.5 px-4 text-center tabular-nums">{row.desaCount} Desa</td>
                  <td className="py-2.5 px-4 text-center font-semibold tabular-nums">{row.memberCount} orang</td>
                  <td className="py-2.5 px-4 text-center">
                    <span className="inline-block px-2 py-0.5 rounded-xs text-[11px] font-medium bg-emerald-50 text-emerald-800">
                      {row.activeKTA} KTA
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    {row.retiringSoon > 0 ? (
                      <span className="inline-block px-2 py-0.5 rounded-xs text-[11px] font-semibold bg-amber-50 text-amber-800">
                        {row.retiringSoon} Orang
                      </span>
                    ) : (
                      <span className="text-neutral-400">-</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums">
                    {row.memberCount > 0 ? (
                      <span className="text-emerald-700 font-medium">Terverifikasi</span>
                    ) : (
                      <span className="text-neutral-400">Belum Terinput</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
