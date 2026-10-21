import React, { useState, useMemo } from 'react';
import { usePPDI } from '../context/PPDIContext';
import { AnggotaFullDetail } from '../types/ppdi';
import { formatDateIndo } from '../utils/ppdiHelpers';
import { getPhotoUrl, getSkFileUrl } from '../utils/fileHelpers';
import {
  Search,
  Filter,
  Download,
  Plus,
  Eye,
  Edit2,
  Trash2,
  CreditCard,
  FileCheck,
  Building2,
  Phone,
  ClockAlert,
  AlertTriangle,
  CheckCircle,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { ExcelImportModal } from './ExcelImportModal';

interface AnggotaListViewProps {
  onOpenAddModal: () => void;
  onOpenDetailModal: (member: AnggotaFullDetail) => void;
  onOpenEditModal: (member: AnggotaFullDetail) => void;
  onSelectForKTA: (member: AnggotaFullDetail) => void;
}

export const AnggotaListView: React.FC<AnggotaListViewProps> = ({
  onOpenAddModal,
  onOpenDetailModal,
  onOpenEditModal,
  onSelectForKTA,
}) => {
  const {
    visibleMembers,
    kecamatanList,
    desaList,
    jabatanList,
    deleteAnggota,
    currentUser,
  } = usePPDI();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKecamatan, setFilterKecamatan] = useState('all');
  const [filterDesa, setFilterDesa] = useState('all');
  const [filterJabatan, setFilterJabatan] = useState('all');
  const [filterStatusKTA, setFilterStatusKTA] = useState('all');
  const [filterStatusPensiun, setFilterStatusPensiun] = useState('all');

  // Delete Confirmation Modal & Notification State
  const [memberToDelete, setMemberToDelete] = useState<AnggotaFullDetail | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const handleConfirmDelete = async () => {
    if (!memberToDelete) return;
    try {
      setIsDeleting(true);
      const res = await deleteAnggota(memberToDelete.anggota.id_anggota);
      setToastMessage({
        type: 'success',
        text: res?.message || `Data perangkat desa "${memberToDelete.anggota.nama_lengkap}" berhasil dihapus.`,
      });
      setMemberToDelete(null);
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        text: err?.message || 'Gagal menghapus anggota dari sistem.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered desa dropdown options based on selected kecamatan
  const availableDesa = useMemo(() => {
    if (filterKecamatan === 'all') return desaList;
    const cleanKec = filterKecamatan.replace(/\./g, '');
    return desaList.filter((d) => d.id_kecamatan.replace(/\./g, '') === cleanKec);
  }, [filterKecamatan, desaList]);

  // Apply filters
  const filteredList = useMemo(() => {
    return visibleMembers.filter((m) => {
      // Search
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const matchNik = m.anggota.nik.toLowerCase().includes(q);
        const matchName = m.anggota.nama_lengkap.toLowerCase().includes(q);
        const matchNiap = m.anggota.nipd?.toLowerCase().includes(q) ?? false;
        const matchKta = m.keanggotaan?.no_kta.toLowerCase().includes(q) ?? false;
        const matchDesa = m.desa?.nama_desa.toLowerCase().includes(q) ?? false;
        const matchKec = m.kecamatan?.nama_kecamatan.toLowerCase().includes(q) ?? false;
        if (!matchNik && !matchName && !matchNiap && !matchKta && !matchDesa && !matchKec) {
          return false;
        }
      }

      // Kecamatan filter
      if (filterKecamatan !== 'all') {
        const cleanKec = filterKecamatan.replace(/\./g, '');
        const memberKec = (m.kecamatan?.id_kecamatan || m.desa?.id_kecamatan || '').replace(/\./g, '');
        if (memberKec !== cleanKec) return false;
      }

      // Desa filter
      if (filterDesa !== 'all') {
        const cleanDesa = filterDesa.replace(/\./g, '');
        const memberDesa = (m.desa?.id_desa || m.jabatanTerkini?.id_desa || '').replace(/\./g, '');
        if (memberDesa !== cleanDesa) return false;
      }

      // Jabatan filter
      if (filterJabatan !== 'all' && String(m.jabatanRef?.id_jabatan) !== filterJabatan) {
        return false;
      }

      // KTA status filter
      if (filterStatusKTA !== 'all' && m.keanggotaan?.status_kta !== filterStatusKTA) {
        return false;
      }

      // Pensiun filter
      if (filterStatusPensiun !== 'all') {
        if (filterStatusPensiun === 'kritis' && m.statusPensiun !== 'Kritis (<6 Bln)' && m.statusPensiun !== 'Siaga (<1 Thn)') {
          return false;
        }
        if (filterStatusPensiun === 'purna' && m.statusPensiun !== 'Sudah Purna Tugas') {
          return false;
        }
      }

      return true;
    });
  }, [
    visibleMembers,
    searchQuery,
    filterKecamatan,
    filterDesa,
    filterJabatan,
    filterStatusKTA,
    filterStatusPensiun,
  ]);

  // Export to CSV function
  const handleExportCSV = () => {
    const headers = [
      'No',
      'NIK',
      'NIAP/NIPD',
      'Nama Lengkap',
      'Gelar Depan',
      'Gelar Belakang',
      'Tempat Lahir',
      'Tanggal Lahir',
      'Usia',
      'Jenis Kelamin',
      'Pendidikan Terakhir',
      'No HP/WhatsApp',
      'Kecamatan',
      'Desa',
      'Jabatan',
      'Kategori Jabatan',
      'No SK',
      'TMT Jabatan',
      'Status Keaktifan',
      'No KTA PPDI',
      'Status KTA',
      'Jabatan Pengurus',
      'Status Masa Pensiun (60 Th)',
    ];

    const rows = filteredList.map((m, idx) => [
      idx + 1,
      `'${m.anggota.nik}`,
      m.anggota.nipd || '-',
      `"${m.anggota.nama_lengkap}"`,
      m.anggota.gelar_depan || '',
      m.anggota.gelar_belakang || '',
      m.anggota.tempat_lahir,
      m.anggota.tanggal_lahir,
      m.usia,
      m.anggota.jenis_kelamin,
      m.anggota.pendidikan_terakhir,
      m.anggota.no_hp_wa,
      m.kecamatan?.nama_kecamatan || '-',
      m.desa?.nama_desa || '-',
      `"${m.jabatanRef?.nama_jabatan || '-'}"`,
      m.jabatanRef?.kategori_jabatan || '-',
      `"${m.jabatanTerkini?.no_sk_pengangkatan || '-'}"`,
      m.jabatanTerkini?.tmt_jabatan || '-',
      m.jabatanTerkini?.status_aktif || '-',
      m.keanggotaan?.no_kta || '-',
      m.keanggotaan?.status_kta || '-',
      `"${m.keanggotaan?.jabatan_pengurus || '-'}"`,
      m.statusPensiun,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `DATA_ANGGOTA_PPDI_KAB_BANDUNG_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-neutral-200 gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 tracking-tight">
            Data Induk Perangkat Desa (Anggota PPDI)
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Database relasional aparatur pemerintah desa dengan NIK, NIAP, SK Pengangkatan, & No KTA
          </p>
        </div>

        <div className="flex items-center gap-2">
          {currentUser.role !== 'Anggota' && (
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span>Import Data Excel</span>
            </button>
          )}

          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 text-xs font-semibold text-neutral-700 bg-white hover:bg-neutral-50 border border-neutral-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-neutral-600" />
            <span>Ekspor CSV / Excel</span>
          </button>

          {currentUser.role !== 'Anggota' && (
            <button
              onClick={onOpenAddModal}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Perangkat</span>
            </button>
          )}
        </div>
      </div>

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          className={`p-3 rounded-xl border flex items-center justify-between text-xs shadow-xs transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMessage.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span className="font-medium">{toastMessage.text}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-neutral-400 hover:text-neutral-700 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search and Filters Bar */}
      <div className="bg-white p-3 rounded-xl border border-neutral-200 space-y-3">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari berdasarkan NIK 16 digit, Nama Lengkap, NIAP/NIPD, No. KTA, atau Desa..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-emerald-700 focus:bg-white"
          />
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
          {/* Kecamatan */}
          <div>
            <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">
              Kecamatan
            </label>
            <select
              aria-label="Filter Kecamatan"
              value={filterKecamatan}
              onChange={(e) => {
                setFilterKecamatan(e.target.value);
                setFilterDesa('all');
              }}
              className="w-full bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5 text-xs text-neutral-800 focus:outline-hidden"
            >
              <option value="all">Semua Kecamatan</option>
              {kecamatanList.map((k) => (
                <option key={k.id_kecamatan} value={k.id_kecamatan}>
                  Kec. {k.nama_kecamatan}
                </option>
              ))}
            </select>
          </div>

          {/* Desa */}
          <div>
            <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">
              Desa
            </label>
            <select
              aria-label="Filter Desa"
              value={filterDesa}
              onChange={(e) => setFilterDesa(e.target.value)}
              className="w-full bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5 text-xs text-neutral-800 focus:outline-hidden"
            >
              <option value="all">Semua Desa</option>
              {availableDesa.map((d) => (
                <option key={d.id_desa} value={d.id_desa}>
                  Desa {d.nama_desa}
                </option>
              ))}
            </select>
          </div>

          {/* Jabatan */}
          <div>
            <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">
              Jabatan
            </label>
            <select
              aria-label="Filter Jabatan"
              value={filterJabatan}
              onChange={(e) => setFilterJabatan(e.target.value)}
              className="w-full bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5 text-xs text-neutral-800 focus:outline-hidden"
            >
              <option value="all">Semua Formasi</option>
              {jabatanList.map((j) => (
                <option key={j.id_jabatan} value={String(j.id_jabatan)}>
                  {j.nama_jabatan}
                </option>
              ))}
            </select>
          </div>

          {/* Status KTA */}
          <div>
            <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">
              Status KTA
            </label>
            <select
              aria-label="Filter Status KTA"
              value={filterStatusKTA}
              onChange={(e) => setFilterStatusKTA(e.target.value)}
              className="w-full bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5 text-xs text-neutral-800 focus:outline-hidden"
            >
              <option value="all">Semua Status KTA</option>
              <option value="Aktif">Aktif</option>
              <option value="Pending">Pending / Verifikasi</option>
              <option value="Non-Aktif">Non-Aktif</option>
            </select>
          </div>

          {/* Batas Pensiun */}
          <div>
            <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">
              Status Purna Tugas (60 Th)
            </label>
            <select
              aria-label="Filter Status Purna Tugas"
              value={filterStatusPensiun}
              onChange={(e) => setFilterStatusPensiun(e.target.value)}
              className="w-full bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5 text-xs text-neutral-800 focus:outline-hidden"
            >
              <option value="all">Semua Usia</option>
              <option value="kritis">Mendekati Pensiun (&lt; 1 Thn)</option>
              <option value="purna">Sudah Genap 60 Thn</option>
            </select>
          </div>
        </div>
      </div>

      {/* Total Found Indicator */}
      <div className="flex items-center justify-between text-xs text-neutral-500 px-1">
        <span>
          Menampilkan <strong className="text-neutral-900 font-semibold">{filteredList.length}</strong> dari{' '}
          {visibleMembers.length} perangkat desa
        </span>
        <span className="text-[11px]">Format No. KTA: 32.04.[KodeKec].[KodeDesa].[NoUrut]</span>
      </div>

      {/* Main High-Density Table */}
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold">
                <th className="py-3 px-4 w-12 text-center">No</th>
                <th className="py-3 px-4">Profil & NIK</th>
                <th className="py-3 px-4">Wilayah Tugas</th>
                <th className="py-3 px-4">Jabatan & SK</th>
                <th className="py-3 px-4">No. KTA PPDI</th>
                <th className="py-3 px-4">Usia & Pensiun</th>
                <th className="py-3 px-4 text-center">Status KTA</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-neutral-800">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-neutral-400">
                    <p className="font-medium text-neutral-600">Tidak ada data perangkat desa yang sesuai</p>
                    <p className="text-xs mt-1">Coba sesuaikan kata kunci pencarian atau reset filter wilayah</p>
                  </td>
                </tr>
              ) : (
                filteredList.map((item, idx) => {
                  const hasFullName = (
                    (item.anggota.gelar_depan ? `${item.anggota.gelar_depan} ` : '') +
                    item.anggota.nama_lengkap +
                    (item.anggota.gelar_belakang ? `, ${item.anggota.gelar_belakang}` : '')
                  ).toUpperCase();

                  return (
                    <tr key={item.anggota.id_anggota} className="hover:bg-neutral-50/70 transition-colors">
                      {/* No */}
                      <td className="py-2.5 px-4 text-center font-mono text-neutral-400 tabular-nums">
                        {idx + 1}
                      </td>

                      {/* Profil & NIK */}
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={getPhotoUrl(item.anggota.foto)}
                            alt={item.anggota.nama_lengkap.toUpperCase()}
                            className="w-8 h-8 rounded-full object-cover shrink-0 border border-neutral-200"
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <div className="font-semibold text-neutral-900 hover:text-emerald-800 cursor-pointer uppercase tracking-tight" onClick={() => onOpenDetailModal(item)}>
                              {hasFullName}
                            </div>
                            <div className="text-[11px] text-neutral-500 font-mono flex items-center gap-1.5">
                              <span>NIK: {item.anggota.nik}</span>
                              {item.anggota.nipd && (
                                <>
                                  <span>·</span>
                                  <span>NIAP: {item.anggota.nipd}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Wilayah Tugas */}
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-neutral-900">
                          Desa {item.desa?.nama_desa || '-'}
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          Kec. {item.kecamatan?.nama_kecamatan || '-'}
                        </div>
                      </td>

                      {/* Jabatan & SK */}
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-neutral-800">
                          {item.jabatanRef?.nama_jabatan || '-'}
                        </div>
                        <div className="text-[11px] text-neutral-500 font-mono">
                          {item.jabatanTerkini?.no_sk_pengangkatan ? (
                            <span>SK: {item.jabatanTerkini.no_sk_pengangkatan}</span>
                          ) : (
                            <span>Belum ada SK terinput</span>
                          )}
                        </div>
                      </td>

                      {/* No KTA PPDI */}
                      <td className="py-2.5 px-4 font-mono text-[11px]">
                        {item.keanggotaan?.no_kta ? (
                          <div className="font-medium text-neutral-900">{item.keanggotaan.no_kta}</div>
                        ) : (
                          <span className="text-neutral-400">Belum Terbit</span>
                        )}
                        <div className="text-neutral-500 text-[10px]">
                          {item.keanggotaan?.jabatan_pengurus || 'Anggota Biasa'}
                        </div>
                      </td>

                      {/* Usia & Pensiun */}
                      <td className="py-2.5 px-4">
                        <div className="tabular-nums font-medium text-neutral-900">
                          {item.usia} Thn{' '}
                          <span className="text-neutral-400 text-[11px]">
                            ({formatDateIndo(item.anggota.tanggal_lahir)})
                          </span>
                        </div>
                        <div className="text-[11px] mt-0.5">
                          {item.statusPensiun === 'Kritis (<6 Bln)' ? (
                            <span className="text-red-700 font-semibold flex items-center gap-1">
                              <ClockAlert className="w-3 h-3" />
                              Pensiun &lt;6 Bulan
                            </span>
                          ) : item.statusPensiun === 'Siaga (<1 Thn)' ? (
                            <span className="text-amber-700 font-semibold flex items-center gap-1">
                              <ClockAlert className="w-3 h-3" />
                              Pensiun &lt;1 Tahun
                            </span>
                          ) : item.statusPensiun === 'Sudah Purna Tugas' ? (
                            <span className="text-neutral-500 font-medium">Purna Tugas (60 Th)</span>
                          ) : (
                            <span className="text-neutral-500">Sisa {item.sisaMasaPensiunTahun} Thn</span>
                          )}
                        </div>
                      </td>

                      {/* Status KTA */}
                      <td className="py-2.5 px-4 text-center">
                        {item.keanggotaan?.status_kta === 'Aktif' ? (
                          <span className="inline-block px-2 py-0.5 rounded-sm text-[11px] font-semibold bg-emerald-50 text-emerald-800">
                            Aktif
                          </span>
                        ) : item.keanggotaan?.status_kta === 'Pending' ? (
                          <span className="inline-block px-2 py-0.5 rounded-sm text-[11px] font-semibold bg-amber-50 text-amber-800">
                            Pending
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-sm text-[11px] font-semibold bg-neutral-100 text-neutral-600">
                            Non-Aktif
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => onOpenDetailModal(item)}
                            title="Detail Profil & Riwayat"
                            className="p-1 text-neutral-500 hover:text-emerald-700 hover:bg-neutral-100 rounded-md transition-colors cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onSelectForKTA(item)}
                            title="Cetak E-KTA Digital"
                            className="p-1 text-neutral-500 hover:text-emerald-700 hover:bg-neutral-100 rounded-md transition-colors cursor-pointer"
                          >
                            <CreditCard className="w-4 h-4" />
                          </button>
                          {currentUser.role !== 'Anggota' && (
                            <>
                              <button
                                onClick={() => onOpenEditModal(item)}
                                title="Edit Data"
                                className="p-1 text-neutral-500 hover:text-blue-700 hover:bg-neutral-100 rounded-md transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setMemberToDelete(item)}
                                title={`Hapus data ${item.anggota.nama_lengkap}`}
                                className="p-1 text-neutral-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4 text-red-600" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL KONFIRMASI HAPUS ANGGOTA (REPLACE NATIVE WINDOW.CONFIRM) */}
      {memberToDelete && (
        <div className="fixed inset-0 z-50 bg-[#111113]/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-neutral-200 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-neutral-100 flex items-start gap-3 bg-red-50/70">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0 text-red-600">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-neutral-900">
                  Konfirmasi Hapus Data Perangkat Desa
                </h3>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Tindakan ini akan menghapus data dari database server MySQL
                </p>
              </div>
              <button
                onClick={() => !isDeleting && setMemberToDelete(null)}
                className="text-neutral-400 hover:text-neutral-600 p-1 cursor-pointer rounded-lg"
                disabled={isDeleting}
                title="Tutup Modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs">
              {/* Member Card Preview */}
              <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/70 flex items-center gap-3">
                <img
                  src={getPhotoUrl(memberToDelete.anggota.foto)}
                  alt={memberToDelete.anggota.nama_lengkap}
                  className="w-12 h-12 rounded-full object-cover border border-neutral-300 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-neutral-900 truncate">
                    {(memberToDelete.anggota.gelar_depan ? `${memberToDelete.anggota.gelar_depan} ` : '') +
                      memberToDelete.anggota.nama_lengkap +
                      (memberToDelete.anggota.gelar_belakang ? `, ${memberToDelete.anggota.gelar_belakang}` : '')}
                  </h4>
                  <div className="text-[11px] font-mono text-neutral-600 mt-0.5">
                    NIK: <strong className="text-neutral-900">{memberToDelete.anggota.nik}</strong>
                  </div>
                  <div className="text-[10px] text-neutral-500 truncate mt-0.5">
                    {memberToDelete.jabatanRef?.nama_jabatan} · Desa {memberToDelete.desa?.nama_desa}
                  </div>
                </div>
              </div>

              {/* Warning Card */}
              <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-xl text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-900 text-[11px] uppercase tracking-wider">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                  <span>Peringatan Penghapusan Permanen</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Seluruh data relasional meliputi rekam jejak jabatan, nomor KTA Digital, dan arsip iuran anggota ini akan dihapus dari sistem.
                </p>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setMemberToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Ya, Hapus Anggota</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel Import Modal */}
      <ExcelImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => {
          setToastMessage({
            type: 'success',
            text: 'Data anggota perangkat desa dari Excel berhasil diimpor & E-KTA siap dicetak!',
          });
        }}
      />
    </div>
  );
};
