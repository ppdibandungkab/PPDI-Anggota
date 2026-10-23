import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import {
  Anggota,
  RiwayatJabatan,
  KeanggotaanPPDI,
  IuranAnggota,
  RefDesa,
  RefKecamatan,
  RefJabatan,
  UserAccount,
  AnggotaFullDetail,
  StatusAktifJabatan,
  StatusKTA,
  StatusVerifikasiIuran,
  PendaftaranPerangkatDesa,
  AppSettings,
  DbStatusInfo,
  DEFAULT_ROLE_PERMISSIONS,
} from '../types/ppdi';
import { REF_KECAMATAN, REF_DESA, REF_JABATAN } from '../data/bandungWilayah';
import {
  INITIAL_ANGGOTA,
  INITIAL_RIWAYAT_JABATAN,
  INITIAL_KEANGGOTAAN_PPDI,
  INITIAL_IURAN,
  INITIAL_USERS,
} from '../data/initialData';
import { buildFullMember, generateNextKTA, safeFetchJson, updateFaviconAndTitle } from '../utils/ppdiHelpers';

interface PPDIContextType {
  anggotaList: Anggota[];
  riwayatList: RiwayatJabatan[];
  keanggotaanList: KeanggotaanPPDI[];
  iuranList: IuranAnggota[];
  desaList: RefDesa[];
  kecamatanList: RefKecamatan[];
  jabatanList: RefJabatan[];
  users: UserAccount[];
  currentUser: UserAccount;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedKecamatanFilter: string;
  setSelectedKecamatanFilter: (kecId: string) => void;
  fullMembers: AnggotaFullDetail[];
  visibleMembers: AnggotaFullDetail[];
  
  // Pendaftaran (Formulir Induk) & Approval Workflow
  pendaftaranList: PendaftaranPerangkatDesa[];
  submitPendaftaran: (data: any) => Promise<{ success: boolean; message: string; id_pendaftaran?: number }>;
  approvePendaftaran: (id: number, noKtaCustom?: string) => Promise<{ success: boolean; message: string; id_anggota?: number; no_kta?: string }>;
  rejectPendaftaran: (id: number, catatan: string) => Promise<{ success: boolean; message: string }>;
  deletePendaftaran: (id: number) => Promise<{ success: boolean; message: string }>;
  
  // User Management (CRUD)
  createUser: (data: Partial<UserAccount> & { password?: string }) => Promise<{ success: boolean; message: string }>;
  updateUser: (id: number, data: Partial<UserAccount> & { password?: string }) => Promise<{ success: boolean; message: string }>;
  deleteUser: (id: number) => Promise<{ success: boolean; message: string }>;

  // App Settings (Logo, Login Background, Branding)
  appSettings: AppSettings;
  updateAppSettings: (newSettings: Partial<AppSettings>) => Promise<{ success: boolean; message: string }>;

  // Actions
  addAnggotaWithJobAndKta: (
    anggota: Omit<Anggota, 'id_anggota' | 'created_at' | 'updated_at'>,
    riwayat: {
      id_desa: string;
      id_jabatan: number;
      no_sk_pengangkatan: string;
      tgl_sk_pengangkatan: string;
      tmt_jabatan: string;
      file_sk?: string;
    },
    jabatanPengurus?: string
  ) => Promise<{ success: boolean; newId?: string; noKta: string }>;
  batchImportAnggota: (items: any[]) => Promise<{ success: boolean; insertedCount: number; skippedCount: number; skipped: any[]; message: string }>;
  updateAnggota: (id: string, updated: Partial<Anggota>) => Promise<void>;
  deleteAnggota: (id: string) => Promise<{ success: boolean; message: string }>;
  addRiwayatJabatan: (data: Omit<RiwayatJabatan, 'id_riwayat'>) => Promise<void>;
  updateRiwayatJabatan: (idRiwayat: string, updated: Partial<RiwayatJabatan>) => Promise<void>;
  deleteRiwayatJabatan: (idRiwayat: string) => Promise<void>;
  updateRiwayatStatus: (idRiwayat: string, newStatus: StatusAktifJabatan) => Promise<void>;
  updateKTAStatus: (idAnggota: string, newStatus: StatusKTA) => Promise<void>;
  addIuran: (data: Omit<IuranAnggota, 'id_iuran'>) => Promise<void>;
  verifyIuran: (idIuran: string, newStatus: StatusVerifikasiIuran) => Promise<void>;
  switchUser: (userId: number) => void;
  resetAllData: () => void;
  refreshDataFromMySQL: () => Promise<void>;
  isSyncing: boolean;
  
  // Authentication
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  
  // MySQL Database Status & Hosting Diagnostics
  dbStatus: DbStatusInfo | null;
  isCheckingDb: boolean;
  initialDbCheckDone: boolean;
  dbAlertVisible: boolean;
  setDbAlertVisible: (visible: boolean) => void;
  isDbModalOpen: boolean;
  setIsDbModalOpen: (open: boolean) => void;
  checkDbStatus: () => Promise<DbStatusInfo>;
  testCustomDbConnection: (config: { host?: string; port?: number; user?: string; password?: string; database?: string }) => Promise<any>;
  reconnectDb: (config?: any) => Promise<any>;
  saveDbEnvConfig: (config: any) => Promise<any>;
  initDbTables: () => Promise<{ success: boolean; message?: string }>;

  // Verification lookup
  findMemberByKtaOrNik: (query: string) => AnggotaFullDetail | null;
}

const PPDIContext = createContext<PPDIContextType | undefined>(undefined);

const STORAGE_KEYS = {
  ANGGOTA: 'ppdi_bandung_anggota_db_v3',
  RIWAYAT: 'ppdi_bandung_riwayat_db_v3',
  KEANGGOTAAN: 'ppdi_bandung_keanggotaan_db_v3',
  IURAN: 'ppdi_bandung_iuran_db_v3',
  CURRENT_USER_ID: 'ppdi_bandung_curr_user_v3',
  AUTH: 'ppdi_bandung_auth_v3',
  SETTINGS: 'ppdi_app_settings_v2',
};

const DEFAULT_SETTINGS: AppSettings = {
  appName: 'PPDI KABUPATEN BANDUNG',
  appSubtitle: 'SISTEM INFORMASI DATABASE & E-KTA PERANGKAT DESA',
  logoUrl: '',
  loginBackgroundType: 'preset_emerald',
  loginBackgroundImage: '',
  loginOverlayOpacity: '0.4',
  syncIntervalSeconds: 60,
  rolePermissions: DEFAULT_ROLE_PERMISSIONS,
};

export const PPDIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Bersihkan data dummy legacy dari localStorage
  useEffect(() => {
    try {
      [
        'ppdi_bandung_anggota_v1',
        'ppdi_bandung_riwayat_v1',
        'ppdi_bandung_keanggotaan_v1',
        'ppdi_bandung_iuran_v1',
      ].forEach((k) => localStorage.removeItem(k));
    } catch (_) {}
  }, []);

  const [anggotaList, setAnggotaList] = useState<Anggota[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.ANGGOTA);
    return saved ? JSON.parse(saved) : INITIAL_ANGGOTA;
  });

  const [riwayatList, setRiwayatList] = useState<RiwayatJabatan[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.RIWAYAT);
    return saved ? JSON.parse(saved) : INITIAL_RIWAYAT_JABATAN;
  });

  const [keanggotaanList, setKeanggotaanList] = useState<KeanggotaanPPDI[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.KEANGGOTAAN);
    return saved ? JSON.parse(saved) : INITIAL_KEANGGOTAAN_PPDI;
  });

  const [iuranList, setIuranList] = useState<IuranAnggota[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.IURAN);
    return saved ? JSON.parse(saved) : INITIAL_IURAN;
  });

  const [desaList, setDesaList] = useState<RefDesa[]>(REF_DESA);
  const [kecamatanList, setKecamatanList] = useState<RefKecamatan[]>(REF_KECAMATAN);
  const [jabatanList, setJabatanList] = useState<RefJabatan[]>(REF_JABATAN);

  const [userList, setUserList] = useState<UserAccount[]>(INITIAL_USERS);
  const [pendaftaranList, setPendaftaranList] = useState<PendaftaranPerangkatDesa[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          rolePermissions: parsed.rolePermissions && Object.keys(parsed.rolePermissions).length > 0
            ? parsed.rolePermissions
            : DEFAULT_ROLE_PERMISSIONS,
        };
      }
    } catch (_) {}
    return DEFAULT_SETTINGS;
  });

  const [currentUserId, setCurrentUserId] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID);
    return saved ? Number(saved) : 1;
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEYS.AUTH) === 'true';
  });

  const [dbStatus, setDbStatus] = useState<DbStatusInfo | null>({
    success: false,
    status: 'Memeriksa Koneksi Database...',
    host: '',
    database: '',
    user: '',
  });
  const [isCheckingDb, setIsCheckingDb] = useState<boolean>(true);
  const [initialDbCheckDone, setInitialDbCheckDone] = useState<boolean>(false);
  const [dbAlertVisible, setDbAlertVisible] = useState<boolean>(false);
  const [isDbModalOpen, setIsDbModalOpen] = useState<boolean>(false);

  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [selectedKecamatanFilter, setSelectedKecamatanFilter] = useState<string>('all');

  // Sync to localStorage as offline fallback
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ANGGOTA, JSON.stringify(anggotaList));
  }, [anggotaList]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.RIWAYAT, JSON.stringify(riwayatList));
  }, [riwayatList]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.KEANGGOTAAN, JSON.stringify(keanggotaanList));
  }, [keanggotaanList]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.IURAN, JSON.stringify(iuranList));
  }, [iuranList]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, String(currentUserId));
  }, [currentUserId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(appSettings));
  }, [appSettings]);

  // Dynamically update document title & favicon generated from uploaded logo
  useEffect(() => {
    const title = `${appSettings.appName || 'PPDI KAB. BANDUNG'}${
      appSettings.appSubtitle ? ` - ${appSettings.appSubtitle}` : ' - Portal Keanggotaan'
    }`;
    updateFaviconAndTitle(appSettings.logoUrl, title);
  }, [appSettings.logoUrl, appSettings.appName, appSettings.appSubtitle]);

  // Fetch full live data from remote MySQL database
  // Fetch full live data from remote MySQL database
  const refreshDataFromMySQL = async () => {
    setIsSyncing(true);
    try {
      const [refRes, angRes, iurRes, uRes, pendRes, setRes] = await Promise.allSettled([
        safeFetchJson('/api/ref/all'),
        safeFetchJson('/api/anggota'),
        safeFetchJson('/api/iuran'),
        safeFetchJson('/api/users'),
        safeFetchJson('/api/pendaftaran'),
        safeFetchJson('/api/settings'),
      ]);

      // 1. Process Master Wilayah & Jabatan
      if (refRes.status === 'fulfilled' && refRes.value.ok && refRes.value.data?.success) {
        if (Array.isArray(refRes.value.data.kecamatan)) setKecamatanList(refRes.value.data.kecamatan);
        if (Array.isArray(refRes.value.data.desa)) setDesaList(refRes.value.data.desa);
        if (Array.isArray(refRes.value.data.jabatan)) setJabatanList(refRes.value.data.jabatan);
      }

      // 2. Process Anggota, Riwayat, Keanggotaan
      if (angRes.status === 'fulfilled' && angRes.value.ok && angRes.value.data?.success) {
        const dbAnggota = (angRes.value.data.anggota || []).map((a: any) => ({
          ...a,
          id_anggota: String(a.id_anggota),
          nama_lengkap: (a.nama_lengkap || '').toUpperCase(),
        }));
        setAnggotaList(dbAnggota);

        const dbRiwayat = (angRes.value.data.riwayat || []).map((r: any) => ({
          ...r,
          id_riwayat: String(r.id_riwayat),
          id_anggota: String(r.id_anggota),
        }));
        setRiwayatList(dbRiwayat);

        const dbKeanggotaan = (angRes.value.data.keanggotaan || []).map((k: any) => ({
          ...k,
          id_ppdi: String(k.id_ppdi),
          id_anggota: String(k.id_anggota),
        }));
        setKeanggotaanList(dbKeanggotaan);
      }

      // 3. Process Iuran
      if (iurRes.status === 'fulfilled' && iurRes.value.ok && iurRes.value.data?.success) {
        const dbIuran = (iurRes.value.data.iuran || []).map((i: any) => ({
          ...i,
          id_iuran: String(i.id_iuran),
          id_anggota: String(i.id_anggota),
          jumlah: Number(i.jumlah),
        }));
        setIuranList(dbIuran);
      }

      // 4. Process Users
      if (uRes.status === 'fulfilled' && uRes.value.ok && uRes.value.data?.success && Array.isArray(uRes.value.data.users)) {
        setUserList(
          uRes.value.data.users.map((u: any) => ({
            ...u,
            nama: (u.nama || u.username).toUpperCase(),
          }))
        );
      }

      // 5. Process Pendaftaran Perangkat Desa
      if (pendRes.status === 'fulfilled' && pendRes.value.ok && pendRes.value.data?.success && Array.isArray(pendRes.value.data.pendaftaran)) {
        setPendaftaranList(
          pendRes.value.data.pendaftaran.map((p: any) => ({
            ...p,
            nama_lengkap: (p.nama_lengkap || '').toUpperCase(),
          }))
        );
      }

      // 6. Process Settings
      if (setRes.status === 'fulfilled' && setRes.value.ok && setRes.value.data?.success && setRes.value.data.settings) {
        const incoming = setRes.value.data.settings;
        setAppSettings((prev) => ({
          ...DEFAULT_SETTINGS,
          ...prev,
          ...incoming,
          rolePermissions:
            incoming.rolePermissions && Object.keys(incoming.rolePermissions).length > 0
              ? incoming.rolePermissions
              : prev.rolePermissions && Object.keys(prev.rolePermissions).length > 0
              ? prev.rolePermissions
              : DEFAULT_ROLE_PERMISSIONS,
        }));
      }
    } catch (err) {
      console.warn('Gagal memuat langsung dari MySQL, menggunakan cache lokal:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Cek status koneksi MySQL dan diagnosis hosting
  const checkDbStatus = async (): Promise<DbStatusInfo> => {
    setIsCheckingDb(true);
    try {
      const fetchRes = await safeFetchJson<DbStatusInfo>('/api/db/status');
      if (fetchRes.ok && fetchRes.data && fetchRes.data.success) {
        setDbStatus(fetchRes.data);
        return fetchRes.data;
      }

      // If server returned error or HTML fallback
      const errorDetail = fetchRes.data?.error || fetchRes.error || fetchRes.data?.status || 'Gagal tersambung';
      const isHtmlOr404 = (fetchRes.error && (fetchRes.error.includes('HTML') || fetchRes.error.includes('404') || fetchRes.error.includes('Endpoint API'))) || fetchRes.status === 404;
      const fallback: DbStatusInfo = {
        success: false,
        status: isHtmlOr404 ? 'Server Backend Node.js Belum Berjalan (404 / HTML)' : (fetchRes.data?.status || 'Koneksi Terputus / Timeout'),
        host: fetchRes.data?.host || '',
        port: fetchRes.data?.port || 3306,
        database: fetchRes.data?.database || '',
        user: fetchRes.data?.user || '',
        error: errorDetail,
        code: fetchRes.data?.code || (fetchRes.status === 0 ? 'NETWORK_ERROR' : `HTTP_${fetchRes.status}`),
        hint: isHtmlOr404
          ? 'Endpoint API tidak ditemukan (404). Server backend Node.js (server.js) belum dijalankan di port 3000.'
          : (fetchRes.data?.hint || 'Gagal menghubungi database MySQL pada port 3306.'),
        diagnosis: isHtmlOr404
          ? 'Setelah "npm run build", Anda perlu menjalankan server backend Express: Jalankan "npm start" (atau "node server.js") di terminal server lokal Anda, lalu buka http://localhost:3000 di browser.'
          : (fetchRes.data?.diagnosis || 'Koneksi ke port 3306 diblokir firewall hosting atau kredensial database salah.'),
        hostingTips: isHtmlOr404
          ? [
              'Jalankan di terminal: npm start (atau node server.js)',
              'Buka browser di http://localhost:3000 (jangan buka file dist secara langsung tanpa server.js)',
              'Jika menggunakan Apache/XAMPP: aktifkan proxy /api ke http://127.0.0.1:3000 di .htaccess',
              'Pastikan file .env berada di direktori yang sama dengan server.js',
            ]
          : (fetchRes.data?.hostingTips || [
              'Pastikan file .env ada di hosting bersama server.js',
              'Pastikan di cPanel "Setup Node.js App" status aplikasi adalah "RUNNING"',
              'Jika di cPanel yang sama, ubah DB_HOST menjadi localhost',
              'Buka cPanel > Remote MySQL dan izinkan IP hosting atau masukkan %',
            ]),
      };
      setDbStatus(fallback);
      setDbAlertVisible(true);
      return fallback;
    } catch (err: any) {
      const fallback: DbStatusInfo = {
        success: false,
        status: 'Koneksi Terputus / Timeout',
        host: '',
        port: 3306,
        database: '',
        user: '',
        error: err.message,
        code: 'NETWORK_ERROR',
        hint: 'Gagal menghubungi endpoint backend /api/db/status.',
        diagnosis: 'Koneksi ke server backend hosting gagal atau port 3306 diblokir firewall hosting.',
        hostingTips: [
          'Pastikan file .env ada di hosting bersama server.js',
          'Jika di cPanel yang sama, ubah DB_HOST menjadi localhost',
          'Buka cPanel > Remote MySQL dan izinkan IP hosting atau masukkan %',
        ],
      };
      setDbStatus(fallback);
      setDbAlertVisible(true);
      return fallback;
    } finally {
      setIsCheckingDb(false);
      setInitialDbCheckDone(true);
    }
  };

  const testCustomDbConnection = async (config: { host?: string; port?: number; user?: string; password?: string; database?: string }) => {
    try {
      const res = await safeFetchJson('/api/db/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      return res.data;
    } catch (err: any) {
      return { success: false, error: err.message, code: 'FETCH_ERROR' };
    }
  };

  const reconnectDb = async (config?: any) => {
    setIsCheckingDb(true);
    try {
      const res = await safeFetchJson('/api/db/reconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      await checkDbStatus();
      if (res.data?.success) {
        await refreshDataFromMySQL();
      }
      return res.data;
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      setIsCheckingDb(false);
    }
  };

  const saveDbEnvConfig = async (config: any) => {
    try {
      const res = await safeFetchJson('/api/db/save-env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.data?.success) {
        await checkDbStatus();
        await refreshDataFromMySQL();
      }
      return res.data;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const initDbTables = async () => {
    try {
      const res = await safeFetchJson('/api/db/init-tables', { method: 'POST' });
      if (res.data?.success) {
        await checkDbStatus();
        await refreshDataFromMySQL();
      }
      return res.data;
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  // TRIGGER CEK KONEKSI SAAT PERTAMA MEMBUKA WEBSITE
  useEffect(() => {
    let isMounted = true;

    const runStartupCheck = async () => {
      console.log('[PPDI] Memicu cek koneksi database MySQL saat pertama membuka website...');
      const statusRes = await checkDbStatus();
      if (isMounted) {
        if (statusRes && statusRes.success) {
          console.log('[PPDI] MySQL Berhasil Terkoneksi:', statusRes.database, statusRes.serverVersion);
          refreshDataFromMySQL();
        } else {
          console.warn('[PPDI] MySQL Belum Terkoneksi di Hosting:', statusRes?.error || statusRes?.status);
          setDbAlertVisible(true);
        }
      }
    };

    runStartupCheck();

    // Auto-sync periodic check setiap 60 detik
    const intervalId = setInterval(() => {
      checkDbStatus();
      refreshDataFromMySQL();
    }, 60000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  const currentUser = useMemo(() => {
    return userList.find((u) => u.id_user === currentUserId) || userList[0] || INITIAL_USERS[0];
  }, [userList, currentUserId]);

  // Adjust filter when switching user role
  useEffect(() => {
    if (currentUser.role === 'Admin_Kecamatan' && currentUser.id_kecamatan) {
      setSelectedKecamatanFilter(currentUser.id_kecamatan);
    } else if (currentUser.role === 'Superadmin_Kabupaten') {
      setSelectedKecamatanFilter('all');
    }
  }, [currentUser]);

  // Computed full details for all members
  const fullMembers = useMemo(() => {
    return anggotaList.map((ang) =>
      buildFullMember(
        ang,
        riwayatList,
        keanggotaanList,
        desaList,
        kecamatanList,
        jabatanList,
        iuranList
      )
    );
  }, [anggotaList, riwayatList, keanggotaanList, desaList, kecamatanList, jabatanList, iuranList]);

  // Filtered members based on role & active kecamatan selector
  const visibleMembers = useMemo(() => {
    if (currentUser.role === 'Anggota' && currentUser.id_anggota) {
      return fullMembers.filter((m) => m.anggota.id_anggota === currentUser.id_anggota);
    }
    if (currentUser.role === 'Admin_Kecamatan' && currentUser.id_kecamatan) {
      const cleanUserKec = currentUser.id_kecamatan.replace(/\./g, '');
      return fullMembers.filter(
        (m) =>
          (m.kecamatan?.id_kecamatan || '').replace(/\./g, '') === cleanUserKec ||
          (m.desa?.id_kecamatan || '').replace(/\./g, '') === cleanUserKec
      );
    }
    if (selectedKecamatanFilter !== 'all') {
      const cleanFilter = selectedKecamatanFilter.replace(/\./g, '');
      return fullMembers.filter(
        (m) =>
          (m.kecamatan?.id_kecamatan || '').replace(/\./g, '') === cleanFilter ||
          (m.desa?.id_kecamatan || '').replace(/\./g, '') === cleanFilter
      );
    }
    return fullMembers;
  }, [fullMembers, currentUser, selectedKecamatanFilter]);

  // Actions fully integrated with MySQL
  const addAnggotaWithJobAndKta = async (
    anggotaData: Omit<Anggota, 'id_anggota' | 'created_at' | 'updated_at'>,
    riwayatData: {
      id_desa: string;
      id_jabatan: number;
      no_sk_pengangkatan: string;
      tgl_sk_pengangkatan: string;
      tmt_jabatan: string;
      file_sk?: string;
    },
    jabatanPengurus: string = 'Anggota Biasa'
  ) => {
    const existing = anggotaList.find((a) => a.nik === anggotaData.nik);
    if (existing) {
      throw new Error(
        `NIK ${anggotaData.nik} sudah terdaftar atas nama "${existing.nama_lengkap}". NIK perangkat desa bersifat unik dan tidak boleh duplikat!`
      );
    }

    const tempId = `ang-${Date.now().toString().slice(-6)}`;
    const nowIso = new Date().toISOString();

    const cleanDesaId = String(riwayatData.id_desa || '').replace(/\./g, '');
    const targetDesa = desaList.find(
      (d) => d.id_desa === riwayatData.id_desa || d.id_desa.replace(/\./g, '') === cleanDesaId
    );
    const targetKecId = targetDesa?.id_kecamatan?.replace(/\./g, '') || (cleanDesaId ? cleanDesaId.slice(0, 6) : '320405');
    const autoKTA = generateNextKTA(targetKecId, cleanDesaId || riwayatData.id_desa, keanggotaanList);

    const newAnggota: Anggota = {
      ...anggotaData,
      nama_lengkap: anggotaData.nama_lengkap.trim().toUpperCase(),
      id_anggota: tempId,
      created_at: nowIso,
      updated_at: nowIso,
    };

    const newRiwayat: RiwayatJabatan = {
      id_riwayat: `rw-${Date.now().toString().slice(-6)}`,
      id_anggota: tempId,
      id_desa: targetDesa?.id_desa || cleanDesaId || riwayatData.id_desa,
      id_jabatan: riwayatData.id_jabatan,
      no_sk_pengangkatan: riwayatData.no_sk_pengangkatan,
      tgl_sk_pengangkatan: riwayatData.tgl_sk_pengangkatan,
      tmt_jabatan: riwayatData.tmt_jabatan,
      status_aktif: 'Aktif',
      file_sk: riwayatData.file_sk || `SK_${newAnggota.nama_lengkap.replace(/\s+/g, '_').toUpperCase()}.pdf`,
      keterangan: 'Pendaftaran Anggota Baru PPDI',
    };

    const newKeanggotaan: KeanggotaanPPDI = {
      id_ppdi: `ppdi-${Date.now().toString().slice(-6)}`,
      id_anggota: tempId,
      no_kta: autoKTA,
      tgl_bergabung: new Date().toISOString().split('T')[0],
      jabatan_pengurus: jabatanPengurus,
      status_kta: 'Aktif',
    };

    setAnggotaList((prev) => [newAnggota, ...prev]);
    setRiwayatList((prev) => [newRiwayat, ...prev]);
    setKeanggotaanList((prev) => [newKeanggotaan, ...prev]);

    try {
      const res = await safeFetchJson('/api/anggota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anggota: newAnggota,
          riwayat: newRiwayat,
          keanggotaan: newKeanggotaan,
        }),
      });

      const json = res.data;
      if (!res.ok || json.success === false) {
        setAnggotaList((prev) => prev.filter((a) => a.id_anggota !== tempId));
        setRiwayatList((prev) => prev.filter((r) => r.id_anggota !== tempId));
        setKeanggotaanList((prev) => prev.filter((k) => k.id_anggota !== tempId));
        throw new Error(json.message || res.error || 'Gagal menyimpan ke database MySQL');
      }

      await refreshDataFromMySQL();
      return {
        success: true,
        newId: json.id_anggota ? String(json.id_anggota) : tempId,
        noKta: autoKTA,
      };
    } catch (err: any) {
      console.warn('MySQL save error:', err);
      throw err;
    }
  };

  const batchImportAnggota = async (items: any[]) => {
    try {
      const res = await safeFetchJson('/api/anggota/batch-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const json = res.data;
      if (!res.ok || json.success === false) {
        throw new Error(json.message || json.error || res.error || 'Gagal mengimpor data ke server');
      }
      await refreshDataFromMySQL();
      return json;
    } catch (err: any) {
      console.error('Batch import error:', err);
      throw err;
    }
  };

  const updateAnggota = async (id: string, updated: Partial<Anggota>) => {
    const formattedUpdated: Partial<Anggota> = { ...updated };
    if (updated.nama_lengkap) {
      formattedUpdated.nama_lengkap = updated.nama_lengkap.trim().toUpperCase();
    }
    setAnggotaList((prev) =>
      prev.map((item) => (item.id_anggota === id ? { ...item, ...formattedUpdated, updated_at: new Date().toISOString() } : item))
    );

    try {
      const res = await safeFetchJson(`/api/anggota/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formattedUpdated),
      });
      const json = res.data;
      if (!res.ok || json.success === false) {
        throw new Error(json.message || res.error || 'Gagal memperbarui data di MySQL');
      }
      await refreshDataFromMySQL();
    } catch (err: any) {
      console.warn('MySQL update error, keeping state updated:', err);
      throw err;
    }
  };

  const deleteAnggota = async (id: string) => {
    const target = anggotaList.find((item) => item.id_anggota === id);
    const targetNama = target ? target.nama_lengkap.toUpperCase() : 'Perangkat Desa';
    const targetNik = target?.nik;

    setAnggotaList((prev) => prev.filter((item) => item.id_anggota !== id && (!targetNik || item.nik !== targetNik)));
    setRiwayatList((prev) => prev.filter((item) => item.id_anggota !== id));
    setKeanggotaanList((prev) => prev.filter((item) => item.id_anggota !== id));
    setIuranList((prev) => prev.filter((item) => item.id_anggota !== id));

    try {
      const res = await safeFetchJson(`/api/anggota/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = res.data;
      await refreshDataFromMySQL();
      return {
        success: true,
        message: json.message || `Data anggota "${targetNama}" berhasil dihapus dari database.`,
      };
    } catch (err: any) {
      return {
        success: true,
        message: `Data anggota "${targetNama}" berhasil dihapus.`,
      };
    }
  };

  const addRiwayatJabatan = async (data: Omit<RiwayatJabatan, 'id_riwayat'>) => {
    const newRw: RiwayatJabatan = {
      ...data,
      id_riwayat: `rw-${Date.now().toString().slice(-6)}`,
    };
    setRiwayatList((prev) => [newRw, ...prev]);

    try {
      await safeFetchJson('/api/riwayat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      await refreshDataFromMySQL();
    } catch (err) {
      console.warn('MySQL riwayat save error:', err);
    }
  };

  const updateRiwayatJabatan = async (idRiwayat: string, updated: Partial<RiwayatJabatan>) => {
    setRiwayatList((prev) =>
      prev.map((r) => (r.id_riwayat === idRiwayat ? { ...r, ...updated } : r))
    );

    try {
      await safeFetchJson(`/api/riwayat/${idRiwayat}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      await refreshDataFromMySQL();
    } catch (err) {
      console.warn('MySQL riwayat update error:', err);
    }
  };

  const deleteRiwayatJabatan = async (idRiwayat: string) => {
    setRiwayatList((prev) => prev.filter((r) => r.id_riwayat !== idRiwayat));
    try {
      await safeFetchJson(`/api/riwayat/${idRiwayat}`, { method: 'DELETE' });
      await refreshDataFromMySQL();
    } catch (err) {
      console.warn('MySQL riwayat delete error:', err);
    }
  };

  const updateRiwayatStatus = async (idRiwayat: string, newStatus: StatusAktifJabatan) => {
    setRiwayatList((prev) =>
      prev.map((r) => (r.id_riwayat === idRiwayat ? { ...r, status_aktif: newStatus } : r))
    );

    try {
      await safeFetchJson(`/api/riwayat/${idRiwayat}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_aktif: newStatus }),
      });
      await refreshDataFromMySQL();
    } catch (err) {
      console.warn('MySQL status update error:', err);
    }
  };

  const updateKTAStatus = async (idAnggota: string, newStatus: StatusKTA) => {
    setKeanggotaanList((prev) =>
      prev.map((k) => (k.id_anggota === idAnggota ? { ...k, status_kta: newStatus } : k))
    );

    try {
      await safeFetchJson(`/api/kta/${idAnggota}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_kta: newStatus }),
      });
      await refreshDataFromMySQL();
    } catch (err) {
      console.warn('MySQL KTA status update error:', err);
    }
  };

  const addIuran = async (data: Omit<IuranAnggota, 'id_iuran'>) => {
    const newIuran: IuranAnggota = {
      ...data,
      id_iuran: `iur-${Date.now().toString().slice(-6)}`,
    };
    setIuranList((prev) => [newIuran, ...prev]);

    try {
      await safeFetchJson('/api/iuran', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      await refreshDataFromMySQL();
    } catch (err) {
      console.warn('MySQL iuran error:', err);
    }
  };

  const verifyIuran = async (idIuran: string, newStatus: StatusVerifikasiIuran) => {
    setIuranList((prev) =>
      prev.map((i) => (i.id_iuran === idIuran ? { ...i, status_verifikasi: newStatus } : i))
    );

    try {
      await safeFetchJson(`/api/iuran/${idIuran}/verify`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_verifikasi: newStatus }),
      });
      await refreshDataFromMySQL();
    } catch (err) {
      console.warn('MySQL iuran verify error:', err);
    }
  };

  // User Management Actions
  const createUser = async (data: Partial<UserAccount> & { password?: string }) => {
    const res = await safeFetchJson('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = res.data;
    if (!res.ok || json.success === false) {
      throw new Error(json.message || res.error || 'Gagal menambahkan akun pengguna');
    }
    const newId = json.id_user || Date.now();
    const newUser: UserAccount = {
      id_user: newId,
      username: data.username || '',
      email: data.email || '',
      nama: data.nama || data.username || '',
      password: data.password || 'admin',
      role: data.role || 'Admin_Kecamatan',
      id_kecamatan: data.id_kecamatan,
      id_desa: data.id_desa,
    };
    setUserList((prev) => [...prev, newUser]);
    await refreshDataFromMySQL();
    return json;
  };

  const updateUser = async (id: number, data: Partial<UserAccount> & { password?: string }) => {
    const res = await safeFetchJson(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = res.data;
    if (!res.ok || json.success === false) {
      throw new Error(json.message || res.error || 'Gagal memperbarui akun pengguna');
    }
    setUserList((prev) =>
      prev.map((u) => {
        if (u.id_user === id) {
          return {
            ...u,
            ...data,
            password: data.password ? data.password : u.password,
          };
        }
        return u;
      })
    );
    await refreshDataFromMySQL();
    return json;
  };

  const deleteUser = async (id: number) => {
    const res = await safeFetchJson(`/api/users/${id}`, { method: 'DELETE' });
    const json = res.data;
    if (!res.ok || json.success === false) {
      throw new Error(json.message || res.error || 'Gagal menghapus akun pengguna');
    }
    await refreshDataFromMySQL();
    return json;
  };

  // Pendaftaran (Formulir Induk) & Approval Actions
  const submitPendaftaran = async (data: any) => {
    const res = await safeFetchJson('/api/pendaftaran', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        nama_lengkap: (data.nama_lengkap || '').toUpperCase(),
      }),
    });
    const json = res.data;
    if (!res.ok || json.success === false) {
      throw new Error(json.message || res.error || 'Gagal mengirim formulir pendaftaran');
    }
    await refreshDataFromMySQL();
    return json;
  };

  const approvePendaftaran = async (id: number, noKtaCustom?: string) => {
    const res = await safeFetchJson(`/api/pendaftaran/${id}/approve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approved_by: currentUser.nama,
        no_kta_custom: noKtaCustom,
      }),
    });
    const json = res.data;
    if (!res.ok || json.success === false) {
      throw new Error(json.message || res.error || 'Gagal menyetujui pendaftaran');
    }
    await refreshDataFromMySQL();
    return json;
  };

  const rejectPendaftaran = async (id: number, catatan: string) => {
    const res = await safeFetchJson(`/api/pendaftaran/${id}/reject`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        catatan_approval: catatan,
        approved_by: currentUser.nama,
      }),
    });
    const json = res.data;
    if (!res.ok || json.success === false) {
      throw new Error(json.message || res.error || 'Gagal menolak pendaftaran');
    }
    await refreshDataFromMySQL();
    return json;
  };

  const deletePendaftaran = async (id: number) => {
    const res = await safeFetchJson(`/api/pendaftaran/${id}`, { method: 'DELETE' });
    await refreshDataFromMySQL();
    return res.data;
  };

  // App Settings Action
  const updateAppSettings = async (newSettings: Partial<AppSettings>) => {
    const merged = { ...appSettings, ...newSettings };
    setAppSettings(merged);
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(merged));
    try {
      const res = await safeFetchJson('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });
      return res.data;
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  const switchUser = (userId: number) => {
    setCurrentUserId(userId);
  };

  const login = async (username: string, password: string) => {
    const cleanUser = username.trim();
    const cleanPass = password.trim();

    if (!cleanUser || !cleanPass) {
      return { success: false, message: 'Username dan password wajib diisi!' };
    }

    try {
      const res = await safeFetchJson('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUser, password: cleanPass }),
      });
      const data = res.data;

      // 1. Sukses terautentikasi dari server backend
      if (res.ok && data?.success && data.user) {
        setIsAuthenticated(true);
        localStorage.setItem(STORAGE_KEYS.AUTH, 'true');
        setCurrentUserId(data.user.id_user);
        setActiveTab('dashboard');
        await refreshDataFromMySQL();
        return { success: true };
      }

      // 2. Kredensial ditolak oleh backend (401 atau success: false)
      if (res.status === 401 || (data && data.success === false)) {
        return {
          success: false,
          message: data?.message || 'Password yang Anda masukkan salah. Silakan periksa kembali.',
        };
      }

      // 3. Error respons backend lainnya (400, 403, 500, dll.)
      if (!res.ok) {
        return {
          success: false,
          message: data?.message || res.error || 'Autentikasi gagal. Silakan periksa kembali username dan password.',
        };
      }

      return { success: false, message: 'Autentikasi gagal. Kredensial tidak valid.' };
    } catch (err: any) {
      // 4. Offline Fallback HANYA jika server backend tidak dapat dihubungi sama sekali (network error):
      // Wajib memvalidasi password secara ketat terhadap user yang tersimpan!
      const cleanLower = cleanUser.toLowerCase();
      const matched = userList.find(
        (u) => u.username.toLowerCase() === cleanLower || u.email.toLowerCase() === cleanLower
      );

      if (matched) {
        // Validasi password ketat di mode offline
        const storedPass = matched.password || 'admin';
        if (cleanPass === storedPass) {
          setIsAuthenticated(true);
          localStorage.setItem(STORAGE_KEYS.AUTH, 'true');
          setCurrentUserId(matched.id_user);
          setActiveTab('dashboard');
          return { success: true };
        } else {
          return {
            success: false,
            message: 'Password yang Anda masukkan salah. Silakan periksa kembali.',
          };
        }
      }

      return {
        success: false,
        message: 'Pengguna tidak ditemukan atau kredensial tidak valid.',
      };
    }
  };

  const logout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem(STORAGE_KEYS.AUTH);
    setActiveTab('dashboard');
  };

  const resetAllData = () => {
    setAnggotaList([]);
    setRiwayatList([]);
    setKeanggotaanList([]);
    setIuranList([]);
    setCurrentUserId(1);
    setSelectedKecamatanFilter('all');
    localStorage.removeItem(STORAGE_KEYS.ANGGOTA);
    localStorage.removeItem(STORAGE_KEYS.RIWAYAT);
    localStorage.removeItem(STORAGE_KEYS.KEANGGOTAAN);
    localStorage.removeItem(STORAGE_KEYS.IURAN);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
    refreshDataFromMySQL();
  };

  const findMemberByKtaOrNik = (query: string): AnggotaFullDetail | null => {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return null;
    return (
      fullMembers.find(
        (m) =>
          m.anggota.nik.toLowerCase() === cleanQuery ||
          (m.keanggotaan?.no_kta && m.keanggotaan.no_kta.toLowerCase() === cleanQuery) ||
          m.anggota.nama_lengkap.toLowerCase().includes(cleanQuery)
      ) || null
    );
  };

  return (
    <PPDIContext.Provider
      value={{
        anggotaList,
        riwayatList,
        keanggotaanList,
        iuranList,
        desaList,
        kecamatanList,
        jabatanList,
        users: userList,
        currentUser,
        activeTab,
        setActiveTab,
        selectedKecamatanFilter,
        setSelectedKecamatanFilter,
        fullMembers,
        visibleMembers,
        pendaftaranList,
        submitPendaftaran,
        approvePendaftaran,
        rejectPendaftaran,
        deletePendaftaran,
        createUser,
        updateUser,
        deleteUser,
        appSettings,
        updateAppSettings,
        addAnggotaWithJobAndKta,
        batchImportAnggota,
        updateAnggota,
        deleteAnggota,
        addRiwayatJabatan,
        updateRiwayatJabatan,
        deleteRiwayatJabatan,
        updateRiwayatStatus,
        updateKTAStatus,
        addIuran,
        verifyIuran,
        switchUser,
        resetAllData,
        refreshDataFromMySQL,
        isSyncing,
        findMemberByKtaOrNik,
        isAuthenticated,
        login,
        logout,
        dbStatus,
        isCheckingDb,
        initialDbCheckDone,
        dbAlertVisible,
        setDbAlertVisible,
        isDbModalOpen,
        setIsDbModalOpen,
        checkDbStatus,
        testCustomDbConnection,
        reconnectDb,
        saveDbEnvConfig,
        initDbTables,
      }}
    >
      {children}
    </PPDIContext.Provider>
  );
};

export const usePPDI = () => {
  const context = useContext(PPDIContext);
  if (!context) {
    throw new Error('usePPDI must be used within a PPDIProvider');
  }
  return context;
};
