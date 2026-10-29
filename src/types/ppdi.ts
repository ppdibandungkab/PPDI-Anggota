export type KategoriJabatan = 
  | 'Sekretariat' 
  | 'Pelaksana Teknis' 
  | 'Pelaksana Kewilayahan' 
  | 'Kepala Desa'
  | 'Staf Desa';

export type StatusAktifJabatan = 
  | 'Aktif' 
  | 'Purna Tugas' 
  | 'Meninggal Dunia' 
  | 'Diberhentikan' 
  | 'Mutasi';

export type StatusKTA = 'Aktif' | 'Pending' | 'Non-Aktif';

export type StatusVerifikasiIuran = 'Pending' | 'Lunas' | 'Ditolak';

export type UserRole = 'Superadmin_Kabupaten' | 'Admin_Kabupaten' | 'Admin_Kecamatan' | 'Admin_Desa' | 'Anggota';

export interface RefKecamatan {
  id_kecamatan: string; // e.g. "32.04.05"
  nama_kecamatan: string;
}

export interface RefDesa {
  id_desa: string; // e.g. "32.04.05.2001"
  id_kecamatan: string;
  nama_desa: string;
  alamat_kantor_desa: string;
}

export interface RefJabatan {
  id_jabatan: number;
  nama_jabatan: string;
  kategori_jabatan: KategoriJabatan;
}

export interface Anggota {
  id_anggota: string;
  nik: string; // 16 digit unique
  nipd?: string; // Nomor Induk Perangkat Desa
  nama_lengkap: string;
  gelar_depan?: string;
  gelar_belakang?: string;
  tempat_lahir: string;
  tanggal_lahir: string; // YYYY-MM-DD
  jenis_kelamin: 'L' | 'P';
  agama: string;
  pendidikan_terakhir: 'SMA/SMK' | 'D3' | 'S1' | 'S2';
  no_hp_wa: string;
  email?: string;
  foto?: string;
  alamat_rumah: string;
  status_pernikahan: 'Kawin' | 'Belum Kawin' | 'Cerai Hidup' | 'Cerai Mati';
  created_at: string;
  updated_at: string;
}

export interface RiwayatJabatan {
  id_riwayat: string;
  id_anggota: string;
  id_desa: string;
  id_jabatan: number;
  no_sk_pengangkatan: string;
  tgl_sk_pengangkatan: string; // YYYY-MM-DD
  tmt_jabatan: string; // YYYY-MM-DD
  status_aktif: StatusAktifJabatan;
  file_sk?: string; // URL or doc name
  keterangan?: string;
}

export interface KeanggotaanPPDI {
  id_ppdi: string;
  id_anggota: string;
  no_kta: string; // Format: 32.04.[KodeKec].[KodeDesa].[NoUrut]
  tgl_bergabung: string; // YYYY-MM-DD
  jabatan_pengurus: string; // e.g. "Anggota Biasa", "Ketua Pengurus Kecamatan", "Pengurus Daerah Kab. Bandung"
  status_kta: StatusKTA;
}

export interface IuranAnggota {
  id_iuran: string;
  id_anggota: string;
  tahun: number;
  bulan: number; // 1 - 12
  jumlah: number;
  tgl_bayar: string;
  bukti_trf?: string;
  status_verifikasi: StatusVerifikasiIuran;
  catatan?: string;
}

export interface UserAccount {
  id_user: number;
  username: string;
  email: string;
  nama: string;
  password?: string;
  role: UserRole;
  id_anggota?: string;
  id_kecamatan?: string; // For Admin_Kecamatan restriction
  id_desa?: string; // For Admin_Desa restriction
}

// Composite views for UI display
export interface AnggotaFullDetail {
  anggota: Anggota;
  jabatanTerkini?: RiwayatJabatan;
  desa?: RefDesa;
  kecamatan?: RefKecamatan;
  jabatanRef?: RefJabatan;
  keanggotaan?: KeanggotaanPPDI;
  usia: number;
  sisaMasaPensiunTahun: number;
  sisaMasaPensiunBulan: number;
  statusPensiun: 'Aman' | 'Waspada (<2 Thn)' | 'Siaga (<1 Thn)' | 'Kritis (<6 Bln)' | 'Sudah Purna Tugas';
  totalIuranLunas: number;
}

export interface PendaftaranPerangkatDesa {
  id_pendaftaran: number;
  nik: string;
  nama_lengkap: string;
  gelar_depan?: string;
  gelar_belakang?: string;
  tempat_lahir: string;
  tanggal_lahir: string;
  jenis_kelamin: 'L' | 'P';
  agama: string;
  pendidikan_terakhir: string;
  no_hp_wa: string;
  email?: string;
  alamat_rumah?: string;
  foto?: string;
  status_pernikahan: string;
  id_kecamatan: string;
  id_desa: string;
  id_jabatan: number;
  no_sk_pengangkatan?: string;
  tgl_sk_pengangkatan?: string;
  tmt_jabatan?: string;
  file_sk?: string;
  status_approval: 'Menunggu' | 'Disetujui' | 'Ditolak';
  catatan_approval?: string;
  tgl_pendaftaran: string;
  tgl_approval?: string;
  approved_by?: string;
  nama_kecamatan?: string;
  nama_desa?: string;
  nama_jabatan?: string;
}

export interface Permission {
  view: boolean;
  add: boolean;
  edit: boolean;
  delete: boolean;
  [key: string]: boolean;
}

export interface RoleConfig {
  [role: string]: {
    [module: string]: Permission;
  };
}

export const DEFAULT_ROLE_PERMISSIONS: RoleConfig = {
  'Superadmin_Kabupaten': {
    'dashboard': { view: true, add: true, edit: true, delete: true },
    'pendaftaran': { view: true, add: true, edit: true, delete: true },
    'anggota': { view: true, add: true, edit: true, delete: true },
    'ekta': { view: true, add: true, edit: true, delete: true },
    'pensiun': { view: true, add: true, edit: true, delete: true },
    'arsip': { view: true, add: true, edit: true, delete: true },
    'iuran': { view: true, add: true, edit: true, delete: true },
    'settings-app': { view: true, add: true, edit: true, delete: true },
    'settings-user': { view: true, add: true, edit: true, delete: true },
    'settings-role': { view: true, add: true, edit: true, delete: true },
    'settings-db': { view: true, add: true, edit: true, delete: true },
    'skema': { view: true, add: true, edit: true, delete: true },
  },
  'Admin_Kabupaten': {
    'dashboard': { view: true, add: false, edit: false, delete: false },
    'pendaftaran': { view: true, add: true, edit: true, delete: true },
    'anggota': { view: true, add: true, edit: true, delete: true },
    'ekta': { view: true, add: true, edit: true, delete: true },
    'pensiun': { view: true, add: false, edit: false, delete: false },
    'arsip': { view: true, add: true, edit: true, delete: true },
    'iuran': { view: true, add: true, edit: true, delete: true },
    'settings-user': { view: true, add: true, edit: true, delete: true },
    'settings-app': { view: false, add: false, edit: false, delete: false },
    'settings-role': { view: false, add: false, edit: false, delete: false },
    'settings-db': { view: false, add: false, edit: false, delete: false },
    'skema': { view: false, add: false, edit: false, delete: false },
  },
  'Admin_Kecamatan': {
    'dashboard': { view: true, add: false, edit: false, delete: false },
    'pendaftaran': { view: true, add: true, edit: true, delete: false },
    'anggota': { view: true, add: true, edit: true, delete: false },
    'ekta': { view: true, add: true, edit: false, delete: false },
    'pensiun': { view: true, add: false, edit: false, delete: false },
    'arsip': { view: true, add: true, edit: false, delete: false },
    'iuran': { view: true, add: true, edit: true, delete: false },
    'settings-user': { view: false, add: false, edit: false, delete: false },
    'settings-app': { view: false, add: false, edit: false, delete: false },
    'settings-role': { view: false, add: false, edit: false, delete: false },
    'settings-db': { view: false, add: false, edit: false, delete: false },
    'skema': { view: false, add: false, edit: false, delete: false },
  },
  'Admin_Desa': {
    'dashboard': { view: true, add: false, edit: false, delete: false },
    'pendaftaran': { view: true, add: true, edit: false, delete: false },
    'anggota': { view: true, add: false, edit: true, delete: false },
    'ekta': { view: true, add: false, edit: false, delete: false },
    'pensiun': { view: true, add: false, edit: false, delete: false },
    'arsip': { view: true, add: true, edit: false, delete: false },
    'iuran': { view: true, add: true, edit: false, delete: false },
    'settings-user': { view: false, add: false, edit: false, delete: false },
    'settings-app': { view: false, add: false, edit: false, delete: false },
    'settings-role': { view: false, add: false, edit: false, delete: false },
    'settings-db': { view: false, add: false, edit: false, delete: false },
    'skema': { view: false, add: false, edit: false, delete: false },
  },
  'Anggota': {
    'dashboard': { view: true, add: false, edit: false, delete: false },
    'pendaftaran': { view: false, add: false, edit: false, delete: false },
    'anggota': { view: true, add: false, edit: false, delete: false },
    'ekta': { view: true, add: false, edit: false, delete: false },
    'pensiun': { view: false, add: false, edit: false, delete: false },
    'arsip': { view: false, add: false, edit: false, delete: false },
    'iuran': { view: true, add: true, edit: false, delete: false },
    'settings-user': { view: false, add: false, edit: false, delete: false },
    'settings-app': { view: false, add: false, edit: false, delete: false },
    'settings-role': { view: false, add: false, edit: false, delete: false },
    'settings-db': { view: false, add: false, edit: false, delete: false },
    'skema': { view: false, add: false, edit: false, delete: false },
  },
};

export interface AppSettings {
  appName: string;
  appSubtitle: string;
  logoUrl: string;
  loginBackgroundType: 'preset_emerald' | 'gradient_mesh' | 'custom_image' | 'dark_slate';
  loginBackgroundImage?: string;
  loginOverlayOpacity?: string;
  syncIntervalSeconds: number;
  rolePermissions?: RoleConfig;
}

export interface DbStatusInfo {
  success: boolean;
  status: string;
  latencyMs?: number;
  host: string;
  port?: number;
  database: string;
  user: string;
  envDetected?: boolean;
  envPath?: string;
  serverVersion?: string;
  serverTime?: string;
  tablesCount?: number;
  tables?: string[];
  error?: string;
  code?: string;
  hint?: string;
  diagnosis?: string;
  hostingTips?: string[];
  message?: string;
}
