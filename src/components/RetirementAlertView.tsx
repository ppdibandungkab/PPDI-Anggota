import React, { useState, useMemo } from 'react';
import { usePPDI } from '../context/PPDIContext';
import { AnggotaFullDetail } from '../types/ppdi';
import { formatDateIndo } from '../utils/ppdiHelpers';
import {
  ClockAlert,
  AlertTriangle,
  CheckCircle2,
  Phone,
  Send,
  FileSpreadsheet,
  Calendar,
  Building,
  UserCheck,
} from 'lucide-react';

interface RetirementAlertViewProps {
  onOpenDetailModal: (member: AnggotaFullDetail) => void;
}

export const RetirementAlertView: React.FC<RetirementAlertViewProps> = ({ onOpenDetailModal }) => {
  const { visibleMembers, updateRiwayatStatus, updateKTAStatus, currentUser } = usePPDI();

  const [activeCategory, setActiveCategory] = useState<'all' | 'kritis' | 'siaga' | 'waspada' | 'sudah'>('all');

  // Categorize members
  const categorized = useMemo(() => {
    const kritis = visibleMembers.filter((m) => m.statusPensiun === 'Kritis (<6 Bln)');
    const siaga = visibleMembers.filter((m) => m.statusPensiun === 'Siaga (<1 Thn)');
    const waspada = visibleMembers.filter((m) => m.statusPensiun === 'Waspada (<2 Thn)');
    const sudah = visibleMembers.filter((m) => m.statusPensiun === 'Sudah Purna Tugas');

    return {
      kritis,
      siaga,
      waspada,
      sudah,
      allAlerts: [...kritis, ...siaga, ...waspada, ...sudah],
    };
  }, [visibleMembers]);

  const displayList = useMemo(() => {
    if (activeCategory === 'kritis') return categorized.kritis;
    if (activeCategory === 'siaga') return categorized.siaga;
    if (activeCategory === 'waspada') return categorized.waspada;
    if (activeCategory === 'sudah') return categorized.sudah;
    return categorized.allAlerts;
  }, [categorized, activeCategory]);

  // Create WhatsApp message template
  const generateWAMessage = (m: AnggotaFullDetail) => {
    const text = `*PEMBERITAHUAN MASA PURNA TUGAS PERANGKAT DESA*
PPDI KABUPATEN BANDUNG

Kepada Yth:
*${m.anggota.nama_lengkap}*
NIK: ${m.anggota.nik}
Jabatan: ${m.jabatanRef?.nama_jabatan} Desa ${m.desa?.nama_desa}, Kec. ${m.kecamatan?.nama_kecamatan}

Berdasarkan UU Desa dan basis data kepegawaian PPDI Kab. Bandung:
- Tanggal Lahir: ${formatDateIndo(m.anggota.tanggal_lahir)}
- Batas Usia Pensiun: 60 Tahun
- Status: ${m.statusPensiun} (Sisa ${m.sisaMasaPensiunTahun} thn ${m.sisaMasaPensiunBulan % 12} bln)

Mohon untuk segera mempersiapkan berkas administrasi dan koordinasi bersama BPD serta Pengurus PPDI setempat.
Terima kasih atas pengabdian terbaik bagi kemajuan desa!`;

    const cleanPhone = m.anggota.no_hp_wa.replace(/^0/, '62').replace(/\D/g, '');
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  };

  const handleProsesPurnaTugas = (m: AnggotaFullDetail) => {
    if (
      confirm(
        `Konfirmasi memproses purna tugas untuk ${m.anggota.nama_lengkap}? Status jabatan akan diubah menjadi 'Purna Tugas' dan KTA disesuaikan.`
      )
    ) {
      if (m.jabatanTerkini) {
        updateRiwayatStatus(m.jabatanTerkini.id_riwayat, 'Purna Tugas');
      }
      updateKTAStatus(m.anggota.id_anggota, 'Non-Aktif');
      alert(`Berhasil memperbarui status purna tugas ${m.anggota.nama_lengkap}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-neutral-200 gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 tracking-tight">
            Peringatan Dini Masa Purna Tugas (Usia 60 Tahun)
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Sistem peringatan otomatis batas usia pensiun aparatur desa berdasarkan UU No. 3 Tahun 2024
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-3 py-1.5 bg-neutral-100 rounded-lg text-neutral-700 font-medium">
            Regulasi: Batas 60 Tahun
          </span>
        </div>
      </div>

      {/* 4 Categorized Counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <button
          onClick={() => setActiveCategory('kritis')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            activeCategory === 'kritis'
              ? 'bg-red-50 border-red-300 ring-2 ring-red-400'
              : 'bg-white border-neutral-200 hover:border-red-200'
          }`}
        >
          <div className="flex items-center justify-between text-red-700 font-semibold mb-1">
            <span>Kritis (&lt; 6 Bulan)</span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-red-900 tabular-nums">
            {categorized.kritis.length} <span className="text-xs font-normal text-neutral-500">Orang</span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">Perlu serah terima & SK Pensiun</div>
        </button>

        <button
          onClick={() => setActiveCategory('siaga')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            activeCategory === 'siaga'
              ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400'
              : 'bg-white border-neutral-200 hover:border-amber-200'
          }`}
        >
          <div className="flex items-center justify-between text-amber-700 font-semibold mb-1">
            <span>Siaga (&lt; 1 Tahun)</span>
            <ClockAlert className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-amber-900 tabular-nums">
            {categorized.siaga.length} <span className="text-xs font-normal text-neutral-500">Orang</span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">Persiapan kaderisasi desa</div>
        </button>

        <button
          onClick={() => setActiveCategory('waspada')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            activeCategory === 'waspada'
              ? 'bg-yellow-50 border-yellow-300 ring-2 ring-yellow-400'
              : 'bg-white border-neutral-200 hover:border-yellow-200'
          }`}
        >
          <div className="flex items-center justify-between text-yellow-800 font-semibold mb-1">
            <span>Waspada (&lt; 2 Tahun)</span>
            <Calendar className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-yellow-950 tabular-nums">
            {categorized.waspada.length} <span className="text-xs font-normal text-neutral-500">Orang</span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">Masa kerja usia 58 - 59 tahun</div>
        </button>

        <button
          onClick={() => setActiveCategory('sudah')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            activeCategory === 'sudah'
              ? 'bg-neutral-100 border-neutral-400 ring-2 ring-neutral-400'
              : 'bg-white border-neutral-200 hover:border-neutral-300'
          }`}
        >
          <div className="flex items-center justify-between text-neutral-700 font-semibold mb-1">
            <span>Sudah Purna Tugas (≥60 Th)</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-neutral-900 tabular-nums">
            {categorized.sudah.length} <span className="text-xs font-normal text-neutral-500">Orang</span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">Status purna tugas terkonfirmasi</div>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-lg text-xs">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              activeCategory === 'all' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600'
            }`}
          >
            Semua Peringatan ({categorized.allAlerts.length})
          </button>
          <button
            onClick={() => setActiveCategory('kritis')}
            className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              activeCategory === 'kritis' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600'
            }`}
          >
            Kritis ({categorized.kritis.length})
          </button>
          <button
            onClick={() => setActiveCategory('siaga')}
            className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              activeCategory === 'siaga' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600'
            }`}
          >
            Siaga ({categorized.siaga.length})
          </button>
          <button
            onClick={() => setActiveCategory('sudah')}
            className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              activeCategory === 'sudah' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600'
            }`}
          >
            Purna ({categorized.sudah.length})
          </button>
        </div>

        <span className="text-xs text-neutral-500">
          Kalkulasi per: <strong>14 Oktober 2026</strong>
        </span>
      </div>

      {/* Table of Members Approaching Retirement */}
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold">
                <th className="py-3 px-4">Nama Perangkat & NIK</th>
                <th className="py-3 px-4">Jabatan & Wilayah</th>
                <th className="py-3 px-4">Tanggal Lahir</th>
                <th className="py-3 px-4">Usia Saat Ini</th>
                <th className="py-3 px-4">Sisa Masa Jabatan</th>
                <th className="py-3 px-4 text-center">Status Peringatan</th>
                <th className="py-3 px-4 text-right">Tindakan Organisasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-neutral-800">
              {displayList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-neutral-400">
                    Tidak ada perangkat desa dalam kategori peringatan ini.
                  </td>
                </tr>
              ) : (
                displayList.map((m) => (
                  <tr key={m.anggota.id_anggota} className="hover:bg-neutral-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div
                        className="font-semibold text-neutral-900 hover:text-emerald-800 cursor-pointer uppercase tracking-tight"
                        onClick={() => onOpenDetailModal(m)}
                      >
                        {m.anggota.nama_lengkap.toUpperCase()}
                      </div>
                      <div className="text-[11px] font-mono text-neutral-500">NIK: {m.anggota.nik}</div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-medium text-neutral-900">{m.jabatanRef?.nama_jabatan}</div>
                      <div className="text-[11px] text-neutral-500">
                        Desa {m.desa?.nama_desa}, Kec. {m.kecamatan?.nama_kecamatan}
                      </div>
                    </td>

                    <td className="py-3 px-4 tabular-nums">
                      {formatDateIndo(m.anggota.tanggal_lahir)}
                    </td>

                    <td className="py-3 px-4 font-bold tabular-nums text-neutral-900">
                      {m.usia} Tahun
                    </td>

                    <td className="py-3 px-4">
                      {m.statusPensiun === 'Sudah Purna Tugas' ? (
                        <span className="text-neutral-500 font-medium">Genap 60 Tahun</span>
                      ) : (
                        <span className="font-semibold text-amber-900 tabular-nums">
                          {m.sisaMasaPensiunTahun} Tahun {m.sisaMasaPensiunBulan % 12} Bulan
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-sm font-semibold text-[11px] ${
                          m.statusPensiun === 'Kritis (<6 Bln)'
                            ? 'bg-red-50 text-red-800 border border-red-200'
                            : m.statusPensiun === 'Siaga (<1 Thn)'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : m.statusPensiun === 'Waspada (<2 Thn)'
                            ? 'bg-yellow-50 text-yellow-800 border border-yellow-200'
                            : 'bg-neutral-100 text-neutral-700'
                        }`}
                      >
                        {m.statusPensiun}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* WhatsApp Reminder Blast */}
                        <a
                          href={generateWAMessage(m)}
                          target="_blank"
                          rel="noreferrer"
                          title="Kirim Pemberitahuan WhatsApp"
                          className="px-2 py-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Phone className="w-3 h-3 text-emerald-600" />
                          <span>Notif WA</span>
                        </a>

                        {/* Proses Purna Tugas button */}
                        {currentUser.role !== 'Anggota' && m.statusPensiun !== 'Sudah Purna Tugas' && (
                          <button
                            onClick={() => handleProsesPurnaTugas(m)}
                            className="px-2 py-1 text-[11px] font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-md transition-colors cursor-pointer"
                          >
                            Proses Purna
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
