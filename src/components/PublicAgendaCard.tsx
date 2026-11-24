import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock, MapPin, Download, X, ChevronRight } from 'lucide-react';
import { CalendarEventItem } from '../types/ppdi';
import { safeFetchJson } from '../utils/ppdiHelpers';

const BULAN_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
const BULAN_FULL = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

function parseIsoDateParts(dateStr?: string): { year: string; monthIdx: number; day: string } | null {
  if (!dateStr) return null;
  const clean = String(dateStr).slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return null;
  const monthIdx = Number(parts[1]) - 1;
  if (Number.isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) return null;
  return {
    year: parts[0],
    monthIdx,
    day: parts[2].padStart(2, '0'),
  };
}

function formatFullDateId(dateStr?: string): string {
  const p = parseIsoDateParts(dateStr);
  if (!p) return dateStr || '-';
  return `${Number(p.day)} ${BULAN_FULL[p.monthIdx]} ${p.year}`;
}

export const PublicAgendaCard: React.FC = () => {
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<'upcoming' | 'all'>('upcoming');
  const [showAllRows, setShowAllRows] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventItem | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    safeFetchJson('/api/kalender')
      .then((res) => {
        if (active && res.ok && res.data?.success && Array.isArray(res.data.items)) {
          setEvents(res.data.items);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredEvents = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const sorted = [...events].sort((a, b) => {
      const aKey = `${a.tanggal_mulai || ''} ${a.waktu_mulai || '00:00'}`;
      const bKey = `${b.tanggal_mulai || ''} ${b.waktu_mulai || '00:00'}`;
      return aKey.localeCompare(bKey);
    });

    if (filterMode === 'upcoming') {
      const upcoming = sorted.filter((ev) => {
        if (ev.status === 'Dibatalkan' || ev.status === 'Selesai') return false;
        const endDate = (ev.tanggal_selesai || ev.tanggal_mulai || '').slice(0, 10);
        return !endDate || endDate >= todayIso;
      });
      // Jika belum ada jadwal di masa depan, tampilkan jadwal aktif/terbaru agar informasi tetap berguna
      return upcoming.length > 0
        ? upcoming
        : sorted.filter((ev) => ev.status !== 'Dibatalkan').slice(-5).reverse();
    }

    return sorted;
  }, [events, filterMode]);

  const visibleEvents = showAllRows ? filteredEvents : filteredEvents.slice(0, 4);

  return (
    <>
      <section
        aria-label="Agenda Kegiatan PPDI"
        className="bg-black/35 backdrop-blur-md rounded-xl border border-white/15 p-4 text-white shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarDays className="w-4 h-4 text-amber-300 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-xs font-mono uppercase tracking-wider text-emerald-300 font-bold truncate">
                Agenda Kegiatan PPDI
              </h3>
              <p className="text-[10px] text-white/60 truncate">
                Jadwal kegiatan, rapat rutin, &amp; batas waktu berkas
              </p>
            </div>
          </div>

          {/* Interactive Filter Segmented Control */}
          <div className="inline-flex items-center p-0.5 bg-white/10 rounded-lg border border-white/10 text-[10px] font-mono shrink-0">
            <button
              type="button"
              onClick={() => {
                setFilterMode('upcoming');
                setShowAllRows(false);
              }}
              className={`px-2 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                filterMode === 'upcoming'
                  ? 'bg-emerald-500/30 text-emerald-100 font-bold'
                  : 'text-white/65 hover:text-white'
              }`}
            >
              Terdekat
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterMode('all');
                setShowAllRows(false);
              }}
              className={`px-2 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                filterMode === 'all'
                  ? 'bg-emerald-500/30 text-emerald-100 font-bold'
                  : 'text-white/65 hover:text-white'
              }`}
            >
              Semua ({events.length})
            </button>
          </div>
        </div>

        {/* Event List */}
        <div className="mt-3 space-y-2.5 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
          {loading ? (
            <div className="space-y-2.5 py-1">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="p-3 rounded-lg bg-white/5 border border-white/10 animate-pulse flex items-center gap-3"
                >
                  <div className="w-11 h-11 rounded-lg bg-white/10 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2.5 bg-white/15 rounded w-2/5" />
                    <div className="h-3 bg-white/15 rounded w-4/5" />
                    <div className="h-2.5 bg-white/10 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : visibleEvents.length === 0 ? (
            <div className="py-6 px-3 text-center rounded-lg bg-white/5 border border-white/10 space-y-1.5">
              <CalendarDays className="w-7 h-7 text-emerald-300/60 mx-auto" />
              <div className="text-xs font-semibold text-white/90">
                Belum Ada Agenda Kegiatan
              </div>
              <p className="text-[11px] text-white/60 leading-relaxed">
                Jadwal kegiatan, rapat rutin, dan pengumuman agenda PPDI Kabupaten Bandung akan tampil di sini.
              </p>
            </div>
          ) : (
            visibleEvents.map((ev) => {
              const dateParts = parseIsoDateParts(ev.tanggal_mulai);
              const timeLabel = ev.is_all_day
                ? 'Sepanjang hari'
                : ev.waktu_mulai
                ? ev.waktu_selesai
                  ? `${ev.waktu_mulai}–${ev.waktu_selesai} WIB`
                  : `${ev.waktu_mulai} WIB`
                : 'Jadwal menyusul';

              const statusColorClass =
                ev.status === 'Berlangsung'
                  ? 'text-emerald-300'
                  : ev.status === 'Selesai'
                  ? 'text-white/50'
                  : ev.status === 'Dibatalkan'
                  ? 'text-red-300'
                  : 'text-amber-300';

              return (
                <button
                  key={ev.id_acara}
                  type="button"
                  onClick={() => setSelectedEvent(ev)}
                  className="w-full text-left p-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors flex items-start gap-3 cursor-pointer group"
                >
                  {/* Compact Date Block */}
                  <div className="w-11 shrink-0 rounded-lg bg-emerald-950/80 border border-emerald-400/25 py-1.5 text-center font-mono tabular-nums">
                    <div className="text-sm font-extrabold text-amber-300 leading-none">
                      {dateParts ? dateParts.day : '--'}
                    </div>
                    <div className="text-[9px] font-bold text-emerald-200 tracking-wider mt-1">
                      {dateParts ? BULAN_SHORT[dateParts.monthIdx] : '---'}
                    </div>
                  </div>

                  {/* Event Details */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="text-[10px] font-mono text-white/65 flex flex-wrap items-center gap-x-1.5">
                      <span className="text-emerald-300 font-semibold">{ev.kategori}</span>
                      <span aria-hidden="true">·</span>
                      <span className={`font-semibold ${statusColorClass}`}>{ev.status}</span>
                    </div>

                    <div className="text-xs font-semibold text-white group-hover:text-amber-200 transition-colors leading-snug line-clamp-2">
                      {ev.judul}
                    </div>

                    <div className="text-[10px] text-white/60 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3 text-white/45 shrink-0" />
                        <span>{timeLabel}</span>
                      </span>
                      {ev.lokasi && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 min-w-0 truncate max-w-[170px]">
                            <MapPin className="w-3 h-3 text-white/45 shrink-0" />
                            <span className="truncate font-sans">{ev.lokasi}</span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-white/35 group-hover:text-amber-300 shrink-0 mt-1 transition-colors" />
                </button>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        {filteredEvents.length > 4 && (
          <button
            type="button"
            onClick={() => setShowAllRows((prev) => !prev)}
            className="mt-3 w-full py-2 text-xs font-mono font-semibold text-emerald-100 bg-emerald-900/60 hover:bg-emerald-800/80 border border-emerald-400/30 rounded-lg transition-colors cursor-pointer"
          >
            {showAllRows
              ? 'Tampilkan Lebih Ringkas'
              : `Lihat Semua Agenda (${filteredEvents.length})`}
          </button>
        )}
      </section>

      {/* Modal Detail Agenda Kegiatan Publik */}
      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden text-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-[#064E3B] text-white flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-mono text-emerald-200 flex items-center gap-1.5">
                  <span>{selectedEvent.kategori}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-300 font-bold">{selectedEvent.status}</span>
                </div>
                <h3 className="text-base font-bold mt-1 leading-snug">{selectedEvent.judul}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                aria-label="Tutup detail agenda"
                className="p-1 text-white/80 hover:text-white rounded-md hover:bg-white/10 cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono tabular-nums">
                <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
                  <div className="text-[10px] text-neutral-500 font-sans">Tanggal Pelaksanaan</div>
                  <div className="font-bold text-neutral-900 mt-0.5">
                    {formatFullDateId(selectedEvent.tanggal_mulai)}
                    {selectedEvent.tanggal_selesai &&
                    selectedEvent.tanggal_selesai !== selectedEvent.tanggal_mulai
                      ? ` – ${formatFullDateId(selectedEvent.tanggal_selesai)}`
                      : ''}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
                  <div className="text-[10px] text-neutral-500 font-sans">Waktu</div>
                  <div className="font-bold text-neutral-900 mt-0.5">
                    {selectedEvent.is_all_day
                      ? 'Sepanjang Hari'
                      : selectedEvent.waktu_mulai
                      ? selectedEvent.waktu_selesai
                        ? `${selectedEvent.waktu_mulai} – ${selectedEvent.waktu_selesai} WIB`
                        : `${selectedEvent.waktu_mulai} WIB`
                      : 'Menyusul'}
                  </div>
                </div>
                {selectedEvent.lokasi && (
                  <div className="sm:col-span-2 p-3 rounded-lg bg-neutral-50 border border-neutral-200 font-sans">
                    <div className="text-[10px] text-neutral-500">Lokasi Kegiatan</div>
                    <div className="font-semibold text-neutral-900 mt-0.5">{selectedEvent.lokasi}</div>
                  </div>
                )}
              </div>

              {selectedEvent.deskripsi && (
                <div className="space-y-1">
                  <div className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider">
                    Keterangan Agenda
                  </div>
                  <p className="text-neutral-700 leading-relaxed whitespace-pre-line">
                    {selectedEvent.deskripsi}
                  </p>
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 bg-neutral-50 border-t border-neutral-200 flex flex-wrap items-center justify-end gap-2">
              <a
                href={`/api/kalender/${encodeURIComponent(selectedEvent.id_acara)}/event.ics`}
                download
                className="px-3.5 py-2 bg-white hover:bg-neutral-100 text-neutral-800 border border-neutral-300 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-[#064E3B]" />
                <span>Simpan ke Kalender (.ICS)</span>
              </a>
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-2 bg-[#064E3B] hover:bg-[#043d2e] text-white rounded-lg text-xs font-bold cursor-pointer transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
