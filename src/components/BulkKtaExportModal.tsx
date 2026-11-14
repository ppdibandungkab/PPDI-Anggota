import React, { useState } from 'react';
import { AnggotaFullDetail } from '../types/ppdi';
import { usePPDI } from '../context/PPDIContext';
import { getPhotoUrl, handleImageError } from '../utils/fileHelpers';
import {
  BulkKtaCardSide,
  BulkKtaPageFormat,
  exportBulkKtaToPDF,
} from '../utils/pdfBulkKtaExport';
import {
  CreditCard,
  Download,
  FileText,
  Layers,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';

interface BulkKtaExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedMembers: AnggotaFullDetail[];
  onRemoveMember?: (idAnggota: string) => void;
  onSuccess?: (count: number) => void;
  onError?: (message: string) => void;
}

export const BulkKtaExportModal: React.FC<BulkKtaExportModalProps> = ({
  isOpen,
  onClose,
  selectedMembers,
  onRemoveMember,
  onSuccess,
  onError,
}) => {
  const { appSettings, kecamatanList, desaList } = usePPDI();

  const [format, setFormat] = useState<BulkKtaPageFormat>('a4');
  const [cardSide, setCardSide] = useState<BulkKtaCardSide>('both');
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });

  if (!isOpen) return null;

  const estimatedPages =
    format === 'cr80'
      ? selectedMembers.length * (cardSide === 'both' ? 2 : 1)
      : Math.max(
          1,
          Math.ceil((selectedMembers.length * (cardSide === 'both' ? 2 : 1)) / 8)
        );

  const handleStartExport = async () => {
    if (selectedMembers.length === 0 || isExporting) return;

    try {
      setIsExporting(true);
      setProgress({ current: 0, total: selectedMembers.length });

      await exportBulkKtaToPDF({
        members: selectedMembers,
        format,
        cardSide,
        appName: appSettings?.appName || 'PERSATUAN PERANGKAT DESA INDONESIA',
        appLogo: appSettings?.logoUrl,
        kecamatanList,
        desaList,
        onProgress: (current, total) => setProgress({ current, total }),
      });

      onSuccess?.(selectedMembers.length);
      onClose();
    } catch (err: any) {
      console.error('Bulk KTA PDF export error:', err);
      onError?.(err?.message || 'Gagal membuat PDF E-KTA massal.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#111113]/65 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-neutral-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-[#064E3B] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">
                Unduh Massal E-KTA Digital (PDF)
              </h3>
              <p className="text-[11px] text-emerald-100 mt-0.5">
                {selectedMembers.length} anggota terpilih · Ukuran kartu standar ISO/ID-1 (8,56 × 5,4 cm)
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isExporting}
            onClick={onClose}
            className="p-1.5 text-white/75 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {/* Format Kertas */}
          <div className="space-y-2">
            <label className="block font-bold text-neutral-800 uppercase tracking-wider text-[11px]">
              1. Pilih Format Dokumen PDF
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setFormat('a4')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  format === 'a4'
                    ? 'bg-emerald-50 border-emerald-600 ring-1 ring-emerald-600'
                    : 'bg-white border-neutral-200 hover:bg-neutral-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-neutral-900 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-emerald-700" />
                    Lembar Cetak A4
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 font-semibold">
                    Hemat Kertas
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 mt-1 leading-relaxed">
                  Tata letak grid 2×4 kartu per halaman A4 lengkap dengan garis potong putus-putus (cocok untuk cetak kertas PVC/laminating).
                </p>
              </button>

              <button
                type="button"
                disabled={isExporting}
                onClick={() => setFormat('cr80')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  format === 'cr80'
                    ? 'bg-emerald-50 border-emerald-600 ring-1 ring-emerald-600'
                    : 'bg-white border-neutral-200 hover:bg-neutral-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-neutral-900 flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-amber-600" />
                    Kartu Satuan CR80
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold">
                    ID Card Printer
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 mt-1 leading-relaxed">
                  Setiap halaman berukuran persis KTP/ATM (85,6 × 54,0 mm) tanpa margin untuk printer ID Card langsung.
                </p>
              </button>
            </div>
          </div>

          {/* Sisi Kartu */}
          <div className="space-y-2">
            <label className="block font-bold text-neutral-800 uppercase tracking-wider text-[11px]">
              2. Pilih Sisi Kartu yang Dicetak
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'both' as const, label: 'Depan & Belakang', desc: 'Lengkap QR & Profil' },
                { id: 'front' as const, label: 'Tampak Depan', desc: 'Foto & No. KTA' },
                { id: 'back' as const, label: 'Tampak Belakang', desc: 'Ketentuan & QR' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={isExporting}
                  onClick={() => setCardSide(opt.id)}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    cardSide === opt.id
                      ? 'bg-emerald-50 border-emerald-600 text-emerald-950 font-semibold'
                      : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <Layers className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span>{opt.label}</span>
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Daftar Anggota Terpilih */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-neutral-800 uppercase tracking-wider text-[11px]">
                3. Daftar Anggota Terpilih ({selectedMembers.length})
              </label>
              <span className="text-[11px] font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-semibold">
                Estimasi: {estimatedPages} halaman PDF
              </span>
            </div>

            <div className="border border-neutral-200 rounded-xl divide-y divide-neutral-100 max-h-48 overflow-y-auto bg-neutral-50/50">
              {selectedMembers.map((m, idx) => (
                <div
                  key={m.anggota.id_anggota}
                  className="px-3 py-2 flex items-center justify-between gap-3 bg-white"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-[10px] font-mono text-neutral-400 w-5 text-right shrink-0">
                      {idx + 1}.
                    </span>
                    <img
                      src={getPhotoUrl(m.anggota.foto, m.anggota.jenis_kelamin)}
                      alt={m.anggota.nama_lengkap}
                      onError={(e) => handleImageError(e, m.anggota.jenis_kelamin)}
                      className="w-7 h-7 rounded-full object-cover border border-neutral-200 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-bold text-neutral-900 uppercase truncate text-[11px]">
                        {m.anggota.nama_lengkap}
                      </div>
                      <div className="text-[10px] text-neutral-500 font-mono truncate">
                        No. KTA: {m.keanggotaan?.no_kta || 'Belum Terbit'} · Desa{' '}
                        {m.desa?.nama_desa || '-'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        m.keanggotaan?.status_kta === 'Aktif'
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'bg-amber-50 text-amber-800'
                      }`}
                    >
                      {m.keanggotaan?.status_kta || 'Pending'}
                    </span>
                    {onRemoveMember && selectedMembers.length > 1 && (
                      <button
                        type="button"
                        disabled={isExporting}
                        onClick={() => onRemoveMember(m.anggota.id_anggota)}
                        title="Hapus dari pilihan cetak"
                        className="p-1 text-neutral-400 hover:text-red-600 rounded cursor-pointer disabled:opacity-40"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {isExporting && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-900">
                <span className="flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-700" />
                  Menyusun E-KTA Digital & QR Verifikasi...
                </span>
                <span className="font-mono">
                  {progress.current}/{progress.total}
                </span>
              </div>
              <div className="w-full h-1.5 bg-emerald-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#064E3B] transition-all duration-150"
                  style={{
                    width: `${progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between gap-3">
          <span className="text-[11px] text-neutral-500 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>Dilengkapi QR Code verifikasi terenkripsi per anggota</span>
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isExporting}
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={isExporting || selectedMembers.length === 0}
              onClick={handleStartExport}
              className="px-4 py-2 text-xs font-bold text-white bg-[#064E3B] hover:bg-[#043d2e] disabled:opacity-60 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              {isExporting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Membuat PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 text-amber-300" />
                  <span>Unduh PDF ({selectedMembers.length} E-KTA)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
