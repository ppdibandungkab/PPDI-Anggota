import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { usePPDI } from '../context/PPDIContext';
import { AnggotaFullDetail, StatusAktifJabatan, StatusKTA } from '../types/ppdi';
import {
  formatDateIndo,
  formatRupiah,
  formatNIPDDisplay,
  safeFetchJson,
  isSekretarisDesaJabatan,
  getMemberKtaVerifyByIdUrl,
} from '../utils/ppdiHelpers';
import { getPhotoUrl, handleImageError } from '../utils/fileHelpers';
import {
  buildMemberVCard,
  generateRawVCardQrDataUrl,
  composeVCardQrCardPng,
  generateKtaVerifyQrDataUrl,
  composeKtaVerifyQrCardPng,
  buildSafeFileSlug,
} from '../utils/vcardHelpers';
import {
  X,
  User,
  Briefcase,
  CreditCard,
  Wallet,
  FileText,
  Phone,
  Mail,
  MapPin,
  Plus,
  Download,
  RefreshCw,
  History,
  QrCode,
  Copy,
  Check,
  Clock,
  ShieldCheck,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Send,
  ExternalLink,
} from 'lucide-react';
import { exportMemberProfileToPDF } from '../utils/pdfProfileExport';
import { SendSekdesUserModal } from './SendSekdesUserModal';

interface MemberActivityItem {
  id: string;
  timestamp: string;
  sortTime: number;
  user_name: string;
  user_role: string;
  modul: string;
  aksi: string;
  deskripsi: string;
  source: 'database' | 'local' | 'milestone';
}

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
    updateKeanggotaanJabatan,
    activityLogs,
    currentUser,
    appSettings,
    hasPermission,
  } = usePPDI();

  const [activeTab, setActiveTab] = useState<'bio' | 'karir' | 'kta' | 'iuran' | 'dokumen' | 'aktivitas'>('bio');
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  // Member Activity History state
  const [serverActivityLogs, setServerActivityLogs] = useState<MemberActivityItem[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState<'all' | 'profil' | 'jabatan' | 'kta'>('all');

  // vCard QR Code generator modal state
  const [showQrPanel, setShowQrPanel] = useState(false);
  const [qrRawDataUrl, setQrRawDataUrl] = useState<string>('');
  const [vcardText, setVcardText] = useState<string>('');
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [isDownloadingQrCard, setIsDownloadingQrCard] = useState(false);
  const [showRawVcard, setShowRawVcard] = useState(false);
  const [copiedVcard, setCopiedVcard] = useState(false);
  const [isSendSekdesModalOpen, setIsSendSekdesModalOpen] = useState(false);

  // Unique Member ID -> Public KTA Verification QR Code modal state
  const [showKtaVerifyQrPanel, setShowKtaVerifyQrPanel] = useState(false);
  const [ktaVerifyQrUrl, setKtaVerifyQrUrl] = useState<string>('');
  const [ktaVerifyQrDataUrl, setKtaVerifyQrDataUrl] = useState<string>('');
  const [isGeneratingKtaQr, setIsGeneratingKtaQr] = useState(false);
  const [isDownloadingKtaQrCard, setIsDownloadingKtaQrCard] = useState(false);
  const [copiedKtaVerifyUrl, setCopiedKtaVerifyUrl] = useState(false);

  const canSendSekdesAccount =
    (currentUser.role === 'Superadmin_Kabupaten' ||
      currentUser.role === 'Admin_Kabupaten' ||
      currentUser.role === 'Admin_Kecamatan') &&
    isSekretarisDesaJabatan(member?.jabatanRef?.nama_jabatan);

  const memberId = member?.anggota.id_anggota ? String(member.anggota.id_anggota) : '';
  const memberNik = member?.anggota.nik ? String(member.anggota.nik) : '';

  const parseTimestampMs = (raw?: string | null): number => {
    if (!raw) return 0;
    const direct = Date.parse(raw);
    if (!Number.isNaN(direct)) return direct;
    // Handle id-ID locale format like "19/11/2026, 07.42.10"
    const m = String(raw).match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})[,\s]+(\d{1,2})[\.:](\d{2})(?:[\.:](\d{2}))?/);
    if (m) {
      const [, dd, mm, yyyy, hh, mi, ss] = m;
      const dt = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss || 0));
      return dt.getTime();
    }
    return 0;
  };

  const formatActivityTimestamp = (raw?: string | null): string => {
    if (!raw) return '-';
    const ms = parseTimestampMs(raw);
    if (!ms) return raw;
    return new Date(ms).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const fetchMemberActivity = useCallback(async () => {
    if (!memberId) return;
    setIsLoadingActivity(true);
    setActivityError(null);
    try {
      const url = `/api/anggota/${encodeURIComponent(memberId)}/activity${
        memberNik ? `?nik=${encodeURIComponent(memberNik)}` : ''
      }`;
      const res = await safeFetchJson<{ logs?: any[] }>(url);
      if (res.ok && res.data?.success !== false && Array.isArray(res.data?.logs)) {
        const mapped: MemberActivityItem[] = res.data.logs.map((row: any) => ({
          id: String(row.id || `db_${Math.random().toString(36).slice(2)}`),
          timestamp: row.timestamp || new Date().toISOString(),
          sortTime: parseTimestampMs(row.timestamp),
          user_name: row.user_name || 'Administrator',
          user_role: row.user_role || 'Admin',
          modul: row.modul || 'Data Induk Anggota',
          aksi: String(row.aksi || 'EDIT').toUpperCase(),
          deskripsi: row.deskripsi || row.keterangan || '-',
          source: 'database',
        }));
        setServerActivityLogs(mapped);
      } else {
        setServerActivityLogs([]);
        if (res.error) setActivityError(res.error);
      }
    } catch (err: any) {
      setActivityError(err?.message || 'Gagal memuat log aktivitas dari server');
    } finally {
      setIsLoadingActivity(false);
    }
  }, [memberId, memberNik]);

  // Reset modal sub-states when member changes or closes
  useEffect(() => {
    if (!isOpen || !member) {
      setShowQrPanel(false);
      setShowKtaVerifyQrPanel(false);
      setShowRawVcard(false);
      setCopiedVcard(false);
      setCopiedKtaVerifyUrl(false);
      setActionFeedback(null);
      return;
    }
    setActiveTab('bio');
    setActivityFilter('all');
    setShowQrPanel(false);
    setShowKtaVerifyQrPanel(false);
    setShowRawVcard(false);
    setQrRawDataUrl('');
    setVcardText('');
    setKtaVerifyQrUrl('');
    setKtaVerifyQrDataUrl('');
    setCopiedKtaVerifyUrl(false);
    setNewDesa(member.jabatanTerkini?.id_desa || '32.04.05.2001');
    setNewJabatan(member.jabatanTerkini?.id_jabatan || 2);
    setNewPeriode(
      Number(member.jabatanTerkini?.id_jabatan) === 10 && member.jabatanTerkini?.periode
        ? String(member.jabatanTerkini.periode)
        : ''
    );
  }, [isOpen, memberId]);

  // Fetch activity logs whenever the user opens the Riwayat Aktivitas tab
  useEffect(() => {
    if (isOpen && member && activeTab === 'aktivitas') {
      fetchMemberActivity();
    }
  }, [isOpen, member, activeTab, fetchMemberActivity]);

  // Generate vCard & QR code whenever QR panel opens for current member
  const handleOpenQrGenerator = useCallback(async () => {
    if (!member) return;
    setShowQrPanel(true);
    setShowRawVcard(false);
    setCopiedVcard(false);
    setIsGeneratingQr(true);
    try {
      const vcard = buildMemberVCard(member);
      setVcardText(vcard);
      const dataUrl = await generateRawVCardQrDataUrl(vcard);
      setQrRawDataUrl(dataUrl);
    } catch (err: any) {
      console.error('Error generating vCard QR code:', err);
      setActionFeedback({
        type: 'error',
        message: 'Gagal membuat QR Code vCard: ' + (err?.message || 'Error'),
      });
    } finally {
      setIsGeneratingQr(false);
    }
  }, [member]);

  const triggerDownload = (href: string, filename: string) => {
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadQrCard = async () => {
    if (!member || !qrRawDataUrl) return;
    setIsDownloadingQrCard(true);
    try {
      const cardDataUrl = await composeVCardQrCardPng(qrRawDataUrl, member);
      const slug = buildSafeFileSlug(member.anggota.nama_lengkap);
      triggerDownload(cardDataUrl, `QR_Kontak_${slug}.png`);
    } catch (err: any) {
      console.error('Error downloading QR card:', err);
      setActionFeedback({
        type: 'error',
        message: 'Gagal mengunduh gambar QR Code.',
      });
    } finally {
      setIsDownloadingQrCard(false);
    }
  };

  const handleDownloadRawQr = () => {
    if (!member || !qrRawDataUrl) return;
    const slug = buildSafeFileSlug(member.anggota.nama_lengkap);
    triggerDownload(qrRawDataUrl, `QR_Polos_${slug}.png`);
  };

  const handleDownloadVcfFile = () => {
    if (!member || !vcardText) return;
    const blob = new Blob([vcardText], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const slug = buildSafeFileSlug(member.anggota.nama_lengkap);
    triggerDownload(url, `Kontak_${slug}.vcf`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleCopyVcard = async () => {
    if (!vcardText) return;
    try {
      await navigator.clipboard.writeText(vcardText);
      setCopiedVcard(true);
      setTimeout(() => setCopiedVcard(false), 2000);
    } catch (_) {}
  };

  // Generate unique QR Code based on ID Anggota pointing directly to Public KTA Verification page
  const handleOpenKtaVerifyQrGenerator = useCallback(async () => {
    if (!member) return;
    setShowKtaVerifyQrPanel(true);
    setCopiedKtaVerifyUrl(false);
    setIsGeneratingKtaQr(true);
    try {
      const verifyUrl = getMemberKtaVerifyByIdUrl(member.anggota.id_anggota);
      setKtaVerifyQrUrl(verifyUrl);
      const dataUrl = await generateKtaVerifyQrDataUrl(verifyUrl);
      setKtaVerifyQrDataUrl(dataUrl);
    } catch (err: any) {
      console.error('Error generating KTA verification QR code:', err);
      setActionFeedback({
        type: 'error',
        message: 'Gagal membuat QR Code Verifikasi KTA: ' + (err?.message || 'Error'),
      });
    } finally {
      setIsGeneratingKtaQr(false);
    }
  }, [member]);

  const handleDownloadKtaVerifyQrCard = async () => {
    if (!member || !ktaVerifyQrDataUrl || !ktaVerifyQrUrl) return;
    setIsDownloadingKtaQrCard(true);
    try {
      const cardDataUrl = await composeKtaVerifyQrCardPng(ktaVerifyQrDataUrl, member, ktaVerifyQrUrl);
      const slug = buildSafeFileSlug(member.anggota.nama_lengkap);
      triggerDownload(cardDataUrl, `QR_Verifikasi_KTA_ID${member.anggota.id_anggota}_${slug}.png`);
    } catch (err: any) {
      console.error('Error downloading KTA verify QR card:', err);
      setActionFeedback({
        type: 'error',
        message: 'Gagal mengunduh kartu QR Verifikasi KTA.',
      });
    } finally {
      setIsDownloadingKtaQrCard(false);
    }
  };

  const handleDownloadRawKtaVerifyQr = () => {
    if (!member || !ktaVerifyQrDataUrl) return;
    const slug = buildSafeFileSlug(member.anggota.nama_lengkap);
    triggerDownload(ktaVerifyQrDataUrl, `QR_Verifikasi_Polos_ID${member.anggota.id_anggota}_${slug}.png`);
  };

  const handleCopyKtaVerifyUrl = async () => {
    if (!ktaVerifyQrUrl) return;
    try {
      await navigator.clipboard.writeText(ktaVerifyQrUrl);
      setCopiedKtaVerifyUrl(true);
      setTimeout(() => setCopiedKtaVerifyUrl(false), 2000);
    } catch (_) {}
  };

  const handleDownloadPDF = async () => {
    if (!member) return;
    try {
      setIsExportingPDF(true);
      await exportMemberProfileToPDF(member, {
        logoUrl: appSettings?.logoUrl || '/logo_kabupaten_bandung.svg',
      });
    } catch (err: any) {
      console.error('Error generating member profile PDF:', err);
      setActionFeedback({
        type: 'error',
        message: 'Gagal membuat dokumen PDF: ' + (err.message || 'Error'),
      });
    } finally {
      setIsExportingPDF(false);
    }
  };

  // Form state for adding new riwayat jabatan (mutasi/promosi)
  const [showAddRiwayat, setShowAddRiwayat] = useState(false);
  const [newDesa, setNewDesa] = useState(member?.jabatanTerkini?.id_desa || '32.04.05.2001');
  const [newJabatan, setNewJabatan] = useState(member?.jabatanTerkini?.id_jabatan || 2);
  const [newPeriode, setNewPeriode] = useState<string>(
    Number(member?.jabatanTerkini?.id_jabatan) === 10 && member?.jabatanTerkini?.periode
      ? String(member.jabatanTerkini.periode)
      : ''
  );
  const [newNoSk, setNewNoSk] = useState('');
  const [newTglSk, setNewTglSk] = useState('2026-03-01');
  const [newTmt, setNewTmt] = useState('2026-03-15');
  const [newKet, setNewKet] = useState('');

  // Combined member activity logs (MySQL DB logs + matching local session logs + record milestones)
  const combinedMemberActivities = useMemo<MemberActivityItem[]>(() => {
    if (!member) return [];

    const idStr = String(member.anggota.id_anggota);
    const nikStr = String(member.anggota.nik || '');
    const namaUpper = (member.anggota.nama_lengkap || '').trim().toUpperCase();

    const localMatched: MemberActivityItem[] = (activityLogs || [])
      .filter((log) => {
        if (log.target_id && String(log.target_id) === idStr) return true;
        if (nikStr && nikStr.length >= 8 && log.deskripsi?.includes(nikStr)) return true;
        if (log.target_nama && namaUpper && log.target_nama.trim().toUpperCase() === namaUpper) return true;
        return false;
      })
      .map((log) => ({
        id: log.id,
        timestamp: log.timestamp,
        sortTime: parseTimestampMs(log.timestamp),
        user_name: log.user_name || 'Administrator',
        user_role: String(log.user_role || 'Admin'),
        modul: log.modul || 'Data Induk Anggota',
        aksi: String(log.aksi || 'EDIT').toUpperCase(),
        deskripsi: log.deskripsi || '-',
        source: 'local' as const,
      }));

    // Merge server logs first, then non-duplicate local logs
    const merged: MemberActivityItem[] = [...serverActivityLogs];
    for (const loc of localMatched) {
      const isDuplicate = merged.some(
        (srv) =>
          srv.aksi === loc.aksi &&
          Math.abs(srv.sortTime - loc.sortTime) < 15000 &&
          (srv.deskripsi.toLowerCase().includes(loc.deskripsi.slice(0, 28).toLowerCase()) ||
            loc.deskripsi.toLowerCase().includes(srv.deskripsi.slice(0, 28).toLowerCase()))
      );
      if (!isDuplicate) {
        merged.push(loc);
      }
    }

    // Add foundational database record milestones (registration, SK appointments, KTA issuance)
    // so members with historical records also have clear baseline traceability.
    const milestones: MemberActivityItem[] = [];
    if (member.anggota.created_at) {
      milestones.push({
        id: `ms_created_${idStr}`,
        timestamp: member.anggota.created_at,
        sortTime: parseTimestampMs(member.anggota.created_at),
        user_name: 'Sistem PPDI',
        user_role: 'Database',
        modul: 'Data Induk Anggota',
        aksi: 'TERCATAT',
        deskripsi: `Data induk anggota "${member.anggota.nama_lengkap.toUpperCase()}" (NIK: ${member.anggota.nik}) mulai tercatat di basis data PPDI.`,
        source: 'milestone',
      });
    }
    if (member.keanggotaan?.tgl_bergabung) {
      milestones.push({
        id: `ms_kta_${member.keanggotaan.id_ppdi}`,
        timestamp: member.keanggotaan.tgl_bergabung,
        sortTime: parseTimestampMs(member.keanggotaan.tgl_bergabung),
        user_name: 'Sistem E-KTA',
        user_role: 'Keanggotaan',
        modul: 'Keanggotaan & E-KTA',
        aksi: 'TERCATAT',
        deskripsi: `Keanggotaan PPDI tercatat dengan No. KTA ${member.keanggotaan.no_kta || '-'} (${member.keanggotaan.jabatan_pengurus || 'Anggota Biasa'}, Status: ${member.keanggotaan.status_kta}).`,
        source: 'milestone',
      });
    }
    const memberRwList = riwayatList.filter((r) => String(r.id_anggota) === idStr);
    for (const rw of memberRwList) {
      const jab = jabatanList.find((j) => Number(j.id_jabatan) === Number(rw.id_jabatan));
      const d = desaList.find((x) => String(x.id_desa) === String(rw.id_desa));
      const ts = rw.created_at || rw.tgl_sk_pengangkatan || rw.tmt_jabatan || '';
      milestones.push({
        id: `ms_rw_${rw.id_riwayat}`,
        timestamp: ts,
        sortTime: parseTimestampMs(ts),
        user_name: 'Arsip SK Jabatan',
        user_role: 'Rekam Jejak',
        modul: 'Riwayat Jabatan & SK',
        aksi: 'TERCATAT',
        deskripsi: `Tercatat sebagai ${jab?.nama_jabatan || `Jabatan #${rw.id_jabatan}`} ${d ? `Desa ${d.nama_desa}` : ''} — No. SK: ${rw.no_sk_pengangkatan || '-'} (TMT: ${formatDateIndo(rw.tmt_jabatan)}, Status: ${rw.status_aktif}).`,
        source: 'milestone',
      });
    }

    const allItems = [...merged, ...milestones];
    allItems.sort((a, b) => b.sortTime - a.sortTime);
    return allItems;
  }, [member, serverActivityLogs, activityLogs, riwayatList, jabatanList, desaList]);

  const filteredMemberActivities = useMemo(() => {
    if (activityFilter === 'all') return combinedMemberActivities;
    return combinedMemberActivities.filter((item) => {
      const mod = item.modul.toLowerCase();
      const desc = item.deskripsi.toLowerCase();
      if (activityFilter === 'profil') {
        return mod.includes('profil') || mod.includes('data induk') || mod.includes('pendaftaran');
      }
      if (activityFilter === 'jabatan') {
        return mod.includes('jabatan') || mod.includes('sk') || desc.includes('jabatan') || desc.includes('sk');
      }
      if (activityFilter === 'kta') {
        return mod.includes('kta') || mod.includes('keanggotaan') || item.aksi === 'STATUS_KTA';
      }
      return true;
    });
  }, [combinedMemberActivities, activityFilter]);

  if (!isOpen || !member) return null;

  const memberRiwayats = riwayatList.filter((r) => r.id_anggota === member.anggota.id_anggota);
  const memberIurans = iuranList.filter((i) => i.id_anggota === member.anggota.id_anggota);

  const handleCreateNewRiwayat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoSk.trim()) return;
    if (Number(newJabatan) === 10 && !['1', '2', '3'].includes(String(newPeriode))) {
      setActionFeedback({
        type: 'error',
        message: 'Periode jabatan Kepala Desa wajib dipilih (Periode Ke-1, Ke-2, atau Ke-3).',
      });
      return;
    }

    // Set old active to Mutasi
    const oldActive = memberRiwayats.find((r) => r.status_aktif === 'Aktif');
    if (oldActive) {
      await updateRiwayatStatus(oldActive.id_riwayat, 'Mutasi');
    }

    await addRiwayatJabatan({
      id_anggota: member.anggota.id_anggota,
      id_desa: newDesa,
      id_jabatan: Number(newJabatan),
      periode: Number(newJabatan) === 10 ? Number(newPeriode) : null,
      no_sk_pengangkatan: newNoSk,
      tgl_sk_pengangkatan: newTglSk,
      tmt_jabatan: newTmt,
      status_aktif: 'Aktif',
      file_sk: '',
      keterangan: newKet || 'Rotasi / Perubahan Jabatan Perangkat Desa',
    });

    setShowAddRiwayat(false);
    setNewNoSk('');
    setNewPeriode('');
    setNewKet('');
    fetchMemberActivity();
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
              src={getPhotoUrl(member.anggota.foto, member.anggota.jenis_kelamin)}
              alt={member.anggota.nama_lengkap.toUpperCase()}
              className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-xs shrink-0 bg-neutral-100"
              onError={(e) => handleImageError(e, member.anggota.jenis_kelamin)}
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

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {canSendSekdesAccount && (
              <button
                type="button"
                onClick={() => setIsSendSekdesModalOpen(true)}
                title="Kirim Akun Admin Desa khusus untuk Sekretaris Desa via WhatsApp"
                className="px-3 py-1.5 text-xs font-bold text-purple-900 bg-purple-50 hover:bg-purple-700 hover:text-white border border-purple-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Kirim User Desa</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleOpenKtaVerifyQrGenerator}
              title={`Generate QR Code unik verifikasi KTA publik berdasarkan ID Anggota #${member.anggota.id_anggota}`}
              className="px-3 py-1.5 text-xs font-bold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
              <span>QR Verifikasi KTA</span>
            </button>
            <button
              onClick={handleOpenQrGenerator}
              title="Buat & Unduh QR Code Kontak (vCard) Anggota"
              className="px-3 py-1.5 text-xs font-semibold text-neutral-800 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <QrCode className="w-3.5 h-3.5 text-emerald-700" />
              <span>QR Kontak (vCard)</span>
            </button>
            <button
              onClick={handleDownloadPDF}
              disabled={isExportingPDF}
              title="Unduh Profil Resmi & Biodata Anggota Format PDF"
              className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 border border-emerald-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              {isExportingPDF ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-amber-300" />
              )}
              <span>{isExportingPDF ? 'Mencetak...' : 'Cetak PDF Profil'}</span>
            </button>
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

        {/* Inline Feedback Banner */}
        {actionFeedback && (
          <div
            className={`px-6 py-2 text-xs flex items-center justify-between border-b ${
              actionFeedback.type === 'error'
                ? 'bg-red-50 text-red-800 border-red-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{actionFeedback.message}</span>
            </div>
            <button
              onClick={() => setActionFeedback(null)}
              className="p-0.5 hover:opacity-75 cursor-pointer"
              aria-label="Tutup pesan"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 pt-2 border-b border-neutral-200 bg-white text-xs overflow-x-auto whitespace-nowrap">
          {[
            { id: 'bio', label: 'Biodata & Identitas', icon: User },
            { id: 'karir', label: `Rekam Jejak SK (${memberRiwayats.length})`, icon: Briefcase },
            { id: 'kta', label: 'Keanggotaan PPDI', icon: CreditCard },
            { id: 'iuran', label: `Histori Iuran (${memberIurans.length})`, icon: Wallet },
            { id: 'dokumen', label: 'e-Arsip Berkas SK', icon: FileText },
            { id: 'aktivitas', label: 'Riwayat Aktivitas', icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-2.5 font-medium border-b-2 cursor-pointer transition-colors shrink-0 ${
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
                      <span className="font-mono text-neutral-900">{formatNIPDDisplay(member.anggota.nipd) || '-'}</span>
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
                  <div className="flex items-center justify-between pb-1 border-b border-neutral-100">
                    <h3 className="font-bold text-neutral-900 uppercase tracking-wider text-[11px]">
                      Kontak & Alamat Domisili
                    </h3>
                    <button
                      type="button"
                      onClick={handleOpenQrGenerator}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Bagikan vCard QR</span>
                    </button>
                  </div>
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
                    {(() => {
                      const isKades = member.jabatanRef?.kategori_jabatan === 'Kepala Desa' ||
                        member.jabatanRef?.nama_jabatan?.toLowerCase().includes('kepala desa') ||
                        member.jabatanRef?.nama_jabatan?.toLowerCase().includes('kades');
                      if (isKades) {
                        return (
                          <>
                            <div className="text-[10px] uppercase font-semibold text-neutral-500">
                              Status Jabatan Kepala Desa
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-neutral-900">{member.usia} Tahun</span>
                              <span className="px-2 py-0.5 rounded-sm font-semibold text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300">
                                Periodisasi Masa Jabatan
                              </span>
                            </div>
                            <div className="text-[11px] text-neutral-500">
                              Masa jabatan Kepala Desa diatur berdasarkan SK & UU Desa (bukan batas usia 60 tahun).
                            </div>
                          </>
                        );
                      }
                      return (
                        <>
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
                        </>
                      );
                    })()}
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
                {hasPermission('anggota', 'edit') && (
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
                        onChange={(e) => {
                          const nextJab = Number(e.target.value);
                          setNewJabatan(nextJab);
                          if (nextJab !== 10) setNewPeriode('');
                        }}
                        className="w-full p-1.5 bg-white border border-neutral-300 rounded-md"
                      >
                        {jabatanList.map((j) => (
                          <option key={j.id_jabatan} value={j.id_jabatan}>
                            {j.nama_jabatan}
                          </option>
                        ))}
                      </select>
                    </div>
                    {Number(newJabatan) === 10 && (
                      <div className="sm:col-span-2">
                        <label className="block text-amber-800 font-semibold mb-1">
                          Periode Kepala Desa <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={newPeriode}
                          onChange={(e) => setNewPeriode(e.target.value)}
                          className="w-full p-1.5 bg-amber-50/60 border border-amber-300 rounded-md"
                          required
                        >
                          <option value="">-- Pilih Periode Kepala Desa --</option>
                          <option value="1">Periode Ke-1 (Pertama)</option>
                          <option value="2">Periode Ke-2 (Kedua)</option>
                          <option value="3">Periode Ke-3 (Ketiga)</option>
                        </select>
                      </div>
                    )}
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
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-neutral-900">{j?.nama_jabatan}</span>
                            {Number(rw.id_jabatan) === 10 && rw.periode && (
                              <span className="px-2 py-0.5 rounded-sm font-semibold text-[10px] bg-amber-50 text-amber-800 border border-amber-200">
                                Periode Ke-{rw.periode}
                              </span>
                            )}
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
                            onChange={async (e) => {
                              await updateRiwayatStatus(rw.id_riwayat, e.target.value as StatusAktifJabatan);
                              fetchMemberActivity();
                            }}
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
                          <span className={rw.file_sk ? 'text-emerald-700 font-medium' : 'text-neutral-400 italic'}>
                            {rw.file_sk ? rw.file_sk.split('/').pop() : 'Belum Diunggah'}
                          </span>
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
                    <div className="flex justify-between items-center">
                      <span className="text-neutral-500">Jabatan Pengurus PPDI</span>
                      {currentUser.role !== 'Anggota' ? (
                        <select
                          aria-label="Ubah Jabatan Pengurus PPDI"
                          value={member.keanggotaan?.jabatan_pengurus || 'Anggota Biasa'}
                          onChange={async (e) => {
                            await updateKeanggotaanJabatan(member.anggota.id_anggota, e.target.value);
                            fetchMemberActivity();
                          }}
                          className="text-xs bg-neutral-50 border border-neutral-300 rounded px-2 py-1 font-semibold text-neutral-900"
                        >
                          {(() => {
                            const isKades = member.jabatanRef?.kategori_jabatan === 'Kepala Desa' ||
                              member.jabatanRef?.nama_jabatan?.toLowerCase().includes('kepala desa') ||
                              member.jabatanRef?.nama_jabatan?.toLowerCase().includes('kades');
                            if (isKades) {
                              return (
                                <>
                                  <option value="Anggota Istimewa">Anggota Istimewa</option>
                                  <option value="Penasehat">Penasehat</option>
                                </>
                              );
                            }
                            return (
                              <>
                                <option value="Anggota Biasa">Anggota Biasa</option>
                                <option value="Pengurus Kecamatan">Pengurus Kecamatan</option>
                                <option value="Pengurus Daerah Kab. Bandung">Pengurus Daerah Kab. Bandung</option>
                                <option value="Anggota Istimewa">Anggota Istimewa</option>
                                <option value="Penasehat">Penasehat</option>
                              </>
                            );
                          })()}
                        </select>
                      ) : (
                        <span className="font-semibold text-neutral-900">
                          {member.keanggotaan?.jabatan_pengurus || 'Anggota Biasa'}
                        </span>
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-neutral-500">Status Keabsahan KTA</span>
                      {currentUser.role !== 'Anggota' ? (
                        <select
                          aria-label="Ubah Status KTA"
                          value={member.keanggotaan?.status_kta || 'Aktif'}
                          onChange={async (e) => {
                            await updateKTAStatus(member.anggota.id_anggota, e.target.value as StatusKTA);
                            fetchMemberActivity();
                          }}
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
          {/* TAB 6: RIWAYAT AKTIVITAS ANGGOTA */}
          {activeTab === 'aktivitas' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-200">
                <div>
                  <h3 className="font-bold text-neutral-900 flex items-center gap-1.5">
                    <History className="w-4 h-4 text-emerald-700" />
                    <span>Riwayat Aktivitas & Perubahan Data Anggota</span>
                  </h3>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    Log kronologis seluruh perubahan profil, mutasi jabatan/SK, dan pembaruan status keanggotaan
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    aria-label="Filter kategori aktivitas"
                    value={activityFilter}
                    onChange={(e) => setActivityFilter(e.target.value as any)}
                    className="text-xs bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-neutral-700 font-medium"
                  >
                    <option value="all">Semua Aktivitas ({combinedMemberActivities.length})</option>
                    <option value="profil">Perubahan Profil</option>
                    <option value="jabatan">Jabatan & Mutasi SK</option>
                    <option value="kta">Keanggotaan & E-KTA</option>
                  </select>
                  <button
                    type="button"
                    onClick={fetchMemberActivity}
                    disabled={isLoadingActivity}
                    className="px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingActivity ? 'animate-spin' : ''}`} />
                    <span>Muat Ulang</span>
                  </button>
                </div>
              </div>

              {activityError && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Tidak dapat memuat log terbaru dari server ({activityError}). Menampilkan catatan sesi & arsip lokal.</span>
                </div>
              )}

              {isLoadingActivity && filteredMemberActivities.length === 0 ? (
                <div className="py-10 flex flex-col items-center justify-center text-neutral-500 gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-emerald-700" />
                  <span>Mengambil riwayat aktivitas anggota...</span>
                </div>
              ) : filteredMemberActivities.length === 0 ? (
                <div className="py-10 text-center border border-dashed border-neutral-300 rounded-xl bg-neutral-50 space-y-1">
                  <History className="w-6 h-6 text-neutral-400 mx-auto" />
                  <div className="font-semibold text-neutral-700">Belum ada catatan aktivitas untuk kategori ini</div>
                  <div className="text-[11px] text-neutral-500">
                    Setiap perubahan profil, status jabatan, mutasi SK, atau status KTA akan otomatis tercatat di sini.
                  </div>
                </div>
              ) : (
                <div className="relative pl-5 space-y-3 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-neutral-200">
                  {filteredMemberActivities.map((item) => {
                    const badgeStyle =
                      item.aksi === 'TAMBAH' || item.aksi === 'APPROVE'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : item.aksi === 'EDIT'
                        ? 'bg-blue-50 text-blue-800 border-blue-200'
                        : item.aksi === 'STATUS_KTA'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : item.aksi === 'HAPUS' || item.aksi === 'REJECT'
                        ? 'bg-red-50 text-red-800 border-red-200'
                        : 'bg-neutral-100 text-neutral-700 border-neutral-200';

                    const dotColor =
                      item.aksi === 'TAMBAH' || item.aksi === 'APPROVE'
                        ? 'bg-emerald-600'
                        : item.aksi === 'EDIT'
                        ? 'bg-blue-600'
                        : item.aksi === 'STATUS_KTA'
                        ? 'bg-amber-500'
                        : item.aksi === 'HAPUS' || item.aksi === 'REJECT'
                        ? 'bg-red-600'
                        : 'bg-neutral-400';

                    return (
                      <div
                        key={item.id}
                        className="relative p-3.5 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50/70 transition-colors"
                      >
                        <span
                          className={`absolute -left-[17px] top-4 w-2.5 h-2.5 rounded-full ring-4 ring-white ${dotColor}`}
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2 py-0.5 rounded-sm font-bold text-[10px] border ${badgeStyle}`}>
                              {item.aksi}
                            </span>
                            <span className="font-semibold text-neutral-800">{item.modul}</span>
                            {item.source === 'milestone' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">
                                Arsip Data
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-neutral-500 font-mono">
                            <Clock className="w-3 h-3 text-neutral-400" />
                            <span>{formatActivityTimestamp(item.timestamp)}</span>
                          </div>
                        </div>

                        <p className="text-xs text-neutral-700 leading-relaxed">{item.deskripsi}</p>

                        <div className="mt-2 pt-2 border-t border-neutral-100 flex items-center justify-between text-[11px] text-neutral-500">
                          <span className="flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                            <span>
                              Oleh: <strong className="text-neutral-700">{item.user_name}</strong> ({item.user_role.replace(/_/g, ' ')})
                            </span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-neutral-200 flex justify-between items-center bg-neutral-50 rounded-b-xl gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleDownloadPDF}
              disabled={isExportingPDF}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 border border-emerald-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              {isExportingPDF ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-amber-300" />
              )}
              <span>{isExportingPDF ? 'Mencetak PDF...' : 'Cetak PDF Profil Resmi'}</span>
            </button>
            <button
              onClick={handleOpenQrGenerator}
              className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-white hover:bg-emerald-50 border border-emerald-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Generate QR Kontak</span>
            </button>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-neutral-700 bg-neutral-200 hover:bg-neutral-300 rounded-lg cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>

      {/* vCard QR Code Sub-Modal */}
      {showQrPanel && (
        <div
          className="fixed inset-0 z-60 bg-neutral-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowQrPanel(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-neutral-200 max-w-lg w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 bg-emerald-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-800 border border-emerald-700">
                  <QrCode className="w-4 h-4 text-amber-300" />
                </div>
                <div>
                  <h3 className="text-sm font-bold leading-tight">QR Code Kontak Anggota (vCard)</h3>
                  <p className="text-[11px] text-emerald-200">
                    Pindai dengan kamera ponsel untuk langsung menyimpan kontak
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQrPanel(false)}
                className="p-1 text-emerald-200 hover:text-white rounded-lg cursor-pointer"
                aria-label="Tutup modal QR Code"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 text-xs max-h-[80vh] overflow-y-auto">
              <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-xl bg-neutral-50 border border-neutral-200">
                <div className="bg-white p-3 rounded-xl border border-neutral-200 shadow-xs shrink-0 flex items-center justify-center w-48 h-48">
                  {isGeneratingQr || !qrRawDataUrl ? (
                    <div className="flex flex-col items-center gap-2 text-neutral-400">
                      <RefreshCw className="w-5 h-5 animate-spin text-emerald-700" />
                      <span className="text-[11px]">Membuat QR...</span>
                    </div>
                  ) : (
                    <img
                      src={qrRawDataUrl}
                      alt={`QR Code vCard ${fullNameWithTitles}`}
                      className="w-44 h-44 object-contain"
                    />
                  )}
                </div>

                <div className="flex-1 space-y-2 text-left w-full">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-700">
                      Data Kontak dalam vCard 3.0
                    </div>
                    <div className="font-bold text-neutral-900 text-sm uppercase mt-0.5 leading-snug">
                      {fullNameWithTitles}
                    </div>
                    <div className="text-[11px] text-neutral-600 mt-0.5">
                      {member.jabatanRef?.nama_jabatan || 'Perangkat Desa'} · Desa {member.desa?.nama_desa || '-'}
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      Kec. {member.kecamatan?.nama_kecamatan || '-'}, Kab. Bandung
                    </div>
                  </div>

                  <div className="pt-2 border-t border-neutral-200 space-y-1 text-[11px]">
                    <div className="flex items-center gap-1.5 text-neutral-700">
                      <Phone className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span className="font-mono">{member.anggota.no_hp_wa || '-'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-neutral-700">
                      <Mail className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                      <span className="truncate">{member.anggota.email || '-'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-neutral-700">
                      <CreditCard className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                      <span className="font-mono">{member.keanggotaan?.no_kta || 'KTA Pending'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Download Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleDownloadQrCard}
                  disabled={!qrRawDataUrl || isDownloadingQrCard}
                  className="px-3.5 py-2.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
                >
                  {isDownloadingQrCard ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 text-amber-300" />
                  )}
                  <span>{isDownloadingQrCard ? 'Menyiapkan PNG...' : 'Unduh Kartu QR (PNG)'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadRawQr}
                  disabled={!qrRawDataUrl}
                  className="px-3.5 py-2.5 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <QrCode className="w-4 h-4 text-emerald-700" />
                  <span>Unduh QR Polos (PNG)</span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleDownloadVcfFile}
                  disabled={!vcardText}
                  className="text-xs font-semibold text-neutral-700 hover:text-emerald-800 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh File Kontak (.vcf)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowRawVcard((prev) => !prev)}
                  className="text-[11px] font-medium text-neutral-500 hover:text-neutral-800 inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>{showRawVcard ? 'Sembunyikan Isi vCard' : 'Lihat Isi vCard'}</span>
                  {showRawVcard ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {showRawVcard && (
                <div className="rounded-xl border border-neutral-200 bg-neutral-900 text-neutral-100 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">
                      Payload vCard 3.0
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyVcard}
                      className="inline-flex items-center gap-1 text-[11px] text-emerald-300 hover:text-emerald-200 cursor-pointer"
                    >
                      {copiedVcard ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedVcard ? 'Tersalin' : 'Salin'}</span>
                    </button>
                  </div>
                  <pre className="text-[10px] font-mono whitespace-pre-wrap break-all leading-relaxed text-emerald-100">
                    {vcardText}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Unique ID Anggota -> Public KTA Verification QR Code Sub-Modal */}
      {showKtaVerifyQrPanel && (
        <div
          className="fixed inset-0 z-60 bg-neutral-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowKtaVerifyQrPanel(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-neutral-200 max-w-lg w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 bg-[#064E3B] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-800 border border-emerald-700">
                  <ShieldCheck className="w-4 h-4 text-amber-300" />
                </div>
                <div>
                  <h3 className="text-sm font-bold leading-tight">
                    QR Code Verifikasi KTA Publik (ID #{member.anggota.id_anggota})
                  </h3>
                  <p className="text-[11px] text-emerald-200">
                    Scan langsung membuka halaman publik verifikasi keabsahan KTA
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowKtaVerifyQrPanel(false)}
                className="p-1 text-emerald-200 hover:text-white rounded-lg cursor-pointer"
                aria-label="Tutup modal QR Verifikasi KTA"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 text-xs max-h-[80vh] overflow-y-auto">
              <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-xl bg-emerald-50/40 border border-emerald-200">
                <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-xs shrink-0 flex items-center justify-center w-48 h-48">
                  {isGeneratingKtaQr || !ktaVerifyQrDataUrl ? (
                    <div className="flex flex-col items-center gap-2 text-neutral-400">
                      <RefreshCw className="w-5 h-5 animate-spin text-emerald-700" />
                      <span className="text-[11px]">Membuat QR...</span>
                    </div>
                  ) : (
                    <img
                      src={ktaVerifyQrDataUrl}
                      alt={`QR Code Verifikasi KTA ID ${member.anggota.id_anggota}`}
                      className="w-44 h-44 object-contain"
                    />
                  )}
                </div>

                <div className="flex-1 space-y-2 text-left w-full">
                  <div>
                    <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-sm border border-emerald-200">
                      <span>ID Anggota Unik: #{member.anggota.id_anggota}</span>
                    </div>
                    <div className="font-bold text-neutral-900 text-sm uppercase mt-1.5 leading-snug">
                      {fullNameWithTitles}
                    </div>
                    <div className="text-[11px] text-neutral-600 mt-0.5">
                      {member.jabatanRef?.nama_jabatan || 'Perangkat Desa'} · Desa {member.desa?.nama_desa || '-'}
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      Kec. {member.kecamatan?.nama_kecamatan || '-'}, Kab. Bandung
                    </div>
                  </div>

                  <div className="pt-2 border-t border-emerald-200/70 space-y-1 text-[11px]">
                    <div className="flex items-center gap-1.5 text-neutral-700">
                      <CreditCard className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span className="font-mono font-semibold">{member.keanggotaan?.no_kta || 'KTA Pending'}</span>
                    </div>
                    <div className="text-[10px] text-emerald-800 font-medium">
                      Status Keanggotaan: <strong>{member.keanggotaan?.status_kta || 'Aktif'}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* URL Tujuan Verifikasi Publik */}
              <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-600">
                    Link Publik Verifikasi KTA (Tujuan Scan QR)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyKtaVerifyUrl}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 cursor-pointer"
                    >
                      {copiedKtaVerifyUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKtaVerifyUrl ? 'Tersalin' : 'Salin Link'}</span>
                    </button>
                    {ktaVerifyQrUrl && (
                      <a
                        href={ktaVerifyQrUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Uji Link</span>
                      </a>
                    )}
                  </div>
                </div>
                <div className="p-2 bg-white border border-neutral-200 rounded-lg font-mono text-[11px] text-neutral-700 break-all select-all">
                  {ktaVerifyQrUrl || '-'}
                </div>
              </div>

              {/* Download Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleDownloadKtaVerifyQrCard}
                  disabled={!ktaVerifyQrDataUrl || isDownloadingKtaQrCard}
                  className="px-3.5 py-2.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
                >
                  {isDownloadingKtaQrCard ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 text-amber-300" />
                  )}
                  <span>{isDownloadingKtaQrCard ? 'Menyiapkan PNG...' : 'Unduh Kartu QR (PNG)'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadRawKtaVerifyQr}
                  disabled={!ktaVerifyQrDataUrl}
                  className="px-3.5 py-2.5 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <QrCode className="w-4 h-4 text-emerald-700" />
                  <span>Unduh QR Polos (PNG)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SendSekdesUserModal
        isOpen={isSendSekdesModalOpen}
        onClose={() => setIsSendSekdesModalOpen(false)}
        initialMember={member}
      />
    </div>
  );
};
