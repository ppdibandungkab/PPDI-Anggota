import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { AnggotaFullDetail } from '../types/ppdi';
import { usePPDI } from '../context/PPDIContext';
import { getPhotoUrl, handleImageError } from '../utils/fileHelpers';
import { generateKtaShortUrl } from '../utils/qrCrypto';
import {
  BulkKtaCardSide,
  BulkKtaPageFormat,
  exportBulkKtaToPDF,
} from '../utils/pdfBulkKtaExport';
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  Eye,
  FileText,
  Layers,
  RefreshCw,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface BulkKtaExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedMembers: AnggotaFullDetail[];
  onRemoveMember?: (idAnggota: string) => void;
  onSuccess?: (count: number) => void;
  onError?: (message: string) => void;
}

const cleanWilayahId = (id?: string | null) =>
  id ? String(id).replace(/\./g, '').trim() : '';

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
  const [activeTab, setActiveTab] = useState<'preview' | 'config'>('preview');
  const [previewPage, setPreviewPage] = useState(0);
  const [previewZoom, setPreviewZoom] = useState<number>(100);
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });

  const appName = appSettings?.appName || 'PERSATUAN PERANGKAT DESA INDONESIA';
  const appLogo = (appSettings?.logoUrl || '').trim() || '/logo_kabupaten_bandung.svg';
  const watermarkLogo = (appSettings?.watermarkLogoUrl || '').trim() || appLogo;
  const globalOpacity =
    typeof appSettings?.watermarkOpacity === 'number'
      ? Math.min(1, Math.max(0, appSettings.watermarkOpacity))
      : undefined;
  const frontOpacity =
    globalOpacity ??
    (typeof appSettings?.watermarkOpacityFront === 'number'
      ? Math.min(1, Math.max(0, appSettings.watermarkOpacityFront))
      : 0.09);
  const backOpacity =
    globalOpacity ??
    (typeof appSettings?.watermarkOpacityBack === 'number'
      ? Math.min(1, Math.max(0, appSettings.watermarkOpacityBack))
      : 0.07);

  // Build ordered slots identical to pdfBulkKtaExport.ts
  const cardSlots = useMemo(() => {
    const slots: Array<{ side: 'front' | 'back'; member: AnggotaFullDetail }> = [];
    if (cardSide === 'both') {
      selectedMembers.forEach((member) => {
        slots.push({ side: 'front', member });
        slots.push({ side: 'back', member });
      });
    } else {
      selectedMembers.forEach((member) => {
        slots.push({ side: cardSide, member });
      });
    }
    return slots;
  }, [selectedMembers, cardSide]);

  const cardsPerPage = 8;
  const totalPages = Math.max(1, Math.ceil(cardSlots.length / cardsPerPage));
  const safePage = Math.min(previewPage, totalPages - 1);

  const visibleSlots = useMemo(() => {
    const start = safePage * cardsPerPage;
    return cardSlots.slice(start, start + cardsPerPage);
  }, [cardSlots, safePage, cardsPerPage]);

  // Reset page when format, cardSide, or modal open state changes
  useEffect(() => {
    setPreviewPage(0);
  }, [format, cardSide, selectedMembers.length]);

  useEffect(() => {
    setActiveTab('preview');
    setPreviewPage(0);
  }, [isOpen]);

  // Generate QR codes for members currently visible in Print Preview
  useEffect(() => {
    if (!isOpen || activeTab !== 'preview') return;

    const backMembers = visibleSlots
      .filter((s) => s.side === 'back')
      .map((s) => s.member)
      .filter((m) => !qrMap[m.anggota.id_anggota]);

    if (backMembers.length === 0) return;

    let cancelled = false;
    (async () => {
      const additions: Record<string, string> = {};
      for (const m of backMembers) {
        const ktaVal =
          (m.keanggotaan?.no_kta || '').trim() ||
          (m.anggota.nipd || '').trim() ||
          `PPDI-${m.anggota.id_anggota}`;
        const nikVal = (m.anggota.nik || '').trim() || `ID${m.anggota.id_anggota}`;
        const { url } = generateKtaShortUrl({
          no_kta: ktaVal,
          nik: nikVal,
          id_anggota: m.anggota.id_anggota,
        });
        try {
          additions[m.anggota.id_anggota] = await QRCode.toDataURL(url, {
            width: 180,
            margin: 1,
            color: { dark: '#064e3b', light: '#ffffff' },
            errorCorrectionLevel: 'M',
          });
        } catch {
          // ignore single QR error
        }
      }
      if (!cancelled && Object.keys(additions).length > 0) {
        setQrMap((prev) => ({ ...prev, ...additions }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab, visibleSlots, qrMap]);

  if (!isOpen) return null;

  const resolveWilayah = (member: AnggotaFullDetail) => {
    const cleanDesaId = cleanWilayahId(member.desa?.id_desa || member.jabatanTerkini?.id_desa);
    const matchedDesa = member.desa?.nama_desa
      ? member.desa
      : desaList.find((d) => cleanWilayahId(d.id_desa) === cleanDesaId);
    const cleanKecId = cleanWilayahId(
      member.kecamatan?.id_kecamatan ||
        matchedDesa?.id_kecamatan ||
        (cleanDesaId.length >= 6 ? cleanDesaId.slice(0, 6) : '')
    );
    const matchedKec = member.kecamatan?.nama_kecamatan
      ? member.kecamatan
      : kecamatanList.find((k) => cleanWilayahId(k.id_kecamatan) === cleanKecId);
    return {
      desaName: matchedDesa?.nama_desa || '-',
      kecName: matchedKec?.nama_kecamatan || '-',
    };
  };

  const handleStartExport = async () => {
    if (selectedMembers.length === 0 || isExporting) return;

    try {
      setIsExporting(true);
      setProgress({ current: 0, total: selectedMembers.length });

      await exportBulkKtaToPDF({
        members: selectedMembers,
        format,
        cardSide,
        appName,
        appLogo,
        watermarkLogo,
        watermarkOpacity: globalOpacity,
        watermarkOpacityFront: frontOpacity,
        watermarkOpacityBack: backOpacity,
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

  const printDateStr = new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const renderPreviewCard = (slot: { side: 'front' | 'back'; member: AnggotaFullDetail }, compact: boolean) => {
    const { member, side } = slot;
    const { desaName, kecName } = resolveWilayah(member);
    const fullName = [
      member.anggota.gelar_depan,
      member.anggota.nama_lengkap,
      member.anggota.gelar_belakang ? `, ${member.anggota.gelar_belakang}` : '',
    ]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+,/g, ',')
      .trim()
      .toUpperCase();

    if (side === 'front') {
      return (
        <div
          className={`w-full aspect-[85.6/54] text-white relative overflow-hidden flex flex-col justify-between shadow-sm ${
            compact ? 'rounded-[6px] p-2' : 'rounded-xl p-4 sm:p-5'
          }`}
          style={{
            backgroundColor: '#064e3b',
            backgroundImage: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #042f2e 100%)',
            border: '1px solid rgba(217, 169, 45, 0.85)',
          }}
        >
          {/* Decorative Dot Matrix */}
          <div
            className="absolute inset-0 opacity-10 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(circle, #fde047 1px, transparent 1px)',
              backgroundSize: compact ? '8px 8px' : '14px 14px',
            }}
          />
          <div
            className={`absolute rounded-full pointer-events-none ${
              compact ? '-top-6 -right-6 w-24 h-24 blur-lg' : '-top-12 -right-12 w-44 h-44 blur-2xl'
            }`}
            style={{ backgroundColor: 'rgba(251, 191, 36, 0.12)' }}
          />

          {/* Global Organization Logo Watermark */}
          {watermarkLogo && frontOpacity > 0 && (
            <div
              className={`absolute top-1/2 -translate-y-1/2 pointer-events-none select-none flex items-center justify-center ${
                compact ? 'right-2 w-24 h-24' : 'right-4 w-44 h-44'
              }`}
              style={{ opacity: frontOpacity }}
            >
              <img
                src={watermarkLogo}
                alt=""
                className="w-full h-full object-contain filter grayscale brightness-200"
              />
            </div>
          )}

          {/* Header */}
          <div
            className={`relative z-10 flex items-center justify-between border-b border-amber-400/40 ${
              compact ? 'pb-1' : 'pb-2'
            }`}
          >
            <div className={`flex items-center ${compact ? 'gap-1.5' : 'gap-2.5'} min-w-0`}>
              <div
                className={`rounded-full p-[1.5px] bg-amber-400 shrink-0 flex items-center justify-center overflow-hidden ${
                  compact ? 'w-5 h-5' : 'w-9 h-9'
                }`}
              >
                <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden p-0.5">
                  {appLogo ? (
                    <img src={appLogo} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <Shield className="w-3 h-3 text-emerald-900" />
                  )}
                </div>
              </div>
              <div className="min-w-0">
                <div
                  className={`font-extrabold tracking-wider text-amber-300 uppercase leading-none truncate ${
                    compact ? 'text-[5.5px]' : 'text-[10px]'
                  }`}
                >
                  {appName}
                </div>
                <div
                  className={`tracking-widest text-emerald-100 font-semibold uppercase mt-0.5 truncate ${
                    compact ? 'text-[4.2px]' : 'text-[7.5px]'
                  }`}
                >
                  PENGURUS DAERAH KAB. BANDUNG
                </div>
              </div>
            </div>
            <div className="text-right shrink-0 ml-1">
              <div className={`font-bold text-amber-300 tracking-wider ${compact ? 'text-[5px]' : 'text-[9px]'}`}>
                E-KTA DIGITAL
              </div>
              <div className={`text-emerald-200 ${compact ? 'text-[4px]' : 'text-[7.5px]'}`}>JAWA BARAT</div>
            </div>
          </div>

          {/* Body */}
          <div className={`relative z-10 grid grid-cols-12 items-center my-auto ${compact ? 'gap-1.5 py-0.5' : 'gap-3 py-1'}`}>
            <div className="col-span-4 flex items-center justify-center">
              <div
                className={`w-full aspect-[3/4] overflow-hidden border border-amber-300 bg-neutral-900 flex items-center justify-center p-0.5 ${
                  compact ? 'rounded-[4px] max-w-[42px]' : 'rounded-lg max-w-[82px]'
                }`}
              >
                <img
                  src={getPhotoUrl(member.anggota.foto, member.anggota.jenis_kelamin)}
                  alt={member.anggota.nama_lengkap}
                  onError={(e) => handleImageError(e, member.anggota.jenis_kelamin)}
                  referrerPolicy="no-referrer"
                  className="max-w-full max-h-full w-auto h-auto object-contain rounded-[3px]"
                />
              </div>
            </div>

            <div className={`col-span-8 min-w-0 text-left ${compact ? 'space-y-0.5' : 'space-y-1'}`}>
              <div>
                <div className={`text-emerald-200 uppercase tracking-wider font-semibold ${compact ? 'text-[4px]' : 'text-[7.5px]'}`}>
                  Nama Perangkat Desa
                </div>
                <div className={`font-extrabold text-amber-300 leading-tight uppercase truncate ${compact ? 'text-[7px]' : 'text-xs'}`}>
                  {fullName || '-'}
                </div>
              </div>

              {member.anggota.nipd && (
                <div className="truncate">
                  <span className={`text-emerald-200 uppercase block leading-none ${compact ? 'text-[3.8px]' : 'text-[7px]'}`}>
                    NIPD
                  </span>
                  <span className={`font-mono font-semibold text-white ${compact ? 'text-[5px]' : 'text-[9px]'}`}>
                    {member.anggota.nipd}
                  </span>
                </div>
              )}

              <div className="truncate">
                <span className={`text-emerald-200 uppercase block leading-none ${compact ? 'text-[3.8px]' : 'text-[7px]'}`}>
                  Jabatan SOTK
                </span>
                <span className={`font-semibold text-white ${compact ? 'text-[5.5px]' : 'text-[10px]'}`}>
                  {member.jabatanRef?.nama_jabatan || 'Perangkat Desa'}
                </span>
              </div>

              <div className="truncate">
                <span className={`text-emerald-200 uppercase block leading-none ${compact ? 'text-[3.8px]' : 'text-[7px]'}`}>
                  Wilayah Tugas
                </span>
                <span className={`text-emerald-100 ${compact ? 'text-[5px]' : 'text-[9px]'}`}>
                  Desa {desaName}, Kec. {kecName}
                </span>
              </div>

              <div
                className={`bg-emerald-950/90 border border-amber-400/90 ${
                  compact ? 'px-1.5 py-0.5 rounded-[4px] mt-0.5' : 'px-2.5 py-1.5 rounded-lg mt-1'
                }`}
              >
                <span className={`text-amber-200 font-bold uppercase tracking-widest block leading-none ${compact ? 'text-[3.8px]' : 'text-[7px]'}`}>
                  NOMOR KTA DIGITAL PPDI
                </span>
                <span className={`font-mono font-black text-amber-300 tracking-wider truncate block ${compact ? 'text-[6.8px]' : 'text-xs'}`}>
                  {member.keanggotaan?.no_kta || 'BELUM TERBIT'}
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            className={`relative z-10 border-t border-amber-400/30 flex items-center justify-between text-emerald-200 ${
              compact ? 'pt-0.5 text-[4.5px]' : 'pt-1.5 text-[8px]'
            }`}
          >
            <div>
              Status: <strong className="text-amber-300 uppercase">{member.keanggotaan?.status_kta || 'Pending'}</strong>
            </div>
            <div className="truncate ml-1">Masa Berlaku: Selama Menjabat (Batas Usia 60 Thn)</div>
          </div>
        </div>
      );
    }

    // Back Card
    const qrSrc = qrMap[member.anggota.id_anggota];
    return (
      <div
        className={`w-full aspect-[85.6/54] text-white relative overflow-hidden flex flex-col justify-between shadow-sm ${
          compact ? 'rounded-[6px] p-2' : 'rounded-xl p-4 sm:p-5'
        }`}
        style={{
          backgroundColor: '#064e3b',
          backgroundImage: 'linear-gradient(315deg, #022c22 0%, #064e3b 50%, #065f46 100%)',
          border: '1px solid rgba(217, 169, 45, 0.85)',
        }}
      >
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, #fde047 1px, transparent 1px)',
            backgroundSize: compact ? '8px 8px' : '14px 14px',
          }}
        />
        <div
          className={`absolute rounded-full pointer-events-none ${
            compact ? '-bottom-6 -left-6 w-24 h-24 blur-lg' : '-bottom-12 -left-12 w-44 h-44 blur-2xl'
          }`}
          style={{ backgroundColor: 'rgba(5, 150, 105, 0.22)' }}
        />

        {/* Global Organization Logo Watermark */}
        {watermarkLogo && backOpacity > 0 && (
          <div
            className={`absolute top-1/2 -translate-y-1/2 pointer-events-none select-none flex items-center justify-center ${
              compact ? 'right-2 w-24 h-24' : 'right-4 w-44 h-44'
            }`}
            style={{ opacity: backOpacity }}
          >
            <img
              src={watermarkLogo}
              alt=""
              className="w-full h-full object-contain filter grayscale brightness-200"
            />
          </div>
        )}

        {/* Header */}
        <div
          className={`relative z-10 flex items-center justify-between border-b border-amber-400/40 ${
            compact ? 'pb-1' : 'pb-2'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <div
              className={`rounded-full bg-white border border-amber-300 flex items-center justify-center p-0.5 shrink-0 overflow-hidden ${
                compact ? 'w-3.5 h-3.5' : 'w-5 h-5'
              }`}
            >
              <img src={appLogo} alt="" className="w-full h-full object-contain" />
            </div>
            <span className={`font-extrabold text-amber-300 uppercase tracking-wider truncate ${compact ? 'text-[5px]' : 'text-[9.5px]'}`}>
              KETENTUAN KARTU ANGGOTA PPDI
            </span>
          </div>
          <span
            className={`font-mono font-bold text-emerald-200 bg-emerald-950/90 border border-emerald-400/40 rounded-full shrink-0 ${
              compact ? 'px-1.5 py-[1px] text-[4.2px]' : 'px-2 py-0.5 text-[7.5px]'
            }`}
          >
            VERIFIED
          </span>
        </div>

        {/* Body */}
        <div className={`relative z-10 grid grid-cols-12 items-center my-auto ${compact ? 'gap-1.5 py-0.5' : 'gap-3 py-1'}`}>
          <div className={`col-span-8 text-emerald-100 leading-snug ${compact ? 'text-[4.4px] space-y-0.5' : 'text-[8px] space-y-1.5'}`}>
            <p>
              <strong className="text-amber-300">1.</strong> Kartu ini merupakan tanda pengenal resmi anggota PPDI Kab. Bandung.
            </p>
            <p>
              <strong className="text-amber-300">2.</strong> Berlaku sebagai bukti sah hak advokasi kelembagaan &amp; keanggotaan organisasi.
            </p>
            <p>
              <strong className="text-amber-300">3.</strong> Apabila perangkat desa purna tugas atau berhenti, keabsahan kartu berakhir.
            </p>
            <div className={`border-t border-emerald-800/80 text-amber-200 truncate ${compact ? 'pt-0.5 text-[4px]' : 'pt-1 text-[7px]'}`}>
              Sekretariat: Jl. Parungserab No. 54, Soreang, Kab. Bandung
            </div>
          </div>

          <div className="col-span-4 flex flex-col items-center justify-center">
            <div className={`bg-white border border-amber-400 shadow-xs ${compact ? 'p-0.5 rounded-[4px]' : 'p-1.5 rounded-lg'}`}>
              {qrSrc ? (
                <img
                  src={qrSrc}
                  alt="QR Verifikasi"
                  className={compact ? 'w-11 h-11 object-contain' : 'w-20 h-20 object-contain'}
                />
              ) : (
                <div className={`${compact ? 'w-11 h-11' : 'w-20 h-20'} bg-neutral-100 animate-pulse rounded`} />
              )}
            </div>
            <span className={`font-bold text-amber-200 mt-0.5 ${compact ? 'text-[3.8px]' : 'text-[7px]'}`}>
              SCAN VERIFIKASI KTA
            </span>
          </div>
        </div>

        {/* Footer */}
        <div
          className={`relative z-10 border-t border-amber-400/40 flex items-center justify-between ${
            compact ? 'pt-0.5 text-[4.3px]' : 'pt-1.5 text-[7.5px]'
          }`}
        >
          <div className="flex items-center gap-1 min-w-0">
            <div className={`rounded-full bg-white border border-amber-300 p-0.5 shrink-0 ${compact ? 'w-3.5 h-3.5' : 'w-6 h-6'}`}>
              <img src={appLogo} alt="" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <div className="text-emerald-200 uppercase leading-none">Diterbitkan oleh:</div>
              <div className="font-bold text-white truncate">Pengurus Daerah PPDI Kab. Bandung</div>
            </div>
          </div>
          <div className="text-right shrink-0 ml-1">
            <div className="text-emerald-200 leading-none">Ketua Pengurus Daerah</div>
            <div className="font-bold text-amber-300 mt-0.5">DADANG IYAS, S.Ip.</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#111113]/65 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full border border-neutral-200 overflow-hidden flex flex-col max-h-[92vh] transition-all ${
          activeTab === 'preview' ? 'max-w-5xl' : 'max-w-2xl'
        }`}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-[#064E3B] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">
                Preview Export E-KTA Digital (PDF)
              </h3>
              <p className="text-[11px] text-emerald-100 mt-0.5">
                {selectedMembers.length} anggota terpilih · Standar ID-1 (8,56 × 5,4 cm) · Watermark{' '}
                {Math.round(frontOpacity * 100)}%
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {/* Mode Switcher */}
            <div className="flex items-center gap-1 p-1 bg-emerald-950/60 border border-emerald-700/70 rounded-lg text-xs">
              <button
                type="button"
                disabled={isExporting || selectedMembers.length === 0}
                onClick={() => setActiveTab('preview')}
                className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 ${
                  activeTab === 'preview'
                    ? 'bg-amber-400 text-neutral-950 shadow-xs'
                    : 'text-emerald-100 hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview Export</span>
              </button>
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setActiveTab('config')}
                className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'config'
                    ? 'bg-white text-emerald-950 shadow-xs'
                    : 'text-emerald-100 hover:text-white'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Pengaturan Cetak</span>
              </button>
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
        </div>

        {/* BODY */}
        {activeTab === 'config' ? (
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
                    <span className="text-[10px] font-mono text-emerald-800 font-semibold">
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
                    <span className="text-[10px] font-mono text-amber-800 font-semibold">
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
                <span className="text-[11px] font-mono text-emerald-800 font-semibold tabular-nums">
                  Estimasi: {totalPages} halaman PDF
                </span>
              </div>

              <div className="border border-neutral-200 rounded-xl divide-y divide-neutral-100 max-h-48 overflow-y-auto bg-neutral-50/50">
                {selectedMembers.map((m, idx) => (
                  <div
                    key={m.anggota.id_anggota}
                    className="px-3 py-2 flex items-center justify-between gap-3 bg-white"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-[10px] font-mono text-neutral-400 w-5 text-right shrink-0 tabular-nums">
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
                        className={`text-[10px] font-semibold ${
                          m.keanggotaan?.status_kta === 'Aktif'
                            ? 'text-emerald-700'
                            : 'text-amber-700'
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
                    Menyusun E-KTA Digital &amp; Watermark PDF...
                  </span>
                  <span className="font-mono tabular-nums">
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
        ) : (
          /* PRINT PREVIEW STAGE */
          <div className="flex-1 flex flex-col overflow-hidden bg-neutral-100">
            {/* Preview Toolbar */}
            <div className="px-5 py-2.5 bg-white border-b border-neutral-200 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 p-0.5 bg-neutral-100 border border-neutral-200 rounded-lg">
                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={() => setFormat('a4')}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
                      format === 'a4'
                        ? 'bg-[#064E3B] text-white shadow-2xs'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    A4 Grid (2×4)
                  </button>
                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={() => setFormat('cr80')}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
                      format === 'cr80'
                        ? 'bg-[#064E3B] text-white shadow-2xs'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    CR80 Satuan
                  </button>
                </div>

                <div className="flex items-center gap-1 p-0.5 bg-neutral-100 border border-neutral-200 rounded-lg">
                  {([
                    { id: 'both', label: 'Depan & Belakang' },
                    { id: 'front', label: 'Depan' },
                    { id: 'back', label: 'Belakang' },
                  ] as const).map((sideOpt) => (
                    <button
                      key={sideOpt.id}
                      type="button"
                      disabled={isExporting}
                      onClick={() => setCardSide(sideOpt.id)}
                      className={`px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer whitespace-nowrap ${
                        cardSide === sideOpt.id
                          ? 'bg-white text-neutral-900 shadow-2xs'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      {sideOpt.label}
                    </button>
                  ))}
                </div>

                <span className="text-[11px] font-mono text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1 tabular-nums">
                  Watermark: {Math.round(frontOpacity * 100)}%
                </span>
              </div>

              <div className="flex items-center gap-3">
                {/* Zoom Controls */}
                <div className="flex items-center gap-1 bg-neutral-100 border border-neutral-200 rounded-lg px-1.5 py-0.5">
                  <button
                    type="button"
                    onClick={() => setPreviewZoom((z) => Math.max(70, z - 15))}
                    disabled={previewZoom <= 70}
                    className="p-1 text-neutral-600 hover:text-neutral-900 disabled:opacity-40 cursor-pointer"
                    title="Perkecil Pratinjau"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] font-mono font-semibold text-neutral-800 w-10 text-center tabular-nums">
                    {previewZoom}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewZoom((z) => Math.min(130, z + 15))}
                    disabled={previewZoom >= 130}
                    className="p-1 text-neutral-600 hover:text-neutral-900 disabled:opacity-40 cursor-pointer"
                    title="Perbesar Pratinjau"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Page Pagination */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={safePage === 0}
                    onClick={() => setPreviewPage((p) => Math.max(0, p - 1))}
                    className="px-2 py-1 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-700 disabled:opacity-40 cursor-pointer flex items-center"
                    title="Halaman Sebelumnya"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] font-mono font-semibold text-neutral-800 tabular-nums px-1">
                    Hal {safePage + 1} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages - 1}
                    onClick={() => setPreviewPage((p) => Math.min(totalPages - 1, p + 1))}
                    className="px-2 py-1 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-700 disabled:opacity-40 cursor-pointer flex items-center"
                    title="Halaman Berikutnya"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Paper Stage */}
            <div className="flex-1 overflow-auto p-5 sm:p-6 flex flex-col items-center">
              {format === 'a4' ? (
                <div
                  className="bg-white shadow-lg border border-neutral-300 rounded-sm p-5 sm:p-7 flex flex-col justify-between transition-all shrink-0"
                  style={{
                    width: `${Math.round(640 * (previewZoom / 100))}px`,
                    minHeight: `${Math.round(905 * (previewZoom / 100))}px`,
                  }}
                >
                  {/* Sheet Header */}
                  <div>
                    <div className="flex items-center justify-between pb-2 border-b border-neutral-300 gap-2">
                      <span className="text-[10px] font-bold text-[#064E3B] uppercase tracking-tight truncate">
                        {appName} — CETAK MASSAL E-KTA ANGGOTA
                      </span>
                      <span className="text-[9px] text-neutral-500 font-mono shrink-0">
                        {selectedMembers.length} Anggota · {printDateStr}
                      </span>
                    </div>

                    {/* 2x4 Card Grid with Cut Guides */}
                    <div className="grid grid-cols-2 gap-3.5 mt-4">
                      {visibleSlots.map((slot, i) => (
                        <div
                          key={`${slot.member.anggota.id_anggota}-${slot.side}-${i}`}
                          className="p-1 border border-dashed border-slate-300 rounded-md"
                        >
                          {renderPreviewCard(slot, true)}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Sheet Footer */}
                  <div className="pt-4 mt-4 border-t border-neutral-200 text-center text-[9px] text-neutral-400 font-mono">
                    Ukuran Standar KTP / ID-1 (8,56 cm × 5,4 cm) · Garis putus-putus sebagai panduan potong · Halaman{' '}
                    {safePage + 1} dari {totalPages}
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-5 my-auto">
                  {visibleSlots.map((slot, i) => (
                    <div
                      key={`${slot.member.anggota.id_anggota}-${slot.side}-${i}`}
                      className="space-y-1.5 transition-all bg-white p-3 rounded-xl border border-neutral-200 shadow-xs"
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono text-neutral-600 px-0.5">
                        <span className="font-bold text-neutral-900 uppercase truncate">
                          {slot.member.anggota.nama_lengkap}
                        </span>
                        <span className="shrink-0 text-emerald-800 font-semibold">
                          {slot.side === 'front' ? 'Depan' : 'Belakang'}
                        </span>
                      </div>
                      {renderPreviewCard(slot, false)}
                    </div>
                  ))}
                </div>
              )}

              {isExporting && (
                <div className="mt-4 w-full max-w-md p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-900">
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-700" />
                      Membuat Berkas PDF Final...
                    </span>
                    <span className="font-mono tabular-nums">
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
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3.5 bg-neutral-50 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] text-neutral-500 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>
              {activeTab === 'preview'
                ? 'Periksa grid kartu E-KTA (depan & belakang) dan watermark, lalu klik Download All.'
                : 'Dilengkapi QR Code terenkripsi & watermark logo organisasi'}
            </span>
          </span>

          <div className="flex items-center gap-2">
            {activeTab === 'config' ? (
              <>
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isExporting || selectedMembers.length === 0}
                  onClick={() => setActiveTab('preview')}
                  className="px-4 py-2 text-xs font-bold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                >
                  <Eye className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Preview Export</span>
                </button>
                <button
                  type="button"
                  disabled={isExporting || selectedMembers.length === 0}
                  onClick={handleStartExport}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#064E3B] hover:bg-[#043d2e] disabled:opacity-60 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm whitespace-nowrap"
                >
                  {isExporting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Membuat PDF...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5 text-amber-300" />
                      <span>Download All ({selectedMembers.length} E-KTA)</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => setActiveTab('config')}
                  className="px-4 py-2 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  Pengaturan Cetak
                </button>
                <button
                  type="button"
                  disabled={isExporting || selectedMembers.length === 0}
                  onClick={handleStartExport}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#064E3B] hover:bg-[#043d2e] disabled:opacity-60 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm whitespace-nowrap"
                >
                  {isExporting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Membuat PDF...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5 text-amber-300" />
                      <span>Download All ({selectedMembers.length} E-KTA PDF)</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
