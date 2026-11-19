import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, PenTool, RotateCcw, CheckCircle2 } from 'lucide-react';

interface StrokePoint {
  x: number;
  y: number;
}

export interface SignatureCanvasProps {
  value: string;
  onChange: (dataUrl: string) => void;
  label?: string;
  helperText?: string;
  required?: boolean;
  height?: number;
  disabled?: boolean;
  signerName?: string;
}

export const SignatureCanvas: React.FC<SignatureCanvasProps> = ({
  value,
  onChange,
  label = 'Tanda Tangan Digital',
  helperText = 'Gunakan mouse, touchpad, stylus, atau jari di layar sentuh untuk menandatangani.',
  required = false,
  height = 156,
  disabled = false,
  signerName,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<StrokePoint[][]>([]);
  const activeStrokeRef = useRef<StrokePoint[] | null>(null);
  const isDrawingRef = useRef(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [canvasCssWidth, setCanvasCssWidth] = useState(460);

  const renderAllStrokes = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, cssHeight: number) => {
      ctx.clearRect(0, 0, width, cssHeight);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0f172a';
      ctx.fillStyle = '#0f172a';
      ctx.lineWidth = 2.4;

      const drawStroke = (pts: StrokePoint[]) => {
        if (pts.length === 0) return;
        if (pts.length === 1) {
          ctx.beginPath();
          ctx.arc(pts[0].x, pts[0].y, 1.4, 0, Math.PI * 2);
          ctx.fill();
          return;
        }
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          const midX = (pts[i].x + pts[i + 1].x) / 2;
          const midY = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
        }
        const last = pts[pts.length - 1];
        ctx.lineTo(last.x, last.y);
        ctx.stroke();
      };

      for (const stroke of strokesRef.current) {
        drawStroke(stroke);
      }
      if (activeStrokeRef.current) {
        drawStroke(activeStrokeRef.current);
      }
      ctx.restore();
    },
    []
  );

  // Sync canvas physical DPI dimensions with container width
  const syncCanvasResolution = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const cssWidth = Math.max(240, Math.floor(rect.width));
    if (cssWidth !== canvasCssWidth) {
      setCanvasCssWidth(cssWidth);
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.floor(cssWidth * dpr);
    const targetH = Math.floor(height * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderAllStrokes(ctx, cssWidth, height);
    }
  }, [canvasCssWidth, height, renderAllStrokes]);

  useEffect(() => {
    syncCanvasResolution();
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => syncCanvasResolution());
    ro.observe(container);
    return () => ro.disconnect();
  }, [syncCanvasResolution]);

  // Reset internal strokes if parent clears value externally (e.g. form reset)
  useEffect(() => {
    if (!value && strokesRef.current.length > 0 && !isDrawingRef.current) {
      strokesRef.current = [];
      activeStrokeRef.current = null;
      setStrokeCount(0);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [value]);

  const emitExport = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || strokesRef.current.length === 0) {
      onChange('');
      return;
    }
    try {
      const dataUrl = canvas.toDataURL('image/png');
      onChange(dataUrl);
    } catch {
      // ignore security errors if any
    }
  }, [onChange]);

  const getRelativePoint = (e: React.PointerEvent<HTMLCanvasElement>): StrokePoint => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(rect.width, e.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, e.clientY - rect.top)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore if unsupported
    }
    syncCanvasResolution();
    const pt = getRelativePoint(e);
    isDrawingRef.current = true;
    activeStrokeRef.current = [pt];

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderAllStrokes(ctx, canvas.width / dpr, height);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !activeStrokeRef.current || disabled) return;
    e.preventDefault();
    const pt = getRelativePoint(e);
    const pts = activeStrokeRef.current;
    const prev = pts[pts.length - 1];
    if (prev && Math.hypot(pt.x - prev.x, pt.y - prev.y) < 1.2) return;
    pts.push(pt);

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderAllStrokes(ctx, canvas.width / dpr, height);
    }
  };

  const finalizeStroke = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    if (e) {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }
    }
    if (activeStrokeRef.current && activeStrokeRef.current.length > 0) {
      strokesRef.current = [...strokesRef.current, activeStrokeRef.current];
      activeStrokeRef.current = null;
      setStrokeCount(strokesRef.current.length);
      emitExport();
    }
  };

  const handleUndo = () => {
    if (disabled || strokesRef.current.length === 0) return;
    strokesRef.current = strokesRef.current.slice(0, -1);
    setStrokeCount(strokesRef.current.length);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderAllStrokes(ctx, canvas.width / dpr, height);
    }
    emitExport();
  };

  const handleClear = () => {
    if (disabled) return;
    strokesRef.current = [];
    activeStrokeRef.current = null;
    isDrawingRef.current = false;
    setStrokeCount(0);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    onChange('');
  };

  const hasSignature = strokeCount > 0 || Boolean(value);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-xs font-bold text-neutral-700 uppercase flex items-center gap-1.5">
          <PenTool className="w-3.5 h-3.5 text-[#064E3B] shrink-0" />
          <span>
            {label} {required && <span className="text-red-500">*</span>}
          </span>
        </label>

        <div className="flex items-center gap-1.5">
          {hasSignature ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-semibold">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              Sudah ditandatangani
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-semibold">
              Belum ditandatangani
            </span>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className={`relative w-full rounded-xl border-2 border-dashed transition-colors overflow-hidden bg-white ${
          disabled
            ? 'border-neutral-200 bg-neutral-50 opacity-75 cursor-not-allowed'
            : hasSignature
            ? 'border-emerald-400 shadow-2xs'
            : 'border-neutral-300 hover:border-[#064E3B]/60'
        }`}
      >
        {/* Subtle signing baseline & watermark prompt */}
        <div
          className="pointer-events-none absolute inset-x-6 border-b border-dotted border-neutral-300"
          style={{ bottom: '28px' }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 text-center text-[10px] font-mono text-neutral-400 select-none"
          style={{ bottom: '10px' }}
        >
          {signerName ? `Tanda tangan: ${signerName.toUpperCase()}` : 'Goreskan tanda tangan di atas garis ini'}
        </div>

        {/* Empty state placeholder */}
        {!hasSignature && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-neutral-400 select-none pb-4">
            <PenTool className="w-5 h-5 mb-1 opacity-40" />
            <span className="text-[11px] font-medium">Area Tanda Tangan Digital (Layar Sentuh / Mouse)</span>
          </div>
        )}

        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finalizeStroke}
          onPointerCancel={finalizeStroke}
          style={{ height: `${height}px` }}
          className={`block w-full touch-none select-none ${disabled ? 'cursor-not-allowed' : 'cursor-crosshair'}`}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <p className="text-[10px] text-neutral-500 leading-snug flex-1 min-w-[200px]">{helperText}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleUndo}
            disabled={disabled || strokeCount === 0}
            className="px-2.5 py-1 text-[11px] font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 disabled:opacity-45 disabled:cursor-not-allowed border border-neutral-200 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1"
            title="Batalkan goresan terakhir"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Undo</span>
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled || !hasSignature}
            className="px-2.5 py-1 text-[11px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-45 disabled:cursor-not-allowed border border-red-200 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1"
            title="Hapus seluruh tanda tangan dan ulangi"
          >
            <Eraser className="w-3 h-3" />
            <span>Hapus / Ulangi</span>
          </button>
        </div>
      </div>
    </div>
  );
};
