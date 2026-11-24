import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Send,
  Copy,
  Check,
  UserCheck,
  Building2,
  Phone,
  KeyRound,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Search,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { usePPDI } from '../context/PPDIContext';
import { AnggotaFullDetail, UserAccount } from '../types/ppdi';
import {
  buildSekdesAdminDesaAccountMessage,
  dispatchWhatsAppNotification,
  formatPhoneForWhatsApp,
  isFonnteWebhookActive,
  isSekretarisDesaJabatan,
} from '../utils/ppdiHelpers';
import {
  PRIMARY_DEFAULT_PASSWORD,
  isDefaultPasswordRequired,
} from '../utils/authHelpers';

interface SendSekdesUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialUser?: UserAccount | null;
  initialMember?: AnggotaFullDetail | null;
}

const normalizeCode = (val?: string | number | null): string =>
  String(val || '')
    .replace(/[^0-9a-z]/gi, '')
    .toLowerCase();

const isHashedPassword = (pw?: string | null): boolean => {
  if (!pw) return true;
  const trimmed = pw.trim();
  if (!trimmed) return true;
  return (
    /^\$2[aby]\$\d{2}\$/.test(trimmed) ||
    /^[a-f0-9]{64}$/i.test(trimmed) ||
    /^\$argon2/.test(trimmed)
  );
};

export const SendSekdesUserModal: React.FC<SendSekdesUserModalProps> = ({
  isOpen,
  onClose,
  initialUser = null,
  initialMember = null,
}) => {
  const { users, fullMembers, desaList, kecamatanList, appSettings, currentUser } = usePPDI();

  // Admin Desa accounts visible to current admin
  const adminDesaAccounts = useMemo(() => {
    const isKecAdmin = currentUser.role === 'Admin_Kecamatan';
    const userKecNorm = normalizeCode(currentUser.id_kecamatan);
    return users
      .filter((u) => {
        if (u.role !== 'Admin_Desa') return false;
        if (isKecAdmin && userKecNorm) {
          const uKecNorm = normalizeCode(u.id_kecamatan);
          if (uKecNorm && uKecNorm !== userKecNorm) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const desaA = desaList.find((d) => normalizeCode(d.id_desa) === normalizeCode(a.id_desa))?.nama_desa || a.username;
        const desaB = desaList.find((d) => normalizeCode(d.id_desa) === normalizeCode(b.id_desa))?.nama_desa || b.username;
        return desaA.localeCompare(desaB, 'id');
      });
  }, [users, currentUser.role, currentUser.id_kecamatan, desaList]);

  // All Sekretaris Desa members in database
  const sekdesMembers = useMemo(() => {
    return fullMembers.filter((m) => isSekretarisDesaJabatan(m.jabatanRef?.nama_jabatan));
  }, [fullMembers]);

  const findSekdesForDesa = (idDesa?: string | null): AnggotaFullDetail | null => {
    const targetNorm = normalizeCode(idDesa);
    if (!targetNorm) return null;
    const matches = sekdesMembers.filter(
      (m) =>
        normalizeCode(m.jabatanTerkini?.id_desa) === targetNorm ||
        normalizeCode(m.desa?.id_desa) === targetNorm
    );
    if (matches.length === 0) return null;
    const activeMatch = matches.find(
      (m) => String(m.jabatanTerkini?.status_aktif || '').toLowerCase() === 'aktif'
    );
    return activeMatch || matches[0];
  };

  const findAdminDesaForDesa = (idDesa?: string | null, namaDesa?: string | null): UserAccount | null => {
    const targetNorm = normalizeCode(idDesa);
    if (targetNorm) {
      const exact = adminDesaAccounts.find((u) => normalizeCode(u.id_desa) === targetNorm);
      if (exact) return exact;
    }
    const cleanName = String(namaDesa || '')
      .replace(/^desa\s+/i, '')
      .trim()
      .toLowerCase();
    if (cleanName) {
      const byName = adminDesaAccounts.find(
        (u) =>
          u.nama.toLowerCase().includes(cleanName) ||
          u.username.toLowerCase().includes(cleanName.replace(/\s+/g, ''))
      );
      if (byName) return byName;
    }
    return null;
  };

  // Selection & editable form state
  const [accountSearch, setAccountSearch] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [namaDesa, setNamaDesa] = useState('');
  const [namaKecamatan, setNamaKecamatan] = useState('');
  const [sekdesName, setSekdesName] = useState('');
  const [sekdesIdAnggota, setSekdesIdAnggota] = useState<string | undefined>(undefined);
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(PRIMARY_DEFAULT_PASSWORD);
  const [hasCustomPasswordWarning, setHasCustomPasswordWarning] = useState(false);

  // Action states
  const [copied, setCopied] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendFeedback, setSendFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const populateFromAccount = (acc: UserAccount | null, forcedMember?: AnggotaFullDetail | null) => {
    const matchedMember = forcedMember || (acc ? findSekdesForDesa(acc.id_desa) : null);

    const desaObj = desaList.find(
      (d) =>
        normalizeCode(d.id_desa) === normalizeCode(acc?.id_desa || matchedMember?.jabatanTerkini?.id_desa || matchedMember?.desa?.id_desa)
    );
    const kecIdToFind =
      desaObj?.id_kecamatan ||
      acc?.id_kecamatan ||
      matchedMember?.kecamatan?.id_kecamatan ||
      '';
    const kecObj = kecamatanList.find((k) => normalizeCode(k.id_kecamatan) === normalizeCode(kecIdToFind));

    setSelectedAccountId(acc ? String(acc.id_user) : '');
    setNamaDesa(desaObj?.nama_desa || matchedMember?.desa?.nama_desa || '');
    setNamaKecamatan(kecObj?.nama_kecamatan || matchedMember?.kecamatan?.nama_kecamatan || '');

    setSekdesName(matchedMember?.anggota.nama_lengkap || '');
    setSekdesIdAnggota(matchedMember?.anggota.id_anggota);
    setPhone(matchedMember?.anggota.no_hp_wa || '');

    setUsername(acc?.username || '');
    if (acc && acc.password && !isHashedPassword(acc.password)) {
      setPassword(acc.password);
      setHasCustomPasswordWarning(false);
    } else {
      setPassword(PRIMARY_DEFAULT_PASSWORD);
      setHasCustomPasswordWarning(Boolean(acc && !isDefaultPasswordRequired(acc)));
    }
    setSendFeedback(null);
  };

  useEffect(() => {
    if (!isOpen) return;
    setAccountSearch('');
    setCopied(false);
    setSendFeedback(null);

    if (initialMember) {
      const matchedAcc = findAdminDesaForDesa(
        initialMember.jabatanTerkini?.id_desa || initialMember.desa?.id_desa,
        initialMember.desa?.nama_desa
      );
      populateFromAccount(matchedAcc, initialMember);
    } else if (initialUser) {
      populateFromAccount(initialUser, null);
    } else if (adminDesaAccounts.length > 0) {
      // Prioritize first Admin_Desa account that has an active Sekretaris Desa with WA number
      const withSekdes = adminDesaAccounts.find((u) => {
        const s = findSekdesForDesa(u.id_desa);
        return Boolean(s?.anggota.no_hp_wa);
      });
      populateFromAccount(withSekdes || adminDesaAccounts[0], null);
    } else {
      populateFromAccount(null, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialUser?.id_user, initialMember?.anggota.id_anggota]);

  const filteredAdminDesaOptions = useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    if (!q) return adminDesaAccounts;
    return adminDesaAccounts.filter((u) => {
      const desaName = desaList.find((d) => normalizeCode(d.id_desa) === normalizeCode(u.id_desa))?.nama_desa || '';
      const kecName = kecamatanList.find((k) => normalizeCode(k.id_kecamatan) === normalizeCode(u.id_kecamatan))?.nama_kecamatan || '';
      const sekdes = findSekdesForDesa(u.id_desa);
      const haystack = `${u.username} ${u.nama} ${desaName} ${kecName} ${sekdes?.anggota.nama_lengkap || ''}`.toLowerCase();
      return haystack.includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminDesaAccounts, accountSearch, desaList, kecamatanList, sekdesMembers]);

  const messagePreview = useMemo(() => {
    return buildSekdesAdminDesaAccountMessage({
      namaDesa: namaDesa || '[Nama Desa]',
      namaKecamatan: namaKecamatan || '[Nama Kecamatan]',
      username: username || '[Username]',
      password: password || '[Password]',
    });
  }, [namaDesa, namaKecamatan, username, password]);

  if (!isOpen) return null;

  const fonnteActive = isFonnteWebhookActive(appSettings?.whatsappSettings);
  const cleanPhone = formatPhoneForWhatsApp(phone);
  const waMeDirectUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messagePreview)}`;
  const canSend = Boolean(
    cleanPhone.length >= 8 &&
    namaDesa.trim() &&
    namaKecamatan.trim() &&
    username.trim() &&
    password.trim()
  );

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(messagePreview);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setSendFeedback({ type: 'error', text: 'Gagal menyalin pesan ke clipboard browser.' });
    }
  };

  const handleSendWhatsApp = async () => {
    if (!canSend) {
      setSendFeedback({
        type: 'error',
        text: 'Lengkapi Nomor WhatsApp Sekretaris Desa, Nama Desa, Kecamatan, Username, dan Password terlebih dahulu.',
      });
      return;
    }

    setIsSending(true);
    setSendFeedback(null);
    try {
      const result = await dispatchWhatsAppNotification({
        phone,
        message: messagePreview,
        recipientName: sekdesName
          ? `Sekretaris Desa ${namaDesa} (${sekdesName})`
          : `Sekretaris Desa ${namaDesa}`,
        idAnggota: sekdesIdAnggota,
        category: 'akun_admin_desa_sekdes',
        whatsappSettings: appSettings?.whatsappSettings,
      });

      if (result.success) {
        setSendFeedback({
          type: 'success',
          text:
            result.mode === 'fonnte'
              ? `Akses akun Admin Desa berhasil dikirim ke Sekretaris Desa ${namaDesa} via Fonnte API.`
              : `Membuka WhatsApp (wa.me) untuk Sekretaris Desa ${namaDesa} (${phone}).`,
        });
      } else {
        setSendFeedback({
          type: 'error',
          text: result.message || 'Gagal mengirim pesan WhatsApp.',
        });
      }
    } catch (err: any) {
      setSendFeedback({
        type: 'error',
        text: err?.message || 'Terjadi kesalahan saat mengirim pesan WhatsApp.',
      });
    } finally {
      setIsSending(false);
    }
  };

  const isLockedMode = Boolean(initialUser || initialMember);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden text-neutral-900 my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-[#064E3B] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
              <Send className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold uppercase tracking-wide">
                Kirim Akun Admin Desa ke Sekretaris Desa
              </h3>
              <p className="text-[11px] text-emerald-200">
                Pengiriman kredensial khusus jabatan <strong className="text-white">Sekretaris Desa</strong> via{' '}
                {fonnteActive ? 'Fonnte WhatsApp Gateway' : 'WhatsApp (wa.me)'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Tutup modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto text-xs flex-1">
          {/* Selector akun Admin Desa (jika dibuka dari tombol header tanpa target spesifik) */}
          {!isLockedMode && (
            <div className="p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-700 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[#064E3B]" />
                  <span>Pilih Akun Admin Desa ({adminDesaAccounts.length} Akun)</span>
                </label>
                <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                  Khusus Sekretaris Desa
                </span>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  placeholder="Cari nama desa, kecamatan, username, atau nama Sekdes..."
                  className="w-full pl-8 pr-3 py-2 bg-white border border-neutral-300 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-[#064E3B]/20 focus:border-[#064E3B]"
                />
              </div>

              <select
                value={selectedAccountId}
                onChange={(e) => {
                  const found = adminDesaAccounts.find((u) => String(u.id_user) === e.target.value) || null;
                  populateFromAccount(found, null);
                }}
                className="w-full p-2.5 bg-white border border-neutral-300 rounded-lg text-xs font-mono font-semibold text-neutral-900 focus:outline-hidden focus:ring-2 focus:ring-[#064E3B]/20 focus:border-[#064E3B] cursor-pointer"
              >
                <option value="">-- Pilih Akun Admin Desa --</option>
                {filteredAdminDesaOptions.map((acc) => {
                  const dName = desaList.find((d) => normalizeCode(d.id_desa) === normalizeCode(acc.id_desa))?.nama_desa || acc.nama;
                  const kName = kecamatanList.find((k) => normalizeCode(k.id_kecamatan) === normalizeCode(acc.id_kecamatan))?.nama_kecamatan || '';
                  const sekdes = findSekdesForDesa(acc.id_desa);
                  const sekdesTag = sekdes
                    ? sekdes.anggota.no_hp_wa
                      ? `Sekdes: ${sekdes.anggota.nama_lengkap} (${sekdes.anggota.no_hp_wa})`
                      : `Sekdes: ${sekdes.anggota.nama_lengkap} (No WA kosong)`
                    : 'Sekdes belum terdaftar';
                  return (
                    <option key={acc.id_user} value={String(acc.id_user)}>
                      Desa {dName}{kName ? ` - Kec. ${kName}` : ''} | {acc.username} | {sekdesTag}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Status Penerima Sekretaris Desa */}
          {sekdesName ? (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5">
              <UserCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5 text-emerald-950">
                <div className="font-bold text-xs uppercase tracking-tight">
                  Penerima Terverifikasi: {sekdesName}
                </div>
                <div className="text-[11px] text-emerald-800">
                  Jabatan: <strong>Sekretaris Desa</strong> · Desa <strong>{namaDesa || '-'}</strong>, Kec.{' '}
                  <strong>{namaKecamatan || '-'}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-bold text-xs">
                  Data Sekretaris Desa Belum Ditemukan Otomatis di Database Anggota
                </div>
                <div className="text-[11px] text-amber-800 leading-relaxed">
                  Pastikan nomor WhatsApp tujuan di bawah ini adalah nomor aktif milik{' '}
                  <strong>Sekretaris Desa {namaDesa || 'bersangkutan'}</strong> sebelum mengirim kredensial.
                </div>
              </div>
            </div>
          )}

          {/* Peringatan jika akun Admin Desa tidak ditemukan otomatis saat dibuka dari profil Sekdes */}
          {initialMember && !selectedAccountId && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl flex items-start gap-2.5 text-orange-950">
              <ShieldAlert className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                Akun <strong>Admin_Desa</strong> untuk Desa <strong>{namaDesa || '-'}</strong> belum ditemukan di
                tabel pengguna. Silakan isi Username &amp; Password secara manual atau buat akun Admin Desa terlebih
                dahulu di menu <em>Pengaturan User</em>.
              </div>
            </div>
          )}

          {/* Form Field Kredensial & Tujuan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-neutral-700 uppercase block">
                Nama Desa <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={namaDesa}
                onChange={(e) => setNamaDesa(e.target.value)}
                placeholder="Contoh: Soreang"
                className="w-full p-2.5 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#064E3B]/20 focus:border-[#064E3B] text-neutral-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-neutral-700 uppercase block">
                Nama Kecamatan <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={namaKecamatan}
                onChange={(e) => setNamaKecamatan(e.target.value)}
                placeholder="Contoh: Soreang"
                className="w-full p-2.5 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#064E3B]/20 focus:border-[#064E3B] text-neutral-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-neutral-700 uppercase flex items-center gap-1">
                <Phone className="w-3 h-3 text-emerald-700" />
                <span>No. WhatsApp Sekretaris Desa</span>
                <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0812xxxxxxxx"
                className="w-full p-2.5 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#064E3B]/20 focus:border-[#064E3B] text-neutral-900 font-semibold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-neutral-700 uppercase block">
                Username Admin Desa <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="contoh: desa.soreang"
                className="w-full p-2.5 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#064E3B]/20 focus:border-[#064E3B] text-[#064E3B] font-bold"
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-[11px] font-bold text-neutral-700 uppercase flex items-center gap-1">
                <KeyRound className="w-3 h-3 text-amber-600" />
                <span>Password Akun Admin Desa</span>
                <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={PRIMARY_DEFAULT_PASSWORD}
                className="w-full p-2.5 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#064E3B]/20 focus:border-[#064E3B] text-neutral-900 font-bold"
              />
              {hasCustomPasswordWarning && (
                <p className="text-[10px] font-sans text-amber-700 mt-1">
                  Catatan: Akun ini tercatat sudah pernah mengganti password dari default sistem ({PRIMARY_DEFAULT_PASSWORD}). Pastikan Anda mengisi password aktif atau melakukan reset password terlebih dahulu jika diperlukan.
                </p>
              )}
            </div>
          </div>

          {/* Live Preview Pesan WhatsApp */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-700">
                Pratinjau Pesan WhatsApp (Format Resmi Sekdes)
              </span>
              <button
                type="button"
                onClick={handleCopyMessage}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border border-neutral-300 transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                    <span className="text-emerald-800">Pesan Tersalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Salin Pesan</span>
                  </>
                )}
              </button>
            </div>
            <pre className="w-full p-3.5 rounded-xl bg-emerald-50/50 border border-emerald-200 text-[11.5px] leading-relaxed text-neutral-800 whitespace-pre-wrap font-sans max-h-60 overflow-y-auto select-all">
              {messagePreview}
            </pre>
          </div>

          {/* Inline Feedback */}
          {sendFeedback && (
            <div
              className={`p-3 rounded-lg border flex items-start gap-2 text-xs font-medium ${
                sendFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-red-50 border-red-300 text-red-900'
              }`}
            >
              {sendFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              )}
              <span>{sendFeedback.text}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 bg-neutral-50 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            {fonnteActive && cleanPhone.length >= 8 && (
              <a
                href={waMeDirectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-300 transition-colors"
                title="Buka pesan secara manual di WhatsApp Web / Aplikasi"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Buka via wa.me</span>
              </a>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
              className="px-4 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={handleSendWhatsApp}
              disabled={isSending || !canSend}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#064E3B] hover:bg-[#043d2e] text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Mengirim...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 text-amber-300" />
                  <span>{fonnteActive ? 'Kirim via Fonnte API' : 'Kirim ke WhatsApp Sekdes'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
