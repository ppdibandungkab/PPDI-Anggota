import React from 'react';
import { ActivityLogEntry, PendaftaranPerangkatDesa } from '../types/ppdi';
import { WilayahStatRow } from '../utils/pdfWilayahExport';
import { formatDateIndo, formatRupiah } from '../utils/ppdiHelpers';

export interface DashboardPrintSections {
  ringkasanEksekutif: boolean;
  rekapWilayah: boolean;
  jabatanMasaKerja: boolean;
  purnaTugasPendaftaran: boolean;
  aktivitasTerkini: boolean;
}

export interface DashboardPrintReportProps {
  appName: string;
  logoUrl: string;
  roleScopeLabel: string;
  printedBy: string;
  totalAnggota: number;
  anggotaAktifCount: number;
  purnaTugasCount: number;
  ktaAktifCount: number;
  ktaPendingCount: number;
  ktaPercentage: number;
  totalIuranTerkumpul: number;
  pendingIuranCount: number;
  retirement18MonthsCount: number;
  retirementKritisCount: number;
  retirementSiagaCount: number;
  retirementWaspadaCount: number;
  totalRegistrasi: number;
  pendingApprovalCount: number;
  approvedPendaftaranCount: number;
  rejectedPendaftaranCount: number;
  lakiLakiCount: number;
  perempuanCount: number;
  pendidikanSummary: Array<{ label: string; count: number }>;
  wilayahStatRows: WilayahStatRow[];
  jabatanChartData: Array<{ nama: string; jumlah: number }>;
  masaKerjaChartData: Array<{ kategori: string; jumlah: number }>;
  recentActivities: ActivityLogEntry[];
  recentRegistrations: PendaftaranPerangkatDesa[];
  sections: DashboardPrintSections;
}

function getLocalDateIndoLong(): string {
  return new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function getLocalDateTimeIndo(): string {
  return new Date().toLocaleString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const DashboardPrintReportDocument: React.FC<DashboardPrintReportProps> = ({
  appName,
  logoUrl,
  roleScopeLabel,
  printedBy,
  totalAnggota,
  anggotaAktifCount,
  purnaTugasCount,
  ktaAktifCount,
  ktaPendingCount,
  ktaPercentage,
  totalIuranTerkumpul,
  pendingIuranCount,
  retirement18MonthsCount,
  retirementKritisCount,
  retirementSiagaCount,
  retirementWaspadaCount,
  totalRegistrasi,
  pendingApprovalCount,
  approvedPendaftaranCount,
  rejectedPendaftaranCount,
  lakiLakiCount,
  perempuanCount,
  pendidikanSummary,
  wilayahStatRows,
  jabatanChartData,
  masaKerjaChartData,
  recentActivities,
  recentRegistrations,
  sections,
}) => {
  const genderTotal = lakiLakiCount + perempuanCount;
  const lakiPct = genderTotal > 0 ? Math.round((lakiLakiCount / genderTotal) * 100) : 0;
  const perempuanPct = genderTotal > 0 ? 100 - lakiPct : 0;

  let sectionIdx = 0;
  const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  const nextRoman = () => romanNumerals[sectionIdx++] || String(sectionIdx);

  return (
    <div className="text-neutral-950 font-sans">
      {/* Kop Laporan Resmi */}
      <header className="pb-3 mb-4 border-b-2 border-[#064E3B] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img
            src={logoUrl || '/logo_kabupaten_bandung.svg'}
            alt="Logo PPDI"
            className="w-12 h-12 object-contain shrink-0"
          />
          <div>
            <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#064E3B]">
              {appName || 'PPDI KABUPATEN BANDUNG'}
            </div>
            <h1 className="text-base font-extrabold text-neutral-950 uppercase tracking-tight leading-tight">
              Laporan Ringkasan Statistik Keanggotaan Dashboard
            </h1>
            <p className="text-[10px] text-neutral-600 mt-0.5">
              Cakupan Data: <b>{roleScopeLabel}</b> &middot; Dicetak oleh: <b>{printedBy}</b>
            </p>
          </div>
        </div>
        <div className="text-right text-[10px] font-mono text-neutral-600 shrink-0">
          <div className="font-bold text-neutral-900">TANGGAL CETAK</div>
          <div>{getLocalDateTimeIndo()} WIB</div>
        </div>
      </header>

      {/* Ringkasan Eksekutif & Demografi */}
      {sections.ringkasanEksekutif && (
        <section className="dashboard-print-section">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#064E3B] mb-2">
            {nextRoman()}. Ringkasan Indikator Utama &amp; Demografi Keanggotaan
          </h2>
          <div className="grid grid-cols-4 gap-2.5 mb-2.5">
            <div className="dashboard-print-card rounded-lg p-2.5 bg-neutral-50 border border-neutral-200">
              <div className="text-[9px] font-bold uppercase text-neutral-500">Total Perangkat Terdata</div>
              <div className="text-lg font-extrabold text-neutral-950 font-mono mt-0.5">{totalAnggota}</div>
              <div className="text-[9px] text-neutral-600 mt-0.5">
                {anggotaAktifCount} Aktif &middot; {purnaTugasCount} Purna
              </div>
            </div>
            <div className="dashboard-print-card rounded-lg p-2.5 bg-neutral-50 border border-neutral-200">
              <div className="text-[9px] font-bold uppercase text-neutral-500">E-KTA Diterbitkan</div>
              <div className="text-lg font-extrabold text-[#064E3B] font-mono mt-0.5">
                {ktaAktifCount} <span className="text-xs font-bold">({ktaPercentage}%)</span>
              </div>
              <div className="text-[9px] text-neutral-600 mt-0.5">{ktaPendingCount} Menunggu Validasi</div>
            </div>
            <div className="dashboard-print-card rounded-lg p-2.5 bg-neutral-50 border border-neutral-200">
              <div className="text-[9px] font-bold uppercase text-neutral-500">Kas Iuran Terkumpul</div>
              <div className="text-sm font-extrabold text-neutral-950 font-mono mt-1">
                {formatRupiah(totalIuranTerkumpul)}
              </div>
              <div className="text-[9px] text-neutral-600 mt-0.5">{pendingIuranCount} Verifikasi Pending</div>
            </div>
            <div className="dashboard-print-card rounded-lg p-2.5 bg-neutral-50 border border-neutral-200">
              <div className="text-[9px] font-bold uppercase text-neutral-500">Purna Tugas (&lt;18 Bln)</div>
              <div className="text-lg font-extrabold text-amber-800 font-mono mt-0.5">
                {retirement18MonthsCount}
              </div>
              <div className="text-[9px] text-neutral-600 mt-0.5">
                {retirementKritisCount} Kritis (&le;6 Bln) &middot; {pendingApprovalCount} Antrean Reg.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="dashboard-print-card rounded-lg p-2.5 bg-white border border-neutral-200">
              <div className="flex items-center justify-between text-[9.5px] font-bold text-neutral-700 mb-1.5">
                <span>Komposisi Jenis Kelamin</span>
                <span className="font-mono text-neutral-500">{genderTotal} Anggota</span>
              </div>
              <div className="w-full h-2.5 rounded-full overflow-hidden bg-neutral-100 flex mb-1.5">
                <div
                  className="bg-[#064E3B] h-full"
                  style={{ width: `${lakiPct}%` }}
                />
                <div
                  className="bg-amber-500 h-full"
                  style={{ width: `${perempuanPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[9px] font-mono text-neutral-700">
                <span>Laki-laki: <b>{lakiLakiCount}</b> ({lakiPct}%)</span>
                <span>Perempuan: <b>{perempuanCount}</b> ({perempuanPct}%)</span>
              </div>
            </div>

            <div className="dashboard-print-card rounded-lg p-2.5 bg-white border border-neutral-200">
              <div className="text-[9.5px] font-bold text-neutral-700 mb-1.5">
                Sebaran Pendidikan Terakhir
              </div>
              <div className="flex flex-wrap gap-1.5">
                {pendidikanSummary.length > 0 ? (
                  pendidikanSummary.slice(0, 6).map((item) => (
                    <span
                      key={item.label}
                      className="px-2 py-0.5 rounded bg-neutral-100 border border-neutral-200 text-[9px] font-mono text-neutral-800"
                    >
                      {item.label}: <b>{item.count}</b>
                    </span>
                  ))
                ) : (
                  <span className="text-[9px] text-neutral-500 italic">Belum ada data pendidikan.</span>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Rekapitulasi Statistik Wilayah per Kecamatan */}
      {sections.rekapWilayah && (
        <section className="mb-4">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#064E3B] mb-2">
            {nextRoman()}. Rekapitulasi Statistik Wilayah Per Kecamatan ({wilayahStatRows.length} Kecamatan)
          </h2>
          <table className="dashboard-print-table w-full border-collapse text-[8.5pt]">
            <thead>
              <tr className="bg-[#064E3B] text-white">
                <th className="w-8 text-center border border-neutral-300 py-1 px-1.5">No</th>
                <th className="text-left border border-neutral-300 py-1 px-1.5">Kecamatan</th>
                <th className="text-center border border-neutral-300 py-1 px-1.5">Desa Terdata</th>
                <th className="text-right border border-neutral-300 py-1 px-1.5">Total Anggota</th>
                <th className="text-center border border-neutral-300 py-1 px-1.5">L / P</th>
                <th className="text-right border border-neutral-300 py-1 px-1.5">E-KTA Aktif</th>
                <th className="text-right border border-neutral-300 py-1 px-1.5">Pending</th>
                <th className="text-right border border-neutral-300 py-1 px-1.5">Porsi (%)</th>
              </tr>
            </thead>
            <tbody>
              {wilayahStatRows.map((row, index) => (
                <tr key={row.id_kecamatan} className={index % 2 === 1 ? 'bg-neutral-50' : 'bg-white'}>
                  <td className="text-center font-mono border border-neutral-300 py-1 px-1.5">{index + 1}</td>
                  <td className="font-semibold border border-neutral-300 py-1 px-1.5">{row.nama_kecamatan}</td>
                  <td className="text-center font-mono border border-neutral-300 py-1 px-1.5">
                    {row.desaWithMembers} / {row.totalDesa}
                  </td>
                  <td className="text-right font-mono font-bold border border-neutral-300 py-1 px-1.5">
                    {row.totalAnggota}
                  </td>
                  <td className="text-center font-mono border border-neutral-300 py-1 px-1.5">
                    {row.lakiLaki} / {row.perempuan}
                  </td>
                  <td className="text-right font-mono border border-neutral-300 py-1 px-1.5">{row.ktaAktif}</td>
                  <td className="text-right font-mono border border-neutral-300 py-1 px-1.5">{row.ktaPending}</td>
                  <td className="text-right font-mono border border-neutral-300 py-1 px-1.5">
                    {row.persentaseTotal.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-emerald-50 font-bold">
                <td colSpan={3} className="text-right uppercase border border-neutral-300 py-1 px-1.5">
                  Total Keseluruhan
                </td>
                <td className="text-right font-mono border border-neutral-300 py-1 px-1.5">{totalAnggota}</td>
                <td className="text-center font-mono border border-neutral-300 py-1 px-1.5">
                  {wilayahStatRows.reduce((s, r) => s + r.lakiLaki, 0)} /{' '}
                  {wilayahStatRows.reduce((s, r) => s + r.perempuan, 0)}
                </td>
                <td className="text-right font-mono border border-neutral-300 py-1 px-1.5">{ktaAktifCount}</td>
                <td className="text-right font-mono border border-neutral-300 py-1 px-1.5">{ktaPendingCount}</td>
                <td className="text-right font-mono border border-neutral-300 py-1 px-1.5">100.0%</td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      {/* Distribusi Jabatan & Masa Kerja */}
      {sections.jabatanMasaKerja && (
        <section className="dashboard-print-section">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#064E3B] mb-2">
            {nextRoman()}. Ringkasan Sebaran Jabatan &amp; Masa Kerja Perangkat Desa
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-bold text-neutral-700 mb-1">Distribusi Jabatan Teratas</div>
              <table className="dashboard-print-table w-full border-collapse text-[8.5pt]">
                <thead>
                  <tr className="bg-[#064E3B] text-white">
                    <th className="text-left border border-neutral-300 py-1 px-1.5">Jabatan</th>
                    <th className="text-right w-16 border border-neutral-300 py-1 px-1.5">Jumlah</th>
                    <th className="text-right w-14 border border-neutral-300 py-1 px-1.5">Porsi</th>
                  </tr>
                </thead>
                <tbody>
                  {jabatanChartData.slice(0, 8).map((item, idx) => (
                    <tr key={item.nama} className={idx % 2 === 1 ? 'bg-neutral-50' : 'bg-white'}>
                      <td className="border border-neutral-300 py-1 px-1.5">{item.nama}</td>
                      <td className="text-right font-mono font-bold border border-neutral-300 py-1 px-1.5">
                        {item.jumlah}
                      </td>
                      <td className="text-right font-mono border border-neutral-300 py-1 px-1.5">
                        {totalAnggota > 0 ? ((item.jumlah / totalAnggota) * 100).toFixed(1) : '0.0'}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <div className="text-[10px] font-bold text-neutral-700 mb-1">Komposisi Masa Kerja</div>
              <table className="dashboard-print-table w-full border-collapse text-[8.5pt]">
                <thead>
                  <tr className="bg-[#064E3B] text-white">
                    <th className="text-left border border-neutral-300 py-1 px-1.5">Rentang Masa Kerja</th>
                    <th className="text-right w-16 border border-neutral-300 py-1 px-1.5">Jumlah</th>
                    <th className="text-right w-14 border border-neutral-300 py-1 px-1.5">Porsi</th>
                  </tr>
                </thead>
                <tbody>
                  {masaKerjaChartData.map((item, idx) => (
                    <tr key={item.kategori} className={idx % 2 === 1 ? 'bg-neutral-50' : 'bg-white'}>
                      <td className="border border-neutral-300 py-1 px-1.5">{item.kategori}</td>
                      <td className="text-right font-mono font-bold border border-neutral-300 py-1 px-1.5">
                        {item.jumlah}
                      </td>
                      <td className="text-right font-mono border border-neutral-300 py-1 px-1.5">
                        {totalAnggota > 0 ? ((item.jumlah / totalAnggota) * 100).toFixed(1) : '0.0'}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Status Purna Tugas & Rekapitulasi Pendaftaran */}
      {sections.purnaTugasPendaftaran && (
        <section className="dashboard-print-section">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#064E3B] mb-2">
            {nextRoman()}. Monitoring Masa Purna Tugas &amp; Status Pendaftaran
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="dashboard-print-card rounded-lg p-2.5 bg-white border border-neutral-200">
              <div className="text-[10px] font-bold text-neutral-800 mb-1.5">
                Peringatan Dini Purna Tugas (Usia 60 Tahun)
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[9.5px]">
                <div className="p-1.5 rounded bg-red-50 border border-red-200 flex items-center justify-between">
                  <span className="text-red-900 font-semibold">Kritis (&le;6 Bln)</span>
                  <span className="font-mono font-bold text-red-800">{retirementKritisCount}</span>
                </div>
                <div className="p-1.5 rounded bg-amber-50 border border-amber-200 flex items-center justify-between">
                  <span className="text-amber-900 font-semibold">Siaga (6-12 Bln)</span>
                  <span className="font-mono font-bold text-amber-800">{retirementSiagaCount}</span>
                </div>
                <div className="p-1.5 rounded bg-blue-50 border border-blue-200 flex items-center justify-between">
                  <span className="text-blue-900 font-semibold">Waspada (12-18 Bln)</span>
                  <span className="font-mono font-bold text-blue-800">{retirementWaspadaCount}</span>
                </div>
                <div className="p-1.5 rounded bg-neutral-100 border border-neutral-200 flex items-center justify-between">
                  <span className="text-neutral-700 font-semibold">Sudah Purna</span>
                  <span className="font-mono font-bold text-neutral-900">{purnaTugasCount}</span>
                </div>
              </div>
            </div>

            <div className="dashboard-print-card rounded-lg p-2.5 bg-white border border-neutral-200">
              <div className="text-[10px] font-bold text-neutral-800 mb-1.5">
                Rekapitulasi Formulir Pendaftaran Anggota
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[9.5px]">
                <div className="p-1.5 rounded bg-neutral-50 border border-neutral-200 flex items-center justify-between">
                  <span className="text-neutral-700 font-semibold">Total Registrasi</span>
                  <span className="font-mono font-bold text-neutral-900">{totalRegistrasi}</span>
                </div>
                <div className="p-1.5 rounded bg-amber-50 border border-amber-200 flex items-center justify-between">
                  <span className="text-amber-900 font-semibold">Menunggu Approval</span>
                  <span className="font-mono font-bold text-amber-800">{pendingApprovalCount}</span>
                </div>
                <div className="p-1.5 rounded bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                  <span className="text-emerald-900 font-semibold">Disetujui</span>
                  <span className="font-mono font-bold text-emerald-800">{approvedPendaftaranCount}</span>
                </div>
                <div className="p-1.5 rounded bg-red-50 border border-red-200 flex items-center justify-between">
                  <span className="text-red-900 font-semibold">Ditolak</span>
                  <span className="font-mono font-bold text-red-800">{rejectedPendaftaranCount}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Aktivitas Terkini Sistem & Pendaftaran */}
      {sections.aktivitasTerkini && (
        <section className="dashboard-print-section">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#064E3B] mb-2">
            {nextRoman()}. Log Aktivitas Terkini &amp; Pendaftaran Terbaru
          </h2>
          {recentActivities.length > 0 ? (
            <table className="dashboard-print-table w-full border-collapse text-[8.5pt]">
              <thead>
                <tr className="bg-[#064E3B] text-white">
                  <th className="text-left w-28 border border-neutral-300 py-1 px-1.5">Waktu</th>
                  <th className="text-left w-28 border border-neutral-300 py-1 px-1.5">Pengguna</th>
                  <th className="text-left w-28 border border-neutral-300 py-1 px-1.5">Modul / Aksi</th>
                  <th className="text-left border border-neutral-300 py-1 px-1.5">Deskripsi Aktivitas</th>
                </tr>
              </thead>
              <tbody>
                {recentActivities.map((log, idx) => (
                  <tr key={log.id} className={idx % 2 === 1 ? 'bg-neutral-50' : 'bg-white'}>
                    <td className="font-mono text-[8pt] border border-neutral-300 py-1 px-1.5">
                      {new Date(log.timestamp).toLocaleString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="font-semibold border border-neutral-300 py-1 px-1.5">{log.user_name}</td>
                    <td className="border border-neutral-300 py-1 px-1.5">
                      <div className="font-bold">{log.aksi}</div>
                      <div className="text-[8pt] text-neutral-600">{log.modul}</div>
                    </td>
                    <td className="border border-neutral-300 py-1 px-1.5">
                      {log.target_nama ? <span className="font-semibold">{log.target_nama}: </span> : null}
                      {log.deskripsi}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : recentRegistrations.length > 0 ? (
            <table className="dashboard-print-table w-full border-collapse text-[8.5pt]">
              <thead>
                <tr className="bg-[#064E3B] text-white">
                  <th className="text-left w-28 border border-neutral-300 py-1 px-1.5">Tanggal</th>
                  <th className="text-left border border-neutral-300 py-1 px-1.5">Nama Perangkat Desa</th>
                  <th className="text-left border border-neutral-300 py-1 px-1.5">Wilayah</th>
                  <th className="text-center w-24 border border-neutral-300 py-1 px-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentRegistrations.map((reg, idx) => (
                  <tr key={reg.id_pendaftaran} className={idx % 2 === 1 ? 'bg-neutral-50' : 'bg-white'}>
                    <td className="font-mono text-[8pt] border border-neutral-300 py-1 px-1.5">
                      {reg.tgl_pendaftaran ? formatDateIndo(String(reg.tgl_pendaftaran).slice(0, 10)) : '-'}
                    </td>
                    <td className="font-semibold border border-neutral-300 py-1 px-1.5">{reg.nama_lengkap}</td>
                    <td className="border border-neutral-300 py-1 px-1.5">
                      {reg.nama_desa || reg.id_desa}, Kec. {reg.nama_kecamatan || reg.id_kecamatan}
                    </td>
                    <td className="text-center font-bold border border-neutral-300 py-1 px-1.5">
                      {reg.status_approval}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-[10px] text-neutral-500 italic">
              Belum terdapat catatan aktivitas terkini pada sesi ini.
            </p>
          )}
        </section>
      )}

      {/* Footer Pengesahan */}
      <footer className="dashboard-print-card mt-5 pt-3 border-t border-neutral-300 flex items-end justify-between text-[9.5px] text-neutral-700">
        <div>
          <div className="font-bold text-neutral-900">{appName || 'PPDI KABUPATEN BANDUNG'}</div>
          <div>Dokumen ini dicetak langsung melalui Dashboard Sistem Informasi Keanggotaan PPDI.</div>
        </div>
        <div className="text-center min-w-[190px]">
          <div>Kabupaten Bandung, {getLocalDateIndoLong()}</div>
          <div className="mt-10 border-t border-neutral-800 pt-1 font-bold text-neutral-900">
            {printedBy}
          </div>
        </div>
      </footer>
    </div>
  );
};
