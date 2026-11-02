import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { usePPDI } from '../context/PPDIContext';
import { AnggotaFullDetail } from '../types/ppdi';
import { formatDateIndo } from '../utils/ppdiHelpers';
import { getPhotoUrl } from '../utils/fileHelpers';
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
} from 'lucide-react';

interface EKTAViewProps {
  selectedMemberId?: string;
  onOpenVerifyModal: (ktaOrNik?: string) => void;
}

export const EKTAView: React.FC<EKTAViewProps> = ({ selectedMemberId, onOpenVerifyModal }) => {
  const { visibleMembers, fullMembers, appSettings } = usePPDI();

  // App Logo synchronized from Application Settings
  const appLogo =
    appSettings?.logoUrl ||
    'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Logo_Kabupaten_Bandung.png/480px-Logo_Kabupaten_Bandung.png';

  // Selected member state
  const [activeMemberId, setActiveMemberId] = useState<string>(() => {
    if (selectedMemberId) return selectedMemberId;
    return visibleMembers[0]?.anggota.id_anggota || fullMembers[0]?.anggota.id_anggota || '';
  });

  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [searchMember, setSearchMember] = useState('');
  const [cardSide, setCardSide] = useState<'both' | 'front' | 'back'>('both');

  const currentMember = fullMembers.find((m) => m.anggota.id_anggota === activeMemberId) || fullMembers[0];

  // Generate dynamic QR Code whenever currentMember changes
  useEffect(() => {
    if (currentMember?.keanggotaan?.no_kta) {
      // Verification payload contains validation URL / signature
      const verifyPayload = `https://ppdi-bandungkab.id/verifikasi?kta=${encodeURIComponent(
        currentMember.keanggotaan.no_kta
      )}&nik=${encodeURIComponent(currentMember.anggota.nik)}`;

      QRCode.toDataURL(verifyPayload, {
        width: 160,
        margin: 1,
        color: {
          dark: '#064e3b', // Deep emerald
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
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

    if (!frontEl) {
      alert('Elemen KTA tidak ditemukan!');
      return;
    }

    setIsExportingPdf(true);
    try {
      // Dimensions in mm: Standard ISO/IEC 7810 ID-1 (CR80 KTP / ATM) is 85.6mm x 53.98mm
      const cardWidthMm = 85.6;
      const cardHeightMm = 53.98;

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [cardWidthMm, cardHeightMm],
        compress: true,
      });

      // Render Front Side Canvas with high resolution scale
      const canvasFront = await html2canvas(frontEl, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        logging: false,
      });
      const imgFront = canvasFront.toDataURL('image/png', 1.0);
      pdf.addImage(imgFront, 'PNG', 0, 0, cardWidthMm, cardHeightMm, undefined, 'FAST');

      // Render Back Side Canvas if available and requested
      if (backEl && (cardSide === 'both' || cardSide === 'back')) {
        pdf.addPage([cardWidthMm, cardHeightMm], 'landscape');
        const canvasBack = await html2canvas(backEl, {
          scale: 3,
          useCORS: true,
          allowTaint: true,
          backgroundColor: null,
          logging: false,
        });
        const imgBack = canvasBack.toDataURL('image/png', 1.0);
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
            Data anggota sekarang dimuat secara live dari database MySQL. Daftarkan perangkat desa baru melalui menu Data Induk Anggota atau Impor Excel untuk menerbitkan E-KTA resmi.
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
            Penerbitan Kartu Tanda Anggota digital berisikan QR Code verifikasi otentikasi kelembagaan (Ukuran KTP / ATM Standard CR80)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenVerifyModal(currentMember?.keanggotaan?.no_kta)}
            className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Uji Scan QR KTA</span>
          </button>
          <button
            onClick={handleDownloadPDF}
            disabled={isExportingPdf}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            title="Unduh File PDF KTA Ukuran KTP / ATM (85.6mm x 53.98mm)"
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
            onChange={(e) => setActiveMemberId(e.target.value)}
            className="bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-900 w-full sm:w-80 focus:outline-hidden"
          >
            {fullMembers.map((m) => (
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
                  className="w-full aspect-[85.6/53.98] bg-linear-to-br from-emerald-900 via-emerald-800 to-teal-950 text-white rounded-2xl shadow-xl relative overflow-hidden border border-emerald-600/40 p-4 sm:p-5 flex flex-col justify-between"
                  style={{ minHeight: '260px' }}
                >
                  {/* Decorative Guilloche / Geometry */}
                  <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fde047_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none"></div>
                  <div className="absolute -top-12 -right-12 w-48 h-48 bg-amber-400/10 rounded-full blur-2xl pointer-events-none"></div>

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
                      <div className="w-11 h-11 rounded-full bg-linear-to-b from-amber-300 via-amber-400 to-amber-500 p-0.5 shadow-md shrink-0 flex items-center justify-center overflow-hidden">
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
                        <div className="text-[10px] sm:text-xs font-extrabold tracking-wider text-amber-300 uppercase leading-none">
                          {appSettings?.appName || 'PERSATUAN PERANGKAT DESA INDONESIA'}
                        </div>
                        <div className="text-[9px] sm:text-[10px] tracking-widest text-emerald-100 font-semibold uppercase mt-0.5">
                          PENGURUS DAERAH KABUPATEN BANDUNG
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] font-bold text-amber-300 tracking-wider">E-KTA DIGITAL</div>
                      <div className="text-[8px] text-emerald-200">JAWA BARAT</div>
                    </div>
                  </div>

                  {/* Card Body: Photo & Credentials */}
                  <div className="relative z-10 grid grid-cols-12 gap-3 items-center py-2">
                    {/* Photo slot */}
                    <div className="col-span-4 flex flex-col items-center">
                      <div className="w-20 sm:w-24 aspect-[3/4] rounded-lg overflow-hidden border-2 border-amber-300 shadow-md bg-neutral-800">
                        <img
                          src={getPhotoUrl(currentMember.anggota.foto)}
                          alt={currentMember.anggota.nama_lengkap}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="mt-1 text-[8px] font-bold tracking-widest text-amber-300 uppercase">
                        PPDI KAB. BANDUNG
                      </div>
                    </div>

                    {/* Member Details */}
                    <div className="col-span-8 space-y-1 text-left">
                      <div>
                        <div className="text-[9px] text-emerald-200 uppercase tracking-wider">
                          Nama Perangkat Desa
                        </div>
                        <div className="text-xs sm:text-sm font-bold text-amber-300 tracking-tight leading-tight uppercase">
                          {fullNameWithTitles}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
                        <div>
                          <span className="text-emerald-300 text-[8px] block">NIK KTP</span>
                          <span className="font-mono font-semibold">{currentMember.anggota.nik}</span>
                        </div>
                        <div>
                          <span className="text-emerald-300 text-[8px] block">NIAP / NIPD</span>
                          <span className="font-mono font-semibold">
                            {currentMember.anggota.nipd || '-'}
                          </span>
                        </div>
                      </div>

                      <div className="text-[10px]">
                        <span className="text-emerald-300 text-[8px] block">Jabatan / Wilayah Tugas</span>
                        <div className="font-semibold text-white leading-tight">
                          {currentMember.jabatanRef?.nama_jabatan}
                        </div>
                        <div className="text-[9px] text-emerald-100">
                          Desa {currentMember.desa?.nama_desa}, Kec. {currentMember.kecamatan?.nama_kecamatan}
                        </div>
                      </div>

                      <div className="pt-0.5 flex items-center justify-between text-[9px] text-amber-200 border-t border-emerald-700/60 mt-1">
                        <div>
                          <span>Nomor KTA: </span>
                          <strong className="font-mono text-white text-[10px]">
                            {currentMember.keanggotaan?.no_kta}
                          </strong>
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
                    <div>Masa Berlaku: Selama Menjabat (Batas 60 Thn)</div>
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
                  className="w-full aspect-[85.6/53.98] bg-linear-to-tl from-emerald-950 via-teal-900 to-emerald-900 text-white rounded-2xl shadow-xl relative overflow-hidden border border-emerald-600/40 p-4 sm:p-5 flex flex-col justify-between"
                  style={{ minHeight: '260px' }}
                >
                  {/* Subtle Background Pattern */}
                  <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fde047_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none"></div>

                  {/* Organization Logo Watermark (Sesuai Logo Aplikasi) */}
                  {appLogo && (
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 w-44 h-44 opacity-[0.08] pointer-events-none select-none flex items-center justify-center">
                      <img
                        src={appLogo}
                        alt=""
                        className="w-full h-full object-contain filter grayscale brightness-200"
                      />
                    </div>
                  )}

                  {/* Header Ketentuan (Sesuai Logo Aplikasi) */}
                  <div className="relative z-10 flex items-center justify-between pb-1.5 border-b border-amber-400/30">
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center p-0.5 shrink-0 overflow-hidden shadow-2xs">
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
                      <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                        KETENTUAN KARTU ANGGOTA PPDI
                      </span>
                    </div>
                    <span className="text-[8px] text-emerald-200 font-mono">DIPERIKSA KAB. BANDUNG</span>
                  </div>

                  {/* Rules & QR Row */}
                  <div className="relative z-10 grid grid-cols-12 gap-3 items-center py-1">
                    <div className="col-span-8 text-[8px] sm:text-[9px] text-emerald-100 space-y-1">
                      <p>
                        1. Kartu ini merupakan tanda pengenal resmi anggota Persatuan Perangkat Desa Indonesia (PPDI) Kab. Bandung.
                      </p>
                      <p>
                        2. Digunakan untuk identifikasi hak advokasi, bantuan hukum ketenagakerjaan desa, dan kepesertaan organisasi.
                      </p>
                      <p>
                        3. Apabila perangkat desa purna tugas, diberhentikan, atau mengundurkan diri, kartu ini dinyatakan tidak berlaku.
                      </p>
                      <p className="text-[8px] text-amber-300/90 italic">
                        Sekretariat: Jl. Raya Soreang No. 45, Soreang, Kab. Bandung 40911
                      </p>
                    </div>

                    {/* QR Code Container */}
                    <div className="col-span-4 flex flex-col items-center justify-center">
                      <div className="p-1.5 bg-white rounded-lg shadow-md border-2 border-amber-300 relative">
                        {qrDataUrl ? (
                          <img
                            src={qrDataUrl}
                            alt="QR Code Verifikasi KTA"
                            className="w-20 sm:w-24 h-20 sm:h-24 object-contain"
                          />
                        ) : (
                          <div className="w-20 h-20 bg-neutral-200 animate-pulse rounded"></div>
                        )}
                      </div>
                      <span className="text-[7px] text-amber-200 font-mono mt-1">SCAN UNTUK VALIDASI</span>
                    </div>
                  </div>

                  {/* Signature & Legal Endorsement */}
                  <div className="relative z-10 pt-1.5 border-t border-amber-400/30 flex items-center justify-between text-[8px]">
                    <div className="flex items-center gap-2">
                      {appLogo && (
                        <div className="w-6 h-6 rounded-full bg-white/95 p-0.5 shadow-2xs shrink-0 flex items-center justify-center overflow-hidden">
                          <img
                            src={appLogo}
                            alt="Logo Organisasi"
                            className="w-full h-full object-contain"
                          />
                        </div>
                      )}
                      <div>
                        <div className="text-emerald-300">Diterbitkan oleh:</div>
                        <div className="font-semibold text-white">Pengurus Daerah PPDI Kab. Bandung</div>
                      </div>
                    </div>

                    <div className="text-center">
                      <div className="text-emerald-200">Ketua Pengurus Daerah</div>
                      <div className="text-[7px] text-amber-300 font-mono tracking-wider">[TTD & CAP RESMI]</div>
                      <div className="font-bold text-amber-300 text-[9px] mt-0.5">
                        Dadang Iyas, S.Ip.
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

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs pt-1">
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
        </div>
      </div>
    </div>
  );
};
