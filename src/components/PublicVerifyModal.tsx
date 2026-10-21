import React, { useState } from 'react';
import { usePPDI } from '../context/PPDIContext';
import { AnggotaFullDetail } from '../types/ppdi';
import { formatDateIndo } from '../utils/ppdiHelpers';
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
  const { findMemberByKtaOrNik, fullMembers } = usePPDI();

  const [query, setQuery] = useState(initialQuery || (fullMembers[0]?.keanggotaan?.no_kta || ''));
  const [result, setResult] = useState<AnggotaFullDetail | null>(() => {
    return findMemberByKtaOrNik(initialQuery || (fullMembers[0]?.keanggotaan?.no_kta || ''));
  });
  const [hasSearched, setHasSearched] = useState(true);

  if (!isOpen) return null;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const found = findMemberByKtaOrNik(query);
    setResult(found);
    setHasSearched(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full flex flex-col my-6 border border-neutral-200">
        {/* Header */}
        <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-emerald-900 text-white rounded-t-xl">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-800 text-amber-300 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">Portal Verifikasi Keabsahan E-KTA</h2>
              <div className="text-[10px] text-emerald-200">PPDI Pengurus Daerah Kabupaten Bandung</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-emerald-200 hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-5 border-b border-neutral-200 bg-neutral-50/70">
          <form onSubmit={handleSearch} className="space-y-2">
            <label className="block text-xs font-semibold text-neutral-700">
              Masukkan Nomor KTA Digital (Format: 32.04.xx.xxxx.xxxx) atau NIK KTP:
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Contoh: 32.04.05.2001.0001 atau 3204051203750001"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-neutral-300 rounded-lg font-mono focus:outline-hidden focus:ring-1 focus:ring-emerald-700"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0"
              >
                Cek Validitas
              </button>
            </div>

            {/* Quick Demo Samples */}
            <div className="flex items-center gap-2 pt-1 text-[11px] text-neutral-500">
              <span>Coba sampel:</span>
              <button
                type="button"
                onClick={() => {
                  setQuery('32.04.05.2001.0001');
                  setResult(findMemberByKtaOrNik('32.04.05.2001.0001'));
                }}
                className="text-emerald-700 hover:underline font-mono"
              >
                32.04.05.2001.0001
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={() => {
                  setQuery('32.04.14.2002.0005');
                  setResult(findMemberByKtaOrNik('32.04.14.2002.0005'));
                }}
                className="text-emerald-700 hover:underline font-mono"
              >
                32.04.14.2002.0005
              </button>
            </div>
          </form>
        </div>

        {/* Result Area */}
        <div className="p-6 overflow-y-auto max-h-[60vh] text-xs">
          {hasSearched && result ? (
            <div className="space-y-4">
              {/* Validation Seal Badge */}
              <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50/80 flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-bold text-emerald-900 text-sm">
                    KTA TERVERIFIKASI RESMI & AKTIF
                  </div>
                  <p className="text-emerald-800 text-xs">
                    Data keanggotaan terdaftar secara sah di Pangkalan Data PPDI Kabupaten Bandung
                  </p>
                  <div className="text-[10px] text-emerald-700 font-mono pt-1">
                    Nomor Seri: {result.keanggotaan?.no_kta} · Verifikasi Real-time
                  </div>
                </div>
              </div>

              {/* Profile Overview */}
              <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-3">
                <div className="flex items-center gap-3 pb-3 border-b border-neutral-100">
                  <img
                    src={
                      result.anggota.foto ||
                      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80'
                    }
                    alt={result.anggota.nama_lengkap}
                    className="w-12 h-12 rounded-full object-cover border border-neutral-200 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <div className="font-bold text-neutral-900 text-sm">
                      {(result.anggota.gelar_depan ? `${result.anggota.gelar_depan} ` : '') +
                        result.anggota.nama_lengkap +
                        (result.anggota.gelar_belakang ? `, ${result.anggota.gelar_belakang}` : '')}
                    </div>
                    <div className="text-[11px] text-neutral-500 font-mono">
                      NIK: {result.anggota.nik} {result.anggota.nipd ? `· NIAP: ${result.anggota.nipd}` : ''}
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
                    <span className="font-mono text-neutral-800">{result.jabatanTerkini?.no_sk_pengangkatan}</span>
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
            <div className="p-6 text-center space-y-2">
              <XCircle className="w-10 h-10 text-red-500 mx-auto" />
              <div className="font-bold text-neutral-900">Data Tidak Ditemukan</div>
              <p className="text-neutral-500 text-xs max-w-sm mx-auto">
                Nomor KTA atau NIK yang Anda masukkan tidak terdaftar pada pangkalan data aktif PPDI Kabupaten Bandung. Silakan periksa kembali angka yang diinput.
              </p>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-3 bg-neutral-50 border-t border-neutral-200 rounded-b-xl flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-neutral-700 bg-neutral-200 hover:bg-neutral-300 rounded-lg cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
