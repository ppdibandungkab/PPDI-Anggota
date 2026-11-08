import React, { useState, useEffect, useRef, useMemo } from 'react';
import QRCode from 'qrcode';
import jsPDF from 'jspdf';
import { toPng } from 'html-to-image';
import { usePPDI } from '../context/PPDIContext';
import { AnggotaFullDetail } from '../types/ppdi';
import { formatDateIndo } from '../utils/ppdiHelpers';
import { getPhotoUrl, handleImageError } from '../utils/fileHelpers';
import { generateKtaShortUrl } from '../utils/qrCrypto';
import {
  CreditCard,
  Printer,
  Download,
  ShieldCheck,
  Search,
  CheckCircle,
  ExternalLink,
  Shield,
  Layers,
  Lock,
} from 'lucide-react';

interface EKTAViewProps {
  selectedMemberId?: string;
  onOpenVerifyModal: (ktaOrNik?: string) => void;
}

export const EKTAView: React.FC<EKTAViewProps> = ({ selectedMemberId, onOpenVerifyModal }) => {
  const { visibleMembers, fullMembers, appSettings, currentUser, hasPermission } = usePPDI();

  const userKecId = currentUser?.id_kecamatan_scope || currentUser?.id_kecamatan;
  const userDesaId = currentUser?.id_desa;
  const userMemberId = currentUser?.id_anggota;
  const userRole = currentUser?.role || 'Anggota';

  // Scoped members for E-KTA selector
  const scopedMembers = useMemo(() => {
    return fullMembers.filter((m: AnggotaFullDetail) => {
      if (userRole === 'Admin_Kecamatan' && userKecId) {
        return m.kecamatan?.id_kecamatan === userKecId || m.desa?.id_kecamatan === userKecId;
      }
      if (userRole === 'Admin_Desa' && userDesaId) {
        return m.desa?.id_desa === userDesaId;
      }
      if (userRole === 'Anggota' && userMemberId) {
        return m.anggota.id_anggota === userMemberId;
      }
      return true;
    });
  }, [fullMembers, userRole, userKecId, userDesaId, userMemberId]);

  // App Logo synchronized from Application Settings
  const appLogo =
    appSettings?.logoUrl ||
    'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Logo_Kabupaten_Bandung.png/480px-Logo_Kabupaten_Bandung.png';

  // Selected member state
  const [activeMemberId, setActiveMemberId] = useState<string>(() => {
    if (selectedMemberId && scopedMembers.some((m: AnggotaFullDetail) => m.anggota.id_anggota === selectedMemberId)) {
      return selectedMemberId;
    }
    return scopedMembers[0]?.anggota.id_anggota || fullMembers[0]?.anggota.id_anggota || '';
  });

  useEffect(() => {
    if (userRole === 'Anggota' && userMemberId) {
      setActiveMemberId(userMemberId);
    } else if (scopedMembers.length > 0 && !scopedMembers.some((m: AnggotaFullDetail) => m.anggota.id_anggota === activeMemberId)) {
      setActiveMemberId(scopedMembers[0].anggota.id_anggota);
    }
  }, [userRole, userMemberId, scopedMembers, activeMemberId]);

  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [verifyUrl, setVerifyUrl] = useState<string>('');
  const [shortDisplay, setShortDisplay] = useState<string>('');
  const [searchMember, setSearchMember] = useState('');
  const [cardSide, setCardSide] = useState<'both' | 'front' | 'back'>('both');

  const currentMember = scopedMembers.find((m) => m.anggota.id_anggota === activeMemberId) || scopedMembers[0] || fullMembers[0];

  // Generate dynamic encrypted QR Code whenever currentMember changes
  useEffect(() => {
    if (currentMember?.keanggotaan?.no_kta && currentMember?.anggota?.nik) {
      // Generate encrypted short verification URL without exposing raw No KTA & NIK
      const { url, shortDisplay: display } = generateKtaShortUrl({
        no_kta: currentMember.keanggotaan.no_kta,
        nik: currentMember.anggota.nik,
        id_anggota: currentMember.anggota.id_anggota,
      });

      setVerifyUrl(url);
      setShortDisplay(display);

      QRCode.toDataURL(url, {
        width: 180,
        margin: 1,
        color: {
          dark: '#064e3b', // Deep emerald
          light: '#ffffff',
        },
      })
        .then((dataUrl) => setQrDataUrl(dataUrl))
        .catch((err) => console.error('QR generation error', err));
    }
  }, [currentMember]);

  const fullNameWithTitles = currentMember
    ? (
        (currentMember.anggota.gelar_depan ? `${currentMember.anggota.gelar_depan} ` : '') +
        currentMember.anggota.nama_lengkap +
        (currentMember.anggota.gelar_belakang ? `, ${currentMember.anggota.gelar_belakang}` : '')
      ).toUpperCase()
    : '-';

  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    const frontEl = document.getElementById('kta-front');
    const backEl = document.getElementById('kta-back');

    if (!frontEl && !backEl) {
      alert('Elemen KTA tidak ditemukan!');
      return;
    }

    setIsExportingPdf(true);
    try {
      // Dimensions in mm: Standard ISO/IEC 7810 ID-1 (CR80 KTP / ATM) is 85.6mm x 54.0mm (8,56 cm x 5,4 cm)
      const cardWidthMm = 85.6;
      const cardHeightMm = 54.0;

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [cardWidthMm, cardHeightMm],
        compress: true,
      });

      const captureCardImage = async (el: HTMLElement): Promise<string> => {
        return await toPng(el, {
          quality: 0.98,
          pixelRatio: 3, // 300 DPI high-definition crisp card print
          cacheBust: true,
          skipFonts: true, // Prevents cross-origin web font fetching issues
        });
      };

      let pageCount = 0;

      // 1. Render Front Side if requested & element exists
      if (frontEl && (cardSide === 'both' || cardSide === 'front')) {
        const imgFront = await captureCardImage(frontEl);
        pdf.addImage(imgFront, 'PNG', 0, 0, cardWidthMm, cardHeightMm, undefined, 'FAST');
        pageCount++;
      }

      // 2. Render Back Side if requested & element exists
      if (backEl && (cardSide === 'both' || cardSide === 'back')) {
        if (pageCount > 0) {
          pdf.addPage([cardWidthMm, cardHeightMm], 'landscape');
        }
        const imgBack = await captureCardImage(backEl);
        pdf.addImage(imgBack, 'PNG', 0, 0, cardWidthMm, cardHeightMm, undefined, 'FAST');
      }

      const cleanName = (currentMember?.anggota?.nama_lengkap || 'PERANGKAT_DESA')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .toUpperCase();
      const ktaNo = (currentMember?.keanggotaan?.no_kta || 'KTA')
        .replace(/[^a-zA-Z0-9]/g, '_');

      pdf.save(`KTA_PPDI_${cleanName}_${ktaNo}.pdf`);
    } catch (err: any) {
      console.error('PDF Export Error:', err);
      alert('Gagal mengekspor file PDF KTA: ' + (err?.message || err));
    } finally {
      setIsExportingPdf(false);
    }
  };

  if (fullMembers.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-neutral-200 gap-3 no-print">
          <div>
            <h1 className="text-xl font-bold text-neutral-900 tracking-tight">
              E-KTA Digital & Kartu Anggota PPDI
            </h1>
            <p className="text-xs text-neutral-500 mt-0.5">
              Penerbitan Kartu Tanda Anggota digital berisikan QR Code verifikasi otentikasi kelembagaan
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center shadow-xs">
          <CreditCard className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-neutral-800">Belum Ada Data Anggota di Database</h3>
          <p className="text-xs text-neutral-500 max-w-md mx-auto mt-1">
            Data anggota sekarang dimuat secara live dari database. Daftarkan perangkat desa baru melalui menu Data Induk Anggota atau Impor Excel untuk menerbitkan E-KTA resmi.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-neutral-200 gap-3 no-print">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 tracking-tight">
            E-KTA Digital & Kartu Anggota PPDI
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Penerbitan Kartu Tanda Anggota digital berisikan QR Code verifikasi otentikasi kelembagaan (Ukuran KTP / ATM Standard 8,56 cm x 5,4 cm)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenVerifyModal(verifyUrl || currentMember?.keanggotaan?.no_kta)}
            className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            title="Uji Scan QR Code E-KTA Terenkripsi (Short URL)"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Uji Scan QR KTA</span>
          </button>
          <button
            onClick={handleDownloadPDF}
            disabled={isExportingPdf}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            title="Unduh File PDF KTA Ukuran KTP / ATM (8,56 cm x 5,4 cm)"
          >
            <Download className="w-4 h-4" />
            <span>{isExportingPdf ? 'Mengekspor PDF...' : 'Unduh PDF KTA (KTP/ATM)'}</span>
          </button>
          <button
            onClick={handlePrint}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            title="Cetak Langsung ke Printer"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak Kartu Fisik</span>
          </button>
        </div>
      </div>

      {/* Member Selector Bar */}
      <div className="bg-white p-3 rounded-xl border border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs no-print">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="font-semibold text-neutral-700 whitespace-nowrap">
            Pilih Perangkat Desa:
          </label>
          <select
            aria-label="Pilih Perangkat Desa untuk Kartu"
            value={activeMemberId}
            disabled={userRole === 'Anggota'}
            onChange={(e) => setActiveMemberId(e.target.value)}
            className="bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-900 w-full sm:w-80 focus:outline-hidden disabled:opacity-75 disabled:bg-neutral-100"
          >
            {scopedMembers.map((m: AnggotaFullDetail) => (
              <option key={m.anggota.id_anggota} value={m.anggota.id_anggota}>
                {m.anggota.nama_lengkap} - Desa {m.desa?.nama_desa} ({m.keanggotaan?.no_kta || 'KTA Pending'})
              </option>
            ))}
          </select>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-lg">
          <button
            onClick={() => setCardSide('both')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              cardSide === 'both' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-500'
            }`}
          >
            Depan & Belakang
          </button>
          <button
            onClick={() => setCardSide('front')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              cardSide === 'front' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-500'
            }`}
          >
            Tampak Depan
          </button>
          <button
            onClick={() => setCardSide('back')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              cardSide === 'back' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-500'
            }`}
          >
            Tampak Belakang
          </button>
        </div>
      </div>

      {/* CARD DISPLAY STAGE */}
      {currentMember && (
        <div className="flex flex-col items-center justify-center p-6 sm:p-10 bg-neutral-100/70 rounded-2xl border border-neutral-200">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl w-full">
            {/* ========================================================= */}
            {/* TAMPAK DEPAN KARTU (FRONT SIDE) */}
            {/* ========================================================= */}
            {(cardSide === 'both' || cardSide === 'front') && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider text-center no-print">
                  Tampak Muka (Depan)
                </div>
                <div
                  id="kta-front"
                  className="w-full aspect-[85.6/54] text-white rounded-2xl shadow-xl relative overflow-hidden p-4 sm:p-5 flex flex-col justify-between"
                  style={{
                    minHeight: '260px',
                    background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #042f2e 100%)',
                    border: '1px solid rgba(5, 150, 105, 0.4)',
                    color: '#ffffff',
                  }}
                >
                  {/* Decorative Guilloche / Geometry */}
                  <div
                    className="absolute inset-0 opacity-10 pointer-events-none"
                    style={{
                      backgroundImage: 'radial-gradient(circle, #fde047 1px, transparent 1px)',
                      backgroundSize: '16px 16px',
                    }}
                  ></div>
                  <div
                    className="absolute -top-12 -right-12 w-48 h-48 rounded-full blur-2xl pointer-events-none"
                    style={{ backgroundColor: 'rgba(251, 191, 36, 0.1)' }}
                  ></div>

                  {/* Organization Logo Watermark (Sesuai Logo Aplikasi) */}
                  {appLogo && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 w-48 h-48 opacity-[0.09] pointer-events-none select-none flex items-center justify-center">
                      <img
                        src={appLogo}
                        alt=""
                        className="w-full h-full object-contain filter grayscale brightness-200"
                      />
                    </div>
                  )}

                  {/* Header Organization Lockup (Sesuai Logo Aplikasi) */}
                  <div className="relative z-10 flex items-center justify-between pb-2.5 border-b border-amber-400/40">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-11 h-11 rounded-full p-0.5 shadow-md shrink-0 flex items-center justify-center overflow-hidden"
                        style={{
                          background: 'linear-gradient(180deg, #fcd34d 0%, #fbbf24 50%, #f59e0b 100%)',
                        }}
                      >
                        <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden p-0.5">
                          {appLogo ? (
                            <img
                              src={appLogo}
                              alt="Logo Aplikasi"
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <div className="w-full h-full rounded-full bg-emerald-950 flex items-center justify-center">
                              <Shield className="w-5 h-5 text-amber-300" />
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-[8px] sm:text-xs font-extrabold tracking-wider text-amber-300 uppercase leading-none">
                          {appSettings?.appName || 'PERSATUAN PERANGKAT DESA INDONESIA'}
                        </div>
                        <div className="text-[7px] sm:text-[8px] tracking-widest text-emerald-100 font-semibold uppercase mt-0.5">
                          PENGURUS DAERAH KAB. BANDUNG
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] font-bold text-amber-300 tracking-wider">E-KTA DIGITAL</div>
                      <div className="text-[8px] text-emerald-200">JAWA BARAT</div>
                    </div>
                  </div>

                  {/* Card Body: Photo & Credentials */}
                  <div className="relative z-10 grid grid-cols-12 gap-3 items-center py-1.5">
                    {/* Photo slot */}
                    <div className="col-span-4 flex flex-col items-center justify-center">
                      <div className="w-20 sm:w-22 aspect-[3/4] rounded-xl overflow-hidden border-2 border-amber-300 shadow-lg bg-neutral-900">
                        <img
                          src={getPhotoUrl(currentMember.anggota.foto, currentMember.anggota.jenis_kelamin)}
                          alt={currentMember.anggota.nama_lengkap}
                          className="w-full h-full object-cover"
                          onError={(e) => handleImageError(e, currentMember.anggota.jenis_kelamin)}
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    </div>

                    {/* Member Details */}
                    <div className="col-span-8 space-y-1 text-left min-w-0">
                      <div>
                        <div className="text-[8px] text-emerald-200 uppercase tracking-widest font-semibold">
                          Nama Perangkat Desa
                        </div>
                        <div className="text-xs sm:text-sm font-extrabold text-amber-300 tracking-tight leading-snug uppercase truncate">
                          {fullNameWithTitles}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-[10px]">
                        {currentMember.anggota.nipd && (
                          <div>
                            <span className="text-emerald-200 text-[8px] uppercase tracking-wider block">NIPD</span>
                            <span className="font-mono font-semibold text-white">{currentMember.anggota.nipd}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-emerald-200 text-[8px] uppercase tracking-wider block">Jabatan SOTK</span>
                          <span className="font-semibold text-white">{currentMember.jabatanRef?.nama_jabatan || 'Perangkat Desa'}</span>
                        </div>
                      </div>

                      <div className="text-[10px]">
                        <span className="text-emerald-200 text-[8px] uppercase tracking-wider block">Wilayah Tugas</span>
                        <div className="font-medium text-emerald-100 leading-tight truncate">
                          Desa {currentMember.desa?.nama_desa}, Kec. {currentMember.kecamatan?.nama_kecamatan}
                        </div>
                      </div>

                      {/* PROMINENT NOMOR KTA HIGHLIGHT CONTAINER */}
                      <div className="mt-1 p-2 rounded-xl bg-gradient-to-r from-emerald-950 via-[#022c22] to-emerald-950 border-2 border-amber-400/90 shadow-md flex items-center justify-between">
                        <div className="min-w-0">
                          <span className="text-[7.5px] text-amber-200 font-bold uppercase tracking-widest block leading-none mb-0.5">
                            NOMOR KTA DIGITAL PPDI
                          </span>
                          <span className="font-mono text-xs sm:text-sm font-black text-amber-300 tracking-widest drop-shadow-xs truncate block">
                            {currentMember.keanggotaan?.no_kta || '-'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer Bar */}
                  <div className="relative z-10 pt-1.5 border-t border-amber-400/30 flex items-center justify-between text-[8px] text-emerald-200">
                    <div>
                      <span>Status: </span>
                      <strong className="text-amber-300 font-bold uppercase">
                        {currentMember.keanggotaan?.status_kta}
                      </strong>
                    </div>
                    <div>Masa Berlaku: Selama Menjabat (Batas Usia 60 Thn)</div>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* TAMPAK BELAKANG KARTU (BACK SIDE) */}
            {/* ========================================================= */}
            {(cardSide === 'both' || cardSide === 'back') && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider text-center no-print">
                  Tampak Belakang (Validasi & QR Code)
                </div>
                <div
                  id="kta-back"
                  className="w-full aspect-[85.6/54] text-white rounded-2xl shadow-xl relative overflow-hidden p-4 sm:p-5 flex flex-col justify-between"
                  style={{
                    minHeight: '260px',
                    background: 'linear-gradient(315deg, #022c22 0%, #064e3b 50%, #065f46 100%)',
                    border: '1px solid rgba(5, 150, 105, 0.4)',
                    color: '#ffffff',
                  }}
                >
                  {/* Security Microprint & Subtle Geometry Background */}
                  <div
                    className="absolute inset-0 opacity-10 pointer-events-none"
                    style={{
                      backgroundImage: 'radial-gradient(circle, #fde047 1px, transparent 1px)',
                      backgroundSize: '14px 14px',
                    }}
                  ></div>
                  <div
                    className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full blur-2xl pointer-events-none"
                    style={{ backgroundColor: 'rgba(5, 150, 105, 0.2)' }}
                  ></div>

                  {/* Organization Logo Watermark */}
                  {appLogo && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 w-48 h-48 opacity-[0.07] pointer-events-none select-none flex items-center justify-center">
                      <img
                        src={appLogo}
                        alt=""
                        className="w-full h-full object-contain filter grayscale brightness-200"
                      />
                    </div>
                  )}

                  {/* Header Ketentuan & Autentikasi Organisasi */}
                  <div className="relative z-10 flex items-center justify-between pb-2 border-b border-amber-400/40">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center p-0.5 shrink-0 overflow-hidden shadow-xs border border-amber-300">
                        {appLogo ? (
                          <img
                            src={appLogo}
                            alt="Logo Aplikasi"
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <Shield className="w-3.5 h-3.5 text-emerald-900" />
                        )}
                      </div>
                      <span className="text-[10px] font-extrabold text-amber-300 uppercase tracking-wider">
                        KETENTUAN KARTU ANGGOTA PPDI
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-500/30">
                      <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span className="text-[8px] font-mono text-emerald-200 font-bold uppercase tracking-wider">
                        VERIFIED
                      </span>
                    </div>
                  </div>

                  {/* Body Row: Terms list (col-7) & QR Validation (col-5) */}
                  <div className="relative z-10 grid grid-cols-12 gap-3 items-center py-1.5">
                    {/* Terms & Regulations */}
                    <div className="col-span-7 sm:col-span-8 text-[8px] sm:text-[9px] text-emerald-100 space-y-1.5 leading-snug">
                      <div className="flex items-start gap-1">
                        <span className="text-amber-300 font-bold shrink-0">1.</span>
                        <p>Kartu ini merupakan tanda pengenal resmi anggota Persatuan Perangkat Desa Indonesia (PPDI) Kab. Bandung.</p>
                      </div>
                      <div className="flex items-start gap-1">
                        <span className="text-amber-300 font-bold shrink-0">2.</span>
                        <p>Berlaku sebagai bukti sah hak bantuan advokasi kelembagaan, kepesertaan organisasi, & jaringan kerja perangkat desa.</p>
                      </div>
                      <div className="flex items-start gap-1">
                        <span className="text-amber-300 font-bold shrink-0">3.</span>
                        <p>Apabila perangkat desa purna tugas atau diberhentikan, keanggotaan dan keabsahan kartu ini otomatis berakhir.</p>
                      </div>
                      <div className="pt-1 border-t border-emerald-800/80 text-[7.5px] text-amber-300/90 flex items-center gap-2">
                        <span className="font-semibold text-emerald-200">Sekretariat:</span>
                        <span className="truncate">Jl. Parungserab No. 54, Parungserab, Soreang, Kab. Bandung 40911</span>
                      </div>
                    </div>
                    

                    {/* QR Code Container & Security Seal */}
                    <div className="col-span-5 sm:col-span-4 flex flex-col items-center justify-center">
                      <div className="p-1.5 bg-white rounded-xl shadow-lg border-2 border-amber-400/90 relative group">
                        {qrDataUrl ? (
                          <img
                            src={qrDataUrl}
                            alt="QR Code Verifikasi E-KTA Terenkripsi"
                            className="w-20 sm:w-22 h-20 sm:h-22 object-contain"
                          />
                        ) : (
                          <div className="w-20 h-20 bg-neutral-200 animate-pulse rounded-lg"></div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Signature & Pengesahan Resmi */}
                  <div className="relative z-10 pt-2 border-t border-amber-400/40 flex items-center justify-between text-[8px]">
                    <div className="flex items-center gap-2">
                      {appLogo && (
                        <div className="w-7 h-7 rounded-full bg-white/95 p-0.5 shadow-xs shrink-0 flex items-center justify-center overflow-hidden border border-amber-300">
                          <img
                            src={appLogo}
                            alt="Logo Organisasi"
                            className="w-full h-full object-contain"
                          />
                        </div>
                      )}
                      <div>
                        <div className="text-[7.5px] text-emerald-200 uppercase tracking-wider">Diterbitkan oleh:</div>
                        <div className="font-bold text-white text-[8.5px]">Pengurus Daerah PPDI Kab. Bandung</div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-emerald-200 text-[7.5px]">Ketua Pengurus Daerah</div>
                      <div className="text-[7px] text-amber-300 font-mono tracking-wider font-semibold">[TTD & CAP RESMI]</div>
                      <div className="font-bold text-amber-300 text-[9.5px] mt-0.5 tracking-wide">
                        DADANG IYAS, S.Ip.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Member Verification Certificate Card & Quick Info */}
      <div className="bg-white p-5 rounded-xl border border-neutral-200 no-print space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
              Parameter Verifikasi Sertifikat Digital E-KTA
            </h3>
          </div>
          <span className="text-xs font-mono text-emerald-800 font-semibold bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
            Terverifikasi di Database Daerah
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs pt-1">
          <div>
            <span className="text-neutral-500 text-[11px] block">Format Penomoran KTA</span>
            <span className="font-mono font-semibold text-neutral-800">
              {currentMember?.keanggotaan?.no_kta}
            </span>
          </div>
          <div>
            <span className="text-neutral-500 text-[11px] block">Kode Wilayah Kemendagri</span>
            <span className="font-mono font-semibold text-neutral-800">
              {currentMember?.desa?.id_desa} ({currentMember?.kecamatan?.nama_kecamatan})
            </span>
          </div>
          <div>
            <span className="text-neutral-500 text-[11px] block">Status Purna Tugas Terhitung</span>
            <span className="font-semibold text-neutral-800">
              {currentMember?.statusPensiun} (Usia: {currentMember?.usia} Thn)
            </span>
          </div>
          <div>
            <span className="text-neutral-500 text-[11px] block">Iuran Terdaftar</span>
            <span className="font-semibold text-emerald-800">
              Rp {currentMember?.totalIuranLunas.toLocaleString('id-ID')}
            </span>
          </div>
          <div>
            <span className="text-neutral-500 text-[11px] block">Keamanan QR Code</span>
            <span className="font-mono font-bold text-emerald-700 flex items-center gap-1">
              <Lock className="w-3 h-3 text-emerald-600 shrink-0" />
              <span className="truncate" title={shortDisplay}>Terenkripsi (Short URL)</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};