import { CalendarEventItem } from '../types/ppdi';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Formats YYYY-MM-DD and optional HH:mm into iCalendar/Google local datetime string (YYYYMMDDTHHMMSS)
 * or all-day date string (YYYYMMDD).
 */
function formatDateForCalendar(
  dateStr: string,
  timeStr?: string,
  isAllDay?: boolean,
  addDaysForExclusiveEnd = false
): string {
  const cleanDate = (dateStr || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    const now = new Date();
    return `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
  }

  if (isAllDay || !timeStr) {
    if (addDaysForExclusiveEnd) {
      const d = new Date(`${cleanDate}T00:00:00`);
      d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
    }
    return cleanDate.replace(/-/g, '');
  }

  const cleanTime = timeStr.trim().replace(/[^0-9:]/g, '');
  const [hh = '09', mm = '00'] = cleanTime.split(':');
  return `${cleanDate.replace(/-/g, '')}T${pad2(Number(hh))}${pad2(Number(mm))}00`;
}

/**
 * Builds an add-event template URL for Google Calendar.
 */
export function buildGoogleCalendarUrl(event: CalendarEventItem): string {
  const startDate = event.tanggal_mulai;
  const endDate = event.tanggal_selesai || event.tanggal_mulai;

  let datesParam = '';
  if (event.is_all_day || !event.waktu_mulai) {
    const dtStart = formatDateForCalendar(startDate, undefined, true, false);
    const dtEnd = formatDateForCalendar(endDate, undefined, true, true);
    datesParam = `${dtStart}/${dtEnd}`;
  } else {
    const dtStart = formatDateForCalendar(startDate, event.waktu_mulai, false, false);
    let endTime = event.waktu_selesai;
    if (!endTime) {
      const [hh = '09', mm = '00'] = event.waktu_mulai.split(':');
      const nextH = (Number(hh) + 2) % 24;
      endTime = `${pad2(nextH)}:${mm}`;
    }
    const dtEnd = formatDateForCalendar(endDate, endTime, false, false);
    datesParam = `${dtStart}/${dtEnd}`;
  }

  const detailsLines = [
    `Kategori: ${event.kategori}`,
    event.deskripsi ? `\n${event.deskripsi}` : '',
    '\nSumber: Portal Resmi PPDI Kabupaten Bandung',
  ]
    .filter(Boolean)
    .join('\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `[PPDI] ${event.judul}`,
    dates: datesParam,
    details: detailsLines,
    location: event.lokasi || 'Kabupaten Bandung',
    ctz: 'Asia/Jakarta',
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Builds an add-event compose URL for Outlook Web Calendar.
 */
export function buildOutlookCalendarUrl(event: CalendarEventItem): string {
  const startDate = (event.tanggal_mulai || '').slice(0, 10);
  const endDate = (event.tanggal_selesai || event.tanggal_mulai || '').slice(0, 10);
  const startTime = event.is_all_day ? '00:00:00' : `${event.waktu_mulai || '09:00'}:00`;
  const endTime = event.is_all_day
    ? '23:59:00'
    : `${event.waktu_selesai || event.waktu_mulai || '11:00'}:00`;

  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: `[PPDI] ${event.judul}`,
    startdt: `${startDate}T${startTime}`,
    enddt: `${endDate}T${endTime}`,
    allday: event.is_all_day ? 'true' : 'false',
    body: `${event.kategori}${event.deskripsi ? ` - ${event.deskripsi}` : ''}`,
    location: event.lokasi || 'Kabupaten Bandung',
  });

  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

function escapeIcsText(val: string): string {
  return (val || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/**
 * Generates an RFC 5545 iCalendar (.ics) content string for one or more events.
 */
export function buildIcsContent(events: CalendarEventItem[], calendarTitle = 'Kalender Acara PPDI Kab. Bandung'): string {
  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PPDI Kabupaten Bandung//Kalender Acara//ID',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarTitle)}`,
    'X-WR-TIMEZONE:Asia/Jakarta',
  ];

  events
    .filter((ev) => ev.status !== 'Dibatalkan')
    .forEach((ev) => {
      const startDate = ev.tanggal_mulai;
      const endDate = ev.tanggal_selesai || ev.tanggal_mulai;
      const isAllDay = ev.is_all_day || !ev.waktu_mulai;

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${ev.id_acara}@ppdi-bandungkab.id`);
      lines.push(`DTSTAMP:${nowStamp}`);

      if (isAllDay) {
        lines.push(`DTSTART;VALUE=DATE:${formatDateForCalendar(startDate, undefined, true, false)}`);
        lines.push(`DTEND;VALUE=DATE:${formatDateForCalendar(endDate, undefined, true, true)}`);
      } else {
        const dtStart = formatDateForCalendar(startDate, ev.waktu_mulai, false, false);
        let endTime = ev.waktu_selesai;
        if (!endTime && ev.waktu_mulai) {
          const [hh = '09', mm = '00'] = ev.waktu_mulai.split(':');
          endTime = `${pad2((Number(hh) + 2) % 24)}:${mm}`;
        }
        const dtEnd = formatDateForCalendar(endDate, endTime, false, false);
        lines.push(`DTSTART;TZID=Asia/Jakarta:${dtStart}`);
        lines.push(`DTEND;TZID=Asia/Jakarta:${dtEnd}`);
      }

      lines.push(`SUMMARY:${escapeIcsText(ev.judul)}`);
      lines.push(
        `DESCRIPTION:${escapeIcsText(
          `[${ev.kategori}] ${ev.deskripsi || 'Agenda resmi PPDI Kabupaten Bandung'}`
        )}`
      );
      if (ev.lokasi) {
        lines.push(`LOCATION:${escapeIcsText(ev.lokasi)}`);
      }
      lines.push(`CATEGORIES:${escapeIcsText(ev.kategori)}`);
      lines.push('STATUS:CONFIRMED');

      if (ev.pengingat_menit && ev.pengingat_menit > 0) {
        lines.push('BEGIN:VALARM');
        lines.push('ACTION:DISPLAY');
        lines.push(`DESCRIPTION:${escapeIcsText(ev.judul)}`);
        lines.push(`TRIGGER:-PT${ev.pengingat_menit}M`);
        lines.push('END:VALARM');
      }

      lines.push('END:VEVENT');
    });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Triggers client-side .ics file download for a single event or entire calendar.
 */
export function downloadIcsFile(events: CalendarEventItem[], fileName: string): void {
  const content = buildIcsContent(events);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.ics') ? fileName : `${fileName}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Returns live subscription URLs for external calendar apps (Google Calendar, Apple Calendar, Outlook).
 */
export function getExternalCalendarSubscriptionUrls(): {
  httpFeedUrl: string;
  webcalUrl: string;
  googleSubscribeUrl: string;
} {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const httpFeedUrl = `${origin}/api/kalender/feed.ics`;
  const webcalUrl = httpFeedUrl.replace(/^https?:\/\//i, 'webcal://');
  const googleSubscribeUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;
  return { httpFeedUrl, webcalUrl, googleSubscribeUrl };
}
