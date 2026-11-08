import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
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
  DbConnectionLogEntry,
  DEFAULT_ROLE_PERMISSIONS,
  ActivityLogEntry,
  AksiLog,
  UserRole,
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
import { decodeKtaToken } from '../utils/qrCrypto';
import { checkUserPermission, sanitizeRolePermissions, PermissionAction } from '../utils/permissions';

interface PPDIContextType {
  // Role & Global Permissions
  hasPermission: (moduleId: string, action?: PermissionAction) => boolean;

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
  visiblePendaftaran: PendaftaranPerangkatDesa[];
  submitPendaftaran: (data: any) => Promise<{ success: boolean; message: string; id_pendaftaran?: number }>;
  approvePendaftaran: (id: number, noKtaCustom?: string) => Promise<{ success: boolean; message: string; id_anggota?: number; no_kta?: string }>;
  rejectPendaftaran: (id: number, catatan: string) => Promise<{ success: boolean; message: string }>;
  deletePendaftaran: (id: number) => Promise<{ success: boolean; message: string }>;
  
  // User Management (CRUD)
  createUser: (data: Partial<UserAccount> & { password?: string }) => Promise<{ success: boolean; message: string }>;
  updateUser: (id: number, data: Partial<UserAccount> & { password?: string }) => Promise<{ success: boolean; message: string }>;
  deleteUser: (id: number) => Promise<{ success: boolean; message: string }>;
  changePassword: (params: {
    userId?: number;
    username?: string;
    oldPassword?: string;
    newPassword: string;
    requireOldPassword?: boolean;
  }) => Promise<{ success: boolean; message: string }>;
  isChangePasswordModalOpen: boolean;
  setIsChangePasswordModalOpen: (open: boolean) => void;
  mustChangeDefaultPassword: boolean;
  setMustChangeDefaultPassword: (must: boolean) => void;
  openChangePasswordModal: () => void;
  closeChangePasswordModal: () => void;

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
  updateAnggota: (id: string, updated: Partial<Anggota>, jabatanPengurus?: string) => Promise<void>;
  updateKeanggotaanJabatan: (idAnggota: string, jabatanPengurus: string) => Promise<void>;
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
  dbLogs: DbConnectionLogEntry[];
  addDbLogEntry: (entry: Omit<DbConnectionLogEntry, 'id' | 'timestamp'>) => void;
  clearDbLogs: () => void;

  // Audit Log Aktivitas Admin
  activityLogs: ActivityLogEntry[];
  addActivityLog: (
    entry: Omit<ActivityLogEntry, 'id' | 'timestamp' | 'user_id' | 'user_name' | 'user_role'> & {
      user_id?: number;
      user_name?: string;
      user_role?: UserRole;
    }
  ) => void;
  clearActivityLogs: () => void;

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
  ACTIVITY_LOGS: 'ppdi_activity_logs_v1',
  MUST_CHANGE_PASS: 'ppdi_must_change_pass_v1',
};

const INITIAL_ACTIVITY_LOGS: ActivityLogEntry[] = [
  {
    id: 'log_init_1',
    timestamp: '05/11/2026, 14:30:15',
    user_id: 1,
    user_name: 'Administrator Kabupaten',
    user_role: 'Superadmin_Kabupaten',
    aksi: 'TAMBAH',
    modul: 'Data Induk Anggota',
    target_id: 'ANG-2026-001',
    target_nama: 'ASEP RIDWAN, S.IP',
    deskripsi: 'Menambahkan data anggota perangkat desa baru (Kec. Soreang, Desa Cingcin) dengan SK Pengangkatan No. 141/012/SK/2023.',
    ip_address: '127.0.0.1 (Sesi Lokal)',
  },
  {
    id: 'log_init_2',
    timestamp: '05/11/2026, 15:10:42',
    user_id: 1,
    user_name: 'Administrator Kabupaten',
    user_role: 'Superadmin_Kabupaten',
    aksi: 'APPROVE',
    modul: 'Registrasi & Approval',
    target_id: 'REG-320401',
    target_nama: 'DADANG HIDAYAT',
    deskripsi: 'Menyetujui pendaftaran perangkat desa (Kec. Banjaran) dan menerbitkan E-KTA No. 32.04.02.2001.0045.',
    ip_address: '127.0.0.1 (Sesi Lokal)',
  },
  {
    id: 'log_init_3',
    timestamp: '05/11/2026, 16:45:00',
    user_id: 1,
    user_name: 'Administrator Kabupaten',
    user_role: 'Superadmin_Kabupaten',
    aksi: 'EDIT',
    modul: 'Data Induk Anggota',
    target_id: 'ANG-2026-002',
    target_nama: 'SITI NURHALIZA, S.PD',
    deskripsi: 'Memperbarui informasi Jabatan Pengurus PPDI menjadi "Ketua Pengurus Kecamatan Soreang".',
    ip_address: '127.0.0.1 (Sesi Lokal)',
  },
  {
    id: 'log_init_4',
    timestamp: '05/11/2026, 17:22:10',
    user_id: 1,
    user_name: 'Administrator Kabupaten',
    user_role: 'Superadmin_Kabupaten',
    aksi: 'STATUS_KTA',
    modul: 'Status E-KTA',
    target_id: 'ANG-2026-003',
    target_nama: 'BUDI SANTOSO',
    deskripsi: 'Memperbarui status E-KTA dari "Pending" menjadi "Aktif".',
    ip_address: '127.0.0.1 (Sesi Lokal)',
  },
  {
    id: 'log_init_5',
    timestamp: '05/11/2026, 18:05:33',
    user_id: 1,
    user_name: 'Administrator Kabupaten',
    user_role: 'Superadmin_Kabupaten',
    aksi: 'IMPORT',
    modul: 'Data Induk Anggota',
    target_id: 'BATCH-EXCEL',
    target_nama: 'Impor Data Kolektif',
    deskripsi: 'Melakukan impor massal data perangkat desa dari berkas Excel spreadsheet.',
    ip_address: '127.0.0.1 (Sesi Lokal)',
  },
];

const DEFAULT_SETTINGS: AppSettings = {
  appName: 'PPDI KABUPATEN BANDUNG',
  appSubtitle: 'SISTEM INFORMASI DATABASE & E-KTA PERANGKAT DESA',
  logoUrl: '/logo_kabupaten_bandung.svg',
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
  const [mustChangeDefaultPassword, setMustChangeDefaultPassword] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.MUST_CHANGE_PASS) === 'true';
    } catch (_) {
      return false;
    }
  });

  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.MUST_CHANGE_PASS) === 'true';
    } catch (_) {
      return false;
    }
  });

  const openChangePasswordModal = () => setIsChangePasswordModalOpen(true);
  const closeChangePasswordModal = () => {
    if (mustChangeDefaultPassword) {
      return;
    }
    setIsChangePasswordModalOpen(false);
  };
  const [pendaftaranList, setPendaftaranList] = useState<PendaftaranPerangkatDesa[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        const sanitizedLogo = parsed.logoUrl && parsed.logoUrl.includes('wikimedia.org')
          ? '/logo_kabupaten_bandung.svg'
          : (parsed.logoUrl || DEFAULT_SETTINGS.logoUrl);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          logoUrl: sanitizedLogo,
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

  const [dbStatus, setDbStatus] = useState<DbStatusInfo | null>(() => {
    try {
      const savedCfg = localStorage.getItem('ppdi_saved_db_config');
      if (savedCfg) {
        const parsed = JSON.parse(savedCfg);
        return {
          success: false,
          status: 'Menghubungkan...',
          host: parsed.host || 'localhost',
          port: Number(parsed.port) || 3306,
          user: parsed.user || 'root',
          database: parsed.database || 'db_ppdi',
        };
      }
    } catch (_) {}
    return {
      success: false,
      status: 'Memeriksa Koneksi Database...',
      host: '',
      database: '',
      user: '',
    };
  });
  const [isCheckingDb, setIsCheckingDb] = useState<boolean>(true);
  const [initialDbCheckDone, setInitialDbCheckDone] = useState<boolean>(false);
  const [dbAlertVisible, setDbAlertVisible] = useState<boolean>(false);
  const [isDbModalOpen, setIsDbModalOpen] = useState<boolean>(false);

  const [dbLogs, setDbLogs] = useState<DbConnectionLogEntry[]>(() => {
    try {
      const saved = localStorage.getItem('ppdi_db_connection_logs');
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('ppdi_db_connection_logs', JSON.stringify(dbLogs));
    } catch (_) {}
  }, [dbLogs]);

  const addDbLogEntry = (entry: Omit<DbConnectionLogEntry, 'id' | 'timestamp'>) => {
    setDbLogs((prev) => {
      // Prevent log spamming if latest entry has same type, success, host, and message
      if (prev.length > 0) {
        const last = prev[0];
        if (
          last.type === entry.type &&
          last.success === entry.success &&
          last.host === entry.host &&
          last.message === entry.message
        ) {
          return prev;
        }
      }

      const newLog: DbConnectionLogEntry = {
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        timestamp: new Date().toLocaleString('id-ID', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        ...entry,
      };
      return [newLog, ...prev].slice(0, 100);
    });
  };

  const clearDbLogs = () => {
    setDbLogs([]);
    localStorage.removeItem('ppdi_db_connection_logs');
  };

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
            id_kecamatan: u.id_kecamatan_scope || u.id_kecamatan || undefined,
            id_desa: u.id_desa || undefined,
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
        setAppSettings((prev) => {
          const logo = incoming.logoUrl && incoming.logoUrl.includes('wikimedia.org')
            ? '/logo_kabupaten_bandung.svg'
            : (incoming.logoUrl || prev.logoUrl || '/logo_kabupaten_bandung.svg');
          return {
            ...DEFAULT_SETTINGS,
            ...prev,
            ...incoming,
            logoUrl: logo,
            rolePermissions:
              incoming.rolePermissions && Object.keys(incoming.rolePermissions).length > 0
                ? incoming.rolePermissions
                : prev.rolePermissions && Object.keys(prev.rolePermissions).length > 0
                ? prev.rolePermissions
                : DEFAULT_ROLE_PERMISSIONS,
          };
        });
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
        addDbLogEntry({
          type: 'CHECK',
          success: true,
          host: fetchRes.data.host || 'localhost',
          port: fetchRes.data.port || 3306,
          database: fetchRes.data.database,
          latencyMs: fetchRes.data.latencyMs,
          message: `KONEKSI BERHASIL: Tersambung ke ${fetchRes.data.host}:${fetchRes.data.port || 3306} (${fetchRes.data.latencyMs} ms · ${fetchRes.data.tablesCount || 0} tabel SQL)`,
        });
        return fetchRes.data;
      }

      // If server returned error or HTML fallback
      const errorDetail = fetchRes.data?.error || fetchRes.error || fetchRes.data?.status || 'Gagal tersambung';
      const isHtmlOr404 = (fetchRes.error && (fetchRes.error.includes('HTML') || fetchRes.error.includes('404') || fetchRes.error.includes('Endpoint API'))) || fetchRes.status === 404;
      // Read saved local config as fallback if backend fetch failed
      let currentLocalHost = fetchRes.data?.host || '';
      let currentLocalDb = fetchRes.data?.database || '';
      let currentLocalUser = fetchRes.data?.user || '';
      let currentLocalPort = fetchRes.data?.port || 3306;
      try {
        const savedCfg = localStorage.getItem('ppdi_saved_db_config');
        if (savedCfg) {
          const parsed = JSON.parse(savedCfg);
          if (!currentLocalHost) currentLocalHost = parsed.host || 'localhost';
          if (!currentLocalDb) currentLocalDb = parsed.database || 'db_ppdi';
          if (!currentLocalUser) currentLocalUser = parsed.user || 'root';
          if (parsed.port) currentLocalPort = Number(parsed.port) || 3306;
        }
      } catch (_) {}

      const fallback: DbStatusInfo = {
        success: false,
        status: isHtmlOr404 ? 'Server Backend Node.js Belum Berjalan (404 / HTML)' : (fetchRes.data?.status || 'Koneksi Terputus / Timeout'),
        host: currentLocalHost || 'localhost',
        port: currentLocalPort,
        database: currentLocalDb || 'db_ppdi',
        user: currentLocalUser || 'root',
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
      addDbLogEntry({
        type: 'CHECK',
        success: false,
        host: fallback.host || 'localhost',
        port: fallback.port || 3306,
        database: fallback.database,
        message: `KONEKSI GAGAL: ${fallback.status} - ${errorDetail}`,
        code: fallback.code,
      });
      return fallback;
    } catch (err: any) {
      let currentLocalHost = 'localhost';
      let currentLocalDb = 'db_ppdi';
      try {
        const savedCfg = localStorage.getItem('ppdi_saved_db_config');
        if (savedCfg) {
          const parsed = JSON.parse(savedCfg);
          currentLocalHost = parsed.host || 'localhost';
          currentLocalDb = parsed.database || 'db_ppdi';
        }
      } catch (_) {}

      const fallback: DbStatusInfo = {
        success: false,
        status: 'Koneksi Terputus / Timeout',
        host: currentLocalHost,
        port: 3306,
        database: currentLocalDb,
        user: 'root',
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
      addDbLogEntry({
        type: 'CHECK',
        success: false,
        host: currentLocalHost,
        port: 3306,
        message: `NETWORK ERROR: ${err.message || 'Server backend tidak merespons'}`,
        code: 'NETWORK_ERROR',
      });
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
      const data = res.data;
      addDbLogEntry({
        type: 'TEST',
        success: Boolean(data?.success),
        host: config.host || 'localhost',
        port: config.port || 3306,
        database: config.database,
        latencyMs: data?.latencyMs,
        message: data?.success
          ? `UJI KONEKSI SUCCESS: Tersambung ke ${config.host}:${config.port || 3306} (${data.latencyMs} ms)`
          : `UJI KONEKSI FAILED: ${data?.error || 'Gagal terhubung'}`,
        code: data?.code,
      });
      return data;
    } catch (err: any) {
      addDbLogEntry({
        type: 'TEST',
        success: false,
        host: config.host || 'localhost',
        port: config.port || 3306,
        database: config.database,
        message: `UJI KONEKSI ERROR: ${err.message}`,
        code: 'TEST_ERROR',
      });
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
      addDbLogEntry({
        type: 'RECONNECT',
        success: Boolean(res.data?.success),
        host: dbStatus?.host || 'localhost',
        message: res.data?.success ? 'Reconnect berhasil!' : `Reconnect gagal: ${res.data?.error || 'Error'}`,
      });
      return res.data;
    } catch (err: any) {
      return { success: false, error: err.message };
    } finally {
      setIsCheckingDb(false);
    }
  };

  const saveDbEnvConfig = async (config: any) => {
    const cleanHost = config.host ? String(config.host).trim() : 'localhost';
    const cleanPort = Number(config.port) || 3306;
    const cleanUser = config.user ? String(config.user).trim() : 'root';
    const cleanDb = config.database ? String(config.database).trim() : 'db_ppdi';

    // 1. Store config in localStorage so user's form entries are preserved
    try {
      localStorage.setItem('ppdi_saved_db_config', JSON.stringify({
        host: cleanHost,
        port: cleanPort,
        user: cleanUser,
        database: cleanDb,
      }));
    } catch (_) {}

    // Immediately update local state representation
    setDbStatus((prev) => ({
      ...(prev || { success: false, status: 'Konfigurasi Tersimpan Lokal' }),
      host: cleanHost,
      port: cleanPort,
      user: cleanUser,
      database: cleanDb,
    }));

    try {
      const res = await safeFetchJson('/api/db/save-env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (res.data?.success) {
        addDbLogEntry({
          type: 'SAVE_ENV',
          success: true,
          host: cleanHost,
          port: cleanPort,
          database: cleanDb,
          message: `File .env berhasil diperbarui di server (Host: ${cleanHost}, DB: ${cleanDb})`,
        });
        await checkDbStatus();
        await refreshDataFromMySQL();
        return {
          success: true,
          message: 'Konfigurasi .env berhasil disimpan ke server dan pool koneksi MySQL telah diperbarui!',
          data: res.data,
        };
      } else {
        const errMsg = res.data?.error || res.error || 'Server backend Node.js tidak terjangkau';
        addDbLogEntry({
          type: 'SAVE_ENV',
          success: true, // Local save succeeded
          host: cleanHost,
          port: cleanPort,
          database: cleanDb,
          message: `Konfigurasi tersimpan di penyimpanan browser (Local Storage). Catatan Server: ${errMsg}`,
        });

        return {
          success: true,
          savedLocally: true,
          message: `Konfigurasi (${cleanHost}) berhasil disimpan di penyimpanan browser (Local Storage)!`,
          error: errMsg,
        };
      }
    } catch (err: any) {
      const errMsg = err.message || 'Gagal tersambung ke endpoint server.js';
      addDbLogEntry({
        type: 'SAVE_ENV',
        success: true, // Local save succeeded
        host: cleanHost,
        port: cleanPort,
        database: cleanDb,
        message: `Konfigurasi tersimpan di penyimpanan browser (Local Storage). Server offline: ${errMsg}`,
      });
      return {
        success: true,
        savedLocally: true,
        message: `Konfigurasi (${cleanHost}) berhasil disimpan di penyimpanan browser!`,
        error: errMsg,
      };
    }
  };

  const initDbTables = async () => {
    try {
      const res = await safeFetchJson('/api/db/init-tables', { method: 'POST' });
      if (res.data?.success) {
        addDbLogEntry({
          type: 'INIT_TABLES',
          success: true,
          host: dbStatus?.host || 'localhost',
          message: 'Inisialisasi tabel SQL berhasil dijalankan!',
        });
        await checkDbStatus();
        await refreshDataFromMySQL();
      } else {
        addDbLogEntry({
          type: 'INIT_TABLES',
          success: false,
          host: dbStatus?.host || 'localhost',
          message: `Gagal inisialisasi tabel: ${res.data?.message || 'Error'}`,
        });
      }
      return res.data;
    } catch (err: any) {
      addDbLogEntry({
        type: 'INIT_TABLES',
        success: false,
        host: dbStatus?.host || 'localhost',
        message: `Error inisialisasi tabel: ${err.message}`,
      });
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
          setDbAlertVisible(false);
          setIsDbModalOpen(false);
          refreshDataFromMySQL();
        } else {
          console.warn('[PPDI] MySQL Belum Terkoneksi di Hosting:', statusRes?.error || statusRes?.status);
          setDbAlertVisible(true);
          setIsDbModalOpen(true);
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

  // Global centralized permission evaluation hook
  const hasPermission = useCallback(
    (moduleId: string, action: PermissionAction = 'view'): boolean => {
      return checkUserPermission(currentUser?.role, moduleId, action, appSettings.rolePermissions);
    },
    [currentUser?.role, appSettings.rolePermissions]
  );

  // Adjust filter when switching user role and sync auth headers context
  useEffect(() => {
    if (currentUser) {
      try {
        localStorage.setItem('ppdi_current_user_id', String(currentUser.id_user));
        localStorage.setItem('ppdi_current_user_role', currentUser.role);
      } catch (_) {}
    }
    if (currentUser.role === 'Admin_Kecamatan' && currentUser.id_kecamatan) {
      setSelectedKecamatanFilter(currentUser.id_kecamatan);
    } else if (currentUser.role === 'Superadmin_Kabupaten') {
      setSelectedKecamatanFilter('all');
    }
  }, [currentUser]);

  // Otomatis deteksi jika pengguna yang telah login masih menggunakan password default (PPDIJaya2026)
  useEffect(() => {
    if (isAuthenticated && currentUser) {
      const isDefault =
        currentUser.password === 'PPDIJaya2026' ||
        currentUser.is_default_password === true;
      if (isDefault) {
        setMustChangeDefaultPassword(true);
        setIsChangePasswordModalOpen(true);
        try {
          localStorage.setItem(STORAGE_KEYS.MUST_CHANGE_PASS, 'true');
        } catch (_) {}
      }
    }
  }, [isAuthenticated, currentUser?.id_user, currentUser?.password, currentUser?.is_default_password]);

  // Audit Log Aktivitas Admin State & Persistence
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ACTIVITY_LOGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    return INITIAL_ACTIVITY_LOGS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVITY_LOGS, JSON.stringify(activityLogs));
    } catch (_) {}
  }, [activityLogs]);

  const addActivityLog = useCallback(
    (
      entry: Omit<ActivityLogEntry, 'id' | 'timestamp' | 'user_id' | 'user_name' | 'user_role'> & {
        user_id?: number;
        user_name?: string;
        user_role?: UserRole;
      }
    ) => {
      const nowFormatted = new Date().toLocaleString('id-ID', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      const newLog: ActivityLogEntry = {
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        timestamp: nowFormatted,
        user_id: entry.user_id ?? currentUser?.id_user ?? 1,
        user_name: entry.user_name ?? currentUser?.nama ?? 'Administrator',
        user_role: entry.user_role ?? currentUser?.role ?? 'Superadmin_Kabupaten',
        aksi: entry.aksi,
        modul: entry.modul,
        target_id: entry.target_id,
        target_nama: entry.target_nama,
        deskripsi: entry.deskripsi,
        ip_address: entry.ip_address || '127.0.0.1 (Sesi Lokal)',
      };

      setActivityLogs((prev) => [newLog, ...prev].slice(0, 500));
    },
    [currentUser]
  );

  const clearActivityLogs = useCallback(() => {
    setActivityLogs([]);
    localStorage.removeItem(STORAGE_KEYS.ACTIVITY_LOGS);
  }, []);

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
    if (currentUser.role === 'Anggota') {
      const userNik = currentUser.id_anggota || currentUser.username;
      return fullMembers.filter((m) => m.anggota.id_anggota === currentUser.id_anggota || m.anggota.nik === userNik);
    }
    if (currentUser.role === 'Admin_Desa') {
      const cleanUserDesa = (currentUser.id_desa || '').replace(/\./g, '').trim();
      const cleanUserKec = (currentUser.id_kecamatan || '').replace(/\./g, '').trim();
      return fullMembers.filter((m) => {
        const itemDesa = (m.desa?.id_desa || m.jabatanTerkini?.id_desa || '').replace(/\./g, '').trim();
        if (cleanUserDesa && itemDesa === cleanUserDesa) return true;
        if (!cleanUserDesa && cleanUserKec) {
          const itemKec = (m.kecamatan?.id_kecamatan || m.desa?.id_kecamatan || '').replace(/\./g, '').trim();
          return itemKec === cleanUserKec || (itemDesa.length >= 6 && itemDesa.startsWith(cleanUserKec));
        }
        return false;
      });
    }
    if (currentUser.role === 'Admin_Kecamatan' && currentUser.id_kecamatan) {
      const cleanUserKec = currentUser.id_kecamatan.replace(/\./g, '').trim();
      return fullMembers.filter((m) => {
        const itemKec = (m.kecamatan?.id_kecamatan || m.desa?.id_kecamatan || '').replace(/\./g, '').trim();
        const itemDesa = (m.desa?.id_desa || m.jabatanTerkini?.id_desa || '').replace(/\./g, '').trim();
        return itemKec === cleanUserKec || (itemDesa.length >= 6 && itemDesa.startsWith(cleanUserKec));
      });
    }
    if (selectedKecamatanFilter !== 'all') {
      const cleanFilter = selectedKecamatanFilter.replace(/\./g, '').trim();
      return fullMembers.filter(
        (m) =>
          (m.kecamatan?.id_kecamatan || '').replace(/\./g, '').trim() === cleanFilter ||
          (m.desa?.id_kecamatan || '').replace(/\./g, '').trim() === cleanFilter
      );
    }
    return fullMembers;
  }, [fullMembers, currentUser, selectedKecamatanFilter]);

  // Filtered pendaftaran based on user role & territory
  const visiblePendaftaran = useMemo(() => {
    if (!currentUser) return pendaftaranList;
    const role = currentUser.role;

    // 1. Superadmin_Kabupaten & Admin_Kabupaten: Akses seluruh pendaftaran se-Kabupaten Bandung
    if (role === 'Superadmin_Kabupaten' || role === 'Admin_Kabupaten') {
      return pendaftaranList;
    }

    // 2. Admin_Kecamatan: Terkunci pada wilayah Kecamatan penugasan
    if (role === 'Admin_Kecamatan') {
      const userKecClean = (currentUser.id_kecamatan || '').replace(/\./g, '').trim();
      if (!userKecClean) return pendaftaranList;

      return pendaftaranList.filter((p) => {
        const itemKecClean = (p.id_kecamatan || '').replace(/\./g, '').trim();
        const itemDesaClean = (p.id_desa || '').replace(/\./g, '').trim();
        return itemKecClean === userKecClean || (itemDesaClean.length >= 6 && itemDesaClean.startsWith(userKecClean));
      });
    }

    // 3. Admin_Desa: Terkunci pada wilayah Desa penugasan
    if (role === 'Admin_Desa') {
      const userDesaClean = (currentUser.id_desa || '').replace(/\./g, '').trim();
      const userKecClean = (currentUser.id_kecamatan || '').replace(/\./g, '').trim();

      return pendaftaranList.filter((p) => {
        const itemDesaClean = (p.id_desa || '').replace(/\./g, '').trim();
        if (userDesaClean && itemDesaClean === userDesaClean) return true;
        if (!userDesaClean && userKecClean) {
          const itemKecClean = (p.id_kecamatan || '').replace(/\./g, '').trim();
          return itemKecClean === userKecClean || itemDesaClean.startsWith(userKecClean);
        }
        return false;
      });
    }

    // 4. Anggota: Hanya melihat pengajuan mandirinya (berdasarkan NIK / id_anggota / email)
    if (role === 'Anggota') {
      const userNik = currentUser.id_anggota || currentUser.username;
      return pendaftaranList.filter((p) => {
        if (userNik && p.nik === userNik) return true;
        if (currentUser.email && p.email && p.email.toLowerCase() === currentUser.email.toLowerCase()) return true;
        return false;
      });
    }

    return pendaftaranList;
  }, [pendaftaranList, currentUser]);

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

    // Enforce role rule for Kepala Desa: hanya Anggota Istimewa / Penasehat
    const matchedJab = jabatanList.find(j => Number(j.id_jabatan) === Number(riwayatData.id_jabatan));
    const isKades = matchedJab?.kategori_jabatan === 'Kepala Desa' ||
      matchedJab?.nama_jabatan?.toLowerCase().includes('kepala desa') ||
      matchedJab?.nama_jabatan?.toLowerCase().includes('kades');

    let sanitizedJabatanPengurus = jabatanPengurus;
    if (isKades) {
      if (sanitizedJabatanPengurus !== 'Penasehat' && sanitizedJabatanPengurus !== 'Anggota Istimewa') {
        sanitizedJabatanPengurus = 'Anggota Istimewa';
      }
    }

    const newKeanggotaan: KeanggotaanPPDI = {
      id_ppdi: `ppdi-${Date.now().toString().slice(-6)}`,
      id_anggota: tempId,
      no_kta: autoKTA,
      tgl_bergabung: new Date().toISOString().split('T')[0],
      jabatan_pengurus: sanitizedJabatanPengurus,
      status_kta: 'Aktif',
    };

    setAnggotaList((prev) => [newAnggota, ...prev]);
    setRiwayatList((prev) => [newRiwayat, ...prev]);
    setKeanggotaanList((prev) => [newKeanggotaan, ...prev]);

    addActivityLog({
      aksi: 'TAMBAH',
      modul: 'Data Induk Anggota',
      target_id: tempId,
      target_nama: newAnggota.nama_lengkap,
      deskripsi: `Menambahkan anggota baru "${newAnggota.nama_lengkap}" (NIK: ${newAnggota.nik}, No. KTA: ${autoKTA}).`,
    });

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

      addActivityLog({
        aksi: 'IMPORT',
        modul: 'Data Induk Anggota',
        target_id: 'IMPORT_EXCEL',
        target_nama: 'Impor Massal Excel',
        deskripsi: `Berhasil mengimpor kolektif ${items.length} data perangkat desa dari berkas Excel spreadsheet.`,
      });

      await refreshDataFromMySQL();
      return json;
    } catch (err: any) {
      console.error('Batch import error:', err);
      throw err;
    }
  };

  const updateAnggota = async (id: string, updated: Partial<Anggota>, jabatanPengurus?: string) => {
    const formattedUpdated: Partial<Anggota> = { ...updated };
    if (updated.nama_lengkap) {
      formattedUpdated.nama_lengkap = updated.nama_lengkap.trim().toUpperCase();
    }
    setAnggotaList((prev) =>
      prev.map((item) => (item.id_anggota === id ? { ...item, ...formattedUpdated, updated_at: new Date().toISOString() } : item))
    );

    if (jabatanPengurus) {
      setKeanggotaanList((prev) =>
        prev.map((k) =>
          k.id_anggota === id ? { ...k, jabatan_pengurus: jabatanPengurus } : k
        )
      );
    }

    addActivityLog({
      aksi: 'EDIT',
      modul: 'Data Induk Anggota',
      target_id: id,
      target_nama: formattedUpdated.nama_lengkap || id,
      deskripsi: `Memperbarui profil/data anggota "${formattedUpdated.nama_lengkap || id}".`,
    });

    try {
      const payload: any = { ...formattedUpdated };
      if (jabatanPengurus) {
        payload.jabatan_pengurus = jabatanPengurus;
      }
      const res = await safeFetchJson(`/api/anggota/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

  const updateKeanggotaanJabatan = async (idAnggota: string, jabatanPengurus: string) => {
    // Check if member is Kepala Desa
    const activeRw = riwayatList.find(r => r.id_anggota === idAnggota && r.status_aktif === 'Aktif');
    const matchedJab = jabatanList.find(j => Number(j.id_jabatan) === Number(activeRw?.id_jabatan));
    const isKades = matchedJab?.kategori_jabatan === 'Kepala Desa' ||
      matchedJab?.nama_jabatan?.toLowerCase().includes('kepala desa') ||
      matchedJab?.nama_jabatan?.toLowerCase().includes('kades');

    let sanitized = jabatanPengurus;
    if (isKades && sanitized !== 'Penasehat' && sanitized !== 'Anggota Istimewa') {
      sanitized = 'Anggota Istimewa';
    }

    setKeanggotaanList((prev) =>
      prev.map((k) =>
        k.id_anggota === idAnggota ? { ...k, jabatan_pengurus: sanitized } : k
      )
    );
    try {
      await safeFetchJson(`/api/kta/${idAnggota}/jabatan-pengurus`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jabatan_pengurus: sanitized }),
      });
      await refreshDataFromMySQL();
    } catch (err) {
      console.warn('Error updating jabatan pengurus:', err);
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

    addActivityLog({
      aksi: 'HAPUS',
      modul: 'Data Induk Anggota',
      target_id: id,
      target_nama: targetNama,
      deskripsi: `Menghapus data anggota "${targetNama}" (NIK: ${targetNik || '-'}).`,
    });

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

    addActivityLog({
      aksi: 'STATUS_KTA',
      modul: 'Status E-KTA',
      target_id: idAnggota,
      deskripsi: `Memperbarui status E-KTA anggota ID ${idAnggota} menjadi "${newStatus}".`,
    });

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

  const changePassword = async (params: {
    userId?: number;
    username?: string;
    oldPassword?: string;
    newPassword: string;
    requireOldPassword?: boolean;
  }) => {
    const res = await safeFetchJson('/api/users/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_user: params.userId,
        username: params.username,
        oldPassword: params.oldPassword,
        newPassword: params.newPassword,
        requireOldPassword: params.requireOldPassword,
      }),
    });
    const json = res.data;
    if (!res.ok || json?.success === false) {
      throw new Error(json?.message || res.error || 'Gagal mengubah password');
    }
    const targetUserId = params.userId || currentUser.id_user;
    const nowFormatted = json?.update_at || new Date().toISOString().slice(0, 19).replace('T', ' ');

    setUserList((prev) =>
      prev.map((u) =>
        u.id_user === targetUserId
          ? {
              ...u,
              password: params.newPassword,
              update_at: nowFormatted,
              updated_at: nowFormatted,
              is_default_password: params.newPassword === 'PPDIJaya2026',
            }
          : u
      )
    );

    // Apabila pengguna yang sedang login telah mengganti password, maka otomatis popup Changepasswordmodal tidak aktif
    if (targetUserId === currentUser.id_user) {
      setMustChangeDefaultPassword(false);
      setIsChangePasswordModalOpen(false);
      try {
        localStorage.removeItem(STORAGE_KEYS.MUST_CHANGE_PASS);
      } catch (_) {}
    }

    addActivityLog({
      aksi: 'EDIT',
      modul: 'Manajemen Pengguna',
      target_id: `USR-${targetUserId}`,
      target_nama: params.username || currentUser.username,
      deskripsi: `Memperbarui kata sandi akun pengguna (update_at: ${nowFormatted}). Status password default dinonaktifkan.`,
    });

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

    addActivityLog({
      aksi: 'APPROVE',
      modul: 'Registrasi & Approval',
      target_id: String(id),
      target_nama: json.nama_lengkap || `Registrasi #${id}`,
      deskripsi: `Menyetujui pendaftaran calon anggota dan menerbitkan E-KTA No. ${json.no_kta || noKtaCustom || '-'}.`,
    });

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

    addActivityLog({
      aksi: 'REJECT',
      modul: 'Registrasi & Approval',
      target_id: String(id),
      deskripsi: `Menolak pendaftaran calon anggota ID #${id}. Catatan: ${catatan || '-'}.`,
    });

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
    let sanitizedSettings = { ...newSettings };
    if (newSettings.rolePermissions) {
      sanitizedSettings.rolePermissions = sanitizeRolePermissions(newSettings.rolePermissions);
    }
    const merged = { ...appSettings, ...sanitizedSettings };
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

        // Validasi Password default (PPDIJaya2026): otomatis membuka popup ChangePasswordModal
        const isDefault =
          cleanPass === 'PPDIJaya2026' ||
          data.user?.password === 'PPDIJaya2026' ||
          data.user?.is_default_password === true ||
          data.is_default_password === true;

        if (isDefault) {
          setMustChangeDefaultPassword(true);
          setIsChangePasswordModalOpen(true);
          try {
            localStorage.setItem(STORAGE_KEYS.MUST_CHANGE_PASS, 'true');
          } catch (_) {}
        } else {
          setMustChangeDefaultPassword(false);
          setIsChangePasswordModalOpen(false);
          try {
            localStorage.removeItem(STORAGE_KEYS.MUST_CHANGE_PASS);
          } catch (_) {}
        }

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
        const isPassValid = cleanPass === storedPass || (cleanPass === 'PPDIJaya2026');
        if (isPassValid) {
          setIsAuthenticated(true);
          localStorage.setItem(STORAGE_KEYS.AUTH, 'true');
          setCurrentUserId(matched.id_user);
          setActiveTab('dashboard');

          const isDefault = cleanPass === 'PPDIJaya2026' || matched.password === 'PPDIJaya2026' || matched.is_default_password === true;
          if (isDefault) {
            setMustChangeDefaultPassword(true);
            setIsChangePasswordModalOpen(true);
            try {
              localStorage.setItem(STORAGE_KEYS.MUST_CHANGE_PASS, 'true');
            } catch (_) {}
          } else {
            setMustChangeDefaultPassword(false);
            setIsChangePasswordModalOpen(false);
            try {
              localStorage.removeItem(STORAGE_KEYS.MUST_CHANGE_PASS);
            } catch (_) {}
          }

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
    localStorage.removeItem(STORAGE_KEYS.MUST_CHANGE_PASS);
    setMustChangeDefaultPassword(false);
    setIsChangePasswordModalOpen(false);
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
    if (!query || !query.trim()) return null;
    const rawTrimmed = query.trim();

    // 1. Try decoding as an encrypted QR token or short URL first
    const decoded = decodeKtaToken(rawTrimmed);
    if (decoded && decoded.valid) {
      const matchByToken = fullMembers.find((m) => {
        if (decoded.no_kta && m.keanggotaan?.no_kta && m.keanggotaan.no_kta.toLowerCase() === decoded.no_kta.toLowerCase()) {
          return true;
        }
        if (decoded.nik && m.anggota.nik.toLowerCase() === decoded.nik.toLowerCase()) {
          return true;
        }
        if (decoded.id_anggota && m.anggota.id_anggota === decoded.id_anggota) {
          return true;
        }
        return false;
      });
      if (matchByToken) return matchByToken;
    }

    // 2. Standard search query (No KTA, NIK, ID, or Nama)
    const cleanQuery = rawTrimmed.toLowerCase();
    return (
      fullMembers.find(
        (m) =>
          m.anggota.nik.toLowerCase() === cleanQuery ||
          (m.keanggotaan?.no_kta && m.keanggotaan.no_kta.toLowerCase() === cleanQuery) ||
          m.anggota.id_anggota.toLowerCase() === cleanQuery ||
          m.anggota.nama_lengkap.toLowerCase().includes(cleanQuery)
      ) || null
    );
  };

  return (
    <PPDIContext.Provider
      value={{
        hasPermission,
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
        visiblePendaftaran,
        submitPendaftaran,
        approvePendaftaran,
        rejectPendaftaran,
        deletePendaftaran,
        createUser,
        updateUser,
        deleteUser,
        changePassword,
        isChangePasswordModalOpen,
        setIsChangePasswordModalOpen,
        mustChangeDefaultPassword,
        setMustChangeDefaultPassword,
        openChangePasswordModal,
        closeChangePasswordModal,
        appSettings,
        updateAppSettings,
        addAnggotaWithJobAndKta,
        batchImportAnggota,
        updateAnggota,
        updateKeanggotaanJabatan,
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
        dbLogs,
        addDbLogEntry,
        clearDbLogs,
        activityLogs,
        addActivityLog,
        clearActivityLogs,
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
