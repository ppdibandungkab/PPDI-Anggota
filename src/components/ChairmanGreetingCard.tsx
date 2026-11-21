import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Quote, User } from 'lucide-react';

export interface ChairmanGreetingCardProps {
  chairmanName?: string;
  chairmanTitle?: string;
  chairmanPhoto?: string;
  chairmanGreeting?: string;
  className?: string;
}

const DEFAULT_CHAIRMAN_NAME = 'Ketua PPDI Kabupaten Bandung';
const DEFAULT_CHAIRMAN_TITLE = 'Ketua Pengurus Daerah PPDI Kabupaten Bandung';
const DEFAULT_CHAIRMAN_GREETING =
  "Assalamu'alaikum Warahmatullahi Wabarakatuh.\n\nSelamat datang di Portal Resmi Sistem Informasi Database & E-KTA Persatuan Perangkat Desa Indonesia (PPDI) Kabupaten Bandung. Mari bersama membangun sinergi, soliditas, dan profesionalisme perangkat desa demi pelayanan masyarakat serta kemajuan desa di seluruh Kabupaten Bandung.";

export const ChairmanGreetingCard: React.FC<ChairmanGreetingCardProps> = ({
  chairmanName,
  chairmanTitle,
  chairmanPhoto,
  chairmanGreeting,
  className = '',
}) => {
  const [expanded, setExpanded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const safePhoto = (chairmanPhoto || '').trim();
  const displayName = (chairmanName || '').trim() || DEFAULT_CHAIRMAN_NAME;
  const displayTitle = (chairmanTitle || '').trim() || DEFAULT_CHAIRMAN_TITLE;
  const rawGreeting = (chairmanGreeting || '').trim();
  const displayGreeting = rawGreeting || DEFAULT_CHAIRMAN_GREETING;

  useEffect(() => {
    setImgError(false);
  }, [safePhoto]);

  const lineBreaks = (displayGreeting.match(/\n/g) || []).length;
  const isLongGreeting = displayGreeting.length > 235 || lineBreaks >= 4;

  const showPhoto = Boolean(safePhoto) && !imgError;

  return (
    <section
      aria-label="Sambutan Ketua PPDI Kabupaten Bandung"
      className={`w-full rounded-2xl bg-black/45 backdrop-blur-md border border-emerald-400/25 shadow-2xl overflow-hidden text-white ${className}`}
    >
      {/* Top gold-emerald institutional accent bar */}
      <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-amber-400 to-emerald-500" />

      <div className="p-4 sm:p-5 space-y-4">
        {/* Card Header */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-amber-400/15 border border-amber-300/35 flex items-center justify-center shrink-0 text-amber-300">
              <Quote className="w-3.5 h-3.5" />
            </div>
            <h2 className="text-[11px] sm:text-xs font-mono font-bold uppercase tracking-wider text-emerald-300 leading-tight">
              Sambutan Ketua PPDI Kabupaten Bandung
            </h2>
          </div>
        </div>

        {/* Chairman Portrait + Identity */}
        <div className="flex items-center gap-3.5">
          <div className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full shrink-0 overflow-hidden ring-2 ring-amber-400/75 ring-offset-2 ring-offset-[#04281e] bg-gradient-to-br from-emerald-900 to-emerald-950 flex items-center justify-center shadow-lg">
            {showPhoto ? (
              <img
                src={safePhoto}
                alt={displayName}
                onError={() => setImgError(true)}
                className="w-full h-full object-cover object-top"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-emerald-200/80">
                <User className="w-7 h-7 text-amber-300/90" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-sm sm:text-[15px] font-bold text-white leading-snug break-words">
              {displayName}
            </h3>
            <p className="text-[11px] sm:text-xs font-medium text-amber-300/95 leading-snug mt-0.5 break-words">
              {displayTitle}
            </p>
          </div>
        </div>

        {/* Greeting Message Body */}
        <div className="relative pl-3.5 border-l-2 border-amber-400/55">
          <p
            className={`text-xs sm:text-[13px] text-emerald-50/90 leading-relaxed whitespace-pre-line break-words ${
              !expanded && isLongGreeting ? 'line-clamp-4' : ''
            }`}
          >
            {displayGreeting}
          </p>

          {isLongGreeting && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-amber-300 hover:text-amber-200 transition-colors cursor-pointer"
            >
              <span>{expanded ? 'Tutup Ringkas' : 'Baca Selengkapnya'}</span>
              {expanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
