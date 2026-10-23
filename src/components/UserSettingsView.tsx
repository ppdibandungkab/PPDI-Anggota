import React, { useState } from 'react';
import { usePPDI } from '../context/PPDIContext';
import {
  Shield,
  User,
  UserCheck,
  Key,
  MapPin,
  Plus,
  Trash2,
  Edit2,
  CheckCircle,
  AlertCircle,
  Lock,
  Mail,
  Building2,
  X,
  Users as UsersIcon,
  HelpCircle,
} from 'lucide-react';
import { UserAccount, UserRole } from '../types/ppdi';

export const UserSettingsView: React.FC = () => {
  const { users, currentUser, switchUser, createUser, updateUser, deleteUser, kecamatanList, desaList } = usePPDI();

  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);

  // Form states
  const [username, setUsername] = useState('');
  const [nama, setNama] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('Admin_Kecamatan');
  const [idKecamatan, setIdKecamatan] = useState<string>(kecamatanList[0]?.id_kecamatan || '320437');
  const [idDesa, setIdDesa] = useState<string>('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isKabupatenLevel = currentUser.role === 'Superadmin_Kabupaten' || currentUser.role === 'Admin_Kabupaten';
  const visibleUsers = users.filter((u) => {
    if (isKabupatenLevel) return true;
    return u.id_user === currentUser.id_user;
  });

  const handleOpenAdd = () => {
    if (!isKabupatenLevel) {
      setFeedbackMsg({
        type: 'error',
        text: 'Hanya Superadmin Kabupaten dan Admin Kabupaten yang dapat menambahkan akun pengguna baru.',
      });
      return;
    }
    setEditingUser(null);
    setUsername('');
    setNama('');
    setEmail('');
    setPassword('');
    setRole(currentUser.role === 'Superadmin_Kabupaten' ? 'Admin_Kabupaten' : 'Admin_Kecamatan');
    setIdKecamatan(kecamatanList[0]?.id_kecamatan || '320437');
    setIdDesa(desaList[0]?.id_desa || '');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (u: UserAccount) => {
    // Admin_Kabupaten tidak dapat mengedit Superadmin_Kabupaten
    if (currentUser.role === 'Admin_Kabupaten' && u.role === 'Superadmin_Kabupaten') {
      setFeedbackMsg({
        type: 'error',
        text: 'Akses Ditolak: User Role Admin_Kabupaten tidak dapat mengedit akun Superadmin_Kabupaten!',
      });
      return;
    }

    // Role selain Kabupaten hanya boleh mengedit akun milik sendiri
    if (!isKabupatenLevel && u.id_user !== currentUser.id_user) {
      setFeedbackMsg({
        type: 'error',
        text: 'Akses Ditolak: Anda hanya memiliki izin mengelola akun profil Anda sendiri.',
      });
      return;
    }

    setEditingUser(u);
    setUsername(u.username);
    setNama(u.nama);
    setEmail(u.email);
    setPassword(''); // leave blank if unchanged
    setRole(u.role);
    setIdKecamatan(u.id_kecamatan || kecamatanList[0]?.id_kecamatan || '320437');
    setIdDesa(u.id_desa || desaList[0]?.id_desa || '');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !nama.trim() || !email.trim()) {
      setFeedbackMsg({ type: 'error', text: 'Username, Nama Lengkap, dan Email wajib diisi!' });
      return;
    }

    // Role protection checks:
    if (editingUser) {
      if (currentUser.role === 'Admin_Kabupaten' && editingUser.role === 'Superadmin_Kabupaten') {
        setFeedbackMsg({
          type: 'error',
          text: 'Akses Ditolak: User Role Admin_Kabupaten tidak dapat mengedit User Role Superadmin_Kabupaten!',
        });
        return;
      }
      if (!isKabupatenLevel && editingUser.id_user !== currentUser.id_user) {
        setFeedbackMsg({
          type: 'error',
          text: 'Akses Ditolak: Anda hanya dapat memperbarui data akun profil Anda sendiri!',
        });
        return;
      }
    } else {
      if (!isKabupatenLevel) {
        setFeedbackMsg({
          type: 'error',
          text: 'Akses Ditolak: Anda tidak memiliki wewenang untuk membuat akun pengguna baru.',
        });
        return;
      }
    }

    // Protection: only Superadmin_Kabupaten can assign Superadmin_Kabupaten role
    if (role === 'Superadmin_Kabupaten' && currentUser.role !== 'Superadmin_Kabupaten') {
      setFeedbackMsg({
        type: 'error',
        text: 'Akses Ditolak: Hanya Superadmin_Kabupaten yang berhak menetapkan tingkatan Superadmin_Kabupaten!',
      });
      return;
    }

    // Non-kabupaten users cannot change their own role
    const finalRole = !isKabupatenLevel && editingUser ? editingUser.role : role;

    setIsSubmitting(true);
    try {
      const payload: any = {
        username: username.trim(),
        nama: nama.trim().toUpperCase(),
        email: email.trim(),
        role: finalRole,
        id_kecamatan: finalRole === 'Admin_Kecamatan' || finalRole === 'Admin_Desa' ? idKecamatan : undefined,
        id_kecamatan_scope: finalRole === 'Admin_Kecamatan' || finalRole === 'Admin_Desa' ? idKecamatan : null,
        id_desa: finalRole === 'Admin_Desa' ? idDesa : undefined,
      };
      if (password.trim()) {
        payload.password = password.trim();
      }

      if (editingUser) {
        await updateUser(editingUser.id_user, payload);
        setFeedbackMsg({ type: 'success', text: `Akun "${username}" berhasil diperbarui!` });
      } else {
        await createUser(payload);
        setFeedbackMsg({ type: 'success', text: `Akun baru "${username}" berhasil didaftarkan ke sistem!` });
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Gagal menyimpan akun pengguna' });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  const handleDelete = async (u: UserAccount) => {
    if (u.id_user === currentUser.id_user) {
      alert('Anda tidak dapat menghapus akun yang sedang Anda gunakan saat ini!');
      return;
    }
    if (u.id_user === 1 || u.username === 'superadmin') {
      alert('Akun Superadmin Utama Sistem tidak dapat dihapus demi keamanan!');
      return;
    }

    // Protection: Admin_Kabupaten cannot delete Superadmin_Kabupaten
    if (currentUser.role === 'Admin_Kabupaten' && u.role === 'Superadmin_Kabupaten') {
      alert('Akses Ditolak: User Role Admin_Kabupaten tidak dapat menghapus User Role Superadmin_Kabupaten!');
      return;
    }

    if (!isKabupatenLevel) {
      alert('Akses Ditolak: Anda tidak memiliki wewenang untuk menghapus akun pengguna!');
      return;
    }

    if (!confirm(`Hapus akun pengguna "${u.username}" (${u.nama.toUpperCase()}) secara permanen?`)) {
      return;
    }

    try {
      await deleteUser(u.id_user);
      setFeedbackMsg({ type: 'success', text: `Akun "${u.username}" telah berhasil dihapus.` });
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Gagal menghapus akun pengguna' });
    } finally {
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  // Role details definitions
  const roleDefinitions = [
    {
      role: 'Superadmin_Kabupaten' as UserRole,
      title: 'Superadmin Kabupaten Bandung',
      badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      description:
        'Tingkatan akses tertinggi tingkat Pengurus Daerah Kabupaten Bandung. Memiliki wewenang lintas 31 Kecamatan se-Kabupaten Bandung serta hak konfigurasi sistem dan database.',
      privileges: [
        'Akses penuh seluruh 31 Kecamatan tanpa batas teritorial',
        'Persetujuan & Approval Formulir Induk Pendaftaran Perangkat Desa',
        'Penerbitan, Pembuatan, dan Cetak E-KTA Nasional PPDI',
        'Manajemen Akun Pengguna, Penugasan Role, dan Password',
        'Pengaturan Branding Aplikasi, Logo Resmi & Latar Belakang Login',
        'Akses Pengelolaan Skema Database & Sinkronisasi SQL Live',
      ],
    },
    {
      role: 'Admin_Kabupaten' as UserRole,
      title: 'Admin Kabupaten (Pengurus Daerah)',
      badgeColor: 'bg-cyan-100 text-cyan-900 border-cyan-300',
      description:
        'Tingkatan operasional Pengurus Daerah (PD) Kabupaten Bandung. Berwenang mengelola data anggota, verifikasi berkas pendaftaran, dan cetak E-KTA se-Kabupaten Bandung tanpa hak akses konfigurasi sistem/database.',
      privileges: [
        'Akses seluruh 31 Kecamatan di wilayah Kabupaten Bandung',
        'Persetujuan (Approval) & Verifikasi Pendaftaran Perangkat Desa',
        'Pengelolaan Master Data Anggota dan Rekapitulasi Wilayah',
        'Penerbitan, Pembuatan, dan Cetak E-KTA Resmi PPDI',
        'Pengelolaan Arsip Digital SK Pengangkatan Perangkat Desa',
        'Monitoring Iuran Kas Organisasi tingkat Kabupaten',
      ],
    },
    {
      role: 'Admin_Kecamatan' as UserRole,
      title: 'Admin Pengurus Kecamatan (PK)',
      badgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
      description:
        'Tingkatan pengurus tingkat kecamatan. Sistem mengunci data secara otomatis (Auto-Filter) hanya pada desa-desa di bawah kecamatan yang ditugaskan.',
      privileges: [
        'Terkunci pada wilayah kecamatan penempatan (Auto-Filter Teritorial)',
        'Input & Validasi Biodata Anggota Desa di wilayah kecamatannya',
        'Pencatatan & Verifikasi Iuran Kas Anggota per Desa',
        'Pemantauan status purna tugas perangkat desa di kecamatannya',
        'Pratinjau E-KTA perangkat desa binaan',
      ],
    },
    {
      role: 'Admin_Desa' as UserRole,
      title: 'Admin Pemerintahan Desa',
      badgeColor: 'bg-purple-100 text-purple-900 border-purple-300',
      description:
        'Tingkatan pengurus tingkat desa. Sistem mengunci data operasional khusus untuk perangkat di desa yang bersangkutan.',
      privileges: [
        'Akses terbatas pada wilayah desa penempatan',
        'Input & pembaruan biodata perangkat desa di tingkat desa',
        'Monitoring iuran kas dan status keaktifan perangkat desa',
        'Pengajuan pendaftaran anggota baru perangkat desa',
      ],
    },
    {
      role: 'Anggota' as UserRole,
      title: 'Anggota Perangkat Desa',
      badgeColor: 'bg-blue-100 text-blue-900 border-blue-300',
      description:
        'Tingkatan akun mandiri untuk setiap perangkat desa (Sekdes, Kaur, Kasi, Kadus, Staf).',
      privileges: [
        'Melihat status keanggotaan dan biodata pribadi',
        'Mengunduh E-KTA digital resmi ber-QR Code',
        'Melihat hitungan sisa masa purna tugas pribadi menuju usia 60 tahun',
        'Melihat riwayat setoran iuran kas organisasi',
      ],
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 text-neutral-900">
      {/* Top Banner */}
      <div className="bg-[#064E3B] text-white p-6 rounded-xl shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <UsersIcon className="w-5 h-5 text-amber-300" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight uppercase">
              Manajemen Akun Pengguna & Tingkatan (Role)
            </h1>
          </div>
          <p className="text-emerald-100 text-xs sm:text-sm mt-1">
            Kelola data autentikasi, hak akses operasional (CRUD), dan konfigurasi tingkatan pengguna PPDI Kabupaten Bandung.
          </p>
        </div>
        {isKabupatenLevel && (
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-4 py-2 bg-white text-[#064E3B] hover:bg-emerald-50 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer uppercase shrink-0"
          >
            <Plus className="w-4 h-4 text-[#064E3B]" />
            <span>Tambah Akun Pengguna</span>
          </button>
        )}
      </div>

      {/* Feedback Alert */}
      {feedbackMsg && (
        <div
          className={`p-4 rounded-lg flex items-center justify-between gap-3 text-xs sm:text-sm font-medium border shadow-xs ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
              : 'bg-red-50 text-red-900 border-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
          <button onClick={() => setFeedbackMsg(null)} className="text-neutral-500 hover:text-neutral-900 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Sub Tabs: Daftar Akun Pengguna vs Tingkatan (Role) */}
      <div className="flex items-center gap-3 border-b border-neutral-200">
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`pb-3 px-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border-b-2 flex items-center gap-2 ${
            activeTab === 'users'
              ? 'border-[#064E3B] text-[#064E3B]'
              : 'border-transparent text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <UsersIcon className="w-4 h-4" />
          <span>
            {isKabupatenLevel ? `Daftar Akun Pengguna (${visibleUsers.length})` : `Profil Akun Pengguna (${visibleUsers.length})`}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('roles')}
          className={`pb-3 px-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border-b-2 flex items-center gap-2 ${
            activeTab === 'roles'
              ? 'border-[#064E3B] text-[#064E3B]'
              : 'border-transparent text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Tingkatan & Hak Akses (Role)</span>
        </button>
      </div>

      {/* Tab 1: Akun Pengguna CRUD Table */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* Active Sesi Info */}
          <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-2xs">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-[#064E3B]" />
                <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-wider font-mono">
                  Sesi Pengguna Sedang Aktif
                </h2>
              </div>
              <span className="px-2.5 py-1 bg-emerald-100 text-emerald-900 text-[11px] font-mono font-semibold rounded-md">
                {currentUser.role}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
              <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                <span className="text-neutral-500 block mb-1 text-[10px] uppercase">Nama Lengkap (strtoupper)</span>
                <span className="font-bold text-neutral-900 text-sm uppercase">{currentUser.nama.toUpperCase()}</span>
              </div>
              <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                <span className="text-neutral-500 block mb-1 text-[10px] uppercase">Username</span>
                <span className="font-semibold text-neutral-900">{currentUser.username}</span>
              </div>
              <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                <span className="text-neutral-500 block mb-1 text-[10px] uppercase">Email Terdaftar</span>
                <span className="font-semibold text-neutral-900 truncate block">{currentUser.email}</span>
              </div>
              <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                <span className="text-neutral-500 block mb-1 text-[10px] uppercase">Lingkup Teritorial</span>
                <span className="font-semibold text-emerald-800">
                  {currentUser.role === 'Superadmin_Kabupaten' || currentUser.role === 'Admin_Kabupaten'
                    ? 'Seluruh 31 Kecamatan (Kabupaten)'
                    : currentUser.role === 'Admin_Desa'
                    ? `Terkunci Desa ${desaList.find(d => String(d.id_desa) === String(currentUser.id_desa))?.nama_desa || currentUser.id_desa || '-'}`
                    : `Terkunci Kec. ${currentUser.id_kecamatan || '-'}`}
                </span>
              </div>
            </div>
          </div>

          {/* Banner Informasi untuk Role Non-Kabupaten */}
          {!isKabupatenLevel && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-xs text-amber-900 shadow-2xs">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm">Mode Tampilan Akun Mandiri</p>
                <p className="text-amber-800 text-[11px] mt-0.5 leading-relaxed">
                  Berdasarkan hak akses tingkatan <strong>{currentUser.role}</strong>, Anda hanya dapat melihat dan mengelola data akun profil Anda sendiri. Hak akses melihat dan mengelola seluruh akun pengguna se-Kabupaten dibatasi khusus untuk <strong>Superadmin Kabupaten</strong> dan <strong>Admin Kabupaten</strong>.
                </p>
              </div>
            </div>
          )}

          {/* User Table with Action CRUD */}
          <div className="bg-white border border-neutral-200 rounded-xl shadow-2xs overflow-hidden">
            <div className="p-4 bg-neutral-50/80 border-b border-neutral-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-wider font-mono">
                  {isKabupatenLevel ? 'Daftar Akun Pengguna Sistem' : 'Data Akun Pengguna Aktif'}
                </h2>
                <p className="text-[11px] text-neutral-500 font-mono mt-0.5">
                  {isKabupatenLevel
                    ? `Menampilkan ${visibleUsers.length} akun pengguna terdaftar`
                    : 'Menampilkan data profil akun yang sedang login'}
                </p>
              </div>
              {isKabupatenLevel && (
                <button
                  onClick={handleOpenAdd}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#064E3B] hover:bg-[#043d2e] text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Pengguna</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-neutral-100 text-neutral-600 border-b border-neutral-200 uppercase tracking-wider">
                  <tr>
                    <th className="p-3 w-16">ID</th>
                    <th className="p-3">Username</th>
                    <th className="p-3">Nama Lengkap</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Tingkatan (Role)</th>
                    <th className="p-3">Wilayah Scope</th>
                    <th className="p-3 text-center">Aksi CRUD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {visibleUsers.map((u) => {
                    const isCurrent = u.id_user === currentUser.id_user;
                    const isTargetSuperadmin = u.role === 'Superadmin_Kabupaten';
                    const isAdminKabupatenBlocked = currentUser.role === 'Admin_Kabupaten' && isTargetSuperadmin;
                    const kecName = kecamatanList.find(
                      (k) => k.id_kecamatan.replace(/\./g, '') === (u.id_kecamatan || '').replace(/\./g, '')
                    )?.nama_kecamatan;

                    return (
                      <tr
                        key={u.id_user}
                        className={`hover:bg-neutral-50 transition-colors ${
                          isCurrent ? 'bg-emerald-50/50 font-semibold' : ''
                        }`}
                      >
                        <td className="p-3 font-bold text-neutral-500">#{u.id_user}</td>
                        <td className="p-3 font-bold text-[#064E3B]">{u.username}</td>
                        <td className="p-3 text-neutral-900 font-bold uppercase tracking-wide">
                          {u.nama.toUpperCase()}
                        </td>
                        <td className="p-3 text-neutral-600">{u.email}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              u.role === 'Superadmin_Kabupaten'
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                : u.role === 'Admin_Kabupaten'
                                ? 'bg-cyan-100 text-cyan-900 border border-cyan-300'
                                : u.role === 'Admin_Kecamatan'
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : u.role === 'Admin_Desa'
                                ? 'bg-purple-100 text-purple-900 border border-purple-300'
                                : 'bg-blue-100 text-blue-900 border border-blue-300'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="p-3">
                          {u.role === 'Superadmin_Kabupaten' || u.role === 'Admin_Kabupaten' ? (
                            <span className={u.role === 'Superadmin_Kabupaten' ? "text-emerald-700 font-semibold" : "text-cyan-800 font-semibold"}>
                              Kab. Bandung (31 Kec)
                            </span>
                          ) : u.role === 'Admin_Desa' && u.id_desa ? (
                            <span className="text-purple-900 font-medium">
                              Desa {desaList.find(d => String(d.id_desa) === String(u.id_desa))?.nama_desa || u.id_desa}
                            </span>
                          ) : kecName ? (
                            <span className="text-neutral-800">Kec. {kecName}</span>
                          ) : (
                            <span className="text-neutral-400">-</span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Switch Sesi (Khusus Superadmin_Kabupaten) */}
                            {currentUser.role === 'Superadmin_Kabupaten' ? (
                              <button
                                type="button"
                                onClick={() => switchUser(u.id_user)}
                                disabled={isCurrent}
                                className={`px-2 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                                  isCurrent
                                    ? 'bg-emerald-200/60 text-emerald-900 cursor-default'
                                    : 'bg-neutral-100 hover:bg-[#064E3B] hover:text-white text-neutral-700'
                                }`}
                                title="Ganti ke sesi akun ini"
                              >
                                {isCurrent ? 'Sesi Aktif' : 'Pilih Sesi'}
                              </button>
                            ) : isCurrent ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                                Sesi Aktif
                              </span>
                            ) : null}

                            {/* Edit Akun */}
                            {isAdminKabupatenBlocked ? (
                              <span
                                className="p-1.5 text-neutral-300 bg-neutral-100 rounded-md cursor-not-allowed inline-flex items-center justify-center"
                                title="User Role Admin_Kabupaten tidak dapat mengedit akun Superadmin_Kabupaten"
                              >
                                <Lock className="w-3.5 h-3.5 text-neutral-400" />
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(u)}
                                className="p-1.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-md transition-colors cursor-pointer"
                                title="Edit Data Pengguna"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Hapus Akun */}
                            {isAdminKabupatenBlocked ? (
                              <span
                                className="p-1.5 text-neutral-300 bg-neutral-100 rounded-md cursor-not-allowed inline-flex items-center justify-center"
                                title="User Role Admin_Kabupaten tidak dapat menghapus akun Superadmin_Kabupaten"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-neutral-300" />
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleDelete(u)}
                                disabled={isCurrent || u.id_user === 1 || !isKabupatenLevel}
                                className={`p-1.5 rounded-md transition-colors ${
                                  isCurrent || u.id_user === 1 || !isKabupatenLevel
                                    ? 'text-neutral-300 cursor-not-allowed'
                                    : 'text-neutral-400 hover:text-red-600 hover:bg-red-50 cursor-pointer'
                                }`}
                                title={
                                  isCurrent
                                    ? 'Akun sedang aktif'
                                    : u.id_user === 1
                                    ? 'Superadmin utama tidak boleh dihapus'
                                    : !isKabupatenLevel
                                    ? 'Anda tidak memiliki hak akses menghapus akun'
                                    : 'Hapus Akun Pengguna'
                                }
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Tingkatan (Role) Information & Permissions Matrix */}
      {activeTab === 'roles' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {roleDefinitions.map((item) => {
              const assignedCount = users.filter((u) => u.role === item.role).length;
              return (
                <div
                  key={item.role}
                  className="bg-white border border-neutral-200 rounded-xl p-5 shadow-2xs flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-md border ${item.badgeColor}`}>
                        {item.role}
                      </span>
                      <span className="text-xs font-mono text-neutral-500 font-semibold">
                        {assignedCount} Akun
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-neutral-900">{item.title}</h3>
                    <p className="text-xs text-neutral-600 leading-relaxed">{item.description}</p>

                    <div className="pt-2 border-t border-neutral-100">
                      <span className="text-[11px] font-bold text-neutral-700 uppercase tracking-wider block mb-2 font-mono">
                        Hak Akses & Wewenang:
                      </span>
                      <ul className="space-y-1.5 text-xs text-neutral-600 font-mono">
                        {item.privileges.map((p, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <span className="text-emerald-600 font-bold">✓</span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('users');
                    }}
                    className="w-full py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-lg text-xs font-bold transition-colors cursor-pointer text-center"
                  >
                    Lihat Pengguna ({assignedCount})
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal Add / Edit User */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden text-neutral-900">
            <div className="px-6 py-4 bg-[#064E3B] text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold uppercase tracking-wide">
                  {editingUser ? 'Edit Akun Pengguna' : 'Tambah Akun Pengguna Baru'}
                </h3>
                <p className="text-xs text-emerald-200">Konfigurasi Kredensial & Tingkatan (Role)</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-md hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 font-mono text-xs">
              {/* Nama Lengkap */}
              <div className="space-y-1">
                <label className="text-neutral-700 font-bold uppercase block text-[11px]">
                  Nama Lengkap (strtoupper) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="CONTOH: H. DEDI KUSNADI, S.AP"
                  value={nama}
                  onChange={(e) => setNama(e.target.value.toUpperCase())}
                  required
                  className="w-full p-2.5 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none uppercase font-bold text-neutral-900"
                />
              </div>

              {/* Username & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-neutral-700 font-bold uppercase block text-[11px]">
                    Username <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="contoh: admin.soreang"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="w-full p-2.5 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none text-neutral-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-neutral-700 font-bold uppercase block text-[11px]">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="admin@ppdi-bandungkab.id"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full p-2.5 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none text-neutral-900"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1">
                <label className="text-neutral-700 font-bold uppercase block text-[11px]">
                  {editingUser ? 'Password Baru (Kosongkan jika tidak diubah)' : 'Password Pengguna'}
                </label>
                <input
                  type="text"
                  placeholder={editingUser ? '•••••••• (Biarkan kosong)' : 'Masukkan password pengguna'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-2.5 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none text-neutral-900 font-mono"
                />
              </div>

              {/* Role */}
              <div className="space-y-1">
                <label className="text-neutral-700 font-bold uppercase block text-[11px]">
                  Tingkatan (Role Pengguna) <span className="text-red-500">*</span>
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  disabled={!isKabupatenLevel}
                  className="w-full p-2.5 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none text-neutral-900 bg-white font-semibold disabled:bg-neutral-100 disabled:text-neutral-500 disabled:cursor-not-allowed"
                >
                  {currentUser.role === 'Superadmin_Kabupaten' && (
                    <option value="Superadmin_Kabupaten">Superadmin Kabupaten (Akses Penuh & Konfigurasi Sistem)</option>
                  )}
                  <option value="Admin_Kabupaten">Admin Kabupaten (Pengurus Daerah / Verifikator 31 Kecamatan)</option>
                  <option value="Admin_Kecamatan">Admin Kecamatan (Terkunci Auto-Filter Teritorial)</option>
                  <option value="Admin_Desa">Admin Desa (Akses Terbatas Tingkat Desa)</option>
                  <option value="Anggota">Anggota Perangkat Desa (Akses Mandiri)</option>
                </select>
                {!isKabupatenLevel && (
                  <p className="text-[10px] text-neutral-500 italic mt-0.5">
                    * Tingkatan role akun Anda ditetapkan oleh Admin/Superadmin Kabupaten.
                  </p>
                )}
              </div>

              {/* Wilayah Penugasan (Jika Admin_Kecamatan) */}
              {role === 'Admin_Kecamatan' && (
                <div className="space-y-1 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <label className="text-amber-900 font-bold uppercase block text-[11px]">
                    Kecamatan Penugasan (Auto-Filter) <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={idKecamatan}
                    onChange={(e) => setIdKecamatan(e.target.value)}
                    className="w-full p-2.5 border border-amber-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none text-neutral-900 bg-white"
                  >
                    {kecamatanList.map((k) => (
                      <option key={k.id_kecamatan} value={k.id_kecamatan}>
                        Kecamatan {k.nama_kecamatan}
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] text-amber-700 block mt-1">
                    Akun ini hanya dapat melihat dan mengelola data di wilayah Kecamatan yang dipilih.
                  </span>
                </div>
              )}

              {/* Wilayah Penugasan (Jika Admin_Desa) */}
              {role === 'Admin_Desa' && (
                <div className="space-y-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="space-y-1">
                    <label className="text-purple-900 font-bold uppercase block text-[11px]">
                      Kecamatan Wilayah Desa <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={idKecamatan}
                      onChange={(e) => {
                        setIdKecamatan(e.target.value);
                        // Reset desa if kecamatan changes
                        const firstDesa = desaList.find(d => String(d.id_kecamatan) === String(e.target.value));
                        if (firstDesa) setIdDesa(firstDesa.id_desa);
                      }}
                      className="w-full p-2.5 border border-purple-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none text-neutral-900 bg-white"
                    >
                      {kecamatanList.map((k) => (
                        <option key={k.id_kecamatan} value={k.id_kecamatan}>
                          Kecamatan {k.nama_kecamatan}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-purple-900 font-bold uppercase block text-[11px]">
                      Desa Penugasan Admin Desa <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={idDesa}
                      onChange={(e) => setIdDesa(e.target.value)}
                      className="w-full p-2.5 border border-purple-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none text-neutral-900 bg-white"
                    >
                      {desaList
                        .filter(d => String(d.id_kecamatan) === String(idKecamatan))
                        .map((d) => (
                          <option key={d.id_desa} value={d.id_desa}>
                            Desa {d.nama_desa}
                          </option>
                        ))}
                    </select>
                    <span className="text-[10px] text-purple-700 block mt-1">
                      Akun Admin Desa terkunci khusus pada desa penempatan ini.
                    </span>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 rounded-lg font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-[#064E3B] hover:bg-[#043d2e] text-white rounded-lg font-bold cursor-pointer shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Simpan Pengguna'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
