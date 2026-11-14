import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Database,
  Activity,
  Server,
  Wifi,
  WifiOff,
  RefreshCw,
  Clock,
  Layers,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Pause,
  Play,
  Terminal,
} from 'lucide-react';

export interface DiagnosticData {
  success: boolean;
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
  service?: string;
  timestamp?: string;
  uptimeSeconds?: number;
  server?: {
    port: number;
    pid: number;
    nodeVersion: string;
    targetNodeVersion?: string;
    platform: string;
    arch: string;
    env: string;
    memoryMb: {
      rss: number;
      heapUsed: number;
      heapTotal: number;
    };
  };
  clientRequest?: {
    ip?: string;
    host?: string;
    forwardedFor?: string | null;
  };
  database?: {
    configuredHost: string;
    port: number;
    databaseName: string;
    reachable: boolean;
    latencyMs: number;
    error: string | null;
  };
  handshake?: {
    message: string;
    proxyTargetRecommendation: string;
  };
  error?: string;
}

interface TelemetrySettingsViewProps {
  onOpenDbModal?: () => void;
  onNavigateDbSettings?: () => void;
  pollIntervalMs?: number;
}

export const TelemetrySettingsView: React.FC<TelemetrySettingsViewProps> = ({
  onOpenDbModal,
  onNavigateDbSettings,
  pollIntervalMs = 10000,
}) => {
  const [diagnostic, setDiagnostic] = useState<DiagnosticData | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null);
  const [latencyHistory, setLatencyHistory] = useState<number[]>([]);
  const isMountedRef = useRef(true);

  const fetchDiagnostic = useCallback(async (isManual = false) => {
    if (isManual) setIsPolling(true);
    const startTime = performance.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch('/api/diagnostic', {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const fetchTime = Math.round(performance.now() - startTime);

      if (res.ok) {
        const data: DiagnosticData = await res.json();
        if (isMountedRef.current) {
          setDiagnostic(data);
          setLastCheckTime(new Date());
          setLatencyHistory((prev) => [...prev.slice(-11), fetchTime]);
        }
      } else {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        setDiagnostic({
          success: false,
          status: 'OFFLINE',
          error:
            err.name === 'AbortError'
              ? 'Koneksi ke backend timeout (>6s)'
              : err.message || 'Koneksi gagal',
        });
        setLastCheckTime(new Date());
      }
    } finally {
      if (isMountedRef.current) {
        setIsPolling(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchDiagnostic();

    let interval: ReturnType<typeof setInterval> | null = null;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchDiagnostic();
      }, pollIntervalMs);
    }

    return () => {
      isMountedRef.current = false;
      if (interval) clearInterval(interval);
    };
  }, [fetchDiagnostic, pollIntervalMs, autoRefresh]);

  const isBackendOnline = diagnostic?.success === true;
  const isDbReachable = diagnostic?.database?.reachable === true;

  let statusLevel: 'connected' | 'db-offline' | 'server-offline' = 'server-offline';
  if (isBackendOnline && isDbReachable) {
    statusLevel = 'connected';
  } else if (isBackendOnline && !isDbReachable) {
    statusLevel = 'db-offline';
  }

  const formatUptime = (seconds?: number) => {
    if (!seconds) return '0d';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (d > 0) return `${d}h ${h}j ${m}m`;
    if (h > 0) return `${h}j ${m}m ${s}d`;
    if (m > 0) return `${m}m ${s}d`;
    return `${s}d`;
  };

  const maxHistoryLatency = Math.max(...latencyHistory, 50);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-tight text-neutral-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#064E3B]" />
            <span>Telemetri & Diagnostik Live</span>
          </h2>
          <p className="text-xs text-neutral-500 mt-1">
            Pemantauan real-time status server Node.js Express, koneksi database MySQL, penggunaan memori heap, dan latensi jaringan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoRefresh((prev) => !prev)}
            className={`px-3 py-2 rounded-lg text-xs font-mono font-semibold border flex items-center gap-1.5 cursor-pointer transition-colors ${
              autoRefresh
                ? 'bg-emerald-50 text-[#064E3B] border-emerald-300 hover:bg-emerald-100'
                : 'bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-50'
            }`}
          >
            {autoRefresh ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{autoRefresh ? `Auto (${pollIntervalMs / 1000}s)` : 'Jeda Auto'}</span>
          </button>

          <button
            type="button"
            onClick={() => fetchDiagnostic(true)}
            disabled={isPolling}
            className="px-3.5 py-2 rounded-lg bg-[#064E3B] hover:bg-[#043d2e] text-white text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPolling ? 'animate-spin text-amber-300' : ''}`} />
            <span>{isPolling ? 'Memeriksa...' : 'Ping Sekarang'}</span>
          </button>
        </div>
      </div>

      {/* Live Telemetry Panel */}
      <div className="bg-neutral-900 text-neutral-100 rounded-2xl shadow-xl border border-neutral-700/80 overflow-hidden">
        {/* Top Telemetry Bar */}
        <div className="p-4 sm:px-6 bg-neutral-950/85 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-3 h-3 rounded-full ${
                statusLevel === 'connected'
                  ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.85)]'
                  : statusLevel === 'db-offline'
                  ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.85)] animate-pulse'
                  : 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.85)] animate-pulse'
              }`}
            />
            <div>
              <div className="text-xs sm:text-sm font-bold tracking-tight text-white uppercase flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-400" />
                <span>Diagnostik Backend & DB Live</span>
              </div>
              <div className="text-[11px] font-mono text-neutral-400 mt-0.5">
                {lastCheckTime
                  ? `Pembaruan terakhir: ${lastCheckTime.toLocaleTimeString('id-ID')}`
                  : 'Memeriksa koneksi...'}
              </div>
            </div>
          </div>

          <span
            className={`px-3 py-1 rounded-md text-xs font-mono font-bold border ${
              statusLevel === 'connected'
                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700/70'
                : statusLevel === 'db-offline'
                ? 'bg-amber-950/70 text-amber-300 border-amber-700/70'
                : 'bg-rose-950/70 text-rose-300 border-rose-700/70'
            }`}
          >
            {statusLevel === 'connected'
              ? `TERHUBUNG (${diagnostic?.database?.latencyMs ?? 0}ms)`
              : statusLevel === 'db-offline'
              ? 'BACKEND ONLINE · DB FALLBACK'
              : 'BACKEND TERPUTUS'}
          </span>
        </div>

        {/* Status Overview Body */}
        <div className="p-4 sm:p-6 space-y-5 text-xs">
          {/* Primary Connectivity Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono">
            {/* Backend Service Card */}
            <div
              className={`p-4 rounded-xl border ${
                isBackendOnline
                  ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
                  : 'bg-rose-950/40 border-rose-800/80 text-rose-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-neutral-400 font-sans uppercase font-bold tracking-wider">
                  Node.js Express Server
                </span>
                {isBackendOnline ? (
                  <Wifi className="w-4 h-4 text-emerald-400" />
                ) : (
                  <WifiOff className="w-4 h-4 text-rose-400" />
                )}
              </div>
              <div className="font-bold text-white text-sm sm:text-base">
                {isBackendOnline
                  ? `ONLINE (Port ${diagnostic?.server?.port || 3000})`
                  : 'OFFLINE / TIMEOUT'}
              </div>
              <div className="text-[11px] text-neutral-400 mt-2 flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-emerald-400" />
                  <span>Uptime: {formatUptime(diagnostic?.uptimeSeconds)}</span>
                </span>
                {diagnostic?.server?.env && (
                  <span className="px-2 py-0.5 rounded bg-neutral-900/80 border border-neutral-700 text-[10px] uppercase">
                    {diagnostic.server.env}
                  </span>
                )}
              </div>
            </div>

            {/* Database Status Card */}
            <div
              className={`p-4 rounded-xl border ${
                isDbReachable
                  ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
                  : 'bg-amber-950/40 border-amber-800/80 text-amber-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-neutral-400 font-sans uppercase font-bold tracking-wider">
                  Live MySQL Database
                </span>
                <Database
                  className={`w-4 h-4 ${isDbReachable ? 'text-emerald-400' : 'text-amber-400'}`}
                />
              </div>
              <div className="font-bold text-white text-sm sm:text-base">
                {isDbReachable
                  ? `TERHUBUNG (${diagnostic?.database?.latencyMs ?? 0}ms)`
                  : 'TERPUTUS / FALLBACK'}
              </div>
              <div className="text-[11px] text-neutral-400 mt-2 truncate">
                Host: {diagnostic?.database?.configuredHost || 'localhost'}:
                {diagnostic?.database?.port || 3306}
              </div>
            </div>
          </div>

          {/* Diagnostic Metrics Details + Latency Sparkline */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-neutral-950/60 rounded-xl p-4 border border-neutral-800 space-y-2.5 text-xs font-mono">
              <div className="text-[10px] font-sans font-bold uppercase tracking-wider text-neutral-400 pb-1 border-b border-neutral-800">
                Metrik Runtime & Proses
              </div>
              <div className="flex justify-between text-neutral-400">
                <span className="flex items-center gap-2 font-sans">
                  <Cpu className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Memori Heap</span>
                </span>
                <span className="text-white font-semibold">
                  {diagnostic?.server?.memoryMb
                    ? `${diagnostic.server.memoryMb.heapUsed}MB / ${diagnostic.server.memoryMb.heapTotal}MB (RSS ${diagnostic.server.memoryMb.rss}MB)`
                    : '-'}
                </span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span className="flex items-center gap-2 font-sans">
                  <Layers className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Database Aktif</span>
                </span>
                <span className="text-amber-300 font-bold truncate max-w-[200px]">
                  {diagnostic?.database?.databaseName || '-'}
                </span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span className="flex items-center gap-2 font-sans">
                  <Server className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Proses & Node.js</span>
                </span>
                <span className="text-neutral-300">
                  PID {diagnostic?.server?.pid || '-'} ({diagnostic?.server?.nodeVersion || '-'})
                </span>
              </div>
              {diagnostic?.clientRequest?.host && (
                <div className="flex justify-between text-neutral-400">
                  <span className="flex items-center gap-2 font-sans">
                    <Terminal className="w-3.5 h-3.5 text-neutral-500" />
                    <span>Endpoint Host</span>
                  </span>
                  <span className="text-neutral-300 truncate max-w-[220px]">
                    {diagnostic.clientRequest.host}
                  </span>
                </div>
              )}
            </div>

            {/* Ping Latency History */}
            <div className="bg-neutral-950/60 rounded-xl p-4 border border-neutral-800 flex flex-col justify-between">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-neutral-400">
                  Riwayat Latensi Respons API ({latencyHistory.length} Sampel)
                </span>
                {latencyHistory.length > 0 && (
                  <span className="font-mono text-[11px] text-emerald-400 font-bold">
                    Terakhir: {latencyHistory[latencyHistory.length - 1]}ms
                  </span>
                )}
              </div>

              {latencyHistory.length === 0 ? (
                <div className="py-6 text-center text-neutral-500 font-mono text-[11px]">
                  Menunggu sampel latensi...
                </div>
              ) : (
                <div className="pt-4 flex items-end gap-1.5 h-24">
                  {latencyHistory.map((ms, i) => {
                    const heightPct = Math.max(12, Math.min(100, Math.round((ms / maxHistoryLatency) * 100)));
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                        <span className="text-[9px] font-mono text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          {ms}ms
                        </span>
                        <div
                          style={{ height: `${heightPct}%` }}
                          className={`w-full rounded-t transition-all ${
                            ms < 150
                              ? 'bg-emerald-500/80 group-hover:bg-emerald-400'
                              : ms < 500
                              ? 'bg-amber-500/80 group-hover:bg-amber-400'
                              : 'bg-rose-500/80 group-hover:bg-rose-400'
                          }`}
                          title={`Ping #${i + 1}: ${ms}ms`}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Handshake Diagnosis or Error */}
          {diagnostic?.database?.error ? (
            <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-amber-300">Catatan Diagnostik MySQL:</div>
                <div className="text-[11px] text-amber-200/90 leading-relaxed mt-0.5">
                  {diagnostic.database.error}
                </div>
              </div>
            </div>
          ) : diagnostic?.handshake?.message ? (
            <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-[11px] leading-relaxed">{diagnostic.handshake.message}</span>
            </div>
          ) : diagnostic?.error ? (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-rose-300">Gangguan Koneksi Backend:</div>
                <div className="text-[11px] text-rose-200/90 mt-0.5">{diagnostic.error}</div>
              </div>
            </div>
          ) : null}

          {/* Action Bar */}
          <div className="pt-2 border-t border-neutral-800 flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono text-[11px] text-neutral-400">
              {diagnostic?.service || 'PPDI Kab. Bandung API Gateway'}
            </span>

            <div className="flex flex-wrap items-center gap-2">
              {onNavigateDbSettings && (
                <button
                  type="button"
                  onClick={onNavigateDbSettings}
                  className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold border border-neutral-700 flex items-center gap-1.5 cursor-pointer transition-colors text-xs"
                >
                  <Database className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Kelola Tabel Database</span>
                </button>
              )}

              {onOpenDbModal && (
                <button
                  type="button"
                  onClick={onOpenDbModal}
                  className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-amber-300 font-semibold border border-neutral-700 flex items-center gap-1.5 cursor-pointer transition-colors text-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Buka Konfigurasi DB</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
