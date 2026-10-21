import React, { useState, useMemo } from 'react';
import { usePPDI } from '../context/PPDIContext';
import { formatRupiah, formatDateIndo } from '../utils/ppdiHelpers';
import {
  Wallet,
  CheckCircle,
  XCircle,
  Clock,
  Plus,
  Search,
  Filter,
  Phone,
  ArrowUpRight,
  X,
  CreditCard,
} from 'lucide-react';

export const IuranView: React.FC = () => {
  const { fullMembers, iuranList, addIuran, verifyIuran, currentUser } = usePPDI();

  const [selectedTahun, setSelectedTahun] = useState<number>(2026);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchMember, setSearchMember] = useState<string>('');

  // Modal Record Payment
  const [showAddModal, setShowAddModal] = useState(false);
  const [inputMemberId, setInputMemberId] = useState(fullMembers[0]?.anggota.id_anggota || '');
  const [inputTahun, setInputTahun] = useState(2026);
  const [inputBulan, setInputBulan] = useState(new Date().getMonth() + 1);
  const [inputJumlah, setInputJumlah] = useState(35000);
  const [inputBukti, setInputBukti] = useState('TRF_BJB_STRUK.png');
  const [inputCatatan, setInputCatatan] = useState('Iuran bulanan via transfer bank');

  // Computed summary
  const summary = useMemo(() => {
    const listForYear = iuranList.filter((i) => i.tahun === selectedTahun);
    const lunas = listForYear.filter((i) => i.status_verifikasi === 'Lunas');
    const pending = listForYear.filter((i) => i.status_verifikasi === 'Pending');
    const ditolak = listForYear.filter((i) => i.status_verifikasi === 'Ditolak');

    const totalNominalLunas = lunas.reduce((acc, curr) => acc + curr.jumlah, 0);
    const totalNominalPending = pending.reduce((acc, curr) => acc + curr.jumlah, 0);

    return {
      totalTransaksi: listForYear.length,
      lunasCount: lunas.length,
      pendingCount: pending.length,
      ditolakCount: ditolak.length,
      totalNominalLunas,
      totalNominalPending,
    };
  }, [iuranList, selectedTahun]);

  // Combined iuran rows
  const displayRows = useMemo(() => {
    return iuranList
      .filter((i) => i.tahun === selectedTahun)
      .filter((i) => (filterStatus === 'all' ? true : i.status_verifikasi === filterStatus))
      .map((i) => {
        const member = fullMembers.find((m) => m.anggota.id_anggota === i.id_anggota);
        return {
          ...i,
          member,
        };
      })
      .filter((item) => {
        if (!searchMember) return true;
        const q = searchMember.toLowerCase();
        return (
          item.member?.anggota.nama_lengkap.toLowerCase().includes(q) ||
          item.member?.anggota.nik.toLowerCase().includes(q) ||
          item.member?.desa?.nama_desa.toLowerCase().includes(q)
        );
      });
  }, [iuranList, selectedTahun, filterStatus, searchMember, fullMembers]);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addIuran({
      id_anggota: inputMemberId,
      tahun: inputTahun,
      bulan: inputBulan,
      jumlah: inputJumlah,
      tgl_bayar: new Date().toISOString().replace('T', ' ').slice(0, 19),
      bukti_trf: inputBukti,
      status_verifikasi: currentUser.role !== 'Anggota' ? 'Lunas' : 'Pending',
      catatan: inputCatatan,
    });
    setShowAddModal(false);
  };

  const monthNames = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-neutral-200 gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 tracking-tight">
            Kas & Iuran Anggota PPDI Kab. Bandung
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Pengelolaan iuran wajib organisasi Rp 35.000 / bulan untuk dana advokasi dan operasional
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Catat Setoran Iuran</span>
        </button>
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded-xl border border-neutral-200">
          <div className="flex items-center justify-between text-neutral-500 text-xs mb-1">
            <span>Kas Masuk Terverifikasi ({selectedTahun})</span>
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-neutral-900 tabular-nums">
            {formatRupiah(summary.totalNominalLunas)}
          </div>
          <div className="text-[11px] text-neutral-500 mt-2">
            {summary.lunasCount} transaksi berhasil dibukukan
          </div>
        </div>

        <div className="p-4 bg-white rounded-xl border border-neutral-200">
          <div className="flex items-center justify-between text-neutral-500 text-xs mb-1">
            <span>Menunggu Verifikasi Bendahara</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-900 tabular-nums">
            {formatRupiah(summary.totalNominalPending)}
          </div>
          <div className="text-[11px] text-neutral-500 mt-2">
            {summary.pendingCount} bukti transfer perlu validasi
          </div>
        </div>

        <div className="p-4 bg-white rounded-xl border border-neutral-200">
          <div className="flex items-center justify-between text-neutral-500 text-xs mb-1">
            <span>Rata-rata Kepatuhan Bulanan</span>
            <Wallet className="w-4 h-4 text-neutral-600" />
          </div>
          <div className="text-2xl font-bold text-neutral-900 tabular-nums">
            {fullMembers.length > 0 ? Math.round((summary.lunasCount / (fullMembers.length * 3)) * 100) : 0}%
          </div>
          <div className="text-[11px] text-neutral-500 mt-2">
            Iuran Rp 35.000 / Perangkat Desa / Bulan
          </div>
        </div>
      </div>

      {/* Filter and Year Selector */}
      <div className="bg-white p-3 rounded-xl border border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="font-semibold text-neutral-700 whitespace-nowrap">Tahun Anggaran:</label>
          <select
            aria-label="Pilih Tahun Anggaran"
            value={selectedTahun}
            onChange={(e) => setSelectedTahun(Number(e.target.value))}
            className="bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-xs text-neutral-800 font-medium"
          >
            <option value={2026}>Tahun 2026</option>
            <option value={2025}>Tahun 2025</option>
          </select>

          <label className="font-semibold text-neutral-700 whitespace-nowrap ml-2">Status:</label>
          <select
            aria-label="Pilih Status Verifikasi"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-xs text-neutral-800"
          >
            <option value="all">Semua Status</option>
            <option value="Lunas">Lunas</option>
            <option value="Pending">Pending</option>
            <option value="Ditolak">Ditolak</option>
          </select>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari nama anggota..."
            value={searchMember}
            onChange={(e) => setSearchMember(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-900 focus:outline-hidden"
          />
        </div>
      </div>

      {/* Transaction Table */}
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold">
                <th className="py-3 px-4">Nama Perangkat Desa</th>
                <th className="py-3 px-4">Wilayah Desa</th>
                <th className="py-3 px-4">Periode Iuran</th>
                <th className="py-3 px-4">Nominal</th>
                <th className="py-3 px-4">Tanggal Setor</th>
                <th className="py-3 px-4">Bukti Transfer</th>
                <th className="py-3 px-4 text-center">Status Verifikasi</th>
                <th className="py-3 px-4 text-right">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-neutral-800">
              {displayRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-neutral-400">
                    Tidak ada transaksi iuran untuk kriteria yang dipilih
                  </td>
                </tr>
              ) : (
                displayRows.map((row) => (
                  <tr key={row.id_iuran} className="hover:bg-neutral-50/70 transition-colors">
                    <td className="py-3 px-4 font-semibold text-neutral-900 uppercase tracking-tight">
                      {row.member?.anggota.nama_lengkap.toUpperCase() || 'ANGGOTA'}
                      <div className="text-[11px] font-mono font-normal text-neutral-500">
                        {row.member?.keanggotaan?.no_kta || 'KTA -'}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div>Desa {row.member?.desa?.nama_desa}</div>
                      <div className="text-[11px] text-neutral-500">
                        Kec. {row.member?.kecamatan?.nama_kecamatan}
                      </div>
                    </td>

                    <td className="py-3 px-4 font-medium">
                      {monthNames[row.bulan - 1]} {row.tahun}
                    </td>

                    <td className="py-3 px-4 font-mono font-semibold tabular-nums text-neutral-900">
                      {formatRupiah(row.jumlah)}
                    </td>

                    <td className="py-3 px-4 text-neutral-600">
                      {row.tgl_bayar}
                    </td>

                    <td className="py-3 px-4">
                      <span className="font-mono text-[11px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {row.bukti_trf || 'TRF_BANK.png'}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-sm font-semibold text-[11px] ${
                          row.status_verifikasi === 'Lunas'
                            ? 'bg-emerald-50 text-emerald-800'
                            : row.status_verifikasi === 'Pending'
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-red-50 text-red-800'
                        }`}
                      >
                        {row.status_verifikasi}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right">
                      {currentUser.role !== 'Anggota' && row.status_verifikasi === 'Pending' ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => verifyIuran(row.id_iuran, 'Lunas')}
                            className="px-2 py-1 bg-emerald-800 text-white rounded text-[11px] font-semibold hover:bg-emerald-900 cursor-pointer"
                          >
                            Setujui
                          </button>
                          <button
                            onClick={() => verifyIuran(row.id_iuran, 'Ditolak')}
                            className="px-2 py-1 bg-neutral-200 text-neutral-700 rounded text-[11px] hover:bg-neutral-300 cursor-pointer"
                          >
                            Tolak
                          </button>
                        </div>
                      ) : (
                        <span className="text-neutral-400 text-[11px]">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Payment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-neutral-200 space-y-4 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
              <h3 className="font-bold text-neutral-900 text-sm">Catat Pembayaran Iuran</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 text-neutral-400 hover:text-neutral-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3">
              <div>
                <label className="block text-neutral-700 font-medium mb-1">Perangkat Desa</label>
                <select
                  value={inputMemberId}
                  onChange={(e) => setInputMemberId(e.target.value)}
                  className="w-full p-2 border border-neutral-300 rounded-lg"
                >
                  {fullMembers.map((m) => (
                    <option key={m.anggota.id_anggota} value={m.anggota.id_anggota}>
                      {m.anggota.nama_lengkap.toUpperCase()} (Desa {m.desa?.nama_desa})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Tahun</label>
                  <input
                    type="number"
                    value={inputTahun}
                    onChange={(e) => setInputTahun(Number(e.target.value))}
                    className="w-full p-2 border border-neutral-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Bulan</label>
                  <select
                    value={inputBulan}
                    onChange={(e) => setInputBulan(Number(e.target.value))}
                    className="w-full p-2 border border-neutral-300 rounded-lg"
                  >
                    {monthNames.map((m, idx) => (
                      <option key={idx} value={idx + 1}>
                        {m} ({idx + 1})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-neutral-700 font-medium mb-1">Nominal Iuran (Rp)</label>
                <input
                  type="number"
                  value={inputJumlah}
                  onChange={(e) => setInputJumlah(Number(e.target.value))}
                  className="w-full p-2 border border-neutral-300 rounded-lg font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-medium mb-1">Nama Bukti Transfer</label>
                <input
                  type="text"
                  value={inputBukti}
                  onChange={(e) => setInputBukti(e.target.value)}
                  placeholder="TRF_BJB_STRUK.png"
                  className="w-full p-2 border border-neutral-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-medium mb-1">Catatan</label>
                <input
                  type="text"
                  value={inputCatatan}
                  onChange={(e) => setInputCatatan(e.target.value)}
                  className="w-full p-2 border border-neutral-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 bg-neutral-100 text-neutral-700 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-800 text-white font-semibold rounded-lg hover:bg-emerald-900 cursor-pointer"
                >
                  Simpan Pembayaran
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
