import { Anggota, RiwayatJabatan, KeanggotaanPPDI, IuranAnggota, UserAccount } from '../types/ppdi';

// Seluruh data anggota, riwayat jabatan, keanggotaan KTA, dan iuran dimuat langsung secara live dari database MySQL
export const INITIAL_ANGGOTA: Anggota[] = [];
export const INITIAL_RIWAYAT_JABATAN: RiwayatJabatan[] = [];
export const INITIAL_KEANGGOTAAN_PPDI: KeanggotaanPPDI[] = [];
export const INITIAL_IURAN: IuranAnggota[] = [];

// Akun otentikasi sistem operasional
export const INITIAL_USERS: UserAccount[] = [
  {
    id_user: 1,
    username: 'superadmin',
    email: 'admin.kabupaten@ppdi-bandungkab.id',
    nama: 'ADMINISTRATOR KABUPATEN',
    password: 'admin',
    role: 'Superadmin_Kabupaten',
  },
  {
    id_user: 2,
    username: 'admin.soreang',
    email: 'admin.soreang@ppdi-bandungkab.id',
    nama: 'ADMIN PK PPDI SOREANG',
    password: 'admin',
    role: 'Admin_Kecamatan',
    id_kecamatan: '320437',
  },
  {
    id_user: 3,
    username: 'admin.banjaran',
    email: 'admin.banjaran@ppdi-bandungkab.id',
    nama: 'ADMIN PK PPDI BANJARAN',
    password: 'admin',
    role: 'Admin_Kecamatan',
    id_kecamatan: '320413',
  },
];