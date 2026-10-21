import React, { useState, useEffect } from 'react';
import { usePPDI } from '../context/PPDIContext';
import { DEFAULT_ROLE_PERMISSIONS, RoleConfig } from '../types/ppdi';
import { Shield, Save, CheckCircle, RotateCcw } from 'lucide-react';

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard & Statistik',
  pendaftaran: 'Registrasi & Approval',
  anggota: 'Data Induk Anggota',
  ekta: 'E-KTA Digital & Cetak',
  pensiun: 'Peringatan Purna Tugas',
  arsip: 'e-Arsip Berkas SK',
  iuran: 'Kas & Iuran Anggota',
  'settings-app': 'Setting Aplikasi',
  'settings-user': 'Daftar Akun Pengguna',
  'settings-role': 'Tingkatan (Role)',
  'settings-db': 'Setting Database',
  skema: 'Skema Database & SQL',
};

const ACTION_LABELS: Record<string, string> = {
  view: 'Lihat (View)',
  add: 'Tambah (Add)',
  edit: 'Ubah (Edit)',
  delete: 'Hapus (Delete)',
};

export const RoleManagementView: React.FC = () => {
  const { appSettings, updateAppSettings } = usePPDI();
  const [permissions, setPermissions] = useState<RoleConfig>(() => {
    return {
      ...DEFAULT_ROLE_PERMISSIONS,
      ...(appSettings.rolePermissions || {}),
    };
  });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (appSettings.rolePermissions && Object.keys(appSettings.rolePermissions).length > 0) {
      setPermissions({
        ...DEFAULT_ROLE_PERMISSIONS,
        ...appSettings.rolePermissions,
      });
    }
  }, [appSettings.rolePermissions]);

  const handlePermissionChange = (role: string, module: string, action: string, value: boolean) => {
    setPermissions(prev => ({
      ...prev,
      [role]: {
        ...(prev[role] || {}),
        [module]: {
          ...(prev[role]?.[module] || { view: false, add: false, edit: false, delete: false }),
          [action]: value,
        },
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    await updateAppSettings({ rolePermissions: permissions });
    setSaving(false);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  const handleResetDefaults = async () => {
    if (window.confirm('Kembalikan seluruh hak akses (permissions) ke standar sistem?')) {
      setPermissions(DEFAULT_ROLE_PERMISSIONS);
      setSaving(true);
      await updateAppSettings({ rolePermissions: DEFAULT_ROLE_PERMISSIONS });
      setSaving(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  const roleList = Object.keys(permissions).length > 0
    ? Object.keys(permissions)
    : Object.keys(DEFAULT_ROLE_PERMISSIONS);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-tight text-neutral-900">
            Tingkatan & Hak Akses (Role Permissions)
          </h2>
          <p className="text-xs text-neutral-500 mt-1">
            Konfigurasi visibilitas menu dan hak aksi (tambah, ubah, hapus) untuk setiap peran pengguna. Superadmin_Kabupaten memiliki hak akses penuh secara permanen.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleResetDefaults}
            type="button"
            className="px-3.5 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Standar</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            type="button"
            className="px-4 py-2 bg-[#064E3B] text-white rounded-lg flex items-center gap-2 cursor-pointer hover:bg-[#043d2e] text-xs font-bold shadow-sm transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4 text-amber-300" />
            <span>{saving ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
          </button>
        </div>
      </div>
      
      {success && (
        <div className="p-4 bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-xl flex items-center gap-2 text-xs font-semibold">
          <CheckCircle className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>Pengaturan hak akses peran berhasil disimpan! Perubahan diterapkan langsung ke navigasi menu.</span>
        </div>
      )}

      <div className="space-y-6">
        {roleList.map((role) => {
          const roleModules = permissions[role] || DEFAULT_ROLE_PERMISSIONS[role] || {};
          const isSuper = role === 'Superadmin_Kabupaten';

          return (
            <div key={role} className="bg-white rounded-2xl border border-neutral-200 shadow-xs overflow-hidden">
              <div className="p-4 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-lg ${isSuper ? 'bg-[#064E3B] text-amber-300' : 'bg-neutral-200 text-neutral-700'}`}>
                    <Shield className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-neutral-900 tracking-tight">{role}</h3>
                    <p className="text-[11px] text-neutral-500">
                      {isSuper ? 'Hak akses penuh tak terbatas (Administrator Utama)' : `Izin menu & aksi khusus untuk peran ${role}`}
                    </p>
                  </div>
                </div>
                {isSuper && (
                  <span className="px-2.5 py-1 bg-amber-100 border border-amber-300 text-amber-900 rounded-md text-[10px] font-mono font-bold uppercase">
                    Akses Penuh
                  </span>
                )}
              </div>

              <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.keys(roleModules).map((module) => {
                  const modulePerms = roleModules[module] || { view: false, add: false, edit: false, delete: false };
                  const actions = ['view', 'add', 'edit', 'delete'];

                  return (
                    <div key={module} className="p-3.5 bg-neutral-50/70 rounded-xl border border-neutral-200/80">
                      <h4 className="font-bold text-xs text-neutral-800 mb-2.5 flex items-center justify-between">
                        <span>{MODULE_LABELS[module] || module}</span>
                        <span className="text-[10px] font-mono text-neutral-400 font-normal">[{module}]</span>
                      </h4>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {actions.map((action) => (
                          <label key={action} className="flex items-center gap-1.5 cursor-pointer text-neutral-700 hover:text-neutral-900">
                            <input 
                              type="checkbox" 
                              disabled={isSuper}
                              checked={isSuper ? true : Boolean(modulePerms[action])}
                              onChange={(e) => handlePermissionChange(role, module, action, e.target.checked)}
                              className="rounded border-neutral-300 text-[#064E3B] focus:ring-[#064E3B] cursor-pointer"
                            />
                            <span className="text-[11px] font-medium">{ACTION_LABELS[action] || action}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
