import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { usePPDI } from '../context/PPDIContext';
import { AnggotaFullDetail } from '../types/ppdi';
import {
  formatDateIndo,
  dispatchWhatsAppNotification,
  isFonnteWebhookActive,
  formatPhoneForWhatsApp,
  safeFetchJson,
} from '../utils/ppdiHelpers';
import {
  ClockAlert,
  AlertTriangle,
  CheckCircle2,
  Phone,
  Send,
  Calendar,
  RefreshCw,
  BellRing,
  Bot,
  Eye,
  StopCircle,
  Settings,
  XCircle,
  Download,
  FileText,
  FileSpreadsheet,
  ChevronDown,
} from 'lucide-react';
import {
  computeRetirementDeadline,
  exportPurnaTugasToExcel,
  exportPurnaTugasToPDF,
} from '../utils/retirementReportExport';

interface RetirementAlertViewProps {
  onOpenDetailModal: (member: AnggotaFullDetail) => void;
}

interface WhatsAppLogRecord {
  id: string;
  timestamp: string;
  direction: string;
  targetOrSender: string;
  idAnggota?: string;
  category?: string;
  status: string;
}

type AutoSendRowStatus = 'sending' | 'sent' | 'failed';

const AUTO_NOTIFY_STORAGE_KEY = 'ppdi_auto_notify_retirement_3m';
function getRetirementDeadlineInfo(birthDateStr?: string): {
  tanggalPurnaTugas: string;
  sisaHari: number;
} {
  return computeRetirementDeadline(birthDateStr);
}

export const RetirementAlertView: React.FC<RetirementAlertViewProps> = ({ onOpenDetailModal }) => {
  const {
    visibleMembers,
    updateRiwayatStatus,
    updateKTAStatus,
    currentUser,
    appSettings,
    updateAppSettings,
    setActiveTab,
    hasPermission,
  } = usePPDI();

  const waSettings = appSettings?.whatsappSettings;
  const fonnteActive = isFonnteWebhookActive(waSettings);
  const canOpenWaSettings = hasPermission('settings-whatsapp', 'view');
  const canEditWaSettings = hasPermission('settings-whatsapp', 'edit');

  const [activeCategory, setActiveCategory] = useState<
    'all' | 'h3bulan' | 'kritis' | 'siaga' | 'waspada' | 'sudah'
  >('all');
  const [sendingWaMemberId, setSendingWaMemberId] = useState<string | null>(null);
  const [waFeedback, setWaFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Auto-notify 3 months before retirement states
  const [autoNotifyEnabled, setAutoNotifyEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(AUTO_NOTIFY_STORAGE_KEY);
      if (saved === 'true') return true;
      if (saved === 'false') return false;
    }
    return Boolean(waSettings?.autoNotifyRetirement3Months);
  });

  useEffect(() => {
    if (typeof waSettings?.autoNotifyRetirement3Months === 'boolean') {
      setAutoNotifyEnabled(waSettings.autoNotifyRetirement3Months);
    }
  }, [waSettings?.autoNotifyRetirement3Months]);

  const [logsLoaded, setLogsLoaded] = useState(false);
  const [notifiedMap, setNotifiedMap] = useState<
    Record<string, { timestamp: string; status: string; category?: string }>
  >({});
  const [rowDeliveryStatus, setRowDeliveryStatus] = useState<
    Record<string, { status: AutoSendRowStatus; detail?: string }>
  >({});
  const [isBatchSending, setIsBatchSending] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    sent: number;
    failed: number;
    mode: 'auto' | 'manual';
  }>({ current: 0, total: 0, sent: 0, failed: 0, mode: 'manual' });
  const [showMessagePreview, setShowMessagePreview] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<'pdf' | 'excel' | null>(null);

  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const cancelBatchRef = useRef(false);
  const autoTriggeredForKeyRef = useRef<string>('');

  useEffect(() => {
    if (!isExportMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsExportMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isExportMenuOpen]);

  const isKepalaDesaMember = (m: AnggotaFullDetail) => {
    return (
      m.jabatanRef?.kategori_jabatan === 'Kepala Desa' ||
      m.jabatanRef?.nama_jabatan?.toLowerCase().includes('kepala desa') ||
      m.jabatanRef?.nama_jabatan?.toLowerCase().includes('kades')
    );
  };

  const isWithin3MonthsWindow = useCallback((m: AnggotaFullDetail) => {
    if (m.statusPensiun === 'Sudah Purna Tugas') return false;
    if (m.sisaMasaPensiunBulan > 0 && m.sisaMasaPensiunBulan <= 3) return true;
    const { sisaHari } = getRetirementDeadlineInfo(m.anggota.tanggal_lahir);
    return sisaHari > 0 && sisaHari <= 92;
  }, []);

  // Load WhatsApp outbound logs from server to avoid duplicate automatic alerts
  const fetchWhatsAppLogs = useCallback(async () => {
    try {
      const res = await safeFetchJson<{ success: boolean; logs: WhatsAppLogRecord[] }>('/api/whatsapp/logs');
      if (res.ok && res.data?.success && Array.isArray(res.data.logs)) {
        const nextMap: Record<string, { timestamp: string; status: string; category?: string }> = {};
        for (const log of res.data.logs) {
          if (
            log.direction === 'outbound' &&
            log.status !== 'failed' &&
            (log.category === 'otomatis-pensiun-3-bulan' || log.category === 'peringatan-purna-tugas')
          ) {
            if (log.idAnggota && !nextMap[log.idAnggota]) {
              nextMap[log.idAnggota] = {
                timestamp: log.timestamp,
                status: log.status,
                category: log.category,
              };
            }
          }
        }
        setNotifiedMap(nextMap);
      }
    } catch {
      // ignore fetch error on offline preview
    } finally {
      setLogsLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchWhatsAppLogs();
  }, [fetchWhatsAppLogs]);

  // Categorize members (Kepala Desa dikecualikan karena bukan perangkat desa pensiun 60 tahun)
  const categorized = useMemo(() => {
    const nonKadesMembers = visibleMembers.filter((m) => !isKepalaDesaMember(m));

    const h3bulan = nonKadesMembers.filter((m) => isWithin3MonthsWindow(m));
    const kritis = nonKadesMembers.filter((m) => m.statusPensiun === 'Kritis (<6 Bln)');
    const siaga = nonKadesMembers.filter((m) => m.statusPensiun === 'Siaga (<1 Thn)');
    const waspada = nonKadesMembers.filter((m) => m.statusPensiun === 'Waspada (<2 Thn)');
    const sudah = nonKadesMembers.filter((m) => m.statusPensiun === 'Sudah Purna Tugas');

    return {
      h3bulan,
      kritis,
      siaga,
      waspada,
      sudah,
      allAlerts: [...kritis, ...siaga, ...waspada, ...sudah],
    };
  }, [visibleMembers, isWithin3MonthsWindow]);

  // Members in 3-month window ready for WhatsApp notification
  const eligible3MonthsWithPhone = useMemo(() => {
    return categorized.h3bulan.filter((m) => {
      const clean = formatPhoneForWhatsApp(m.anggota.no_hp_wa);
      return Boolean(clean && clean.length >= 8);
    });
  }, [categorized.h3bulan]);

  const pending3MonthsMembers = useMemo(() => {
    return eligible3MonthsWithPhone.filter((m) => !notifiedMap[m.anggota.id_anggota]);
  }, [eligible3MonthsWithPhone, notifiedMap]);

  const notified3MonthsCount = eligible3MonthsWithPhone.length - pending3MonthsMembers.length;
  const missingPhone3MonthsCount = categorized.h3bulan.length - eligible3MonthsWithPhone.length;

  const displayList = useMemo(() => {
    if (activeCategory === 'h3bulan') return categorized.h3bulan;
    if (activeCategory === 'kritis') return categorized.kritis;
    if (activeCategory === 'siaga') return categorized.siaga;
    if (activeCategory === 'waspada') return categorized.waspada;
    if (activeCategory === 'sudah') return categorized.sudah;
    return categorized.allAlerts;
  }, [categorized, activeCategory]);

  // Create WhatsApp message template (khusus penekanan 3 bulan sebelum masa bakti berakhir)
  const buildRetirementWAMessage = useCallback(
    (m: AnggotaFullDetail) => {
      const is3Months = isWithin3MonthsWindow(m);
      const { tanggalPurnaTugas, sisaHari } = getRetirementDeadlineInfo(m.anggota.tanggal_lahir);
      const sisaTahun = m.sisaMasaPensiunTahun;
      const sisaBulanMod = m.sisaMasaPensiunBulan % 12;

      if (is3Months) {
        return `*NOTIFIKASI OTOMATIS H-3 BULAN MASA PURNA TUGAS*
PPDI KABUPATEN BANDUNG

Kepada Yth:
*${m.anggota.nama_lengkap}*
NIK: ${m.anggota.nik}
Jabatan: ${m.jabatanRef?.nama_jabatan || 'Perangkat Desa'} — Desa ${m.desa?.nama_desa || '-'}, Kec. ${m.kecamatan?.nama_kecamatan || '-'}

Berdasarkan regulasi batas usia pensiun perangkat desa (60 tahun / UU Desa) dan data kepegawaian PPDI Kab. Bandung, masa bakti Anda akan segera berakhir dalam waktu kurang dari 3 bulan:
- Tanggal Lahir: ${formatDateIndo(m.anggota.tanggal_lahir)}
- Estimasi Berakhir Masa Bakti: *${formatDateIndo(tanggalPurnaTugas)}*
- Sisa Waktu Efektif: *${m.sisaMasaPensiunBulan} Bulan* (${sisaHari > 0 ? `±${sisaHari} hari` : 'segera'})

Mohon untuk segera menyiapkan berkas administrasi purna tugas, SK Pemberhentian, serta melakukan koordinasi serah terima tugas dengan Kepala Desa, BPD, dan Pengurus PPDI setempat.

Terima kasih atas dedikasi dan pengabdian terbaik Anda bagi kemajuan desa.`;
      }

      return `*PEMBERITAHUAN MASA PURNA TUGAS PERANGKAT DESA*
PPDI KABUPATEN BANDUNG

Kepada Yth:
*${m.anggota.nama_lengkap}*
NIK: ${m.anggota.nik}
Jabatan: ${m.jabatanRef?.nama_jabatan || 'Perangkat Desa'} Desa ${m.desa?.nama_desa || '-'}, Kec. ${m.kecamatan?.nama_kecamatan || '-'}

Berdasarkan UU Desa dan basis data kepegawaian PPDI Kab. Bandung:
- Tanggal Lahir: ${formatDateIndo(m.anggota.tanggal_lahir)}
- Estimasi Purna Tugas (60 Tahun): ${formatDateIndo(tanggalPurnaTugas)}
- Status: ${m.statusPensiun} (Sisa ${sisaTahun} thn ${sisaBulanMod} bln)

Mohon untuk segera mempersiapkan berkas administrasi dan koordinasi bersama BPD serta Pengurus PPDI setempat.
Terima kasih atas pengabdian terbaik bagi kemajuan desa!`;
    },
    [isWithin3MonthsWindow]
  );

  const runBatch3MonthDispatch = useCallback(
    async (targets: AnggotaFullDetail[], mode: 'auto' | 'manual') => {
      if (!fonnteActive || targets.length === 0 || isBatchSending) return;

      cancelBatchRef.current = false;
      setIsBatchSending(true);
      setBatchProgress({
        current: 0,
        total: targets.length,
        sent: 0,
        failed: 0,
        mode,
      });

      const batchId = `pensiun_3bln_${Date.now()}`;
      let sent = 0;
      let failed = 0;

      for (let i = 0; i < targets.length; i++) {
        if (cancelBatchRef.current) break;
        const member = targets[i];
        const idAnggota = member.anggota.id_anggota;

        setRowDeliveryStatus((prev) => ({
          ...prev,
          [idAnggota]: { status: 'sending', detail: 'Mengirim via Fonnte...' },
        }));

        const res = await dispatchWhatsAppNotification({
          phone: member.anggota.no_hp_wa,
          message: buildRetirementWAMessage(member),
          recipientName: member.anggota.nama_lengkap,
          idAnggota,
          category: 'otomatis-pensiun-3-bulan',
          batchId,
          whatsappSettings: waSettings,
        });

        if (res.success) {
          sent++;
          const nowIso = new Date().toISOString();
          setRowDeliveryStatus((prev) => ({
            ...prev,
            [idAnggota]: { status: 'sent', detail: 'Terkirim via Fonnte' },
          }));
          setNotifiedMap((prev) => ({
            ...prev,
            [idAnggota]: {
              timestamp: nowIso,
              status: 'sent',
              category: 'otomatis-pensiun-3-bulan',
            },
          }));
        } else {
          failed++;
          setRowDeliveryStatus((prev) => ({
            ...prev,
            [idAnggota]: { status: 'failed', detail: res.message },
          }));
        }

        setBatchProgress({
          current: i + 1,
          total: targets.length,
          sent,
          failed,
          mode,
        });

        if (i < targets.length - 1 && !cancelBatchRef.current) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      setIsBatchSending(false);
      await fetchWhatsAppLogs();
      setWaFeedback({
        type: sent > 0 && failed === 0 ? 'success' : sent > 0 ? 'success' : 'error',
        text:
          mode === 'auto'
            ? `Pengiriman otomatis WA H-3 Bulan selesai: ${sent} terkirim${failed > 0 ? `, ${failed} gagal` : ''} (tercatat di log whatsapp_logs).`
            : `Notifikasi massal WA H-3 Bulan selesai: ${sent} berhasil dikirim via Fonnte${failed > 0 ? `, ${failed} gagal` : ''}.`,
      });
    },
    [fonnteActive, isBatchSending, buildRetirementWAMessage, waSettings, fetchWhatsAppLogs]
  );

  // Automatic execution when module opens & auto-notify toggle + Fonnte Gateway are active
  useEffect(() => {
    if (!autoNotifyEnabled || !fonnteActive || !logsLoaded || isBatchSending) return;
    if (pending3MonthsMembers.length === 0) return;

    const batchKey = pending3MonthsMembers
      .map((m) => m.anggota.id_anggota)
      .sort()
      .join(',');
    if (autoTriggeredForKeyRef.current === batchKey) return;

    autoTriggeredForKeyRef.current = batchKey;
    runBatch3MonthDispatch(pending3MonthsMembers, 'auto');
  }, [
    autoNotifyEnabled,
    fonnteActive,
    logsLoaded,
    isBatchSending,
    pending3MonthsMembers,
    runBatch3MonthDispatch,
  ]);

  const handleToggleAutoNotify = async (nextVal: boolean) => {
    setAutoNotifyEnabled(nextVal);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(AUTO_NOTIFY_STORAGE_KEY, String(nextVal));
    }
    if (canEditWaSettings && waSettings) {
      try {
        await updateAppSettings({
          whatsappSettings: {
            ...waSettings,
            autoNotifyRetirement3Months: nextVal,
          },
        });
      } catch {
        // local preference already saved
      }
    }
    if (nextVal && !fonnteActive) {
      setWaFeedback({
        type: 'error',
        text: 'Mode otomatis diaktifkan, namun Gateway Fonnte belum aktif. Aktifkan Token Fonnte di Pengaturan -> Setting WhatsApp (Fonnte) agar pengiriman otomatis berjalan.',
      });
    }
  };

  const handleSendRetirementWA = async (m: AnggotaFullDetail) => {
    const idAnggota = m.anggota.id_anggota;
    const is3Months = isWithin3MonthsWindow(m);
    setSendingWaMemberId(idAnggota);
    setRowDeliveryStatus((prev) => ({
      ...prev,
      [idAnggota]: { status: 'sending', detail: 'Mengirim...' },
    }));
    try {
      const result = await dispatchWhatsAppNotification({
        phone: m.anggota.no_hp_wa,
        message: buildRetirementWAMessage(m),
        recipientName: m.anggota.nama_lengkap,
        idAnggota,
        category: is3Months ? 'otomatis-pensiun-3-bulan' : 'peringatan-purna-tugas',
        whatsappSettings: waSettings,
      });

      if (result.success) {
        setRowDeliveryStatus((prev) => ({
          ...prev,
          [idAnggota]: { status: 'sent', detail: result.mode === 'fonnte' ? 'Terkirim via Fonnte' : 'Via wa.me' },
        }));
        if (result.mode === 'fonnte') {
          setNotifiedMap((prev) => ({
            ...prev,
            [idAnggota]: {
              timestamp: new Date().toISOString(),
              status: 'sent',
              category: is3Months ? 'otomatis-pensiun-3-bulan' : 'peringatan-purna-tugas',
            },
          }));
        }
      } else {
        setRowDeliveryStatus((prev) => ({
          ...prev,
          [idAnggota]: { status: 'failed', detail: result.message },
        }));
      }

      setWaFeedback({
        type: result.success ? 'success' : 'error',
        text: result.message,
      });
    } finally {
      setSendingWaMemberId(null);
    }
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
      setWaFeedback({
        type: 'success',
        text: `Berhasil memperbarui status purna tugas ${m.anggota.nama_lengkap}.`,
      });
    }
  };

  const activeCategoryMeta = useMemo(() => {
    const map: Record<typeof activeCategory, { label: string; slug: string }> = {
      all: { label: 'Semua Peringatan Purna Tugas', slug: 'semua_peringatan' },
      h3bulan: { label: 'Prioritas H-3 Bulan (<= 3 Bulan)', slug: 'h3_bulan' },
      kritis: { label: 'Kritis (< 6 Bulan)', slug: 'kritis' },
      siaga: { label: 'Siaga (< 1 Tahun)', slug: 'siaga' },
      waspada: { label: 'Waspada (< 2 Tahun)', slug: 'waspada' },
      sudah: { label: 'Sudah Purna Tugas (>= 60 Tahun)', slug: 'sudah_purna' },
    };
    return map[activeCategory];
  }, [activeCategory]);

  const handleExportReport = async (format: 'pdf' | 'excel', scope: 'filtered' | 'all') => {
    const targetMembers = scope === 'all' ? categorized.allAlerts : displayList;
    const label = scope === 'all' ? 'Semua Peringatan Purna Tugas' : activeCategoryMeta.label;
    const slug = scope === 'all' ? 'semua_peringatan' : activeCategoryMeta.slug;

    setIsExportMenuOpen(false);
    if (targetMembers.length === 0) {
      setWaFeedback({
        type: 'error',
        text: `Tidak ada data perangkat desa pada kategori "${label}" untuk diekspor.`,
      });
      return;
    }

    setExportingFormat(format);
    try {
      const payload = {
        members: targetMembers,
        categoryLabel: label,
        categorySlug: slug,
        summary: {
          h3bulan: categorized.h3bulan.length,
          kritis: categorized.kritis.length,
          siaga: categorized.siaga.length,
          waspada: categorized.waspada.length,
          sudah: categorized.sudah.length,
          total: categorized.allAlerts.length,
        },
        notifiedMap,
        printedBy: currentUser?.nama || 'Administrator PPDI',
        referenceDateLabel: '14 Oktober 2026',
      };

      const filename =
        format === 'pdf'
          ? exportPurnaTugasToPDF(payload)
          : await exportPurnaTugasToExcel(payload);

      setWaFeedback({
        type: 'success',
        text: `Laporan ${format === 'pdf' ? 'PDF' : 'Excel'} berhasil dibuat (${targetMembers.length} data): ${filename}`,
      });
    } catch (err: any) {
      setWaFeedback({
        type: 'error',
        text: `Gagal mengekspor laporan ${format === 'pdf' ? 'PDF' : 'Excel'}: ${err?.message || 'Terjadi kesalahan'}`,
      });
    } finally {
      setExportingFormat(null);
    }
  };

  const samplePreviewMember = categorized.h3bulan[0] || categorized.kritis[0] || null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-neutral-200 gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 tracking-tight">
            Peringatan Dini Masa Purna Tugas (Usia 60 Tahun)
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Sistem peringatan &amp; notifikasi WhatsApp otomatis batas usia pensiun aparatur desa berdasarkan UU No. 3 Tahun 2024
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="px-3 py-1.5 bg-neutral-100 rounded-lg text-neutral-700 font-medium">
            Regulasi: Batas 60 Tahun (Perangkat Desa)
          </span>
          <span className="px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg font-medium">
            Jabatan Kepala Desa Dikecualikan
          </span>
          <span
            className={`px-3 py-1.5 rounded-lg font-mono font-semibold border ${
              fonnteActive
                ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                : 'bg-neutral-50 text-neutral-600 border-neutral-200'
            }`}
          >
            {fonnteActive ? 'WA: Fonnte Aktif' : 'WA: API wa.me'}
          </span>

          {/* Export Data Purna Tugas Dropdown Button */}
          <div className="relative" ref={exportMenuRef}>
            <button
              type="button"
              disabled={exportingFormat !== null || categorized.allAlerts.length === 0}
              onClick={() => setIsExportMenuOpen((prev) => !prev)}
              className="px-3.5 py-1.5 rounded-lg bg-[#064E3B] hover:bg-emerald-900 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              {exportingFormat !== null ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5 text-amber-300" />
              )}
              <span>
                {exportingFormat === 'pdf'
                  ? 'Membuat PDF...'
                  : exportingFormat === 'excel'
                  ? 'Membuat Excel...'
                  : 'Export Data Purna Tugas'}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-150 ${
                  isExportMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isExportMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-72 bg-white rounded-xl border border-neutral-200 shadow-xl z-40 overflow-hidden">
                <div className="px-3.5 py-2.5 bg-neutral-50 border-b border-neutral-200">
                  <div className="text-[11px] font-bold text-neutral-800 uppercase tracking-wider">
                    Export Laporan Purna Tugas
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-0.5 truncate">
                    Filter aktif: {activeCategoryMeta.label} ({displayList.length} orang)
                  </div>
                </div>

                <div className="p-1.5 space-y-1">
                  <button
                    type="button"
                    disabled={displayList.length === 0}
                    onClick={() => handleExportReport('pdf', 'filtered')}
                    className="w-full px-3 py-2 rounded-lg hover:bg-red-50/80 disabled:opacity-40 text-left flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-md bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-neutral-900">
                        Export PDF (.pdf)
                      </div>
                      <div className="text-[10px] text-neutral-500">
                        Laporan resmi A4 Landscape ({displayList.length} data)
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={displayList.length === 0}
                    onClick={() => handleExportReport('excel', 'filtered')}
                    className="w-full px-3 py-2 rounded-lg hover:bg-emerald-50/80 disabled:opacity-40 text-left flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                      <FileSpreadsheet className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-neutral-900">
                        Export Excel (.xlsx)
                      </div>
                      <div className="text-[10px] text-neutral-500">
                        Spreadsheet lengkap terformat ({displayList.length} data)
                      </div>
                    </div>
                  </button>

                  {activeCategory !== 'all' && categorized.allAlerts.length > displayList.length && (
                    <div className="pt-1.5 mt-1 border-t border-neutral-100 space-y-1">
                      <div className="px-2.5 text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                        Semua Kategori ({categorized.allAlerts.length} orang)
                      </div>
                      <div className="grid grid-cols-2 gap-1 px-1">
                        <button
                          type="button"
                          onClick={() => handleExportReport('pdf', 'all')}
                          className="px-2.5 py-1.5 rounded-md bg-neutral-100 hover:bg-red-50 hover:text-red-800 text-neutral-700 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Semua PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportReport('excel', 'all')}
                          className="px-2.5 py-1.5 rounded-md bg-neutral-100 hover:bg-emerald-50 hover:text-emerald-800 text-neutral-700 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          <span>Semua Excel</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Panel Integrasi Notifikasi WhatsApp Otomatis (H-3 Bulan Purna Tugas) */}
      <div className="bg-white rounded-xl border border-emerald-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-gradient-to-r from-[#064E3B] to-emerald-900 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-amber-300/40 flex items-center justify-center shrink-0">
              <BellRing className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold tracking-tight">
                  Notifikasi Otomatis WhatsApp (H-3 Bulan Masa Bakti Berakhir)
                </h2>
                <span className="px-2 py-0.5 rounded bg-amber-400/20 border border-amber-300/40 text-amber-200 font-mono text-[10px] font-bold">
                  {categorized.h3bulan.length} Anggota ≤ 3 Bulan
                </span>
              </div>
              <p className="text-[11px] text-emerald-100 mt-0.5 leading-relaxed">
                Sistem memantau perangkat desa dengan sisa masa jabatan ≤ 3 bulan dan mencatat riwayat kirim pada{' '}
                <code className="font-mono text-amber-200">whatsapp_logs</code> agar tidak terjadi pengiriman ganda.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <label
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 cursor-pointer select-none text-xs font-semibold"
              title="Jika aktif & Gateway Fonnte terhubung, anggota H-3 bulan yang belum dinotifikasi akan dikirimi pesan WA secara otomatis saat modul dibuka"
            >
              <input
                type="checkbox"
                checked={autoNotifyEnabled}
                onChange={(e) => handleToggleAutoNotify(e.target.checked)}
                className="w-4 h-4 accent-amber-400 rounded cursor-pointer"
              />
              <Bot className="w-4 h-4 text-amber-300 shrink-0" />
              <span>Kirim Otomatis Saat Dibuka</span>
            </label>

            {isBatchSending ? (
              <button
                type="button"
                onClick={() => {
                  cancelBatchRef.current = true;
                }}
                className="px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <StopCircle className="w-4 h-4" />
                <span>Hentikan ({batchProgress.current}/{batchProgress.total})</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={!fonnteActive || eligible3MonthsWithPhone.length === 0}
                onClick={() =>
                  runBatch3MonthDispatch(
                    pending3MonthsMembers.length > 0 ? pending3MonthsMembers : eligible3MonthsWithPhone,
                    'manual'
                  )
                }
                className="px-3.5 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed text-emerald-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {pending3MonthsMembers.length > 0
                    ? `Kirim Otomatis H-3 Bln (${pending3MonthsMembers.length})`
                    : eligible3MonthsWithPhone.length > 0
                    ? `Kirim Ulang Semua H-3 Bln (${eligible3MonthsWithPhone.length})`
                    : 'Tidak Ada Target H-3 Bln'}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Summary Metrics & Gateway Status Bar */}
        <div className="p-3.5 bg-emerald-50/40 flex flex-wrap items-center justify-between gap-3 text-xs border-t border-emerald-100">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-neutral-200 text-neutral-700 font-medium">
              Siap Kirim (No. WA Valid): <strong className="text-neutral-900">{eligible3MonthsWithPhone.length}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-100/80 border border-emerald-200 text-emerald-900 font-medium">
              Sudah Terkirim: <strong>{notified3MonthsCount}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-900 font-medium">
              Menunggu Kirim: <strong>{pending3MonthsMembers.length}</strong>
            </span>
            {missingPhone3MonthsCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-50 border border-red-200 text-red-800 font-medium">
                Tanpa No. WA Valid: <strong>{missingPhone3MonthsCount}</strong>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {samplePreviewMember && (
              <button
                type="button"
                onClick={() => setShowMessagePreview((v) => !v)}
                className="px-2.5 py-1 rounded-md bg-white hover:bg-neutral-100 border border-neutral-200 text-neutral-700 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5 text-[#064E3B]" />
                <span>{showMessagePreview ? 'Tutup Pratinjau Pesan' : 'Pratinjau Template Pesan H-3 Bln'}</span>
              </button>
            )}
            {!fonnteActive && canOpenWaSettings && (
              <button
                type="button"
                onClick={() => setActiveTab('settings-whatsapp')}
                className="px-2.5 py-1 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Aktifkan Fonnte Gateway</span>
              </button>
            )}
          </div>
        </div>

        {/* Batch Progress Indicator */}
        {isBatchSending && batchProgress.total > 0 && (
          <div className="px-4 py-3 bg-white border-t border-emerald-100 space-y-1.5 text-xs">
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-700" />
                <span>
                  {batchProgress.mode === 'auto'
                    ? 'Pengiriman Otomatis WhatsApp H-3 Bulan...'
                    : 'Mengirim Notifikasi WhatsApp H-3 Bulan...'}
                </span>
              </span>
              <span>
                {batchProgress.current} / {batchProgress.total} (Terkirim: {batchProgress.sent}, Gagal:{' '}
                {batchProgress.failed})
              </span>
            </div>
            <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#064E3B] transition-all duration-200"
                style={{ width: `${Math.round((batchProgress.current / batchProgress.total) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Template Message Preview */}
        {showMessagePreview && samplePreviewMember && (
          <div className="p-4 bg-neutral-50 border-t border-neutral-200 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-neutral-700 uppercase tracking-wider text-[11px]">
                Pratinjau Pesan Otomatis H-3 Bulan (Contoh: {samplePreviewMember.anggota.nama_lengkap})
              </span>
              <span className="text-[10px] font-mono text-neutral-500">
                Kategori Log: otomatis-pensiun-3-bulan
              </span>
            </div>
            <pre className="p-3 rounded-lg bg-white border border-neutral-200 font-sans text-[11px] text-neutral-800 whitespace-pre-wrap leading-relaxed">
              {buildRetirementWAMessage(samplePreviewMember)}
            </pre>
          </div>
        )}
      </div>

      {waFeedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            waFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-red-50 border-red-300 text-red-900'
          }`}
        >
          <span className="font-medium">{waFeedback.text}</span>
          <button
            type="button"
            onClick={() => setWaFeedback(null)}
            className="text-xs font-bold underline cursor-pointer shrink-0"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Categorized Counters */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
        <button
          onClick={() => setActiveCategory('h3bulan')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            activeCategory === 'h3bulan'
              ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-400'
              : 'bg-white border-neutral-200 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between text-rose-700 font-semibold mb-1">
            <span>H-3 Bulan (≤ 3 Bln)</span>
            <BellRing className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-rose-900 tabular-nums">
            {categorized.h3bulan.length} <span className="text-xs font-normal text-neutral-500">Orang</span>
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">Prioritas notifikasi WA otomatis</div>
        </button>

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
          <div className="text-[11px] text-neutral-500 mt-1">Perlu serah terima &amp; SK Pensiun</div>
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
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer col-span-2 lg:col-span-1 ${
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 bg-neutral-100 p-1 rounded-lg text-xs">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              activeCategory === 'all' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600'
            }`}
          >
            Semua Peringatan ({categorized.allAlerts.length})
          </button>
          <button
            onClick={() => setActiveCategory('h3bulan')}
            className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              activeCategory === 'h3bulan' ? 'bg-white text-rose-800 font-bold shadow-xs' : 'text-rose-700'
            }`}
          >
            H-3 Bulan ({categorized.h3bulan.length})
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
                <th className="py-3 px-4">Nama Perangkat &amp; NIK</th>
                <th className="py-3 px-4">Jabatan &amp; Wilayah</th>
                <th className="py-3 px-4">Tgl Lahir &amp; Purna</th>
                <th className="py-3 px-4">Usia Saat Ini</th>
                <th className="py-3 px-4">Sisa Masa Jabatan</th>
                <th className="py-3 px-4 text-center">Status &amp; Notif WA</th>
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
                displayList.map((m) => {
                  const idAnggota = m.anggota.id_anggota;
                  const is3Months = isWithin3MonthsWindow(m);
                  const { tanggalPurnaTugas } = getRetirementDeadlineInfo(m.anggota.tanggal_lahir);
                  const notifiedInfo = notifiedMap[idAnggota];
                  const liveStatus = rowDeliveryStatus[idAnggota];
                  const isSendingRow =
                    sendingWaMemberId === idAnggota || liveStatus?.status === 'sending';

                  return (
                    <tr
                      key={idAnggota}
                      className={`hover:bg-neutral-50/70 transition-colors ${
                        is3Months ? 'bg-rose-50/30' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <div
                            className="font-semibold text-neutral-900 hover:text-emerald-800 cursor-pointer uppercase tracking-tight"
                            onClick={() => onOpenDetailModal(m)}
                          >
                            {m.anggota.nama_lengkap.toUpperCase()}
                          </div>
                          {is3Months && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200 text-[9px] font-bold uppercase">
                              H-3 Bln
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-neutral-500">
                          NIK: {m.anggota.nik}
                        </div>
                        <div className="text-[10px] font-mono text-neutral-500">
                          WA: {m.anggota.no_hp_wa || '-'}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-neutral-900">{m.jabatanRef?.nama_jabatan}</div>
                        <div className="text-[11px] text-neutral-500">
                          Desa {m.desa?.nama_desa}, Kec. {m.kecamatan?.nama_kecamatan}
                        </div>
                      </td>

                      <td className="py-3 px-4 tabular-nums">
                        <div>Lahir: {formatDateIndo(m.anggota.tanggal_lahir)}</div>
                        <div className="text-[10px] text-neutral-500 font-mono">
                          Purna: {formatDateIndo(tanggalPurnaTugas)}
                        </div>
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

                      <td className="py-3 px-4 text-center space-y-1">
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

                        {liveStatus?.status === 'failed' ? (
                          <div
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 text-red-800 text-[10px] font-semibold"
                            title={liveStatus.detail}
                          >
                            <XCircle className="w-3 h-3 shrink-0" />
                            <span>Gagal Kirim WA</span>
                          </div>
                        ) : notifiedInfo ? (
                          <div
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-200 text-[10px] font-semibold"
                            title={`Terkirim pada ${new Date(notifiedInfo.timestamp).toLocaleString('id-ID')}`}
                          >
                            <CheckCircle2 className="w-3 h-3 text-emerald-700 shrink-0" />
                            <span>
                              WA Terkirim{' '}
                              {new Date(notifiedInfo.timestamp).toLocaleDateString('id-ID', {
                                day: '2-digit',
                                month: 'short',
                              })}
                            </span>
                          </div>
                        ) : is3Months ? (
                          <div className="text-[10px] text-rose-700 font-semibold">
                            Belum Dinotifikasi WA
                          </div>
                        ) : null}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* WhatsApp Reminder */}
                          <button
                            type="button"
                            onClick={() => handleSendRetirementWA(m)}
                            disabled={isSendingRow || isBatchSending}
                            title={
                              fonnteActive
                                ? 'Kirim Pemberitahuan WhatsApp via Fonnte Gateway'
                                : 'Kirim Pemberitahuan WhatsApp via wa.me'
                            }
                            className="px-2 py-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-md transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
                          >
                            {isSendingRow ? (
                              <RefreshCw className="w-3 h-3 text-emerald-600 animate-spin" />
                            ) : (
                              <Phone className="w-3 h-3 text-emerald-600" />
                            )}
                            <span>
                              {isSendingRow
                                ? 'Mengirim...'
                                : notifiedInfo
                                ? 'Kirim Ulang WA'
                                : 'Notif WA'}
                            </span>
                          </button>

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
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
