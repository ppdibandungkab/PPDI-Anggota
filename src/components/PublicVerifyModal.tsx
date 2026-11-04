import React, { useState, useEffect } from 'react';
import { usePPDI } from '../context/PPDIContext';
import { AnggotaFullDetail } from '../types/ppdi';
import { formatDateIndo } from '../utils/ppdiHelpers';
import { getPhotoUrl, handleImageError } from '../utils/fileHelpers';
import { decodeKtaToken } from '../utils/qrCrypto';
import {
  ShieldCheck,
  Search,
  CheckCircle2,
  XCircle,
  X,
  Building,
  User,
  Shield,
  Clock,
  Sparkles,
  Lock,
  QrCode,
  Check,
  Copy,
} from 'lucide-react';

interface PublicVerifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
}

export const PublicVerifyModal: React.FC<PublicVerifyModalProps> = ({
  isOpen,
  onClose,
  initialQuery = '',
}) => {
  const { findMemberByKtaOrNik, fullMembers, appSettings } = usePPDI();

  const [query, setQuery] = useState('');
  const [result, setResult] = useState<AnggotaFullDetail | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isEncryptedToken, setIsEncryptedToken] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Synchronize state whenever modal opens or initialQuery changes
  useEffect(() => {
    if (isOpen) {
      const q = initialQuery || (fullMembers[0]?.keanggotaan?.no_kta || '');
      setQuery(q);
      const decoded = decodeKtaToken(q);
      setIsEncryptedToken(Boolean(decoded && decoded.valid));
      const found = findMemberByKtaOrNik(q);
      setResult(found);
      setHasSearched(Boolean(q));
    }
  }, [isOpen, initialQuery, fullMembers]);

  if (!isOpen) return null;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanQ = query.trim();
    const decoded = decodeKtaToken(cleanQ);
    setIsEncryptedToken(Boolean(decoded && decoded.valid));
    const found = findMemberByKtaOrNik(cleanQ);
    setResult(found);
    setHasSearched(true);
  };

  const handleCopyVerifiedUrl = () => {
    if (typeof window !== 'undefined' && query) {
      navigator.clipboard.writeText(query);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full flex flex-col my-6 border border-neutral-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-emerald-900 text-white rounded-t-xl">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center p-0.5 overflow-hidden shadow-xs">
              {appSettings?.logoUrl ? (
                <img
                  src={appSettings.logoUrl}
                  alt="Logo Organisasi"
                  className="w-full h-full object-contain"
                />
              ) : (
                <ShieldCheck className="w-5 h-5 text-emerald-900" />
              )}
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight flex items-center gap-1.5">
                <span>Portal Verifikasi Keabsahan E-KTA</span>
                <span className="text-[10px] bg-amber-400 text-emerald-950 font-mono font-bold px-1.5 py-0.2 rounded-xs">
                  RESMI
                </span>
              </h2>
              <div className="text-[10px] text-emerald-200">
                {appSettings?.appName || 'PPDI Pengurus Daerah Kabupaten Bandung'}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-emerald-200 hover:text-white rounded-lg cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar / Input Payload */}
        <div className="p-5 border-b border-neutral-200 bg-neutral-50/70">
          <form onSubmit={handleSearch} className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-neutral-700">
                Scan QR Code, Masukkan Token / Short URL, No KTA, atau NIK:
              </label>
              {isEncryptedToken && (
                <span className="text-[10px] text-emerald-700 font-mono font-bold flex items-center gap-1 bg-emerald-100 px-2 py-0.5 rounded">
                  <Lock className="w-3 h-3 text-emerald-600" />
                  <span>Payload Terenkripsi</span>
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Scan QR / Tempel URL / v_... / No KTA / NIK"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-neutral-300 rounded-lg font-mono focus:outline-hidden focus:ring-1 focus:ring-emerald-700 text-neutral-900"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 shadow-xs"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Verifikasi</span>
              </button>
            </div>

            {/* Quick Demo Samples */}
            <div className="flex items-center gap-2 pt-1 text-[11px] text-neutral-500 flex-wrap">
              <span>Sampel cepat:</span>
              <button
                type="button"
                onClick={() => {
                  const sampleKta = fullMembers[0]?.keanggotaan?.no_kta || '32.04.05.2001.0001';
                  setQuery(sampleKta);
                  setIsEncryptedToken(false);
                  setResult(findMemberByKtaOrNik(sampleKta));
                  setHasSearched(true);
                }}
                className="text-emerald-700 hover:underline font-mono text-[10px]"
              >
                {fullMembers[0]?.keanggotaan?.no_kta || '32.04.05.2001.0001'}
              </button>
              {fullMembers[1] && (
                <>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => {
                      const sampleKta2 = fullMembers[1]?.keanggotaan?.no_kta || '';
                      setQuery(sampleKta2);
                      setIsEncryptedToken(false);
                      setResult(findMemberByKtaOrNik(sampleKta2));
                      setHasSearched(true);
                    }}
                    className="text-emerald-700 hover:underline font-mono text-[10px]"
                  >
                    {fullMembers[1]?.keanggotaan?.no_kta}
                  </button>
                </>
              )}
            </div>
          </form>
        </div>

        {/* Result Area */}
        <div className="p-6 overflow-y-auto max-h-[60vh] text-xs">
          {hasSearched && result ? (
            <div className="space-y-4">
              {/* Validation Seal Badge */}
              <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50/90 flex items-start gap-3 shadow-xs">
                <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="font-bold text-emerald-900 text-sm">
                      KTA TERVERIFIKASI RESMI & AKTIF
                    </div>
                    {isEncryptedToken && (
                      <span className="text-[10px] font-mono font-bold bg-emerald-200 text-emerald-950 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" />
                        <span>QR Token Valid</span>
                      </span>
                    )}
                  </div>
                  <p className="text-emerald-800 text-xs">
                    Data keanggotaan terdaftar secara sah di Pangkalan Data Resmi PPDI Kabupaten Bandung.
                  </p>
                  <div className="text-[10px] text-emerald-700 font-mono pt-0.5 flex items-center justify-between">
                    <span>Nomor KTA: {result.keanggotaan?.no_kta}</span>
                    <span className="text-emerald-600">Status: {result.keanggotaan?.status_kta}</span>
                  </div>
                </div>
              </div>

              {/* Profile Overview */}
              <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-3 shadow-xs">
                <div className="flex items-center gap-3 pb-3 border-b border-neutral-100">
                  <img
                    src={getPhotoUrl(result.anggota.foto, result.anggota.jenis_kelamin)}
                    alt={result.anggota.nama_lengkap}
                    className="w-14 h-14 rounded-full object-cover border-2 border-emerald-600/30 shadow-xs shrink-0 bg-neutral-100"
                    onError={(e) => handleImageError(e, result.anggota.jenis_kelamin)}
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <div className="font-bold text-neutral-900 text-sm uppercase">
                      {(result.anggota.gelar_depan ? `${result.anggota.gelar_depan} ` : '') +
                        result.anggota.nama_lengkap +
                        (result.anggota.gelar_belakang ? `, ${result.anggota.gelar_belakang}` : '')}
                    </div>
                    <div className="text-[11px] text-neutral-500 font-mono flex items-center gap-1 mt-0.5">
                      {result.anggota.nipd && (
                        <>
                          <span>·</span>
                          <span>NIPD: {result.anggota.nipd}</span>
                        </>
                      )}
                      <span>·</span>
                      <span className="font-bold text-neutral-700">
                        {result.anggota.jenis_kelamin === 'P' ? 'Perempuan' : 'Laki-laki'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-neutral-500 text-[10px] block">Jabatan Formasi Desa</span>
                    <strong className="text-neutral-900 font-semibold">{result.jabatanRef?.nama_jabatan}</strong>
                  </div>

                  <div>
                    <span className="text-neutral-500 text-[10px] block">Wilayah Pemerintahan</span>
                    <strong className="text-neutral-900 font-semibold">
                      Desa {result.desa?.nama_desa}, Kec. {result.kecamatan?.nama_kecamatan}
                    </strong>
                  </div>

                  <div>
                    <span className="text-neutral-500 text-[10px] block">Nomor SK Pengangkatan</span>
                    <span className="font-mono text-neutral-800">{result.jabatanTerkini?.no_sk_pengangkatan || '-'}</span>
                  </div>

                  <div>
                    <span className="text-neutral-500 text-[10px] block">Terhitung Mulai Tanggal (TMT)</span>
                    <span className="text-neutral-800">{formatDateIndo(result.jabatanTerkini?.tmt_jabatan)}</span>
                  </div>

                  <div>
                    <span className="text-neutral-500 text-[10px] block">Jabatan Pengurus Organisasi</span>
                    <span className="text-emerald-800 font-semibold">
                      {result.keanggotaan?.jabatan_pengurus || 'Anggota Biasa'}
                    </span>
                  </div>

                  <div>
                    <span className="text-neutral-500 text-[10px] block">Evaluasi Purna Tugas (Batas 60 Th)</span>
                    <span className="text-neutral-800">
                      Usia {result.usia} Tahun ({result.statusPensiun})
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : hasSearched && !result ? (
            <div className="p-8 text-center space-y-2 bg-neutral-50 rounded-xl border border-dashed border-neutral-300">
              <XCircle className="w-10 h-10 text-red-500 mx-auto" />
              <div className="font-bold text-neutral-900 text-sm">Data Tidak Ditemukan</div>
              <p className="text-neutral-500 text-xs max-w-sm mx-auto leading-relaxed">
                Nomor KTA, Token QR terenkripsi, atau NIK yang Anda masukkan tidak terdaftar pada pangkalan data aktif PPDI Kabupaten Bandung. Pastikan data yang dimasukkan telah diverifikasi dan disetujui.
              </p>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-neutral-400">
              Silakan masukkan nomor KTA atau scan QR Code untuk memulai verifikasi keabsahan.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-neutral-50 border-t border-neutral-200 rounded-b-xl flex items-center justify-between">
          <div className="text-[10px] text-neutral-500 font-mono">
            {isEncryptedToken ? 'Metode: QR Code Terenkripsi (Short URL)' : 'Metode: Verifikasi Langsung'}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-neutral-700 bg-neutral-200 hover:bg-neutral-300 rounded-lg cursor-pointer transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
