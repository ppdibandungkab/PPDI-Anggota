import React, { useState } from 'react';
import { usePPDI } from '../context/PPDIContext';
import { AnggotaFullDetail, StatusAktifJabatan, StatusKTA } from '../types/ppdi';
import { formatDateIndo, formatRupiah } from '../utils/ppdiHelpers';
import {
  X,
  User,
  Briefcase,
  CreditCard,
  Wallet,
  FileText,
  ClockAlert,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Building,
  CheckCircle,
  Plus,
  ExternalLink,
} from 'lucide-react';

interface AnggotaDetailModalProps {
  member: AnggotaFullDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectForKTA: (member: AnggotaFullDetail) => void;
  onOpenAddIuranForMember?: (memberId: string) => void;
}

export const AnggotaDetailModal: React.FC<AnggotaDetailModalProps> = ({
  member,
  isOpen,
  onClose,
  onSelectForKTA,
}) => {
  const {
    riwayatList,
    iuranList,
    jabatanList,
    desaList,
    addRiwayatJabatan,
    updateRiwayatStatus,
    updateKTAStatus,
    currentUser,
  } = usePPDI();

  const [activeTab, setActiveTab] = useState<'bio' | 'karir' | 'kta' | 'iuran' | 'dokumen'>('bio');

  // Form state for adding new riwayat jabatan (mutasi/promosi)
  const [showAddRiwayat, setShowAddRiwayat] = useState(false);
  const [newDesa, setNewDesa] = useState(member?.jabatanTerkini?.id_desa || '32.04.05.2001');
  const [newJabatan, setNewJabatan] = useState(member?.jabatanTerkini?.id_jabatan || 2);
  const [newNoSk, setNewNoSk] = useState('');
  const [newTglSk, setNewTglSk] = useState('2026-03-01');
  const [newTmt, setNewTmt] = useState('2026-03-15');
  const [newKet, setNewKet] = useState('');

  if (!isOpen || !member) return null;

  const memberRiwayats = riwayatList.filter((r) => r.id_anggota === member.anggota.id_anggota);
  const memberIurans = iuranList.filter((i) => i.id_anggota === member.anggota.id_anggota);

  const handleCreateNewRiwayat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoSk.trim()) return;

    // Set old active to Mutasi
    const oldActive = memberRiwayats.find((r) => r.status_aktif === 'Aktif');
    if (oldActive) {
      updateRiwayatStatus(oldActive.id_riwayat, 'Mutasi');
    }

    addRiwayatJabatan({
      id_anggota: member.anggota.id_anggota,
      id_desa: newDesa,
      id_jabatan: Number(newJabatan),
      no_sk_pengangkatan: newNoSk,
      tgl_sk_pengangkatan: newTglSk,
      tmt_jabatan: newTmt,
      status_aktif: 'Aktif',
      file_sk: `SK_MUTASI_${member.anggota.nama_lengkap.replace(/\s+/g, '_').toUpperCase()}.pdf`,
      keterangan: newKet || 'Rotasi / Perubahan Jabatan Perangkat Desa',
    });

    setShowAddRiwayat(false);
    setNewNoSk('');
    setNewKet('');
  };

  const fullNameWithTitles = (
    (member.anggota.gelar_depan ? `${member.anggota.gelar_depan} ` : '') +
    member.anggota.nama_lengkap +
    (member.anggota.gelar_belakang ? `, ${member.anggota.gelar_belakang}` : '')
  ).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col my-6 border border-neutral-200">
        {/* Header Profile Bar */}
        <div className="p-5 border-b border-neutral-200 flex items-start justify-between bg-neutral-50/70 rounded-t-xl gap-4">
          <div className="flex items-center gap-4">
            <img
              src={
                member.anggota.foto ||
                'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80'
              }
              alt={member.anggota.nama_lengkap.toUpperCase()}
              className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-xs shrink-0"
              referrerPolicy="no-referrer"
            />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-neutral-900 uppercase tracking-tight">{fullNameWithTitles}</h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-sm bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
                  {member.keanggotaan?.no_kta || 'KTA Pending'}
                </span>
              </div>
              <div className="text-xs text-neutral-600 flex items-center gap-2 mt-1">
                <span>{member.jabatanRef?.nama_jabatan}</span>
                <span>·</span>
                <span>Desa {member.desa?.nama_desa}</span>
                <span>·</span>
                <span>Kec. {member.kecamatan?.nama_kecamatan}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onSelectForKTA(member);
              }}
              className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-white hover:bg-emerald-50 border border-emerald-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Lihat E-KTA</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 text-neutral-400 hover:text-neutral-700 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 pt-2 border-b border-neutral-200 bg-white text-xs">
          {[
            { id: 'bio', label: 'Biodata & Identitas', icon: User },
            { id: 'karir', label: `Rekam Jejak SK (${memberRiwayats.length})`, icon: Briefcase },
            { id: 'kta', label: 'Keanggotaan PPDI', icon: CreditCard },
            { id: 'iuran', label: `Histori Iuran (${memberIurans.length})`, icon: Wallet },
            { id: 'dokumen', label: 'e-Arsip Berkas SK', icon: FileText },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-2.5 font-medium border-b-2 cursor-pointer transition-colors ${
                  isActive
                    ? 'border-emerald-700 text-emerald-800 font-semibold'
                    : 'border-transparent text-neutral-500 hover:text-neutral-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 text-xs">
          {/* TAB 1: BIODATA */}
          {activeTab === 'bio' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-neutral-200 space-y-3">
                  <h3 className="font-bold text-neutral-900 uppercase tracking-wider text-[11px] pb-1 border-b border-neutral-100">
                    Data Kependudukan (KTP & NIPD)
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Nomor Induk Kependudukan (NIK)</span>
                      <span className="font-mono font-semibold text-neutral-900">{member.anggota.nik}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Nomor Induk Perangkat Desa (NIAP)</span>
                      <span className="font-mono text-neutral-900">{member.anggota.nipd || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Tempat, Tanggal Lahir</span>
                      <span className="text-neutral-900">
                        {member.anggota.tempat_lahir}, {formatDateIndo(member.anggota.tanggal_lahir)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Jenis Kelamin</span>
                      <span className="text-neutral-900">
                        {member.anggota.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Agama</span>
                      <span className="text-neutral-900">{member.anggota.agama}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Pendidikan Terakhir</span>
                      <span className="font-semibold text-neutral-900">{member.anggota.pendidikan_terakhir}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Status Pernikahan</span>
                      <span className="text-neutral-900">{member.anggota.status_pernikahan}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-neutral-200 space-y-3">
                  <h3 className="font-bold text-neutral-900 uppercase tracking-wider text-[11px] pb-1 border-b border-neutral-100">
                    Kontak & Alamat Domisili
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-emerald-700 shrink-0" />
                      <div>
                        <div className="text-[10px] text-neutral-400">Nomor WhatsApp Aktif</div>
                        <a
                          href={`https://wa.me/62${member.anggota.no_hp_wa.replace(/^0/, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono font-medium text-emerald-700 hover:underline"
                        >
                          {member.anggota.no_hp_wa}
                        </a>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-neutral-500 shrink-0" />
                      <div>
                        <div className="text-[10px] text-neutral-400">Email Resmi</div>
                        <div className="text-neutral-900">{member.anggota.email || '-'}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 pt-1">
                      <MapPin className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-[10px] text-neutral-400">Alamat Tempat Tinggal</div>
                        <div className="text-neutral-900 leading-relaxed">{member.anggota.alamat_rumah}</div>
                      </div>
                    </div>
                  </div>

                  {/* Retirement Card */}
                  <div className="mt-4 p-3 bg-neutral-50 rounded-lg border border-neutral-200 space-y-1">
                    <div className="text-[10px] uppercase font-semibold text-neutral-500">
                      Evaluasi Batas Usia Pensiun (60 Tahun)
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-neutral-900">{member.usia} Tahun</span>
                      <span
                        className={`px-2 py-0.5 rounded-sm font-semibold text-[10px] ${
                          member.statusPensiun === 'Kritis (<6 Bln)'
                            ? 'bg-red-50 text-red-800'
                            : member.statusPensiun === 'Siaga (<1 Thn)'
                            ? 'bg-amber-50 text-amber-800'
                            : member.statusPensiun === 'Sudah Purna Tugas'
                            ? 'bg-neutral-100 text-neutral-700'
                            : 'bg-emerald-50 text-emerald-800'
                        }`}
                      >
                        {member.statusPensiun}
                      </span>
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      Sisa masa jabatan: {member.sisaMasaPensiunTahun} tahun {member.sisaMasaPensiunBulan % 12} bulan
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: REKAM JEJAK KARIR & SK */}
          {activeTab === 'karir' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
                <div>
                  <h3 className="font-bold text-neutral-900">Kronologi Jabatan & Surat Keputusan (SK)</h3>
                  <p className="text-[11px] text-neutral-500">
                    Rekam jejak mutasi, promosi, dan riwayat SK pengangkatan perangkat desa
                  </p>
                </div>
                {currentUser.role !== 'Anggota' && (
                  <button
                    onClick={() => setShowAddRiwayat(!showAddRiwayat)}
                    className="px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Catat Mutasi / SK Baru</span>
                  </button>
                )}
              </div>

              {/* Form Input Riwayat Baru */}
              {showAddRiwayat && (
                <form
                  onSubmit={handleCreateNewRiwayat}
                  className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 space-y-3"
                >
                  <div className="font-semibold text-neutral-900 text-xs">Form Entri Mutasi / SK Baru</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-neutral-600 mb-1">Desa</label>
                      <select
                        value={newDesa}
                        onChange={(e) => setNewDesa(e.target.value)}
                        className="w-full p-1.5 bg-white border border-neutral-300 rounded-md"
                      >
                        {desaList.map((d) => (
                          <option key={d.id_desa} value={d.id_desa}>
                            Desa {d.nama_desa}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-neutral-600 mb-1">Jabatan Baru</label>
                      <select
                        value={newJabatan}
                        onChange={(e) => setNewJabatan(Number(e.target.value))}
                        className="w-full p-1.5 bg-white border border-neutral-300 rounded-md"
                      >
                        {jabatanList.map((j) => (
                          <option key={j.id_jabatan} value={j.id_jabatan}>
                            {j.nama_jabatan}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-neutral-600 mb-1">Nomor SK Pengangkatan</label>
                      <input
                        type="text"
                        value={newNoSk}
                        onChange={(e) => setNewNoSk(e.target.value)}
                        placeholder="141.1/Kep.xx-Desa/2026"
                        className="w-full p-1.5 bg-white border border-neutral-300 rounded-md font-mono"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-neutral-600 mb-1">Tanggal SK</label>
                        <input
                          type="date"
                          value={newTglSk}
                          onChange={(e) => setNewTglSk(e.target.value)}
                          className="w-full p-1.5 bg-white border border-neutral-300 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-neutral-600 mb-1">TMT Jabatan</label>
                        <input
                          type="date"
                          value={newTmt}
                          onChange={(e) => setNewTmt(e.target.value)}
                          className="w-full p-1.5 bg-white border border-neutral-300 rounded-md"
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-neutral-600 mb-1">Keterangan Rotasi</label>
                      <input
                        type="text"
                        value={newKet}
                        onChange={(e) => setNewKet(e.target.value)}
                        placeholder="Contoh: Rotasi jabatan dari Kaur Keuangan ke Sekretaris Desa"
                        className="w-full p-1.5 bg-white border border-neutral-300 rounded-md"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAddRiwayat(false)}
                      className="px-3 py-1 bg-neutral-200 text-neutral-700 rounded-md cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1 bg-emerald-800 text-white rounded-md font-semibold cursor-pointer"
                    >
                      Simpan Mutasi
                    </button>
                  </div>
                </form>
              )}

              {/* Timeline List of Riwayat */}
              <div className="space-y-3">
                {memberRiwayats.map((rw) => {
                  const j = jabatanList.find((x) => x.id_jabatan === rw.id_jabatan);
                  const d = desaList.find((x) => x.id_desa === rw.id_desa);

                  return (
                    <div
                      key={rw.id_riwayat}
                      className="p-4 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50/50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-neutral-900">{j?.nama_jabatan}</span>
                            <span
                              className={`px-2 py-0.5 rounded-sm font-semibold text-[10px] ${
                                rw.status_aktif === 'Aktif'
                                  ? 'bg-emerald-50 text-emerald-800'
                                  : rw.status_aktif === 'Purna Tugas'
                                  ? 'bg-neutral-100 text-neutral-600'
                                  : 'bg-amber-50 text-amber-800'
                              }`}
                            >
                              {rw.status_aktif}
                            </span>
                          </div>
                          <div className="text-neutral-500 text-xs mt-0.5">
                            Desa {d?.nama_desa} ({rw.id_desa}) · Kategori: {j?.kategori_jabatan}
                          </div>
                        </div>

                        {currentUser.role !== 'Anggota' && (
                          <select
                            aria-label="Ubah Status Jabatan"
                            value={rw.status_aktif}
                            onChange={(e) =>
                              updateRiwayatStatus(rw.id_riwayat, e.target.value as StatusAktifJabatan)
                            }
                            className="text-[11px] bg-neutral-50 border border-neutral-200 rounded px-2 py-1"
                          >
                            <option value="Aktif">Aktif</option>
                            <option value="Purna Tugas">Purna Tugas</option>
                            <option value="Mutasi">Mutasi</option>
                            <option value="Diberhentikan">Diberhentikan</option>
                            <option value="Meninggal Dunia">Meninggal Dunia</option>
                          </select>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-neutral-100 text-[11px]">
                        <div>
                          <div className="text-neutral-400">Nomor SK</div>
                          <div className="font-mono font-medium text-neutral-800">{rw.no_sk_pengangkatan}</div>
                        </div>
                        <div>
                          <div className="text-neutral-400">Tanggal SK</div>
                          <div className="text-neutral-800">{formatDateIndo(rw.tgl_sk_pengangkatan)}</div>
                        </div>
                        <div>
                          <div className="text-neutral-400">TMT Jabatan</div>
                          <div className="text-neutral-800">{formatDateIndo(rw.tmt_jabatan)}</div>
                        </div>
                        <div>
                          <div className="text-neutral-400">Berkas SK</div>
                          <span className="text-emerald-700 font-medium">{rw.file_sk || 'Tersimpan'}</span>
                        </div>
                      </div>
                      {rw.keterangan && (
                        <div className="mt-2 text-[11px] text-neutral-500 italic">
                          Catatan: {rw.keterangan}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: STATUS KEANGGOTAAN PPDI & KTA */}
          {activeTab === 'kta' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                  <div>
                    <h3 className="font-bold text-neutral-900">Kartu Tanda Anggota (KTA) Digital PPDI</h3>
                    <p className="text-[11px] text-neutral-500">
                      Identitas resmi keanggotaan Persatuan Perangkat Desa Indonesia
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      onClose();
                      onSelectForKTA(member);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Tampilkan Kartu & Cetak</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Nomor KTA Digital</span>
                      <span className="font-mono font-bold text-neutral-900">
                        {member.keanggotaan?.no_kta || '32.04.xx.xxxx.xxxx'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Tanggal Terdaftar</span>
                      <span className="text-neutral-900">
                        {formatDateIndo(member.keanggotaan?.tgl_bergabung)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Jabatan Pengurus PPDI</span>
                      <span className="font-semibold text-neutral-900">
                        {member.keanggotaan?.jabatan_pengurus || 'Anggota Biasa'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-neutral-500">Status Keabsahan KTA</span>
                      {currentUser.role !== 'Anggota' ? (
                        <select
                          aria-label="Ubah Status KTA"
                          value={member.keanggotaan?.status_kta || 'Aktif'}
                          onChange={(e) =>
                            updateKTAStatus(member.anggota.id_anggota, e.target.value as StatusKTA)
                          }
                          className="text-xs bg-neutral-50 border border-neutral-300 rounded px-2 py-1"
                        >
                          <option value="Aktif">Aktif</option>
                          <option value="Pending">Pending</option>
                          <option value="Non-Aktif">Non-Aktif</option>
                        </select>
                      ) : (
                        <span className="font-semibold text-emerald-800">
                          {member.keanggotaan?.status_kta}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-[11px] text-neutral-600 space-y-1.5">
                    <div className="font-bold text-neutral-800">Ketentuan KTA PPDI:</div>
                    <p>1. KTA digital memuat QR Code unik yang terhubung ke basis data keanggotaan Kabupaten Bandung.</p>
                    <p>2. Hak pembelaan hukum, advokasi ketenagakerjaan desa, dan hak suara organisasi melekat pada status KTA Aktif.</p>
                    <p>3. Iuran bulanan teratur memastikan validitas keanggotaan tetap berlaku.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: HISTORI IURAN ANGGOTA */}
          {activeTab === 'iuran' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
                <div>
                  <h3 className="font-bold text-neutral-900">Histori Pembayaran Iuran Wajib</h3>
                  <p className="text-[11px] text-neutral-500">
                    Kewajiban iuran kas organisasi Rp 35.000 / bulan
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-neutral-400">Total Telah Lunas</div>
                  <div className="font-bold text-emerald-800 text-sm">
                    {formatRupiah(member.totalIuranLunas)}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto border border-neutral-200 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600">
                    <tr>
                      <th className="p-2.5">Periode</th>
                      <th className="p-2.5">Jumlah</th>
                      <th className="p-2.5">Tanggal Bayar</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {memberIurans.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-neutral-400">
                          Belum ada catatan iuran untuk anggota ini
                        </td>
                      </tr>
                    ) : (
                      memberIurans.map((iur) => (
                        <tr key={iur.id_iuran}>
                          <td className="p-2.5 font-medium">
                            Bulan {iur.bulan} / {iur.tahun}
                          </td>
                          <td className="p-2.5 font-mono">{formatRupiah(iur.jumlah)}</td>
                          <td className="p-2.5 text-neutral-600">{iur.tgl_bayar}</td>
                          <td className="p-2.5">
                            <span
                              className={`px-2 py-0.5 rounded-sm font-semibold text-[10px] ${
                                iur.status_verifikasi === 'Lunas'
                                  ? 'bg-emerald-50 text-emerald-800'
                                  : 'bg-amber-50 text-amber-800'
                              }`}
                            >
                              {iur.status_verifikasi}
                            </span>
                          </td>
                          <td className="p-2.5 text-neutral-500">{iur.catatan || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: E-ARSIP BERKAS SK */}
          {activeTab === 'dokumen' && (
            <div className="space-y-4">
              <div className="p-5 border border-neutral-200 rounded-xl bg-neutral-50 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-neutral-900">Arsip Digital Surat Keputusan (SK)</h3>
                    <p className="text-[11px] text-neutral-500">
                      Dokumen bukti otentik pengangkatan perangkat desa untuk keperluan hukum & advokasi
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 bg-white border border-neutral-200 rounded-lg text-emerald-800">
                    Status: Terverifikasi Hukum
                  </span>
                </div>

                {/* Simulated Official Document Viewer */}
                <div className="bg-white p-6 rounded-lg border border-neutral-300 font-serif shadow-xs max-w-xl mx-auto space-y-4 text-neutral-900">
                  <div className="text-center pb-3 border-b-2 border-neutral-800 space-y-1">
                    <div className="font-bold text-sm tracking-wider">PEMERINTAH KABUPATEN BANDUNG</div>
                    <div className="font-bold text-base tracking-wider uppercase">
                      KECAMATAN {member.kecamatan?.nama_kecamatan}
                    </div>
                    <div className="font-bold text-sm uppercase">KANTOR KEPALA DESA {member.desa?.nama_desa}</div>
                    <div className="text-[10px] font-sans text-neutral-500">{member.desa?.alamat_kantor_desa}</div>
                  </div>

                  <div className="text-center space-y-1">
                    <div className="font-bold underline text-xs">KEPUTUSAN KEPALA DESA {member.desa?.nama_desa}</div>
                    <div className="font-mono text-[11px]">
                      Nomor: {member.jabatanTerkini?.no_sk_pengangkatan || '141.1/Kep.01/Desa/2023'}
                    </div>
                    <div className="text-[11px] italic font-sans">TENTANG</div>
                    <div className="font-bold text-xs uppercase">
                      PENGANGKATAN PERANGKAT DESA {member.desa?.nama_desa}
                    </div>
                  </div>

                  <div className="text-xs space-y-2 font-sans pt-2">
                    <p>
                      <strong>MEMUTUSKAN:</strong>
                    </p>
                    <p>
                      Mengangkat Saudara/i <strong>{fullNameWithTitles}</strong> (NIK: {member.anggota.nik}) dalam jabatan sebagai <strong>{member.jabatanRef?.nama_jabatan}</strong> Desa {member.desa?.nama_desa} Kecamatan {member.kecamatan?.nama_kecamatan} Kabupaten Bandung.
                    </p>
                    <p className="text-neutral-600 text-[11px]">
                      Terhitung Mulai Tanggal: <strong>{formatDateIndo(member.jabatanTerkini?.tmt_jabatan)}</strong> dengan masa jabatan sesuai ketentuan perundang-undangan sampai dengan usia 60 (enam puluh) tahun.
                    </p>
                  </div>

                  <div className="pt-4 flex justify-end text-center font-sans text-xs">
                    <div className="space-y-1">
                      <div>Ditetapkan di: {member.desa?.nama_desa}</div>
                      <div>Pada tanggal: {formatDateIndo(member.jabatanTerkini?.tgl_sk_pengangkatan)}</div>
                      <div className="font-bold pt-8">KEPALA DESA {member.desa?.nama_desa}</div>
                      <div className="text-[10px] text-neutral-400 font-mono">[Cap Stempel & TTD Digital]</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-neutral-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
