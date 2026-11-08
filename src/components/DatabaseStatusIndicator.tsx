import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Database,
  Activity,
  Server,
  Wifi,
  WifiOff,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Clock,
  Layers,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  X,
  ExternalLink,
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

interface DatabaseStatusIndicatorProps {
  onOpenDbModal?: () => void;
  pollIntervalMs?: number;
}

export const DatabaseStatusIndicator: React.FC<DatabaseStatusIndicatorProps> = ({
  onOpenDbModal,
  pollIntervalMs = 15000,
}) => {
  const [diagnostic, setDiagnostic] = useState<DiagnosticData | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
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
          setLatencyHistory((prev) => [...prev.slice(-9), fetchTime]);
        }
      } else {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        setDiagnostic({
          success: false,
          status: 'OFFLINE',
          error: err.name === 'AbortError' ? 'Koneksi ke backend timeout (>6s)' : err.message || 'Koneksi gagal',
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

    const interval = setInterval(() => {
      fetchDiagnostic();
    }, pollIntervalMs);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchDiagnostic, pollIntervalMs]);

  // Determine indicator status color & label
  const isBackendOnline = diagnostic?.success === true;
  const isDbReachable = diagnostic?.database?.reachable === true;

  let statusLevel: 'connected' | 'db-offline' | 'server-offline' = 'server-offline';
  if (isBackendOnline && isDbReachable) {
    statusLevel = 'connected';
  } else if (isBackendOnline && !isDbReachable) {
    statusLevel = 'db-offline';
  }

  const formatUptime = (seconds?: number) => {
    if (!seconds) return '0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}j ${m}m ${s}d`;
    if (m > 0) return `${m}m ${s}d`;
    return `${s}d`;
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 no-print flex flex-col items-end gap-2 font-sans select-none">
      {/* Expanded Live Telemetry Drawer */}
      {isExpanded && (
        <div className="w-80 sm:w-96 bg-neutral-900 text-neutral-100 rounded-2xl shadow-2xl border border-neutral-700/80 overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-200 backdrop-blur-md">
          {/* Header */}
          <div className="p-3.5 bg-neutral-950/80 border-b border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  statusLevel === 'connected'
                    ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                    : statusLevel === 'db-offline'
                    ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]'
                    : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                }`}
              />
              <span className="text-xs font-bold tracking-tight text-white uppercase flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-amber-400" />
                <span>Diagnostik Backend & DB Live</span>
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => fetchDiagnostic(true)}
                disabled={isPolling}
                title="Picu ping diagnostik sekarang"
                className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isPolling ? 'animate-spin text-amber-400' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                title="Tutup detail diagnostik"
                className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Status Overview Body */}
          <div className="p-4 space-y-3 text-xs">
            {/* Primary Connectivity Cards */}
            <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
              {/* Backend Service Card */}
              <div
                className={`p-2.5 rounded-xl border ${
                  isBackendOnline
                    ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
                    : 'bg-rose-950/40 border-rose-800/80 text-rose-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-neutral-400 font-sans uppercase font-bold">Node.js Express</span>
                  {isBackendOnline ? (
                    <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                  )}
                </div>
                <div className="font-bold text-white text-xs">
                  {isBackendOnline ? 'ONLINE (Port 3000)' : 'OFFLINE / TIMEOUT'}
                </div>
                <div className="text-[10px] text-neutral-400 mt-1 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  <span>Uptime: {formatUptime(diagnostic?.uptimeSeconds)}</span>
                </div>
              </div>

              {/* Database Status Card */}
              <div
                className={`p-2.5 rounded-xl border ${
                  isDbReachable
                    ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
                    : 'bg-amber-950/40 border-amber-800/80 text-amber-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-neutral-400 font-sans uppercase font-bold">Live DB</span>
                  <Database className={`w-3.5 h-3.5 ${isDbReachable ? 'text-emerald-400' : 'text-amber-400'}`} />
                </div>
                <div className="font-bold text-white text-xs">
                  {isDbReachable
                    ? `TERHUBUNG (${diagnostic?.database?.latencyMs ?? 0}ms)`
                    : 'TERPUTUS / FALLBACK'}
                </div>
                <div className="text-[10px] text-neutral-400 mt-1 truncate">
                  Host: {diagnostic?.database?.configuredHost || 'localhost'}
                </div>
              </div>
            </div>

            {/* Diagnostic Metrics Details */}
            <div className="bg-neutral-950/60 rounded-xl p-3 border border-neutral-800 space-y-1.5 text-[11px] font-mono">
              <div className="flex justify-between text-neutral-400">
                <span className="flex items-center gap-1.5 font-sans">
                  <Cpu className="w-3 h-3 text-neutral-500" />
                  <span>Memori Heap</span>
                </span>
                <span className="text-white">
                  {diagnostic?.server?.memoryMb ? `${diagnostic.server.memoryMb.heapUsed}MB / ${diagnostic.server.memoryMb.heapTotal}MB` : '-'}
                </span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span className="flex items-center gap-1.5 font-sans">
                  <Layers className="w-3 h-3 text-neutral-500" />
                  <span>Database Aktif</span>
                </span>
                <span className="text-amber-300 font-bold truncate max-w-[150px]">
                  {diagnostic?.database?.databaseName || '-'}
                </span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span className="flex items-center gap-1.5 font-sans">
                  <Server className="w-3 h-3 text-neutral-500" />
                  <span>Proses PID & Node</span>
                </span>
                <span className="text-neutral-300">
                  PID {diagnostic?.server?.pid || '-'} ({diagnostic?.server?.nodeVersion || 'Node'})
                </span>
              </div>
            </div>

            {/* Handshake Diagnosis or Error */}
            {diagnostic?.database?.error ? (
              <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-200 text-[11px] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-amber-300">Catatan Diagnostik MySQL:</div>
                  <div className="text-[10px] text-amber-200/90 leading-tight mt-0.5">{diagnostic.database.error}</div>
                </div>
              </div>
            ) : diagnostic?.handshake?.message ? (
              <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-[11px] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-[10px] leading-tight">{diagnostic.handshake.message}</span>
              </div>
            ) : null}

            {/* Action Bar */}
            <div className="pt-1 flex items-center justify-between text-[10px] text-neutral-400">
              <span className="font-mono">
                {lastCheckTime ? `Diperiksa: ${lastCheckTime.toLocaleTimeString()}` : 'Memeriksa...'}
              </span>

              {onOpenDbModal && (
                <button
                  type="button"
                  onClick={() => {
                    setIsExpanded(false);
                    onOpenDbModal();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-amber-300 font-semibold border border-neutral-700 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Buka Konfigurasi DB</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Persistent Status Trigger Button */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        title="Klik untuk membuka Status Diagnostik Backend & MySQL"
        className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-mono font-bold shadow-xl backdrop-blur-md border transition-all cursor-pointer ${
          statusLevel === 'connected'
            ? 'bg-neutral-900/90 text-emerald-300 border-emerald-700/80 hover:bg-neutral-900 hover:border-emerald-500'
            : statusLevel === 'db-offline'
            ? 'bg-amber-950/95 text-amber-200 border-amber-500 hover:bg-amber-900'
            : 'bg-rose-950/95 text-rose-200 border-rose-500 hover:bg-rose-900 animate-pulse'
        }`}
      >
        <div className="relative flex items-center justify-center">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              statusLevel === 'connected'
                ? 'bg-emerald-500'
                : statusLevel === 'db-offline'
                ? 'bg-amber-400 animate-ping'
                : 'bg-rose-500 animate-ping'
            }`}
          />
          <span
            className={`absolute w-2.5 h-2.5 rounded-full ${
              statusLevel === 'connected'
                ? 'bg-emerald-500/50'
                : statusLevel === 'db-offline'
                ? 'bg-amber-400'
                : 'bg-rose-500'
            }`}
          />
        </div>

        <span className="flex items-center gap-1.5 font-bold">
          <Database className="w-3.5 h-3.5 shrink-0" />
          <span>
            {statusLevel === 'connected'
              ? `Backend & DB Aktif (${diagnostic?.database?.latencyMs ?? 0}ms)`
              : statusLevel === 'db-offline'
              ? 'Backend Online · DB Offline'
              : 'Backend Terputus (Offline)'}
          </span>
        </span>

        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
        ) : (
          <ChevronUp className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
        )}
      </button>
    </div>
  );
};
