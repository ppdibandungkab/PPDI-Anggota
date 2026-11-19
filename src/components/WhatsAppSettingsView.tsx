import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePPDI } from '../context/PPDIContext';
import { WhatsAppSettings } from '../types/ppdi';
import { dispatchWhatsAppNotification, safeFetchJson } from '../utils/ppdiHelpers';
import {
  Activity,
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  MessageSquare,
  Phone,
  Radio,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  Webhook,
  Zap,
} from 'lucide-react';

interface WhatsAppLogEntry {
  id: string;
  timestamp: string;
  direction: 'outbound' | 'inbound' | 'status';
  provider: 'fonnte' | 'webhook';
  senderNumber?: string;
  targetOrSender: string;
  senderName?: string;
  idAnggota?: string;
  category?: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'received' | 'replied';
  message: string;
  fonnteId?: string;
  batchId?: string;
  rawPayload?: any;
}

interface WhatsAppDbStatus {
  dbConnected: boolean;
  storageMode: 'mysql' | 'json_fallback';
  tables: {
    whatsapp_senders: { exists: boolean; count: number };
    whatsapp_logs: { exists: boolean; count: number };
  };
  fallbackLogsCount: number;
}

export const WhatsAppSettingsView: React.FC = () => {
  const { appSettings, updateAppSettings, hasPermission } = usePPDI();
  const canEdit = hasPermission('settings-whatsapp', 'edit');
  const canDelete = hasPermission('settings-whatsapp', 'delete');

  const defaultOriginWebhook = useMemo(() => {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin.replace(/\/+$/, '')}/api/webhook/fonnte`;
    }
    return '/api/webhook/fonnte';
  }, []);

  const initialWa = appSettings?.whatsappSettings;
  const [enabled, setEnabled] = useState<boolean>(Boolean(initialWa?.enabled));
  const [senderNumber, setSenderNumber] = useState<string>(initialWa?.senderNumber || '');
  const [fonnteToken, setFonnteToken] = useState<string>(initialWa?.fonnteToken || '');
  const [webhookUrl, setWebhookUrl] = useState<string>(initialWa?.webhookUrl || defaultOriginWebhook);
  const [webhookSecret, setWebhookSecret] = useState<string>(initialWa?.webhookSecret || '');
  const [autoReplyEnabled, setAutoReplyEnabled] = useState<boolean>(
    initialWa?.autoReplyEnabled !== undefined ? Boolean(initialWa.autoReplyEnabled) : true
  );
  const [countryCode, setCountryCode] = useState<string>(initialWa?.countryCode || '62');

  const [showToken, setShowToken] = useState<boolean>(false);
  const [copiedWebhook, setCopiedWebhook] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Test & Logs state
  const [testTarget, setTestTarget] = useState<string>('');
  const [testMessage, setTestMessage] = useState<string>(
    'Halo, ini adalah pesan uji coba notifikasi resmi dari Portal PPDI Kabupaten Bandung.'
  );
  const [testingDevice, setTestingDevice] = useState<boolean>(false);
  const [sendingTest, setSendingTest] = useState<boolean>(false);
  const [simulatingWebhook, setSimulatingWebhook] = useState<boolean>(false);
  const [deviceStatusInfo, setDeviceStatusInfo] = useState<any>(null);

  const [logs, setLogs] = useState<WhatsAppLogEntry[]>([]);
  const [logSource, setLogSource] = useState<'mysql' | 'json_fallback'>('json_fallback');
  const [logDirectionFilter, setLogDirectionFilter] = useState<'all' | 'outbound' | 'inbound' | 'status'>('all');
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const [waDbStatus, setWaDbStatus] = useState<WhatsAppDbStatus | null>(null);
  const [initializingDb, setInitializingDb] = useState<boolean>(false);

  const isDirtyRef = useRef(false);
  const lastSyncedWaSignatureRef = useRef('');
  const formContainerRef = useRef<HTMLFormElement>(null);

  // Sync local form when appSettings loads from backend, unless user is editing
  useEffect(() => {
    const cfg = appSettings?.whatsappSettings;
    if (!cfg) return;

    const signature = JSON.stringify({
      enabled: Boolean(cfg.enabled),
      senderNumber: cfg.senderNumber || '',
      fonnteToken: cfg.fonnteToken || '',
      webhookUrl: cfg.webhookUrl || defaultOriginWebhook,
      webhookSecret: cfg.webhookSecret || '',
      autoReplyEnabled: cfg.autoReplyEnabled !== undefined ? Boolean(cfg.autoReplyEnabled) : true,
      countryCode: cfg.countryCode || '62',
    });

    const isFocusedInsideForm =
      typeof document !== 'undefined' &&
      Boolean(formContainerRef.current && document.activeElement && formContainerRef.current.contains(document.activeElement));

    if (isDirtyRef.current || isFocusedInsideForm || lastSyncedWaSignatureRef.current === signature) {
      return;
    }

    lastSyncedWaSignatureRef.current = signature;
    setEnabled(Boolean(cfg.enabled));
    setSenderNumber(cfg.senderNumber || '');
    setFonnteToken(cfg.fonnteToken || '');
    setWebhookUrl(cfg.webhookUrl || defaultOriginWebhook);
    setWebhookSecret(cfg.webhookSecret || '');
    setAutoReplyEnabled(cfg.autoReplyEnabled !== undefined ? Boolean(cfg.autoReplyEnabled) : true);
    setCountryCode(cfg.countryCode || '62');
  }, [appSettings?.whatsappSettings, defaultOriginWebhook]);

  const fetchWaDbStatus = async () => {
    try {
      const res = await safeFetchJson<WhatsAppDbStatus & { success: boolean }>('/api/whatsapp/db-status');
      if (res.ok && res.data?.success) {
        setWaDbStatus(res.data);
      }
    } catch (_) {}
  };

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await safeFetchJson<{ success: boolean; source?: 'mysql' | 'json_fallback'; logs: WhatsAppLogEntry[] }>('/api/whatsapp/logs');
      if (res.ok && res.data?.logs) {
        setLogs(res.data.logs);
        if (res.data.source) setLogSource(res.data.source);
      }
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleInitWhatsAppTables = async () => {
    if (!canEdit) return;
    setInitializingDb(true);
    setFeedback(null);
    try {
      const res = await safeFetchJson('/api/whatsapp/init-tables', { method: 'POST' });
      setFeedback({
        type: res.ok && res.data?.success ? 'success' : 'error',
        text: res.data?.message || (res.ok ? 'Tabel database WhatsApp berhasil dibuat.' : 'Gagal menginisialisasi tabel database WhatsApp.'),
      });
      await fetchWaDbStatus();
      await fetchLogs();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Gagal menghubungi server database.' });
    } finally {
      setInitializingDb(false);
    }
  };

  useEffect(() => {
    fetchWaDbStatus();
    fetchLogs();
  }, []);

  const fullWebhookUrlWithSecret = useMemo(() => {
    const base = (webhookUrl || defaultOriginWebhook).trim();
    const secret = webhookSecret.trim();
    if (!secret) return base;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}secret=${encodeURIComponent(secret)}`;
  }, [webhookUrl, webhookSecret, defaultOriginWebhook]);

  const handleCopyWebhook = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(fullWebhookUrlWithSecret);
      setCopiedWebhook(true);
      window.setTimeout(() => setCopiedWebhook(false), 2000);
    }
  };

  const buildPayloadSettings = (): WhatsAppSettings => ({
    enabled,
    senderNumber: senderNumber.trim(),
    fonnteToken: fonnteToken.trim(),
    webhookUrl: (webhookUrl || defaultOriginWebhook).trim(),
    webhookSecret: webhookSecret.trim(),
    autoReplyEnabled,
    countryCode: countryCode.trim() || '62',
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setFeedback(null);

    try {
      const payload = buildPayloadSettings();
      if (payload.enabled && !payload.fonnteToken) {
        setFeedback({
          type: 'error',
          text: 'Token API Fonnte wajib diisi terlebih dahulu sebelum mengaktifkan Webhook / Gateway Fonnte.',
        });
        setSaving(false);
        return;
      }

      await updateAppSettings({ whatsappSettings: payload });
      const waSaveRes = await safeFetchJson('/api/whatsapp/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsappSettings: payload }),
      });

      await fetchWaDbStatus();
      isDirtyRef.current = false;

      setFeedback({
        type: 'success',
        text: payload.enabled
          ? `Pengaturan WhatsApp disimpan${waSaveRes.data?.dbSynced ? ' ke database (whatsapp_senders)' : ''}! Mode Gateway Fonnte & Webhook AKTIF — semua notifikasi otomatis dikirim via Fonnte.`
          : `Pengaturan WhatsApp disimpan${waSaveRes.data?.dbSynced ? ' ke database (whatsapp_senders)' : ''}! Mode Webhook NONAKTIF — pengiriman otomatis kembali menggunakan API wa.me standar.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Gagal menyimpan pengaturan WhatsApp.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCheckDevice = async () => {
    setTestingDevice(true);
    setFeedback(null);
    setDeviceStatusInfo(null);
    try {
      const res = await safeFetchJson('/api/whatsapp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fonnteToken: fonnteToken.trim() }),
      });
      setDeviceStatusInfo(res.data?.device || res.data);
      setFeedback({
        type: res.ok && res.data?.success ? 'success' : 'error',
        text: res.data?.message || (res.ok ? 'Device Fonnte terhubung.' : 'Gagal memeriksa device Fonnte.'),
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Gagal menghubungi API Fonnte.' });
    } finally {
      setTestingDevice(false);
    }
  };

  const handleSendTestMessage = async () => {
    if (!testTarget.trim()) {
      setFeedback({ type: 'error', text: 'Masukkan nomor WhatsApp tujuan uji coba terlebih dahulu.' });
      return;
    }
    setSendingTest(true);
    setFeedback(null);
    try {
      const currentCfg = buildPayloadSettings();
      if (currentCfg.enabled && currentCfg.fonnteToken) {
        const res = await safeFetchJson('/api/whatsapp/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fonnteToken: currentCfg.fonnteToken,
            testTarget: testTarget.trim(),
            testMessage: testMessage.trim(),
          }),
        });
        setFeedback({
          type: res.ok && res.data?.success ? 'success' : 'error',
          text: res.data?.message || 'Pengujian kirim pesan selesai.',
        });
        await fetchLogs();
      } else {
        const result = await dispatchWhatsAppNotification({
          phone: testTarget.trim(),
          message: testMessage.trim(),
          recipientName: testTarget.trim(),
          category: 'test_wa_me',
          whatsappSettings: currentCfg,
        });
        setFeedback({
          type: result.success ? 'success' : 'error',
          text: `${result.message} (Mode API Standar wa.me karena webhook nonaktif)`,
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Gagal mengirim pesan uji coba.' });
    } finally {
      setSendingTest(false);
    }
  };

  const handleSimulateWebhook = async () => {
    setSimulatingWebhook(true);
    setFeedback(null);
    try {
      const res = await safeFetchJson('/api/whatsapp/webhook-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: senderNumber.trim() || '6281234567890',
          name: 'Simulasi Anggota PPDI',
          message: 'INFO',
        }),
      });
      setFeedback({
        type: res.ok && res.data?.success ? 'success' : 'error',
        text: res.data?.message || 'Simulasi webhook diproses.',
      });
      await fetchLogs();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Gagal menjalankan simulasi webhook.' });
    } finally {
      setSimulatingWebhook(false);
    }
  };

  const handleClearLogs = async () => {
    const res = await safeFetchJson('/api/whatsapp/logs', { method: 'DELETE' });
    if (res.ok && res.data?.success) {
      setLogs([]);
      setFeedback({ type: 'success', text: res.data.message || 'Log WhatsApp dibersihkan.' });
    }
  };

  const isGatewayReady = enabled && Boolean(fonnteToken.trim());

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16 text-neutral-900">
      {/* Top Banner */}
      <div className="bg-[#064E3B] text-white p-5 sm:p-6 rounded-2xl shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <MessageSquare className="w-5 h-5 text-amber-300 shrink-0" />
            <h1 className="text-lg sm:text-2xl font-bold tracking-tight">
              Setting WhatsApp &amp; Webhook Fonnte
            </h1>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold ${
                isGatewayReady
                  ? 'bg-emerald-400/20 text-emerald-200 border border-emerald-300/40'
                  : 'bg-amber-400/20 text-amber-200 border border-amber-300/40'
              }`}
            >
              {isGatewayReady ? 'MODE: FONNTE GATEWAY' : 'MODE: API WA.ME STANDAR'}
            </span>
          </div>
          <p className="text-emerald-100 text-xs sm:text-sm mt-1">
            Konfigurasi nomor pengirim, token device Fonnte, dan endpoint webhook untuk pengiriman notifikasi WhatsApp otomatis.
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs sm:text-sm flex items-start gap-2.5 shadow-2xs ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-red-50 border-red-300 text-red-900'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          )}
          <span className="font-semibold leading-relaxed">{feedback.text}</span>
        </div>
      )}

      {/* Master Auto-Routing Switch Card */}
      <div
        className={`rounded-2xl border p-5 transition-all shadow-xs ${
          enabled
            ? 'bg-gradient-to-r from-emerald-50/90 via-white to-white border-emerald-300'
            : 'bg-white border-neutral-200'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                enabled
                  ? 'bg-[#064E3B] text-amber-300'
                  : 'bg-neutral-100 text-neutral-500 border border-neutral-200'
              }`}
            >
              <Webhook className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-neutral-900">
                  Aktifkan Integrasi Webhook &amp; Gateway Fonnte
                </h2>
                <span
                  className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase ${
                    enabled
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-neutral-200 text-neutral-700'
                  }`}
                >
                  {enabled ? 'AKTIF (VIA FONNTE)' : 'NONAKTIF (API WA.ME)'}
                </span>
              </div>
              <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
                {enabled
                  ? 'Notifikasi WhatsApp (Approval, E-KTA, Iuran, Purna Tugas) dikirim otomatis di latar belakang melalui API Fonnte tanpa membuka tab baru.'
                  : 'Webhook sedang nonaktif. Pengiriman notifikasi WhatsApp otomatis menggunakan API wa.me standar seperti semula.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={!canEdit}
            onClick={() => {
              isDirtyRef.current = true;
              setEnabled((prev) => !prev);
            }}
            className={`relative inline-flex h-7 w-13 shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 ${
              enabled ? 'bg-[#064E3B]' : 'bg-neutral-300'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                enabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Database Table Penyimpan Pengirim & Log WhatsApp Status Card */}
      <div className="bg-white border border-neutral-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-[#064E3B] flex items-center justify-center shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xs sm:text-sm font-bold text-neutral-900">
                Tabel Database Penyimpan &amp; Log Pengirim WhatsApp
              </h3>
              <span
                className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold border ${
                  waDbStatus?.storageMode === 'mysql'
                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                    : 'bg-amber-50 text-amber-900 border-amber-300'
                }`}
              >
                {waDbStatus?.storageMode === 'mysql' ? 'MYSQL AKTIF' : 'FALLBACK JSON LOKAL'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-neutral-600">
              <span>
                • <strong className="text-neutral-900">whatsapp_senders</strong>:{' '}
                {waDbStatus?.tables.whatsapp_senders.exists
                  ? `Tersedia (${waDbStatus.tables.whatsapp_senders.count} pengirim)`
                  : 'Belum dibuat / DB Offline'}
              </span>
              <span>
                • <strong className="text-neutral-900">whatsapp_logs</strong>:{' '}
                {waDbStatus?.tables.whatsapp_logs.exists
                  ? `Tersedia (${waDbStatus.tables.whatsapp_logs.count} log)`
                  : `Belum dibuat (${waDbStatus?.fallbackLogsCount ?? logs.length} log lokal)`}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={fetchWaDbStatus}
            className="px-3 py-2 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg cursor-pointer flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Cek Tabel</span>
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={handleInitWhatsAppTables}
              disabled={initializingDb}
              className="px-3.5 py-2 text-xs font-bold text-white bg-[#064E3B] hover:bg-[#043d2e] rounded-lg cursor-pointer flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
            >
              <Database className={`w-3.5 h-3.5 text-amber-300 ${initializingDb ? 'animate-spin' : ''}`} />
              <span>{initializingDb ? 'Membuat Tabel...' : 'Buat / Sinkronkan Tabel DB'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Configuration Form */}
      <form
        ref={formContainerRef}
        onSubmit={handleSave}
        onChange={() => {
          isDirtyRef.current = true;
        }}
        className="bg-white border border-neutral-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5"
      >
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-[#064E3B]" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-800">
              Konfigurasi Nomor, Token Fonnte &amp; Endpoint Webhook
            </h2>
          </div>
          <span className="text-[11px] font-mono text-neutral-500">Fonnte API v2</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Nomor WhatsApp Pengirim */}
          <div>
            <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
              Nomor WhatsApp Pengirim (Device Fonnte)
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                disabled={!canEdit}
                placeholder="Contoh: 6281234567890 atau 081234567890"
                value={senderNumber}
                onChange={(e) => setSenderNumber(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:ring-2 focus:ring-[#064E3B] outline-none disabled:bg-neutral-50"
              />
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">
              Nomor WhatsApp yang terhubung (scan QR) pada device di dashboard Fonnte Anda.
            </p>
          </div>

          {/* Kode Negara Default */}
          <div>
            <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
              Kode Negara Default (Country Code)
            </label>
            <input
              type="text"
              disabled={!canEdit}
              placeholder="62"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value.replace(/\D/g, ''))}
              className="w-full px-3 py-2.5 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:ring-2 focus:ring-[#064E3B] outline-none disabled:bg-neutral-50"
            />
            <p className="text-[11px] text-neutral-500 mt-1">
              Default Indonesia: <code className="font-mono font-bold">62</code> (otomatis mengonversi awalan 08 menjadi 628).
            </p>
          </div>

          {/* Token Fonnte */}
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
              Token API Device Fonnte <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <KeyRound className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showToken ? 'text' : 'password'}
                  disabled={!canEdit}
                  placeholder="Tempel Token API Device dari menu Device di dashboard Fonnte"
                  value={fonnteToken}
                  onChange={(e) => setFonnteToken(e.target.value)}
                  className="w-full pl-9 pr-10 py-2.5 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:ring-2 focus:ring-[#064E3B] outline-none disabled:bg-neutral-50"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                  aria-label={showToken ? 'Sembunyikan Token' : 'Tampilkan Token'}
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                type="button"
                disabled={testingDevice || !fonnteToken.trim()}
                onClick={handleCheckDevice}
                className="px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
              >
                <Radio className={`w-3.5 h-3.5 ${testingDevice ? 'animate-spin' : ''}`} />
                <span>{testingDevice ? 'Mengecek...' : 'Cek Device'}</span>
              </button>
            </div>
            {deviceStatusInfo && (
              <div className="mt-2 p-2.5 rounded-lg bg-neutral-50 border border-neutral-200 text-[11px] font-mono text-neutral-700">
                Status API Fonnte: <strong>{String(deviceStatusInfo.device_status || deviceStatusInfo.status || '-')}</strong>
                {deviceStatusInfo.device ? ` · Device: ${deviceStatusInfo.device}` : ''}
                {deviceStatusInfo.quota !== undefined ? ` · Kuota: ${deviceStatusInfo.quota}` : ''}
              </div>
            )}
          </div>

          {/* Webhook URL */}
          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-neutral-700 uppercase">
                URL Webhook Fonnte (Endpoint Receiver)
              </label>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => {
                  isDirtyRef.current = true;
                  setWebhookUrl(defaultOriginWebhook);
                }}
                className="text-[11px] text-emerald-700 hover:underline flex items-center gap-1 cursor-pointer font-semibold"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Gunakan URL Server Ini</span>
              </button>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2 className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  disabled={!canEdit}
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:ring-2 focus:ring-[#064E3B] outline-none disabled:bg-neutral-50"
                />
              </div>
              <button
                type="button"
                onClick={handleCopyWebhook}
                className="px-3.5 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-300" />}
                <span>{copiedWebhook ? 'Tersalin' : 'Salin URL'}</span>
              </button>
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">
              URL lengkap siap tempel di Fonnte Dashboard:{' '}
              <code className="font-mono text-emerald-800 break-all">{fullWebhookUrlWithSecret}</code>
            </p>
          </div>

          {/* Webhook Secret (Optional) */}
          <div>
            <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
              Webhook Secret Key (Opsional)
            </label>
            <input
              type="text"
              disabled={!canEdit}
              placeholder="Kosongkan jika tanpa secret, atau isi kata rahasia"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              className="w-full px-3 py-2.5 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:ring-2 focus:ring-[#064E3B] outline-none disabled:bg-neutral-50"
            />
            <p className="text-[11px] text-neutral-500 mt-1">
              Jika diisi, request webhook wajib menyertakan <code className="font-mono">?secret=...</code> atau header <code className="font-mono">x-webhook-secret</code>.
            </p>
          </div>

          {/* Auto Reply Bot Switch */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/70">
            <div className="flex items-start gap-2.5 pr-3">
              <Bot className="w-4 h-4 text-[#064E3B] shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-neutral-900">
                  Auto-Reply Cek E-KTA di Webhook
                </div>
                <p className="text-[11px] text-neutral-500 mt-0.5 leading-snug">
                  Balas otomatis pesan masuk <code className="font-mono font-semibold">INFO</code> atau{' '}
                  <code className="font-mono font-semibold">CEK &lt;NIK/No.KTA&gt;</code> dari database anggota.
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoReplyEnabled}
              disabled={!canEdit}
              onClick={() => {
                isDirtyRef.current = true;
                setAutoReplyEnabled((prev) => !prev);
              }}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 ${
                autoReplyEnabled ? 'bg-[#064E3B]' : 'bg-neutral-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoReplyEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="pt-3 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] text-neutral-500 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>Tersimpan permanen di konfigurasi server &amp; langsung diterapkan ke seluruh tombol notifikasi WhatsApp.</span>
          </div>
          <button
            type="submit"
            disabled={!canEdit || saving}
            className="px-5 py-2.5 bg-[#064E3B] hover:bg-[#043d2e] disabled:bg-neutral-300 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer shadow-xs"
          >
            <Save className="w-4 h-4 text-amber-300" />
            <span>{saving ? 'Menyimpan...' : 'Simpan Pengaturan WhatsApp'}</span>
          </button>
        </div>
      </form>

      {/* Test Message & Webhook Simulator Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Uji Kirim Notifikasi */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-600" />
              <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-neutral-800">
                Uji Kirim Notifikasi WhatsApp
              </h3>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-100 text-neutral-700 font-bold">
              {enabled && fonnteToken.trim() ? 'Via Fonnte' : 'Via wa.me'}
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-neutral-700 uppercase mb-1">
                Nomor WhatsApp Tujuan Uji Coba
              </label>
              <input
                type="text"
                placeholder="Contoh: 081234567890"
                value={testTarget}
                onChange={(e) => setTestTarget(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:ring-2 focus:ring-[#064E3B] outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-neutral-700 uppercase mb-1">
                Isi Pesan Uji Coba
              </label>
              <textarea
                rows={3}
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs text-neutral-900 focus:ring-2 focus:ring-[#064E3B] outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={sendingTest || !testTarget.trim()}
                onClick={handleSendTestMessage}
                className="px-4 py-2 bg-[#064E3B] hover:bg-[#043d2e] disabled:bg-neutral-200 disabled:text-neutral-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 text-amber-300" />
                <span>{sendingTest ? 'Mengirim...' : 'Kirim Pesan Uji Coba'}</span>
              </button>

              <button
                type="button"
                disabled={simulatingWebhook || !canEdit}
                onClick={handleSimulateWebhook}
                className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Activity className={`w-3.5 h-3.5 ${simulatingWebhook ? 'animate-spin' : ''}`} />
                <span>{simulatingWebhook ? 'Memproses...' : 'Simulasi Webhook Masuk'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Panduan Integrasi Fonnte */}
        <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 border-b border-neutral-200 pb-2.5">
            <Webhook className="w-4 h-4 text-[#064E3B]" />
            <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-neutral-800">
              Panduan Menghubungkan Dashboard Fonnte
            </h3>
          </div>
          <ol className="list-decimal list-inside space-y-2 text-xs text-neutral-700 leading-relaxed">
            <li>
              Login ke akun <strong>Fonnte</strong> (<code className="font-mono text-emerald-800">md.fonnte.com</code>) dan pastikan device WhatsApp Anda berstatus <strong>Connect</strong>.
            </li>
            <li>
              Buka menu <strong>Device &rarr; Token</strong>, salin token API device lalu tempel pada kolom <strong>Token API Device Fonnte</strong> di atas.
            </li>
            <li>
              Buka menu <strong>Device &rarr; Edit</strong> di Fonnte, lalu tempel <strong>URL Webhook Fonnte</strong> di atas ke kolom <strong>Webhook URL</strong> (dan <strong>Webhook Status</strong> bila ingin melacak status terkirim/dibaca).
            </li>
            <li>
              Aktifkan sakelar <strong>Aktifkan Integrasi Webhook &amp; Gateway Fonnte</strong> lalu klik <strong>Simpan Pengaturan WhatsApp</strong>.
            </li>
            <li>
              Saat sakelar <strong>AKTIF</strong>, seluruh pengiriman notifikasi WhatsApp otomatis melewati <strong>Fonnte API</strong>. Saat sakelar <strong>NONAKTIF</strong>, sistem otomatis memakai API <strong>wa.me</strong> seperti semula.
            </li>
          </ol>
        </div>
      </div>

      {/* Real-time Webhook & Outbound Delivery Logs */}
      <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#064E3B]" />
                <span>Log Pengirim WhatsApp &amp; Webhook Fonnte ({logs.length})</span>
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-100 text-neutral-700 border border-neutral-200">
                Sumber: {logSource === 'mysql' ? 'Tabel MySQL whatsapp_logs' : 'Cache Lokal JSON'}
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              Riwayat pesan keluar (satuan &amp; massal) via Fonnte API, pesan masuk melalui webhook, dan callback status pengiriman.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-neutral-100 p-0.5 rounded-lg text-[11px] font-semibold">
              {(['all', 'outbound', 'inbound', 'status'] as const).map((dir) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => setLogDirectionFilter(dir)}
                  className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                    logDirectionFilter === dir
                      ? 'bg-white text-[#064E3B] shadow-2xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  {dir === 'all' ? 'Semua' : dir === 'outbound' ? 'Keluar' : dir === 'inbound' ? 'Masuk' : 'Status'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={fetchLogs}
              disabled={loadingLogs}
              className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            {canDelete && logs.length > 0 && (
              <button
                type="button"
                onClick={handleClearLogs}
                className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Bersihkan Log</span>
              </button>
            )}
          </div>
        </div>

        {(() => {
          const displayedLogs =
            logDirectionFilter === 'all'
              ? logs
              : logs.filter((l) => l.direction === logDirectionFilter);

          if (displayedLogs.length === 0) {
            return (
              <div className="p-8 text-center text-xs text-neutral-400 bg-neutral-50 rounded-xl border border-dashed border-neutral-300">
                Belum ada catatan pengiriman Fonnte atau event webhook pada filter ini.
              </div>
            );
          }

          return (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 border-b border-neutral-200 text-[11px] font-bold text-neutral-600 uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Waktu</th>
                    <th className="py-2.5 px-3">Arah</th>
                    <th className="py-2.5 px-3">Pengirim / Tujuan</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Ringkasan Pesan / Event</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {displayedLogs.slice(0, 40).map((log) => (
                    <tr key={log.id} className="hover:bg-neutral-50/70">
                      <td className="py-2.5 px-3 font-mono text-[11px] text-neutral-500 whitespace-nowrap">
                        <div>{new Date(log.timestamp).toLocaleString('id-ID')}</div>
                        {log.batchId && (
                          <div className="text-[10px] text-amber-800 font-semibold mt-0.5">
                            Batch: {log.batchId}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase ${
                            log.direction === 'outbound'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : log.direction === 'inbound'
                              ? 'bg-blue-50 text-blue-800 border border-blue-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {log.direction}
                        </span>
                        {log.category && (
                          <div className="text-[10px] text-neutral-500 font-mono mt-1">{log.category}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-neutral-800">
                        <div>{log.targetOrSender}</div>
                        {log.senderName && (
                          <div className="text-[10px] text-neutral-600 font-sans font-semibold">{log.senderName}</div>
                        )}
                        {log.senderNumber && (
                          <div className="text-[10px] text-neutral-400">Pengirim: {log.senderNumber}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase ${
                            log.status === 'sent' || log.status === 'delivered' || log.status === 'read'
                              ? 'bg-emerald-100 text-emerald-900'
                              : log.status === 'received' || log.status === 'replied'
                              ? 'bg-sky-100 text-sky-900'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-neutral-700 max-w-md">
                        <p className="line-clamp-2 whitespace-pre-line break-words">{log.message}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
