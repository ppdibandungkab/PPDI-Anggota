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
    email: 'superadmin@ppdi-bandungkab.id',
    nama: 'SUPERADMIN KABUPATEN BANDUNG',
    password: 'PPDIJaya#2006',
    is_default_password: true,
    role: 'Superadmin_Kabupaten',
  },
  {
    id_user: 2,
    username: 'admin.kabupaten',
    email: 'admin.pd@ppdi-bandungkab.id',
    nama: 'PENGURUS DAERAH KAB. BANDUNG',
    password: 'PPDIJaya#2006',
    is_default_password: true,
    role: 'Admin_Kabupaten',
  },
  {
    id_user: 3,
    username: 'admin.soreang',
    email: 'admin.soreang@ppdi-bandungkab.id',
    nama: 'ADMIN PK PPDI SOREANG',
    password: 'PPDIJaya#2006',
    is_default_password: true,
    role: 'Admin_Kecamatan',
    id_kecamatan: '320437',
  },
  {
    id_user: 4,
    username: 'admin.banjaran',
    email: 'admin.banjaran@ppdi-bandungkab.id',
    nama: 'ADMIN PK PPDI BANJARAN',
    password: 'PPDIJaya#2006',
    is_default_password: true,
    role: 'Admin_Kecamatan',
    id_kecamatan: '320413',
  },
  {
    id_user: 5,
    username: 'admin.sekarwangi',
    email: 'admin.sekarwangi@ppdi-bandungkab.id',
    nama: 'OPERATOR DESA SEKARWANGI',
    password: 'PPDIJaya#2006',
    is_default_password: true,
    role: 'Admin_Desa',
    id_kecamatan: '320437',
    id_desa: '3204372021',
  },
];