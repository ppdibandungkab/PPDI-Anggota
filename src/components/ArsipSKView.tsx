import React, { useState, useMemo, useEffect } from 'react';
import { usePPDI } from '../context/PPDIContext';
import { RiwayatJabatan, AnggotaFullDetail } from '../types/ppdi';
import { formatDateIndo, safeFetchJson } from '../utils/ppdiHelpers';
import {
  FileText,
  Search,
  Upload,
  Eye,
  Download,
  Building,
  CheckCircle,
  X,
  FileCheck,
  FolderArchive,
  HardDrive,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

export const ArsipSKView: React.FC = () => {
  const { fullMembers, riwayatList, kecamatanList, desaList, jabatanList, addRiwayatJabatan } = usePPDI();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterKec, setFilterKec] = useState('all');
  const [selectedSkDoc, setSelectedSkDoc] = useState<{
    riwayat: RiwayatJabatan;
    member?: AnggotaFullDetail;
  } | null>(null);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadMemberId, setUploadMemberId] = useState(fullMembers[0]?.anggota.id_anggota || '');
  const [uploadDesaId, setUploadDesaId] = useState(desaList[0]?.id_desa || '');
  const [uploadJabatanId, setUploadJabatanId] = useState(jabatanList[0]?.id_jabatan || 2);
  const [uploadNoSk, setUploadNoSk] = useState('');
  const [uploadTglSk, setUploadTglSk] = useState('2026-03-01');
  const [uploadTmt, setUploadTmt] = useState('2026-03-15');
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadFileData, setUploadFileData] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Folder server status
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderData, setFolderData] = useState<{
    success: boolean;
    folders: { fotoDir: string; skDir: string };
    foto: { count: number; files: Array<{ name: string; url: string; sizeBytes: number; mtime: string }> };
    sk: { count: number; files: Array<{ name: string; url: string; sizeBytes: number; mtime: string }> };
  } | null>(null);
  const [loadingFolderData, setLoadingFolderData] = useState(false);

  const fetchFolderData = async () => {
    try {
      setLoadingFolderData(true);
      const res = await safeFetchJson('/api/uploads/list');
      if (res.ok && res.data?.success) {
        setFolderData(res.data);
      }
    } catch (err) {
      console.warn('Gagal membaca daftar uploads folder:', err);
    } finally {
      setLoadingFolderData(false);
    }
  };

  useEffect(() => {
    if (showFolderModal) {
      fetchFolderData();
    }
  }, [showFolderModal]);

  // Combined documents list
  const skDocuments = useMemo(() => {
    return riwayatList.map((rw) => {
      const member = fullMembers.find((m) => m.anggota.id_anggota === rw.id_anggota);
      const desa = desaList.find((d) => d.id_desa === rw.id_desa);
      const kec = desa ? kecamatanList.find((k) => k.id_kecamatan === desa.id_kecamatan) : undefined;
      const jabatan = jabatanList.find((j) => j.id_jabatan === rw.id_jabatan);

      return {
        riwayat: rw,
        member,
        desa,
        kecamatan: kec,
        jabatan,
      };
    });
  }, [riwayatList, fullMembers, desaList, kecamatanList, jabatanList]);

  const filteredDocs = useMemo(() => {
    return skDocuments.filter((doc) => {
      if (filterKec !== 'all' && doc.kecamatan?.id_kecamatan !== filterKec) {
        return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchSk = doc.riwayat.no_sk_pengangkatan.toLowerCase().includes(q);
        const matchName = doc.member?.anggota.nama_lengkap.toLowerCase().includes(q);
        const matchDesa = doc.desa?.nama_desa.toLowerCase().includes(q);
        if (!matchSk && !matchName && !matchDesa) return false;
      }
      return true;
    });
  }, [skDocuments, filterKec, searchQuery]);

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadNoSk.trim()) return;

    let targetFileUrl = uploadFileName || `SK_${uploadNoSk.replace(/\//g, '_')}.pdf`;

    // If actual file data is loaded, send to /api/upload to write in /uploads/sk/
    if (uploadFileData) {
      try {
        setIsUploading(true);
        const res = await safeFetchJson('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'sk',
            fileName: uploadFileName,
            fileData: uploadFileData,
          }),
        });
        const json = res.data;
        if (res.ok && json?.success && json.url) {
          targetFileUrl = json.url;
        }
      } catch (err) {
        console.warn('Gagal upload fisik ke server, simpan metadata:', err);
      } finally {
        setIsUploading(false);
      }
    }

    addRiwayatJabatan({
      id_anggota: uploadMemberId,
      id_desa: uploadDesaId,
      id_jabatan: Number(uploadJabatanId),
      no_sk_pengangkatan: uploadNoSk,
      tgl_sk_pengangkatan: uploadTglSk,
      tmt_jabatan: uploadTmt,
      status_aktif: 'Aktif',
      file_sk: targetFileUrl,
      keterangan: 'Arsip Surat Keputusan digital baru',
    });

    setShowUploadModal(false);
    setUploadNoSk('');
    setUploadFileName('');
    setUploadFileData('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-neutral-200 gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 tracking-tight">
            e-Arsip Berkas Surat Keputusan (SK)
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Penyimpanan digital SK Pengangkatan & Pemberhentian perangkat desa PPDI Kab. Bandung
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Server Folder Inspector Button */}
          <button
            onClick={() => setShowFolderModal(true)}
            className="px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
            title="Periksa folder upload foto dan SK fisik di server"
          >
            <FolderArchive className="w-4 h-4 text-emerald-700" />
            <span>Folder Server (/uploads)</span>
          </button>

          <button
            onClick={() => setShowUploadModal(true)}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#064E3B] hover:bg-[#043d2e] rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
          >
            <Upload className="w-4 h-4" />
            <span>Upload SK Baru</span>
          </button>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="bg-white p-3 rounded-xl border border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari Nomor SK, Nama Perangkat Desa, atau Desa..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-900 focus:outline-hidden focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-neutral-500 font-medium whitespace-nowrap">Filter Kecamatan:</label>
          <select
            aria-label="Filter Kecamatan untuk e-Arsip"
            value={filterKec}
            onChange={(e) => setFilterKec(e.target.value)}
            className="bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-xs text-neutral-800 focus:outline-hidden"
          >
            <option value="all">Semua Kecamatan ({kecamatanList.length})</option>
            {kecamatanList.map((k) => (
              <option key={k.id_kecamatan} value={k.id_kecamatan}>
                Kec. {k.nama_kecamatan}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Documents Table */}
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold">
                <th className="py-3 px-4">Nomor SK Pengangkatan</th>
                <th className="py-3 px-4">Nama Perangkat Desa</th>
                <th className="py-3 px-4">Jabatan Formasi</th>
                <th className="py-3 px-4">Wilayah Kerja</th>
                <th className="py-3 px-4">Tanggal SK & TMT</th>
                <th className="py-3 px-4 text-center">Status SK</th>
                <th className="py-3 px-4 text-right">Aksi Pratinjau</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-neutral-800">
              {filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-neutral-400">
                    Tidak ada arsip berkas SK yang cocok dengan pencarian
                  </td>
                </tr>
              ) : (
                filteredDocs.map((doc) => (
                  <tr key={doc.riwayat.id_riwayat} className="hover:bg-neutral-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-neutral-900">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-700 shrink-0" />
                        <span>{doc.riwayat.no_sk_pengangkatan}</span>
                      </div>
                      <div className="text-[10px] text-neutral-400 font-sans mt-0.5">
                        File: {doc.riwayat.file_sk || 'SK_DOKUMEN_RESMI.pdf'}
                      </div>
                    </td>

                    <td className="py-3 px-4 font-semibold text-neutral-900 uppercase tracking-tight">
                      {doc.member?.anggota.nama_lengkap ? doc.member.anggota.nama_lengkap.toUpperCase() : '-'}
                      <div className="text-[11px] font-mono font-normal text-neutral-500">
                        NIK: {doc.member?.anggota.nik}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-medium text-neutral-900">{doc.jabatan?.nama_jabatan}</div>
                      <div className="text-[11px] text-neutral-500">
                        Kategori: {doc.jabatan?.kategori_jabatan}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div>Desa {doc.desa?.nama_desa}</div>
                      <div className="text-[11px] text-neutral-500">
                        Kec. {doc.kecamatan?.nama_kecamatan}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div>SK: {formatDateIndo(doc.riwayat.tgl_sk_pengangkatan)}</div>
                      <div className="text-[11px] text-neutral-500">
                        TMT: {formatDateIndo(doc.riwayat.tmt_jabatan)}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-sm font-semibold text-[10px] ${
                          doc.riwayat.status_aktif === 'Aktif'
                            ? 'bg-emerald-50 text-emerald-800'
                            : doc.riwayat.status_aktif === 'Purna Tugas'
                            ? 'bg-neutral-100 text-neutral-600'
                            : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {doc.riwayat.status_aktif}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setSelectedSkDoc({ riwayat: doc.riwayat, member: doc.member })}
                        className="px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors cursor-pointer inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Buka Berkas</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Document Viewer Modal */}
      {selectedSkDoc && (
        <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col my-6 border border-neutral-200">
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50 rounded-t-xl">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-emerald-700" />
                <div>
                  <h3 className="font-bold text-neutral-900 text-xs">
                    Pratinjau Dokumen SK Digital
                  </h3>
                  <div className="text-[10px] font-mono text-neutral-500">
                    {selectedSkDoc.riwayat.no_sk_pengangkatan}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedSkDoc(null)}
                className="p-1 text-neutral-400 hover:text-neutral-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Document Body */}
            <div className="p-8 overflow-y-auto font-serif text-neutral-900 space-y-4 bg-neutral-50/50">
              <div className="bg-white p-8 rounded-lg shadow-sm border border-neutral-300 space-y-4 text-xs">
                {/* Kop Surat */}
                <div className="text-center pb-3 border-b-2 border-neutral-800 space-y-1">
                  <div className="font-bold text-sm tracking-wider">PEMERINTAH KABUPATEN BANDUNG</div>
                  <div className="font-bold text-base tracking-wider uppercase">
                    KECAMATAN {selectedSkDoc.member?.kecamatan?.nama_kecamatan || 'SOREANG'}
                  </div>
                  <div className="font-bold text-sm uppercase">
                    KANTOR KEPALA DESA {selectedSkDoc.member?.desa?.nama_desa || 'PAMEKARAN'}
                  </div>
                  <div className="text-[10px] font-sans text-neutral-500">
                    {selectedSkDoc.member?.desa?.alamat_kantor_desa}
                  </div>
                </div>

                {/* Judul SK */}
                <div className="text-center space-y-1 pt-2">
                  <div className="font-bold underline text-xs">KEPUTUSAN KEPALA DESA</div>
                  <div className="font-mono text-[11px]">
                    NOMOR: {selectedSkDoc.riwayat.no_sk_pengangkatan}
                  </div>
                  <div className="text-[10px] italic font-sans">TENTANG</div>
                  <div className="font-bold text-xs uppercase">
                    PENGANGKATAN PERANGKAT DESA {selectedSkDoc.member?.desa?.nama_desa}
                  </div>
                </div>

                {/* Isi Konsideran */}
                <div className="space-y-2 font-sans text-[11px] pt-2 text-justify leading-relaxed">
                  <p>
                    <strong>Menimbang:</strong> bahwa untuk kelancaran penyelenggaraan pemerintahan desa, pembangunan, pembinaan kemasyarakatan, dan pemberdayaan masyarakat desa, dipandang perlu mengangkat Perangkat Desa yang memenuhi syarat.
                  </p>
                  <p>
                    <strong>Mengingat:</strong> Undang-Undang Nomor 6 Tahun 2014 tentang Desa sebagaimana telah diubah dengan Undang-Undang Nomor 3 Tahun 2024; Peraturan Menteri Dalam Negeri Nomor 83 Tahun 2015 tentang Pengangkatan dan Pemberhentian Perangkat Desa.
                  </p>
                  <p>
                    <strong>MEMUTUSKAN:</strong>
                  </p>
                  <p>
                    <strong>KESATU:</strong> Mengangkat Saudara/i <strong className="uppercase">{selectedSkDoc.member?.anggota.nama_lengkap.toUpperCase()}</strong>, NIK: <span className="font-mono">{selectedSkDoc.member?.anggota.nik}</span>, sebagai <strong>{selectedSkDoc.member?.jabatanRef?.nama_jabatan}</strong> pada Pemerintah Desa {selectedSkDoc.member?.desa?.nama_desa}.
                  </p>
                  <p>
                    <strong>KEDUA:</strong> Keputusan ini mulai berlaku sejak Terhitung Mulai Tanggal (TMT) <strong>{formatDateIndo(selectedSkDoc.riwayat.tmt_jabatan)}</strong> sampai dengan yang bersangkutan mencapai batas usia 60 (enam puluh) tahun.
                  </p>
                </div>

                {/* Tanda Tangan */}
                <div className="pt-6 flex justify-end font-sans text-xs">
                  <div className="text-center space-y-1">
                    <div>Ditetapkan di: {selectedSkDoc.member?.desa?.nama_desa}</div>
                    <div>Pada tanggal: {formatDateIndo(selectedSkDoc.riwayat.tgl_sk_pengangkatan)}</div>
                    <div className="font-bold pt-8">KEPALA DESA {selectedSkDoc.member?.desa?.nama_desa}</div>
                    <div className="text-[9px] text-neutral-400 font-mono">[Cap Stempel Resmi & TTD]</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-neutral-200 flex flex-wrap justify-between items-center gap-3 bg-white rounded-b-xl">
              <span className="text-[11px] text-emerald-800 font-semibold flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>Arsip Tersimpan di Database & Folder Server</span>
              </span>

              <div className="flex items-center gap-2">
                {selectedSkDoc.riwayat.file_sk && (
                  <a
                    href={
                      selectedSkDoc.riwayat.file_sk.startsWith('/') ||
                      selectedSkDoc.riwayat.file_sk.startsWith('http') ||
                      selectedSkDoc.riwayat.file_sk.startsWith('data:')
                        ? selectedSkDoc.riwayat.file_sk
                        : `/uploads/sk/${selectedSkDoc.riwayat.file_sk}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-[#064E3B] hover:bg-[#043d2e] rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Buka / Unduh File Asli</span>
                  </a>
                )}
                <button
                  onClick={() => setSelectedSkDoc(null)}
                  className="px-4 py-1.5 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload New SK Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-neutral-200 space-y-4 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
              <div>
                <h3 className="font-bold text-neutral-900 text-sm">Upload Berkas SK Baru</h3>
                <p className="text-[11px] text-neutral-500">
                  Berkas fisik akan otomatis disimpan ke folder server <code className="text-emerald-700 font-mono font-bold">/uploads/sk/</code>
                </p>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-1 text-neutral-400 hover:text-neutral-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-3">
              <div>
                <label className="block text-neutral-700 font-medium mb-1">Pilih Perangkat Desa</label>
                <select
                  value={uploadMemberId}
                  onChange={(e) => setUploadMemberId(e.target.value)}
                  className="w-full p-2 border border-neutral-300 rounded-lg bg-white"
                >
                  {fullMembers.map((m) => (
                    <option key={m.anggota.id_anggota} value={m.anggota.id_anggota}>
                      {m.anggota.nama_lengkap.toUpperCase()} (Desa {m.desa?.nama_desa})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-neutral-700 font-medium mb-1">Desa Tugas</label>
                <select
                  value={uploadDesaId}
                  onChange={(e) => setUploadDesaId(e.target.value)}
                  className="w-full p-2 border border-neutral-300 rounded-lg bg-white"
                >
                  {desaList.map((d) => (
                    <option key={d.id_desa} value={d.id_desa}>
                      Desa {d.nama_desa}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-neutral-700 font-medium mb-1">Jabatan Formasi</label>
                <select
                  value={uploadJabatanId}
                  onChange={(e) => setUploadJabatanId(Number(e.target.value))}
                  className="w-full p-2 border border-neutral-300 rounded-lg bg-white"
                >
                  {jabatanList.map((j) => (
                    <option key={j.id_jabatan} value={j.id_jabatan}>
                      {j.nama_jabatan}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-neutral-700 font-medium mb-1">Nomor Surat Keputusan (SK)</label>
                <input
                  type="text"
                  placeholder="141.1/Kep.45-Desa/2026"
                  value={uploadNoSk}
                  onChange={(e) => setUploadNoSk(e.target.value)}
                  className="w-full p-2 border border-neutral-300 rounded-lg font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Tanggal SK</label>
                  <input
                    type="date"
                    value={uploadTglSk}
                    onChange={(e) => setUploadTglSk(e.target.value)}
                    className="w-full p-2 border border-neutral-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-neutral-700 font-medium mb-1">TMT Jabatan</label>
                  <input
                    type="date"
                    value={uploadTmt}
                    onChange={(e) => setUploadTmt(e.target.value)}
                    className="w-full p-2 border border-neutral-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-neutral-700 font-medium mb-1">Pilih File PDF / Scan Dokumen</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setUploadFileName(f.name);
                      const reader = new FileReader();
                      reader.onload = () => {
                        setUploadFileData(reader.result as string);
                      };
                      reader.readAsDataURL(f);
                    }
                  }}
                  className="w-full p-2 border border-dashed border-neutral-300 rounded-lg bg-neutral-50 text-xs"
                />
                {uploadFileName && (
                  <div className="mt-1 text-[11px] font-mono text-emerald-800 flex items-center gap-1">
                    <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>File siap diunggah ke: <strong className="text-emerald-700">/uploads/sk/{uploadFileName}</strong></span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-3 py-1.5 bg-neutral-100 text-neutral-700 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-4 py-1.5 bg-[#064E3B] hover:bg-[#043d2e] disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan ke Server...</span>
                    </>
                  ) : (
                    <span>Simpan ke /uploads/sk/ & Database</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Server Folder Inspector Modal */}
      {showFolderModal && (
        <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col my-6 border border-neutral-200 text-xs">
            {/* Header */}
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50 rounded-t-xl">
              <div className="flex items-center gap-2.5">
                <HardDrive className="w-5 h-5 text-emerald-800" />
                <div>
                  <h3 className="font-bold text-neutral-900 text-sm">
                    Manajemen Folder Unggahan Server (/uploads)
                  </h3>
                  <p className="text-[11px] text-neutral-500 font-mono">
                    Lokasi Fisik: public/uploads/foto & public/uploads/sk
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchFolderData}
                  disabled={loadingFolderData}
                  className="p-1.5 text-neutral-600 hover:text-emerald-800 hover:bg-neutral-200/50 rounded-lg transition-colors cursor-pointer"
                  title="Segarkan daftar file"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingFolderData ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => setShowFolderModal(false)}
                  className="p-1 text-neutral-400 hover:text-neutral-700 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-800 block">
                      Folder Pasfoto
                    </span>
                    <span className="text-base font-mono font-bold text-neutral-900 block mt-0.5">
                      /uploads/foto/
                    </span>
                    <span className="text-xs text-neutral-600 mt-1 block">
                      Total Berkas: <strong>{folderData?.foto.count ?? 0} file</strong>
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-800 font-bold font-mono">
                    IMG
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/50 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-blue-800 block">
                      Folder Berkas SK
                    </span>
                    <span className="text-base font-mono font-bold text-neutral-900 block mt-0.5">
                      /uploads/sk/
                    </span>
                    <span className="text-xs text-neutral-600 mt-1 block">
                      Total Berkas: <strong>{folderData?.sk.count ?? 0} file</strong>
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-800 font-bold font-mono">
                    PDF
                  </div>
                </div>
              </div>

              {/* Files in /uploads/sk */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-neutral-900 text-xs flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-emerald-700" />
                    <span>Daftar Berkas Dokumen SK (/uploads/sk/)</span>
                  </h4>
                  <span className="text-[11px] font-mono text-neutral-400">
                    {folderData?.sk.count ?? 0} berkas
                  </span>
                </div>

                {folderData?.sk.files.length === 0 ? (
                  <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg text-center text-neutral-500">
                    Belum ada berkas SK fisik di folder server. Silakan upload melalui tombol di atas atau Form Anggota.
                  </div>
                ) : (
                  <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-200 overflow-hidden max-h-48 overflow-y-auto">
                    {folderData?.sk.files.map((file) => (
                      <div key={file.name} className="p-2.5 flex items-center justify-between hover:bg-neutral-50 transition-colors">
                        <div className="truncate pr-3">
                          <span className="font-mono text-neutral-900 font-medium block truncate">
                            {file.name}
                          </span>
                          <span className="text-[10px] font-mono text-neutral-400">
                            Ukuran: {(file.sizeBytes / 1024).toFixed(1)} KB · URL: {file.url}
                          </span>
                        </div>
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md shrink-0 flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Buka</span>
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Files in /uploads/foto */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-neutral-900 text-xs flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-700" />
                    <span>Daftar Pasfoto Anggota (/uploads/foto/)</span>
                  </h4>
                  <span className="text-[11px] font-mono text-neutral-400">
                    {folderData?.foto.count ?? 0} berkas
                  </span>
                </div>

                {folderData?.foto.files.length === 0 ? (
                  <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg text-center text-neutral-500">
                    Belum ada pasfoto di folder server. Pasfoto baru yang diunggah akan otomatis tersimpan di sini.
                  </div>
                ) : (
                  <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-200 overflow-hidden max-h-48 overflow-y-auto">
                    {folderData?.foto.files.map((file) => (
                      <div key={file.name} className="p-2.5 flex items-center justify-between hover:bg-neutral-50 transition-colors">
                        <div className="flex items-center gap-3 truncate pr-3">
                          <img src={file.url} alt={file.name} className="w-8 h-8 rounded-full object-cover border border-neutral-200 shrink-0" />
                          <div className="truncate">
                            <span className="font-mono text-neutral-900 font-medium block truncate">
                              {file.name}
                            </span>
                            <span className="text-[10px] font-mono text-neutral-400">
                              Ukuran: {(file.sizeBytes / 1024).toFixed(1)} KB · URL: {file.url}
                            </span>
                          </div>
                        </div>
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md shrink-0 flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Lihat</span>
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-neutral-200 flex justify-end bg-neutral-50 rounded-b-xl">
              <button
                onClick={() => setShowFolderModal(false)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-900 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Tutup Manajemen Folder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
