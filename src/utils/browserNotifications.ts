import { PendaftaranPerangkatDesa } from '../types/ppdi';

export type BrowserNotificationPermissionState = NotificationPermission | 'unsupported';

export function isBrowserNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getBrowserNotificationPermission(): BrowserNotificationPermissionState {
  if (!isBrowserNotificationSupported()) {
    return 'unsupported';
  }
  try {
    return window.Notification.permission;
  } catch {
    return 'unsupported';
  }
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermissionState> {
  if (!isBrowserNotificationSupported()) {
    return 'unsupported';
  }
  try {
    if (window.Notification.permission === 'granted') {
      return 'granted';
    }
    const result = await window.Notification.requestPermission();
    return result;
  } catch {
    return getBrowserNotificationPermission();
  }
}

export interface SendRegistrationNotificationParams {
  newRegistrations: PendaftaranPerangkatDesa[];
  appName?: string;
  logoUrl?: string;
  desaNameMap?: Map<string, string>;
  kecamatanNameMap?: Map<string, string>;
  onClick?: () => void;
}

export function sendNewRegistrationBrowserNotification({
  newRegistrations,
  appName = 'PPDI Kabupaten Bandung',
  logoUrl = '/logo_kabupaten_bandung.svg',
  desaNameMap,
  kecamatanNameMap,
  onClick,
}: SendRegistrationNotificationParams): boolean {
  if (!isBrowserNotificationSupported() || newRegistrations.length === 0) {
    return false;
  }
  try {
    if (window.Notification.permission !== 'granted') {
      return false;
    }

    const first = newRegistrations[0];
    const cleanDesaId = String(first.id_desa || '').replace(/\./g, '');
    const cleanKecId = String(first.id_kecamatan || '').replace(/\./g, '');
    const desaName =
      desaNameMap?.get(first.id_desa) ||
      desaNameMap?.get(cleanDesaId) ||
      first.id_desa ||
      '-';
    const kecName =
      kecamatanNameMap?.get(first.id_kecamatan) ||
      kecamatanNameMap?.get(cleanKecId) ||
      first.id_kecamatan ||
      '-';

    const title =
      newRegistrations.length === 1
        ? `Pendaftaran Baru: ${first.nama_lengkap}`
        : `${newRegistrations.length} Pengajuan Pendaftaran Baru`;

    const body =
      newRegistrations.length === 1
        ? `NIK ${first.nik} • Desa ${desaName}, Kec. ${kecName}. Klik untuk verifikasi & approval.`
        : `${first.nama_lengkap} dan ${newRegistrations.length - 1} pendaftar lainnya menunggu verifikasi (${appName}).`;

    const tag =
      newRegistrations.length === 1
        ? `ppdi-reg-${first.id_pendaftaran}`
        : `ppdi-reg-batch-${newRegistrations.map((r) => r.id_pendaftaran).join('-')}`;

    const notif = new window.Notification(title, {
      body,
      icon: logoUrl || '/logo_kabupaten_bandung.svg',
      badge: logoUrl || '/logo_kabupaten_bandung.svg',
      tag,
    });

    notif.onclick = () => {
      try {
        window.focus();
        onClick?.();
        notif.close();
      } catch {
        // ignore focus errors in restricted frames
      }
    };

    return true;
  } catch (err) {
    console.warn('[Web Notifications] Gagal menampilkan notifikasi browser:', err);
    return false;
  }
}

export function sendTestBrowserNotification(
  appName = 'PPDI Kabupaten Bandung',
  logoUrl = '/logo_kabupaten_bandung.svg',
  onClick?: () => void
): boolean {
  if (!isBrowserNotificationSupported()) {
    return false;
  }
  try {
    if (window.Notification.permission !== 'granted') {
      return false;
    }
    const notif = new window.Notification(`Notifikasi Aktif — ${appName}`, {
      body: 'Anda akan menerima pemberitahuan langsung di perangkat ini saat ada pengajuan pendaftaran anggota baru.',
      icon: logoUrl || '/logo_kabupaten_bandung.svg',
      badge: logoUrl || '/logo_kabupaten_bandung.svg',
      tag: 'ppdi-reg-test',
    });
    notif.onclick = () => {
      try {
        window.focus();
        onClick?.();
        notif.close();
      } catch {
        // ignore
      }
    };
    return true;
  } catch {
    return false;
  }
}
