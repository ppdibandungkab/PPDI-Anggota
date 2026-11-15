import React, { useMemo, useRef, useState, useEffect } from 'react';
import { AnggotaFullDetail } from '../types/ppdi';
import { usePPDI } from '../context/PPDIContext';
import {
  buildWhatsAppIuranReminderMessage,
  buildWhatsAppKTAReminderMessage,
  dispatchWhatsAppNotification,
  formatPhoneForWhatsApp,
  getPortalVerifikasiEktaUrl,
  isFonnteWebhookActive,
} from '../utils/ppdiHelpers';
import { getPhotoUrl, handleImageError } from '../utils/fileHelpers';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FileText,
  MessageSquare,
  RefreshCw,
  Send,
  Settings,
  StopCircle,
  Users,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';

interface BulkWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedMembers: AnggotaFullDetail[];
  onRemoveMember: (id: string) => void;
  onComplete: (summary: { sentCount: number; failedCount: number; batchId: string }) => void;
}

type DeliveryStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'no_phone';

export const BulkWhatsAppModal: React.FC<BulkWhatsAppModalProps> = ({
  isOpen,
  onClose,
  selectedMembers,
  onRemoveMember,
  onComplete,
}) => {
  const { appSettings, setActiveTab, hasPermission } = usePPDI();
  const waSettings = appSettings?.whatsappSettings;
  const fonnteActive = isFonnteWebhookActive(waSettings);
  const canOpenWaSettings = hasPermission('settings-whatsapp', 'view');

  const [messageMode, setMessageMode] = useState<'kta' | 'iuran' | 'custom'>('kta');
  const [customMessage, setCustomMessage] = useState<string>(
    'Yth. Bpk/Ibu *{nama}*,\n\nInformasi resmi dari Pengurus Daerah PPDI Kabupaten Bandung untuk perangkat desa *{desa}*, Kec. *{kecamatan}* (No. KTA: *{no_kta}*).\n\nMohon memastikan data keanggotaan Anda selalu mutakhir. Terima kasih.\n\nSalam Perjuangan,\n*Pengurus Daerah PPDI Kabupaten Bandung*'
  );
  const [includeVerifyLink, setIncludeVerifyLink] = useState<boolean>(true);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [statusMap, setStatusMap] = useState<Record<string, { status: DeliveryStatus; detail?: string }>>({});
  const [progress, setProgress] = useState<{ current: number; total: number; sent: number; failed: number }>({
    current: 0,
    total: 0,
    sent: 0,
    failed: 0,
  });
  const [hasFinishedBatch, setHasFinishedBatch] = useState<boolean>(false);
  const cancelRef = useRef<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      cancelRef.current = false;
      setHasFinishedBatch(false);
      setIsSending(false);
      const initialMap: Record<string, { status: DeliveryStatus; detail?: string }> = {};
      selectedMembers.forEach((m) => {
        const clean = formatPhoneForWhatsApp(m.anggota.no_hp_wa);
        initialMap[m.anggota.id_anggota] =
          clean && clean.length >= 8
            ? { status: 'pending' }
            : { status: 'no_phone', detail: 'Nomor WA kosong / tidak valid' };
      });
      setStatusMap(initialMap);
      setProgress({ current: 0, total: 0, sent: 0, failed: 0 });
    }
  }, [isOpen, selectedMembers]);

  const validMembers = useMemo(() => {
    return selectedMembers.filter((m) => {
      const clean = formatPhoneForWhatsApp(m.anggota.no_hp_wa);
      return Boolean(clean && clean.length >= 8);
    });
  }, [selectedMembers]);

  const missingPhoneCount = selectedMembers.length - validMembers.length;

  const buildMemberMessage = (member: AnggotaFullDetail): { verifyUrl: string; message: string } => {
    const verifyUrl = getPortalVerifikasiEktaUrl({
      noKta: member.keanggotaan?.no_kta,
      nik: member.anggota.nik,
      idAnggota: member.anggota.id_anggota,
    });

    if (messageMode === 'kta') {
      return {
        verifyUrl,
        message: buildWhatsAppKTAReminderMessage({
          name: member.anggota.nama_lengkap,
          noKta: member.keanggotaan?.no_kta,
          nik: member.anggota.nik,
          idAnggota: member.anggota.id_anggota,
          statusKta: member.keanggotaan?.status_kta,
          desa: member.desa?.nama_desa,
          kecamatan: member.kecamatan?.nama_kecamatan,
          verifyUrl,
        }),
      };
    }

    if (messageMode === 'iuran') {
      return {
        verifyUrl,
        message: buildWhatsAppIuranReminderMessage({
          name: member.anggota.nama_lengkap,
          desa: member.desa?.nama_desa,
          noKta: member.keanggotaan?.no_kta,
          nik: member.anggota.nik,
          idAnggota: member.anggota.id_anggota,
          verifyUrl,
        }),
      };
    }

    let rendered = customMessage
      .replace(/\{nama\}/gi, (member.anggota.nama_lengkap || '').toUpperCase().trim())
      .replace(/\{no_kta\}/gi, member.keanggotaan?.no_kta || 'Belum Terbit')
      .replace(/\{nik\}/gi, member.anggota.nik || '-')
      .replace(/\{desa\}/gi, member.desa?.nama_desa ? `Desa ${member.desa.nama_desa}` : '-')
      .replace(/\{kecamatan\}/gi, member.kecamatan?.nama_kecamatan ? `Kec. ${member.kecamatan.nama_kecamatan}` : '-')
      .replace(/\{link_verifikasi\}/gi, verifyUrl);

    if (includeVerifyLink && !customMessage.includes('{link_verifikasi}')) {
      rendered += `\n\n*Portal Verifikasi Keabsahan E-KTA:*\n${verifyUrl}`;
    }

    return { verifyUrl, message: rendered };
  };

  const sampleMember = validMembers[0] || selectedMembers[0] || null;
  const samplePreview = useMemo(() => {
    if (!sampleMember) return null;
    return buildMemberMessage(sampleMember);
  }, [sampleMember, messageMode, customMessage, includeVerifyLink]);

  if (!isOpen) return null;

  const handleStartBulkSend = async () => {
    if (!fonnteActive || validMembers.length === 0 || isSending) return;

    cancelRef.current = false;
    setIsSending(true);
    setHasFinishedBatch(false);

    const batchId = `batch_${Date.now()}`;
    const total = validMembers.length;
    let sent = 0;
    let failed = 0;

    setProgress({ current: 0, total, sent: 0, failed: 0 });

    for (let i = 0; i < validMembers.length; i++) {
      if (cancelRef.current) break;

      const member = validMembers[i];
      const memberId = member.anggota.id_anggota;
      setStatusMap((prev) => ({
        ...prev,
        [memberId]: { status: 'sending', detail: 'Mengirim via Fonnte...' },
      }));

      const { message } = buildMemberMessage(member);
      const res = await dispatchWhatsAppNotification({
        phone: member.anggota.no_hp_wa,
        message,
        recipientName: member.anggota.nama_lengkap,
        idAnggota: memberId,
        category:
          messageMode === 'kta'
            ? 'massal-kta'
            : messageMode === 'iuran'
            ? 'massal-iuran'
            : 'massal-kustom',
        batchId,
        whatsappSettings: waSettings,
      });

      if (res.success) {
        sent++;
        setStatusMap((prev) => ({
          ...prev,
          [memberId]: { status: 'sent', detail: 'Terkirim via Fonnte' },
        }));
      } else {
        failed++;
        setStatusMap((prev) => ({
          ...prev,
          [memberId]: { status: 'failed', detail: res.message },
        }));
      }

      setProgress({ current: i + 1, total, sent, failed });

      if (i < validMembers.length - 1 && !cancelRef.current) {
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    setIsSending(false);
    setHasFinishedBatch(true);
    onComplete({ sentCount: sent, failedCount: failed, batchId });
  };

  const handleStopSending = () => {
    cancelRef.current = true;
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#111113]/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full border border-neutral-200 overflow-hidden text-neutral-900 my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-100 flex items-start justify-between gap-3 bg-emerald-50/90 shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#064E3B] text-amber-300 flex items-center justify-center shrink-0 shadow-xs">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-neutral-900 uppercase">
                  Kirim Notifikasi WhatsApp Massal (Fonnte)
                </h3>
                <span
                  className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold border ${
                    fonnteActive
                      ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                      : 'bg-red-100 text-red-800 border-red-300'
                  }`}
                >
                  {fonnteActive ? 'FONNTE GATEWAY AKTIF' : 'GATEWAY FONNTE NONAKTIF'}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-neutral-600 mt-0.5">
                {selectedMembers.length} anggota dipilih ·{' '}
                <strong className="text-emerald-800">{validMembers.length} nomor WA siap kirim</strong>
                {missingPhoneCount > 0 && (
                  <span className="text-amber-700 font-semibold">
                    {' '}
                    · {missingPhoneCount} tanpa nomor WA (dilewati)
                  </span>
                )}
                {waSettings?.senderNumber && (
                  <span className="font-mono text-neutral-500"> · Pengirim: {waSettings.senderNumber}</span>
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => !isSending && onClose()}
            disabled={isSending}
            className="text-neutral-400 hover:text-neutral-700 p-1.5 rounded-lg cursor-pointer disabled:opacity-40"
            title="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs flex-1">
          {/* Warning when Fonnte Webhook/Token is inactive */}
          {!fonnteActive && (
            <div className="p-3.5 rounded-xl border border-amber-300 bg-amber-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 text-amber-950">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-xs">
                    Integrasi Webhook &amp; Token Fonnte Belum Aktif
                  </div>
                  <p className="text-[11px] text-amber-900 mt-0.5 leading-relaxed">
                    Pengiriman notifikasi WhatsApp massal secara langsung membutuhkan sakelar{' '}
                    <strong>Webhook &amp; Gateway Fonnte</strong> aktif beserta <strong>Token API Device Fonnte</strong> yang valid.
                  </p>
                </div>
              </div>
              {canOpenWaSettings && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    setActiveTab('settings-whatsapp');
                  }}
                  className="px-3.5 py-2 bg-[#064E3B] hover:bg-[#043d2e] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Settings className="w-3.5 h-3.5 text-amber-300" />
                  <span>Buka Setting WhatsApp</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* Live Batch Progress Bar */}
          {(isSending || hasFinishedBatch) && progress.total > 0 && (
            <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/70 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-emerald-950 flex items-center gap-1.5">
                  {isSending ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-700" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                  )}
                  <span>
                    {isSending
                      ? `Mengirim pesan massal... (${progress.current} dari ${progress.total})`
                      : `Pengiriman Massal Selesai (${progress.sent} terkirim, ${progress.failed} gagal)`}
                  </span>
                </span>
                <span className="font-mono text-emerald-900">
                  {Math.round((progress.current / progress.total) * 100)}%
                </span>
              </div>
              <div className="w-full h-2.5 bg-emerald-200/70 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#064E3B] transition-all duration-300"
                  style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Column: Template & Preview */}
            <div className="lg:col-span-7 space-y-3">
              <div>
                <label className="text-xs font-bold text-neutral-800 uppercase tracking-wider block mb-1.5">
                  Pilih Kategori Pesan Massal:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={isSending}
                    onClick={() => setMessageMode('kta')}
                    className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer disabled:opacity-60 ${
                      messageMode === 'kta'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold shadow-2xs'
                        : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span>Status E-KTA</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={isSending}
                    onClick={() => setMessageMode('iuran')}
                    className={`p-2.5 rounded-xl border text-xs text-left transition-all cursor-pointer disabled:opacity-60 ${
                      messageMode === 'iuran'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold shadow-2xs'
                        : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span>Iuran Kas</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={isSending}
                    onClick={() => setMessageMode('custom')}
                    className={`p-2.5 rounded-xl border text-xs text-left transition-all cursor-pointer disabled:opacity-60 ${
                      messageMode === 'custom'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold shadow-2xs'
                        : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span>Pesan Kustom</span>
                    </div>
                  </button>
                </div>
              </div>

              {messageMode === 'custom' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="text-[11px] font-bold text-neutral-700 uppercase">
                      Isi Pesan Pengumuman Kustom:
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeVerifyLink}
                        disabled={isSending}
                        onChange={(e) => setIncludeVerifyLink(e.target.checked)}
                        className="rounded border-neutral-300 text-[#064E3B] focus:ring-[#064E3B]"
                      />
                      <span>Lampirkan Link Portal Verifikasi E-KTA</span>
                    </label>
                  </div>
                  <textarea
                    rows={5}
                    disabled={isSending}
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    className="w-full p-3 border border-neutral-300 rounded-xl text-xs font-mono text-neutral-900 focus:ring-2 focus:ring-[#064E3B] outline-none disabled:bg-neutral-50"
                  />
                  <p className="text-[10px] font-mono text-neutral-500">
                    Variabel otomatis per anggota: {'{nama}'}, {'{no_kta}'}, {'{nik}'}, {'{desa}'}, {'{kecamatan}'}, {'{link_verifikasi}'}
                  </p>
                </div>
              )}

              {/* Highlighted Portal Verifikasi Keabsahan E-KTA Card */}
              {samplePreview && (
                <div className="space-y-2.5">
                  <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1 font-sans">
                    <span className="text-[10px] text-amber-900 font-bold uppercase tracking-wider block">
                      Contoh Link Portal Verifikasi Keabsahan E-KTA ({sampleMember?.anggota.nama_lengkap}):
                    </span>
                    <div className="text-[11px] font-mono text-emerald-900 bg-white border border-amber-200/80 rounded-lg px-2.5 py-1.5 break-all select-all">
                      {samplePreview.verifyUrl}
                    </div>
                  </div>

                  <div className="p-3 bg-[#064E3B]/5 border border-emerald-200 rounded-xl space-y-1">
                    <span className="text-[10px] text-emerald-900 font-bold uppercase tracking-wider block">
                      Pratinjau Pesan (Sampel Penerima #1 — {sampleMember?.anggota.nama_lengkap}):
                    </span>
                    <p className="text-[11px] text-neutral-700 leading-relaxed font-mono whitespace-pre-line max-h-44 overflow-y-auto">
                      {samplePreview.message}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Selected Recipients Queue */}
            <div className="lg:col-span-5 flex flex-col border border-neutral-200 rounded-xl overflow-hidden bg-neutral-50/50">
              <div className="px-3.5 py-2.5 bg-neutral-100 border-b border-neutral-200 flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-[#064E3B]" />
                  <span>Daftar Penerima ({selectedMembers.length})</span>
                </span>
                <span className="text-[10px] font-mono text-neutral-500">
                  {validMembers.length} siap kirim
                </span>
              </div>

              <div className="divide-y divide-neutral-200 max-h-80 overflow-y-auto bg-white flex-1">
                {selectedMembers.length === 0 ? (
                  <div className="p-6 text-center text-neutral-400 text-xs">
                    Tidak ada anggota terpilih.
                  </div>
                ) : (
                  selectedMembers.map((m) => {
                    const st = statusMap[m.anggota.id_anggota]?.status || 'pending';
                    const detail = statusMap[m.anggota.id_anggota]?.detail;
                    return (
                      <div key={m.anggota.id_anggota} className="p-2.5 flex items-center gap-2.5 hover:bg-neutral-50">
                        <img
                          src={getPhotoUrl(m.anggota.foto, m.anggota.jenis_kelamin)}
                          alt={m.anggota.nama_lengkap}
                          onError={(e) => handleImageError(e, m.anggota.jenis_kelamin)}
                          className="w-8 h-8 rounded-full object-cover border border-neutral-200 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-[11px] text-neutral-900 truncate uppercase">
                            {m.anggota.nama_lengkap}
                          </div>
                          <div className="text-[10px] font-mono text-neutral-500 truncate">
                            {m.anggota.no_hp_wa ? m.anggota.no_hp_wa : 'No. WA belum diisi'} · Ds.{' '}
                            {m.desa?.nama_desa || '-'}
                          </div>
                          {detail && st === 'failed' && (
                            <div className="text-[10px] text-red-600 truncate">{detail}</div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {st === 'sending' && (
                            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-mono font-bold flex items-center gap-1">
                              <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                              <span>Kirim</span>
                            </span>
                          )}
                          {st === 'sent' && (
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[10px] font-mono font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              <span>Terkirim</span>
                            </span>
                          )}
                          {st === 'failed' && (
                            <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 text-[10px] font-mono font-bold flex items-center gap-1">
                              <XCircle className="w-2.5 h-2.5" />
                              <span>Gagal</span>
                            </span>
                          )}
                          {st === 'no_phone' && (
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-mono font-bold">
                              No. Kosong
                            </span>
                          )}
                          {st === 'pending' && (
                            <span className="px-2 py-0.5 rounded bg-neutral-100 text-neutral-600 text-[10px] font-mono font-bold">
                              Siap
                            </span>
                          )}

                          {!isSending && !hasFinishedBatch && (
                            <button
                              type="button"
                              onClick={() => onRemoveMember(m.anggota.id_anggota)}
                              title="Keluarkan dari daftar pengiriman"
                              className="p-1 text-neutral-400 hover:text-red-600 rounded cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-neutral-50 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-neutral-500">
            Seluruh pengiriman tercatat ke tabel log database <code className="font-mono font-bold">whatsapp_logs</code>.
          </div>

          <div className="flex items-center gap-2">
            {isSending ? (
              <button
                type="button"
                onClick={handleStopSending}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <StopCircle className="w-3.5 h-3.5" />
                <span>Hentikan Pengiriman</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg cursor-pointer"
                >
                  {hasFinishedBatch ? 'Tutup' : 'Batal'}
                </button>
                <button
                  type="button"
                  disabled={!fonnteActive || validMembers.length === 0}
                  onClick={handleStartBulkSend}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#064E3B] hover:bg-[#043d2e] disabled:bg-neutral-300 disabled:text-neutral-500 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
                >
                  <Send className="w-3.5 h-3.5 text-amber-300" />
                  <span>
                    Kirim ke {validMembers.length} Anggota via Fonnte
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
