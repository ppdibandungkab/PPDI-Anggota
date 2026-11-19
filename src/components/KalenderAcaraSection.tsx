import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CalendarEventCategory,
  CalendarEventItem,
  CalendarEventStatus,
} from '../types/ppdi';
import { usePPDI } from '../context/PPDIContext';
import { PermissionGate } from './PermissionGate';
import { safeFetchJson } from '../utils/ppdiHelpers';
import {
  buildGoogleCalendarUrl,
  buildOutlookCalendarUrl,
  downloadIcsFile,
  getExternalCalendarSubscriptionUrls,
} from '../utils/calendarSyncHelpers';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Plus,
  RefreshCw,
  Share2,
  Download,
  ExternalLink,
  Copy,
  Check,
  Pencil,
  Trash2,
  X,
  Bell,
  AlertTriangle,
} from 'lucide-react';

interface KalenderAcaraSectionProps {
  onNotify?: (title: string, message: string) => void;
}

const KATEGORI_OPTIONS: CalendarEventCategory[] = [
  'Kegiatan PPDI',
  'Rapat Rutin',
  'Batas Waktu Berkas',
  'Lainnya',
];

const STATUS_OPTIONS: CalendarEventStatus[] = [
  'Terjadwal',
  'Berlangsung',
  'Selesai',
  'Dibatalkan',
];

const REMINDER_OPTIONS = [
  { value: 0, label: 'Tanpa pengingat (.ics VALARM)' },
  { value: 30, label: '30 menit sebelumnya' },
  { value: 60, label: '1 jam sebelumnya' },
  { value: 1440, label: '1 hari sebelumnya (H-1)' },
  { value: 2880, label: '2 hari sebelumnya (H-2)' },
];

const BULAN_INDO = [
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

const HARI_SINGKAT = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toIsoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function formatShortDateIndo(isoDate?: string): string {
  if (!isoDate) return '-';
  const clean = isoDate.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return clean;
  const year = Number(parts[0]);
  const monthIdx = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  if (isNaN(year) || isNaN(monthIdx) || isNaN(day) || !BULAN_INDO[monthIdx]) return clean;
  return `${day} ${BULAN_INDO[monthIdx].slice(0, 3)} ${year}`;
}

function getCategoryStyle(kategori: CalendarEventCategory): {
  dot: string;
  text: string;
  bgSubtle: string;
  borderSubtle: string;
} {
  switch (kategori) {
    case 'Kegiatan PPDI':
      return {
        dot: 'bg-emerald-600',
        text: 'text-emerald-800',
        bgSubtle: 'bg-emerald-50',
        borderSubtle: 'border-emerald-200',
      };
    case 'Rapat Rutin':
      return {
        dot: 'bg-blue-600',
        text: 'text-blue-800',
        bgSubtle: 'bg-blue-50',
        borderSubtle: 'border-blue-200',
      };
    case 'Batas Waktu Berkas':
      return {
        dot: 'bg-amber-600',
        text: 'text-amber-800',
        bgSubtle: 'bg-amber-50',
        borderSubtle: 'border-amber-200',
      };
    default:
      return {
        dot: 'bg-neutral-500',
        text: 'text-neutral-700',
        bgSubtle: 'bg-neutral-100',
        borderSubtle: 'border-neutral-200',
      };
  }
}

function eventOccursOnDate(ev: CalendarEventItem, isoDate: string): boolean {
  const start = (ev.tanggal_mulai || '').slice(0, 10);
  const end = (ev.tanggal_selesai || ev.tanggal_mulai || '').slice(0, 10);
  if (!start) return false;
  return isoDate >= start && isoDate <= (end || start);
}

interface EventFormState {
  judul: string;
  kategori: CalendarEventCategory;
  tanggal_mulai: string;
  tanggal_selesai: string;
  is_all_day: boolean;
  waktu_mulai: string;
  waktu_selesai: string;
  lokasi: string;
  deskripsi: string;
  pengingat_menit: number;
  status: CalendarEventStatus;
}

const buildInitialFormState = (defaultDate?: string): EventFormState => {
  const today = defaultDate || new Date().toISOString().slice(0, 10);
  return {
    judul: '',
    kategori: 'Kegiatan PPDI',
    tanggal_mulai: today,
    tanggal_selesai: today,
    is_all_day: false,
    waktu_mulai: '09:00',
    waktu_selesai: '12:00',
    lokasi: 'Sekretariat PPDI Kabupaten Bandung',
    deskripsi: '',
    pengingat_menit: 1440,
    status: 'Terjadwal',
  };
};

export const KalenderAcaraSection: React.FC<KalenderAcaraSectionProps> = ({ onNotify }) => {
  const { currentUser } = usePPDI();

  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const todayIso = useMemo(() => {
    const now = new Date();
    return toIsoDate(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const [viewYear, setViewYear] = useState<number>(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'Semua' | CalendarEventCategory>('Semua');
  const [agendaScope, setAgendaScope] = useState<'bulan' | 'semua'>('bulan');

  // Modals state
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEventItem | null>(null);
  const [formState, setFormState] = useState<EventFormState>(() => buildInitialFormState());
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [isSyncModalOpen, setIsSyncModalOpen] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<'http' | 'webcal' | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<CalendarEventItem | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const fetchEvents = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setLoadError(null);
    try {
      const res = await safeFetchJson<{
        success: boolean;
        items?: CalendarEventItem[];
        error?: string;
      }>('/api/kalender');
      if (res.ok && res.data?.success && Array.isArray(res.data.items)) {
        setEvents(res.data.items);
      } else {
        setLoadError(res.data?.error || res.error || 'Gagal memuat jadwal acara.');
      }
    } catch (err: any) {
      setLoadError(err?.message || 'Tidak dapat menghubungi server kalender.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Escape key handler for active section modals
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (deleteTarget) {
        setDeleteTarget(null);
      } else if (isFormOpen) {
        setIsFormOpen(false);
      } else if (isSyncModalOpen) {
        setIsSyncModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteTarget, isFormOpen, isSyncModalOpen]);

  // Calendar grid days (Monday first, 35 or 42 cells)
  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
    const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();
    // JS getDay(): 0 = Sun, 1 = Mon ... 6 = Sat -> convert to Mon=0 .. Sun=6
    const startOffset = (firstDayOfMonth.getDay() + 6) % 7;

    const prevMonthLastDate = new Date(viewYear, viewMonth, 0).getDate();
    const cells: Array<{
      isoDate: string;
      dayNumber: number;
      isCurrentMonth: boolean;
    }> = [];

    for (let i = startOffset - 1; i >= 0; i--) {
      const d = prevMonthLastDate - i;
      const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
      cells.push({
        isoDate: toIsoDate(prevYear, prevMonth, d),
        dayNumber: d,
        isCurrentMonth: false,
      });
    }

    for (let d = 1; d <= totalDays; d++) {
      cells.push({
        isoDate: toIsoDate(viewYear, viewMonth, d),
        dayNumber: d,
        isCurrentMonth: true,
      });
    }

    const totalSlots = cells.length <= 35 ? 35 : 42;
    let nextDay = 1;
    while (cells.length < totalSlots) {
      const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
      cells.push({
        isoDate: toIsoDate(nextYear, nextMonth, nextDay),
        dayNumber: nextDay,
        isCurrentMonth: false,
      });
      nextDay++;
    }

    return cells;
  }, [viewYear, viewMonth]);

  const categoryFilteredEvents = useMemo(() => {
    if (selectedCategory === 'Semua') return events;
    return events.filter((ev) => ev.kategori === selectedCategory);
  }, [events, selectedCategory]);

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {
      Semua: events.length,
      'Kegiatan PPDI': 0,
      'Rapat Rutin': 0,
      'Batas Waktu Berkas': 0,
      Lainnya: 0,
    };
    events.forEach((ev) => {
      map[ev.kategori] = (map[ev.kategori] || 0) + 1;
    });
    return map;
  }, [events]);

  const monthPrefix = `${viewYear}-${pad2(viewMonth + 1)}`;

  const visibleAgendaEvents = useMemo(() => {
    return categoryFilteredEvents.filter((ev) => {
      if (selectedDate) {
        return eventOccursOnDate(ev, selectedDate);
      }
      if (agendaScope === 'bulan') {
        const startMonth = (ev.tanggal_mulai || '').slice(0, 7);
        const endMonth = (ev.tanggal_selesai || ev.tanggal_mulai || '').slice(0, 7);
        return startMonth <= monthPrefix && endMonth >= monthPrefix;
      }
      return true;
    });
  }, [categoryFilteredEvents, selectedDate, agendaScope, monthPrefix]);

  const handlePrevMonth = () => {
    setSelectedDate(null);
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    setSelectedDate(null);
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleJumpToday = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDate(null);
  };

  const openAddModal = () => {
    setEditingEvent(null);
    setFormState(buildInitialFormState(selectedDate || todayIso));
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditModal = (ev: CalendarEventItem) => {
    setEditingEvent(ev);
    setFormState({
      judul: ev.judul,
      kategori: ev.kategori,
      tanggal_mulai: (ev.tanggal_mulai || '').slice(0, 10),
      tanggal_selesai: (ev.tanggal_selesai || ev.tanggal_mulai || '').slice(0, 10),
      is_all_day: Boolean(ev.is_all_day),
      waktu_mulai: ev.waktu_mulai || '09:00',
      waktu_selesai: ev.waktu_selesai || '12:00',
      lokasi: ev.lokasi || '',
      deskripsi: ev.deskripsi || '',
      pengingat_menit: ev.pengingat_menit ?? 1440,
      status: ev.status || 'Terjadwal',
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.judul.trim()) {
      setFormError('Judul acara wajib diisi.');
      return;
    }
    if (!formState.tanggal_mulai) {
      setFormError('Tanggal mulai wajib diisi.');
      return;
    }
    if (formState.tanggal_selesai && formState.tanggal_selesai < formState.tanggal_mulai) {
      setFormError('Tanggal selesai tidak boleh lebih awal dari tanggal mulai.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        ...formState,
        judul: formState.judul.trim(),
        tanggal_selesai: formState.tanggal_selesai || formState.tanggal_mulai,
        created_by: currentUser?.nama || 'Admin PPDI',
      };

      const url = editingEvent
        ? `/api/kalender/${encodeURIComponent(editingEvent.id_acara)}`
        : '/api/kalender';
      const method = editingEvent ? 'PUT' : 'POST';

      const res = await safeFetchJson<{
        success: boolean;
        message?: string;
        item?: CalendarEventItem;
      }>(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok || !res.data?.success) {
        setFormError(res.data?.message || res.error || 'Gagal menyimpan jadwal acara.');
        return;
      }

      setIsFormOpen(false);
      await fetchEvents(true);
      onNotify?.(
        editingEvent ? 'Acara Diperbarui' : 'Acara Ditambahkan',
        res.data.message || `Jadwal "${formState.judul.trim()}" berhasil disimpan.`
      );
    } catch (err: any) {
      setFormError(err?.message || 'Terjadi kesalahan saat menyimpan jadwal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await safeFetchJson<{ success: boolean; message?: string }>(
        `/api/kalender/${encodeURIComponent(deleteTarget.id_acara)}`,
        { method: 'DELETE' }
      );
      if (res.ok && res.data?.success) {
        onNotify?.('Acara Dihapus', res.data.message || `Acara "${deleteTarget.judul}" telah dihapus.`);
        setDeleteTarget(null);
        await fetchEvents(true);
      } else {
        onNotify?.('Gagal Menghapus', res.data?.message || res.error || 'Tidak dapat menghapus acara.');
      }
    } catch (err: any) {
      onNotify?.('Gagal Menghapus', err?.message || 'Terjadi kesalahan jaringan.');
    } finally {
      setIsDeleting(false);
    }
  };

  const subscriptionUrls = useMemo(() => getExternalCalendarSubscriptionUrls(), []);

  const handleCopySubscriptionUrl = async (type: 'http' | 'webcal', value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(type);
      window.setTimeout(() => setCopiedKey(null), 2200);
    } catch {
      onNotify?.('Salin Tautan', 'Silakan salin tautan secara manual dari kotak teks.');
    }
  };

  return (
    <section
      id="kalender-acara-dashboard"
      aria-label="Kalender Acara PPDI"
      className="bg-white border border-neutral-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs"
    >
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3.5 border-b border-neutral-100">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#064E3B] text-amber-300 flex items-center justify-center shrink-0">
            <CalendarDays className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-neutral-900 tracking-tight">
              Kalender Acara &amp; Jadwal Kegiatan PPDI
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">
              Jadwal kegiatan PPDI, rapat rutin pengurus, dan batas waktu berkas dengan sinkronisasi Google Calendar, Outlook, &amp; iCalendar (.ics)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => fetchEvents()}
            disabled={isLoading}
            title="Muat ulang jadwal acara"
            className="px-2.5 py-1.5 text-xs font-medium text-neutral-700 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Muat Ulang</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSyncModalOpen(true)}
            className="px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Share2 className="w-3.5 h-3.5 text-emerald-700" />
            <span>Sinkronisasi Kalender</span>
          </button>

          <PermissionGate module="kalender" action="create">
            <button
              type="button"
              onClick={openAddModal}
              className="px-3 py-1.5 text-xs font-bold text-white bg-[#064E3B] hover:bg-[#043d2e] rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 text-amber-300" />
              <span>Tambah Acara</span>
            </button>
          </PermissionGate>
        </div>
      </div>

      {/* Category Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['Semua', ...KATEGORI_OPTIONS] as const).map((cat) => {
            const active = selectedCategory === cat;
            const catStyle = cat === 'Semua' ? null : getCategoryStyle(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 border ${
                  active
                    ? 'bg-[#064E3B] text-white border-[#064E3B]'
                    : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                }`}
              >
                {catStyle && (
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      active ? 'bg-amber-300' : catStyle.dot
                    }`}
                  />
                )}
                <span>{cat}</span>
                <span
                  className={`font-mono tabular-nums text-[11px] ${
                    active ? 'text-emerald-200' : 'text-neutral-500'
                  }`}
                >
                  {categoryCounts[cat] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        {selectedDate && (
          <div className="flex items-center gap-2 text-xs text-neutral-600">
            <span>
              Filter tanggal: <strong className="text-neutral-900 font-mono">{formatShortDateIndo(selectedDate)}</strong>
            </span>
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className="text-xs font-semibold text-emerald-800 hover:underline cursor-pointer"
            >
              Tampilkan Semua
            </button>
          </div>
        )}
      </div>

      {/* Main 2-Column Balanced Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left: Interactive Monthly Calendar */}
        <div className="lg:col-span-5 bg-neutral-50/70 border border-neutral-200 rounded-xl p-3.5 flex flex-col justify-between">
          <div>
            {/* Month Controls */}
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  aria-label="Bulan sebelumnya"
                  className="p-1.5 rounded-lg bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-100 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="px-2 text-sm font-bold text-neutral-900 min-w-[130px] text-center">
                  {BULAN_INDO[viewMonth]} {viewYear}
                </div>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  aria-label="Bulan berikutnya"
                  className="p-1.5 rounded-lg bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-100 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={handleJumpToday}
                className="px-2.5 py-1 text-[11px] font-semibold text-emerald-800 bg-white hover:bg-emerald-50 border border-neutral-200 rounded-lg cursor-pointer"
              >
                Hari Ini
              </button>
            </div>

            {/* Weekday Header */}
            <div className="grid grid-cols-7 gap-1 mb-1.5">
              {HARI_SINGKAT.map((h) => (
                <div
                  key={h}
                  className="text-center text-[11px] font-semibold text-neutral-500 py-1"
                >
                  {h}
                </div>
              ))}
            </div>

            {/* Calendar Days */}
            <div className="grid grid-cols-7 gap-1">
              {calendarCells.map((cell) => {
                const dayEvents = categoryFilteredEvents.filter((ev) =>
                  eventOccursOnDate(ev, cell.isoDate)
                );
                const isToday = cell.isoDate === todayIso;
                const isSelected = cell.isoDate === selectedDate;
                const hasEvents = dayEvents.length > 0;

                return (
                  <button
                    key={cell.isoDate}
                    type="button"
                    onClick={() =>
                      setSelectedDate((prev) => (prev === cell.isoDate ? null : cell.isoDate))
                    }
                    title={
                      hasEvents
                        ? `${dayEvents.length} acara pada ${formatShortDateIndo(cell.isoDate)}`
                        : formatShortDateIndo(cell.isoDate)
                    }
                    className={`h-11 rounded-lg border text-xs flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#064E3B] text-white border-[#064E3B] font-bold'
                        : isToday
                        ? 'bg-emerald-50 text-emerald-950 border-emerald-400 font-bold'
                        : cell.isCurrentMonth
                        ? 'bg-white text-neutral-800 border-neutral-200/80 hover:border-emerald-300'
                        : 'bg-transparent text-neutral-400 border-transparent hover:bg-neutral-100'
                    }`}
                  >
                    <span className="font-mono tabular-nums leading-none">{cell.dayNumber}</span>
                    <span className="flex items-center gap-0.5 h-1.5">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <span
                          key={ev.id_acara}
                          className={`w-1.5 h-1.5 rounded-full ${
                            isSelected ? 'bg-amber-300' : getCategoryStyle(ev.kategori).dot
                          }`}
                        />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Compact Legend */}
          <div className="pt-3 mt-3 border-t border-neutral-200 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-600">
            {KATEGORI_OPTIONS.map((kat) => (
              <span key={kat} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${getCategoryStyle(kat).dot}`} />
                <span>{kat}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Right: Chronological Agenda Panel */}
        <div className="lg:col-span-7 border border-neutral-200 rounded-xl p-3.5 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-3 border-b border-neutral-100">
            <div>
              <h3 className="text-xs sm:text-[13px] font-bold text-neutral-900">
                {selectedDate
                  ? `Agenda Tanggal ${formatShortDateIndo(selectedDate)}`
                  : agendaScope === 'bulan'
                  ? `Agenda ${BULAN_INDO[viewMonth]} ${viewYear}`
                  : 'Semua Agenda Terjadwal'}
              </h3>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                {visibleAgendaEvents.length} acara ditemukan · Klik tautan sinkronisasi untuk menyimpan ke kalender pribadi
              </p>
            </div>

            {!selectedDate && (
              <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 text-[11px] font-medium">
                <button
                  type="button"
                  onClick={() => setAgendaScope('bulan')}
                  className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                    agendaScope === 'bulan'
                      ? 'bg-white text-neutral-900 font-semibold shadow-2xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  Bulan Ini
                </button>
                <button
                  type="button"
                  onClick={() => setAgendaScope('semua')}
                  className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                    agendaScope === 'semua'
                      ? 'bg-white text-neutral-900 font-semibold shadow-2xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  Semua Agenda
                </button>
              </div>
            )}
          </div>

          {loadError ? (
            <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-xs text-red-800 flex items-center justify-between gap-2">
              <span>{loadError}</span>
              <button
                type="button"
                onClick={() => fetchEvents()}
                className="px-2.5 py-1 bg-white border border-red-200 rounded-lg font-semibold cursor-pointer"
              >
                Coba Lagi
              </button>
            </div>
          ) : isLoading ? (
            <div className="flex-1 flex items-center justify-center py-12 text-xs text-neutral-500 gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-emerald-700" />
              <span>Memuat jadwal kalender acara...</span>
            </div>
          ) : visibleAgendaEvents.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-10 px-4 bg-neutral-50/70 rounded-xl border border-dashed border-neutral-200">
              <CalendarDays className="w-8 h-8 text-neutral-300 mb-2" />
              <p className="text-xs font-semibold text-neutral-700">
                Belum ada acara pada tampilan ini
              </p>
              <p className="text-[11px] text-neutral-500 mt-1 max-w-sm">
                Pilih tanggal lain pada kalender, ubah ke &ldquo;Semua Agenda&rdquo;, atau tambahkan jadwal kegiatan baru.
              </p>
              {agendaScope === 'bulan' && !selectedDate && events.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAgendaScope('semua')}
                  className="mt-3 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg cursor-pointer"
                >
                  Lihat Semua {events.length} Agenda
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {visibleAgendaEvents.map((ev) => {
                const catStyle = getCategoryStyle(ev.kategori);
                const dateDisplay =
                  ev.tanggal_selesai && ev.tanggal_selesai !== ev.tanggal_mulai
                    ? `${formatShortDateIndo(ev.tanggal_mulai)} – ${formatShortDateIndo(ev.tanggal_selesai)}`
                    : formatShortDateIndo(ev.tanggal_mulai);
                const timeDisplay = ev.is_all_day
                  ? 'Sepanjang Hari'
                  : ev.waktu_mulai
                  ? `${ev.waktu_mulai}${ev.waktu_selesai ? ` – ${ev.waktu_selesai}` : ''} WIB`
                  : 'Terjadwal';

                return (
                  <article
                    key={ev.id_acara}
                    className="border border-neutral-200 rounded-xl p-3.5 hover:border-emerald-300 transition-colors bg-white space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${catStyle.dot}`} />
                          <span className={`text-[11px] font-semibold ${catStyle.text}`}>
                            {ev.kategori}
                          </span>
                          <span className="text-neutral-300">&middot;</span>
                          <span className="text-[11px] font-mono tabular-nums text-neutral-600">
                            {dateDisplay}
                          </span>
                          {ev.status && ev.status !== 'Terjadwal' && (
                            <>
                              <span className="text-neutral-300">&middot;</span>
                              <span
                                className={`text-[11px] font-semibold ${
                                  ev.status === 'Dibatalkan'
                                    ? 'text-red-700'
                                    : ev.status === 'Selesai'
                                    ? 'text-neutral-500'
                                    : 'text-emerald-700'
                                }`}
                              >
                                {ev.status}
                              </span>
                            </>
                          )}
                        </div>
                        <h4 className="text-xs sm:text-[13px] font-bold text-neutral-900 mt-1 leading-snug">
                          {ev.judul}
                        </h4>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <PermissionGate module="kalender" action="edit">
                          <button
                            type="button"
                            onClick={() => openEditModal(ev)}
                            title="Edit jadwal acara"
                            aria-label={`Edit ${ev.judul}`}
                            className="p-1.5 text-neutral-500 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </PermissionGate>
                        <PermissionGate module="kalender" action="delete">
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(ev)}
                            title="Hapus jadwal acara"
                            aria-label={`Hapus ${ev.judul}`}
                            className="p-1.5 text-neutral-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </PermissionGate>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-600">
                      <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                        <Clock className="w-3 h-3 text-neutral-400" />
                        <span>{timeDisplay}</span>
                      </span>
                      {ev.lokasi && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-neutral-400 shrink-0" />
                          <span className="truncate max-w-[260px]">{ev.lokasi}</span>
                        </span>
                      )}
                      {ev.pengingat_menit > 0 && (
                        <span className="inline-flex items-center gap-1 text-neutral-500">
                          <Bell className="w-3 h-3 text-neutral-400" />
                          <span>
                            Pengingat{' '}
                            {ev.pengingat_menit >= 1440
                              ? `${Math.round(ev.pengingat_menit / 1440)} hari`
                              : ev.pengingat_menit >= 60
                              ? `${Math.round(ev.pengingat_menit / 60)} jam`
                              : `${ev.pengingat_menit} mnt`}
                          </span>
                        </span>
                      )}
                    </div>

                    {ev.deskripsi && (
                      <p className="text-[11px] text-neutral-600 leading-relaxed line-clamp-2">
                        {ev.deskripsi}
                      </p>
                    )}

                    {/* Direct External Calendar Sync Row */}
                    <div className="pt-2 border-t border-neutral-100 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="text-neutral-500 font-medium">Simpan ke:</span>
                      <a
                        href={buildGoogleCalendarUrl(ev)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-neutral-50 hover:bg-emerald-50 text-neutral-700 hover:text-emerald-900 border border-neutral-200 transition-colors font-medium"
                      >
                        <span>Google Calendar</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                      <a
                        href={buildOutlookCalendarUrl(ev)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-neutral-50 hover:bg-blue-50 text-neutral-700 hover:text-blue-900 border border-neutral-200 transition-colors font-medium"
                      >
                        <span>Outlook</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          downloadIcsFile(
                            [ev],
                            `${ev.judul.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.ics`
                          )
                        }
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border border-neutral-200 transition-colors font-mono font-medium cursor-pointer"
                      >
                        <Download className="w-2.5 h-2.5" />
                        <span>.ics (Apple/Outlook)</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal 1: Add / Edit Calendar Event */}
      {isFormOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="kalender-form-title"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsFormOpen(false);
          }}
        >
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 id="kalender-form-title" className="text-sm font-bold text-neutral-900">
                  {editingEvent ? 'Edit Jadwal Acara' : 'Tambah Jadwal Acara Baru'}
                </h3>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Acara otomatis masuk ke feed sinkronisasi kalender eksternal (.ics)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                aria-label="Tutup modal acara"
                className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-5 space-y-3.5 text-xs">
              {formError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-800 font-medium">
                  {formError}
                </div>
              )}

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Judul Acara <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formState.judul}
                  onChange={(e) => setFormState((s) => ({ ...s, judul: e.target.value }))}
                  placeholder="Contoh: Rapat Koordinasi Pengurus PPDI Kab. Bandung"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Kategori</label>
                  <select
                    value={formState.kategori}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        kategori: e.target.value as CalendarEventCategory,
                      }))
                    }
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-white focus:ring-2 focus:ring-[#064E3B] outline-none"
                  >
                    {KATEGORI_OPTIONS.map((kat) => (
                      <option key={kat} value={kat}>
                        {kat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Status</label>
                  <select
                    value={formState.status}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        status: e.target.value as CalendarEventStatus,
                      }))
                    }
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-white focus:ring-2 focus:ring-[#064E3B] outline-none"
                  >
                    {STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    Tanggal Mulai <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formState.tanggal_mulai}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        tanggal_mulai: e.target.value,
                        tanggal_selesai:
                          !s.tanggal_selesai || s.tanggal_selesai < e.target.value
                            ? e.target.value
                            : s.tanggal_selesai,
                      }))
                    }
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg font-mono focus:ring-2 focus:ring-[#064E3B] outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    Tanggal Selesai
                  </label>
                  <input
                    type="date"
                    value={formState.tanggal_selesai}
                    min={formState.tanggal_mulai}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, tanggal_selesai: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg font-mono focus:ring-2 focus:ring-[#064E3B] outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-0.5">
                <input
                  id="kalender-all-day"
                  type="checkbox"
                  checked={formState.is_all_day}
                  onChange={(e) =>
                    setFormState((s) => ({ ...s, is_all_day: e.target.checked }))
                  }
                  className="rounded border-neutral-300 text-[#064E3B] focus:ring-[#064E3B]"
                />
                <label htmlFor="kalender-all-day" className="font-medium text-neutral-700 cursor-pointer">
                  Sepanjang hari (All-day event / tenggat harian)
                </label>
              </div>

              {!formState.is_all_day && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">
                      Waktu Mulai (WIB)
                    </label>
                    <input
                      type="time"
                      value={formState.waktu_mulai}
                      onChange={(e) =>
                        setFormState((s) => ({ ...s, waktu_mulai: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg font-mono focus:ring-2 focus:ring-[#064E3B] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">
                      Waktu Selesai (WIB)
                    </label>
                    <input
                      type="time"
                      value={formState.waktu_selesai}
                      onChange={(e) =>
                        setFormState((s) => ({ ...s, waktu_selesai: e.target.value }))
                      }
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg font-mono focus:ring-2 focus:ring-[#064E3B] outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Lokasi / Media
                </label>
                <input
                  type="text"
                  value={formState.lokasi}
                  onChange={(e) => setFormState((s) => ({ ...s, lokasi: e.target.value }))}
                  placeholder="Contoh: Aula Kecamatan Soreang / Portal e-Arsip PPDI"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Pengingat Otomatis
                </label>
                <select
                  value={formState.pengingat_menit}
                  onChange={(e) =>
                    setFormState((s) => ({ ...s, pengingat_menit: Number(e.target.value) }))
                  }
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-white focus:ring-2 focus:ring-[#064E3B] outline-none"
                >
                  {REMINDER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Keterangan / Agenda
                </label>
                <textarea
                  rows={3}
                  value={formState.deskripsi}
                  onChange={(e) => setFormState((s) => ({ ...s, deskripsi: e.target.value }))}
                  placeholder="Ringkasan agenda, peserta yang diundang, atau berkas yang perlu disiapkan..."
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-3.5 py-2 rounded-lg border border-neutral-300 text-neutral-700 font-semibold hover:bg-neutral-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-[#064E3B] hover:bg-[#043d2e] disabled:opacity-60 text-white font-bold cursor-pointer"
                >
                  {isSubmitting
                    ? 'Menyimpan...'
                    : editingEvent
                    ? 'Simpan Perubahan'
                    : 'Simpan Acara'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: External Calendar Sync Modal */}
      {isSyncModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="kalender-sync-title"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsSyncModalOpen(false);
          }}
        >
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
              <div>
                <h3 id="kalender-sync-title" className="text-sm font-bold text-neutral-900">
                  Sinkronisasi ke Kalender Eksternal
                </h3>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Berlangganan feed iCalendar (RFC 5545) atau unduh file .ics untuk Google Calendar, Apple Calendar, dan Outlook
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSyncModalOpen(false)}
                aria-label="Tutup modal sinkronisasi"
                className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* Quick Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <a
                  href={subscriptionUrls.googleSubscribeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2.5 rounded-xl bg-[#064E3B] hover:bg-[#043d2e] text-white font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <ExternalLink className="w-4 h-4 text-amber-300" />
                  <span>Langganan Google Calendar</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    downloadIcsFile(events, 'kalender-acara-ppdi-kab-bandung.ics');
                    onNotify?.(
                      'File .ics Diunduh',
                      `${events.length} agenda berhasil diekspor ke format iCalendar (.ics).`
                    );
                  }}
                  className="px-3.5 py-2.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-900 font-bold border border-neutral-300 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4 text-neutral-700" />
                  <span>Unduh Semua Acara (.ics)</span>
                </button>
              </div>

              {/* HTTP Feed URL */}
              <div className="space-y-1.5">
                <label className="block font-semibold text-neutral-700">
                  URL Feed Langganan (Google Calendar / Microsoft Outlook Web)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={subscriptionUrls.httpFeedUrl}
                    className="flex-1 px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-mono text-[11px] text-neutral-800 select-all"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      handleCopySubscriptionUrl('http', subscriptionUrls.httpFeedUrl)
                    }
                    className="px-3 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 font-semibold text-neutral-700 flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    {copiedKey === 'http' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Disalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Webcal URL */}
              <div className="space-y-1.5">
                <label className="block font-semibold text-neutral-700">
                  URL Webcal (Apple Calendar macOS / iOS)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={subscriptionUrls.webcalUrl}
                    className="flex-1 px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-mono text-[11px] text-neutral-800 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopySubscriptionUrl('webcal', subscriptionUrls.webcalUrl)}
                    className="px-3 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 font-semibold text-neutral-700 flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    {copiedKey === 'webcal' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Disalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Setup Guide */}
              <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2 text-[11px] text-neutral-600 leading-relaxed">
                <div className="font-bold text-neutral-800">Panduan Singkat Sinkronisasi:</div>
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    <strong>Google Calendar:</strong> Buka Google Calendar &rarr; klik ikon <strong>+</strong> di samping &ldquo;Kalender lain&rdquo; &rarr; pilih <strong>Dari URL</strong> &rarr; tempel URL Feed di atas.
                  </li>
                  <li>
                    <strong>Apple Calendar (iPhone / Mac):</strong> Klik <em>File &rarr; New Calendar Subscription</em> dan tempel tautan <code>webcal://</code>.
                  </li>
                  <li>
                    <strong>Microsoft Outlook:</strong> Buka Outlook Calendar &rarr; <em>Add calendar &rarr; Subscribe from web</em> &rarr; tempel URL Feed HTTP di atas.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Delete Confirmation */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="kalender-delete-title"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteTarget(null);
          }}
        >
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 id="kalender-delete-title" className="text-sm font-bold text-neutral-900">
                  Hapus Jadwal Acara?
                </h3>
                <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
                  Jadwal <strong>&ldquo;{deleteTarget.judul}&rdquo;</strong> pada tanggal{' '}
                  <span className="font-mono">{formatShortDateIndo(deleteTarget.tanggal_mulai)}</span>{' '}
                  akan dihapus dari daftar dan feed kalender eksternal.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="px-3.5 py-2 rounded-lg border border-neutral-300 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold cursor-pointer"
              >
                {isDeleting ? 'Menghapus...' : 'Ya, Hapus Acara'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default KalenderAcaraSection;
