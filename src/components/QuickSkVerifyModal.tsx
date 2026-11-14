import React, { useMemo, useState } from 'react';
import { usePPDI } from '../context/PPDIContext';
import { StatusAktifJabatan } from '../types/ppdi';
import { formatDateIndo, safeFetchJson } from '../utils/ppdiHelpers';
import {
  AlertCircle,
  CheckCircle,
  ClockAlert,
  Download,
  Eye,
  FileCheck,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  X,
  XCircle,
} from 'lucide-react';

interface QuickSkVerifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotify?: (message: string) => void;
}

const isRealUploadedSk = (fileSk?: string | null): boolean => {
  const raw = (fileSk || '').trim();
  if (!raw) return false;
  return raw.startsWith('/uploads/') || raw.startsWith('data:') || /^https?:\/\//i.test(raw);
};

export const QuickSkVerifyModal: React.FC<QuickSkVerifyModalProps> = ({
  isOpen,
  onClose,
  onNotify,
}) => {
  const {
    visibleMembers,
    riwayatList,
    desaList,
    kecamatanList,
    jabatanList,
    visiblePendaftaran,
    updateRiwayatJabatan,
    updateRiwayatStatus,
    approvePendaftaran,
    rejectPendaftaran,
    hasPermission,
  } = usePPDI();

  const [activeSubTab, setActiveSubTab] = useState<'riwayat' | 'pendaftaran'>('riwayat');
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadFilter, setUploadFilter] = useState<'all' | 'missing' | 'uploaded'>('all');
  const [busyId, setBusyId] = useState<string | number | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ title: string; url: string } | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const memberMap = useMemo(() => {
    const map = new Map<string, (typeof visibleMembers)[number]>();
    visibleMembers.forEach((m) => map.set(m.anggota.id_anggota, m));
    return map;
  }, [visibleMembers]);

  const scopedRiwayatItems = useMemo(() => {
    return riwayatList
      .filter((rw) => memberMap.has(rw.id_anggota))
      .map((rw) => {
        const member = memberMap.get(rw.id_anggota)!;
        const desa = desaList.find((d) => d.id_desa === rw.id_desa) || member.desa;
        const kec = desa
          ? kecamatanList.find((k) => k.id_kecamatan === desa.id_kecamatan) || member.kecamatan
          : member.kecamatan;
        const jabatan = jabatanList.find((j) => j.id_jabatan === rw.id_jabatan) || member.jabatanRef;
        const hasUploaded = isRealUploadedSk(rw.file_sk);
        return { rw, member, desa, kec, jabatan, hasUploaded };
      });
  }, [riwayatList, memberMap, desaList, kecamatanList, jabatanList]);

  const filteredRiwayat = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return scopedRiwayatItems.filter((item) => {
      if (uploadFilter === 'missing' && item.hasUploaded) return false;
      if (uploadFilter === 'uploaded' && !item.hasUploaded) return false;
      if (q) {
        const matchName = item.member.anggota.nama_lengkap.toLowerCase().includes(q);
        const matchNik = item.member.anggota.nik.toLowerCase().includes(q);
        const matchSk = (item.rw.no_sk_pengangkatan || '').toLowerCase().includes(q);
        const matchDesa = (item.desa?.nama_desa || '').toLowerCase().includes(q);
        if (!matchName && !matchNik && !matchSk && !matchDesa) return false;
      }
      return true;
    });
  }, [scopedRiwayatItems, uploadFilter, searchQuery]);

  const pendingRegistrations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (visiblePendaftaran || [])
      .filter((p) => p.status_approval === 'Menunggu')
      .filter((p) => {
        if (!q) return true;
        return (
          p.nama_lengkap.toLowerCase().includes(q) ||
          p.nik.toLowerCase().includes(q) ||
          (p.no_sk_pengangkatan || '').toLowerCase().includes(q) ||
          (p.nama_desa || '').toLowerCase().includes(q)
        );
      });
  }, [visiblePendaftaran, searchQuery]);

  if (!isOpen) return null;

  const missingUploadCount = scopedRiwayatItems.filter((i) => !i.hasUploaded).length;
  const uploadedCount = scopedRiwayatItems.filter((i) => i.hasUploaded).length;
  const totalPendingReg = (visiblePendaftaran || []).filter(
    (p) => p.status_approval === 'Menunggu'
  ).length;

  const canEditMember = hasPermission('anggota', 'edit') || hasPermission('arsip', 'edit');
  const canApproveReg = hasPermission('pendaftaran', 'edit');

  const handleUploadRowSk = async (
    idRiwayat: string,
    nik: string,
    nama: string,
    file: File
  ) => {
    setFeedback(null);
    setBusyId(idRiwayat);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Gagal membaca berkas SK.'));
        reader.readAsDataURL(file);
      });

      let savedUrl = dataUrl;
      try {
        const res = await safeFetchJson('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'sk',
            fileName: file.name,
            fileData: dataUrl,
            nik,
          }),
        });
        if (res.ok && res.data?.success && res.data.url) {
          savedUrl = res.data.url;
        }
      } catch {
        // fallback ke data URL
      }

      await updateRiwayatJabatan(idRiwayat, { file_sk: savedUrl });
      const msg = `Berkas SK untuk ${nama} berhasil diunggah & terverifikasi.`;
      setFeedback({ type: 'success', text: msg });
      onNotify?.(msg);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Gagal mengunggah berkas SK.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleStatusChange = async (
    idRiwayat: string,
    nama: string,
    nextStatus: StatusAktifJabatan
  ) => {
    setFeedback(null);
    setBusyId(idRiwayat);
    try {
      await updateRiwayatStatus(idRiwayat, nextStatus);
      const msg = `Status SK jabatan ${nama} diperbarui menjadi ${nextStatus}.`;
      setFeedback({ type: 'success', text: msg });
      onNotify?.(msg);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Gagal memperbarui status SK jabatan.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleApproveReg = async (idPendaftaran: number, nama: string) => {
    setFeedback(null);
    setBusyId(`reg-${idPendaftaran}`);
    try {
      const res = await approvePendaftaran(idPendaftaran);
      const msg =
        res.message ||
        `SK & pendaftaran ${nama} disetujui. E-KTA ${res.no_kta || ''} berhasil diterbitkan.`;
      setFeedback({ type: 'success', text: msg });
      onNotify?.(msg);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Gagal menyetujui pendaftaran SK.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleRejectReg = async (idPendaftaran: number, nama: string) => {
    setFeedback(null);
    setBusyId(`reg-${idPendaftaran}`);
    try {
      await rejectPendaftaran(
        idPendaftaran,
        rejectReason.trim() || 'Berkas SK belum sesuai ketentuan.'
      );
      const msg = `Pengajuan SK ${nama} ditolak dengan catatan perbaikan.`;
      setFeedback({ type: 'success', text: msg });
      setRejectingId(null);
      setRejectReason('');
      onNotify?.(msg);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Gagal menolak pengajuan.',
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#111113]/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-neutral-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-[#064E3B] text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">
                Verifikasi Cepat Berkas Surat Keputusan (SK)
              </h3>
              <p className="text-[11px] text-emerald-100 mt-0.5">
                Periksa, unggah file asli, dan verifikasi status SK jabatan maupun antrean pendaftaran langsung dari Dashboard
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/75 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs & Search Toolbar */}
        <div className="px-5 pt-3 pb-3 border-b border-neutral-200 bg-neutral-50 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex bg-neutral-200/70 p-1 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => setActiveSubTab('riwayat')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeSubTab === 'riwayat'
                    ? 'bg-white text-emerald-950 shadow-2xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <FileCheck className="w-3.5 h-3.5 text-emerald-700" />
                <span>SK Jabatan Anggota</span>
                <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-900 font-mono text-[10px]">
                  {uploadedCount}/{scopedRiwayatItems.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSubTab('pendaftaran')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeSubTab === 'pendaftaran'
                    ? 'bg-white text-emerald-950 shadow-2xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <ClockAlert className="w-3.5 h-3.5 text-amber-600" />
                <span>Antrean SK Pendaftaran</span>
                {totalPendingReg > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white font-mono text-[10px] font-bold">
                    {totalPendingReg}
                  </span>
                )}
              </button>
            </div>

            {activeSubTab === 'riwayat' && (
              <div className="flex items-center gap-1.5">
                {[
                  { id: 'all' as const, label: `Semua (${scopedRiwayatItems.length})` },
                  { id: 'missing' as const, label: `Belum Upload (${missingUploadCount})` },
                  { id: 'uploaded' as const, label: `Terunggah (${uploadedCount})` },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setUploadFilter(f.id)}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer text-[11px] border ${
                      uploadFilter === f.id
                        ? 'bg-[#064E3B] text-white border-[#064E3B]'
                        : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-100'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari Nama Perangkat Desa, NIK, Nomor SK, atau Nama Desa..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-neutral-300 rounded-lg text-xs focus:outline-hidden focus:ring-1 focus:ring-[#064E3B]"
            />
          </div>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div
            className={`mx-5 mt-3 p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="p-0.5 text-neutral-400 hover:text-neutral-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Body List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 text-xs">
          {activeSubTab === 'riwayat' ? (
            filteredRiwayat.length === 0 ? (
              <div className="py-12 text-center text-neutral-400 border border-dashed border-neutral-200 rounded-xl">
                <FileText className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
                <p className="font-semibold text-neutral-600">Tidak ada data SK yang sesuai filter</p>
              </div>
            ) : (
              filteredRiwayat.slice(0, 50).map(({ rw, member, desa, kec, jabatan, hasUploaded }) => {
                const isBusy = busyId === rw.id_riwayat;
                return (
                  <div
                    key={rw.id_riwayat}
                    className="p-3.5 rounded-xl border border-neutral-200 bg-white hover:border-emerald-300 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-neutral-900 uppercase">
                          {member.anggota.nama_lengkap}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            hasUploaded
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          {hasUploaded ? 'File SK Terunggah' : 'Belum Upload File SK'}
                        </span>
                      </div>

                      <div className="text-[11px] font-mono text-neutral-700">
                        No. SK: <strong>{rw.no_sk_pengangkatan || '-'}</strong> · Tgl SK:{' '}
                        {formatDateIndo(rw.tgl_sk_pengangkatan)}
                      </div>

                      <div className="text-[11px] text-neutral-500">
                        {jabatan?.nama_jabatan || 'Perangkat Desa'} · Desa {desa?.nama_desa || '-'}, Kec.{' '}
                        {kec?.nama_kecamatan || '-'}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {hasUploaded && rw.file_sk && (
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewDoc({
                              title: `SK ${member.anggota.nama_lengkap} (${rw.no_sk_pengangkatan})`,
                              url: rw.file_sk!,
                            })
                          }
                          className="px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Lihat SK</span>
                        </button>
                      )}

                      {canEditMember && (
                        <label
                          className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer flex items-center gap-1 ${
                            isBusy
                              ? 'opacity-60 cursor-wait bg-neutral-100 text-neutral-500 border-neutral-200'
                              : 'bg-white hover:bg-neutral-50 text-neutral-700 border-neutral-300'
                          }`}
                        >
                          {isBusy ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Upload className="w-3.5 h-3.5 text-[#064E3B]" />
                          )}
                          <span>{hasUploaded ? 'Ganti File' : 'Upload SK'}</span>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.webp"
                            disabled={isBusy}
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                void handleUploadRowSk(
                                  rw.id_riwayat,
                                  member.anggota.nik,
                                  member.anggota.nama_lengkap,
                                  file
                                );
                              }
                              e.target.value = '';
                            }}
                          />
                        </label>
                      )}

                      {canEditMember && (
                        <select
                          aria-label={`Status SK ${member.anggota.nama_lengkap}`}
                          value={rw.status_aktif}
                          disabled={isBusy}
                          onChange={(e) =>
                            void handleStatusChange(
                              rw.id_riwayat,
                              member.anggota.nama_lengkap,
                              e.target.value as StatusAktifJabatan
                            )
                          }
                          className="px-2 py-1.5 text-[11px] font-semibold bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-800 focus:outline-hidden cursor-pointer"
                        >
                          <option value="Aktif">Status: Aktif</option>
                          <option value="Purna Tugas">Purna Tugas</option>
                          <option value="Mutasi">Mutasi</option>
                          <option value="Diberhentikan">Diberhentikan</option>
                          <option value="Meninggal Dunia">Meninggal Dunia</option>
                        </select>
                      )}
                    </div>
                  </div>
                );
              })
            )
          ) : pendingRegistrations.length === 0 ? (
            <div className="py-12 text-center text-neutral-500 border border-dashed border-neutral-200 rounded-xl space-y-1">
              <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto" />
              <p className="font-semibold text-neutral-700">
                Tidak ada antrean pendaftaran SK berstatus Menunggu
              </p>
              <p className="text-[11px] text-neutral-400">
                Seluruh pengajuan pendaftaran pada wilayah Anda sudah diproses.
              </p>
            </div>
          ) : (
            pendingRegistrations.map((item) => {
              const isBusy = busyId === `reg-${item.id_pendaftaran}`;
              const hasUploaded = isRealUploadedSk(item.file_sk);
              return (
                <div
                  key={item.id_pendaftaran}
                  className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/40 space-y-3"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-neutral-900 uppercase">
                          {item.nama_lengkap}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-mono text-[10px] font-bold">
                          Menunggu Approval
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-neutral-700">
                        NIK: {item.nik} · No. SK: <strong>{item.no_sk_pengangkatan || '-'}</strong>
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        {item.nama_jabatan || 'Perangkat Desa'} · Desa {item.nama_desa || '-'}, Kec.{' '}
                        {item.nama_kecamatan || '-'}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {hasUploaded && item.file_sk && (
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewDoc({
                              title: `SK Pendaftaran ${item.nama_lengkap}`,
                              url: item.file_sk!,
                            })
                          }
                          className="px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800 bg-white hover:bg-emerald-50 border border-emerald-300 rounded-lg cursor-pointer flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Lihat Berkas SK</span>
                        </button>
                      )}

                      {canApproveReg && (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void handleApproveReg(item.id_pendaftaran, item.nama_lengkap)
                            }
                            className="px-3 py-1.5 text-[11px] font-bold text-white bg-[#064E3B] hover:bg-[#043d2e] disabled:opacity-50 rounded-lg cursor-pointer flex items-center gap-1"
                          >
                            {isBusy ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckCircle className="w-3.5 h-3.5 text-amber-300" />
                            )}
                            <span>Setujui & Terbitkan KTA</span>
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => {
                              setRejectingId(
                                rejectingId === item.id_pendaftaran ? null : item.id_pendaftaran
                              );
                              setRejectReason('');
                            }}
                            className="px-2.5 py-1.5 text-[11px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg cursor-pointer flex items-center gap-1"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Tolak</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {rejectingId === item.id_pendaftaran && (
                    <div className="pt-2 border-t border-amber-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        type="text"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Masukkan alasan penolakan berkas SK..."
                        className="flex-1 px-3 py-1.5 bg-white border border-red-200 rounded-lg text-xs focus:outline-hidden"
                      />
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleRejectReg(item.id_pendaftaran, item.nama_lengkap)}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-[11px] cursor-pointer"
                      >
                        Konfirmasi Tolak
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Inline Document Preview Sub-Modal */}
        {previewDoc && (
          <div className="fixed inset-0 z-60 bg-neutral-900/70 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col border border-neutral-200 overflow-hidden">
              <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
                <span className="font-bold text-xs text-neutral-900 truncate">
                  {previewDoc.title}
                </span>
                <div className="flex items-center gap-2">
                  <a
                    href={previewDoc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 text-[11px] font-semibold bg-[#064E3B] text-white rounded-md flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    <span>Unduh</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setPreviewDoc(null)}
                    className="p-1 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="p-4 bg-neutral-100 flex-1 overflow-auto flex items-center justify-center">
                {previewDoc.url.toLowerCase().includes('.pdf') ||
                previewDoc.url.startsWith('data:application/pdf') ? (
                  <iframe
                    src={previewDoc.url}
                    title={previewDoc.title}
                    className="w-full h-[55vh] rounded border border-neutral-300 bg-white"
                  />
                ) : (
                  <img
                    src={previewDoc.url}
                    alt={previewDoc.title}
                    className="max-h-[55vh] object-contain rounded border border-neutral-300 bg-white"
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between text-[11px] text-neutral-500">
          <span>Menampilkan data sesuai hak akses wilayah Anda</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-900 text-white font-semibold rounded-lg text-xs cursor-pointer"
          >
            Selesai & Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
