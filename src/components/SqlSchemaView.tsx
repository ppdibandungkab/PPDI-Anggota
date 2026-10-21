import React, { useState } from 'react';
import { usePPDI } from '../context/PPDIContext';
import {
  MYSQL_SCHEMA_SQL,
  LARAVEL_MIGRATION_CODE,
  CODEIGNITER4_MIGRATION_CODE,
} from '../utils/sqlGenerator';
import {
  Database,
  Copy,
  Check,
  Download,
  Code2,
  Table,
  Layers,
  KeyRound,
  FileCode,
} from 'lucide-react';

export const SqlSchemaView: React.FC = () => {
  const { dbStatus } = usePPDI();
  const [activeTab, setActiveTab] = useState<'mysql' | 'views' | 'laravel' | 'ci4' | 'erd'>('mysql');
  const [copied, setCopied] = useState(false);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSQL = () => {
    const blob = new Blob([MYSQL_SCHEMA_SQL], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ppdi_kabupaten_bandung_schema_${new Date().toISOString().slice(0, 10)}.sql`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-neutral-200 gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 tracking-tight">
            Rancangan Skema Database Relasional (MySQL / MariaDB)
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Arsitektur 8 tabel normalisasi, index komposit, view agregasi, dan script migrasi backend Laravel / CI4
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadSQL}
            className="px-3 py-1.5 text-xs font-semibold text-neutral-700 bg-white hover:bg-neutral-50 border border-neutral-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-neutral-600" />
            <span>Unduh File .SQL</span>
          </button>
        </div>
      </div>

      {/* Active MySQL Database Connection Card */}
      <div className="bg-emerald-950 text-white p-5 rounded-2xl border border-emerald-800 shadow-md space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-emerald-800/80 gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-800 flex items-center justify-center text-amber-300">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-sm text-white">Konfigurasi Database MySQL Server Terpasang</div>
              <div className="text-[11px] text-emerald-300 font-mono">
                {dbStatus?.host ? `${dbStatus.host}:${dbStatus.port || 3306}` : 'localhost:3306'} &rarr; {dbStatus?.database || 'MySQL Database'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-0.5 rounded bg-emerald-900 border border-emerald-700 text-amber-300 font-semibold font-mono">
              User: {dbStatus?.user || '-'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="bg-emerald-900/50 p-2.5 rounded-lg border border-emerald-800/60">
            <span className="text-[10px] text-emerald-400 block font-sans">URL / IP Server</span>
            <span className="font-semibold text-white">{dbStatus?.host || 'localhost'}</span>
          </div>
          <div className="bg-emerald-900/50 p-2.5 rounded-lg border border-emerald-800/60">
            <span className="text-[10px] text-emerald-400 block font-sans">Database</span>
            <span className="font-semibold text-amber-300">{dbStatus?.database || '-'}</span>
          </div>
          <div className="bg-emerald-900/50 p-2.5 rounded-lg border border-emerald-800/60">
            <span className="text-[10px] text-emerald-400 block font-sans">User MySQL</span>
            <span className="font-semibold text-white">{dbStatus?.user || '-'}</span>
          </div>
          <div className="bg-emerald-900/50 p-2.5 rounded-lg border border-emerald-800/60">
            <span className="text-[10px] text-emerald-400 block font-sans">Port</span>
            <span className="font-semibold text-emerald-200">{dbStatus?.port || 3306}</span>
          </div>
        </div>

        <div className="text-[11px] text-emerald-300/90 flex flex-col sm:flex-row sm:items-center justify-between pt-1 gap-2">
          <span>Koneksi dikelola oleh modul pool <code className="text-amber-300">mysql2/promise</code> di server Express (<code className="text-emerald-200">server.ts</code>).</span>
          <span className="font-mono text-emerald-400 text-[10px]">Config Path: /.env</span>
        </div>
      </div>

      {/* Overview Cards: 8 Tables breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="p-4 bg-white rounded-xl border border-neutral-200 space-y-2">
          <div className="font-bold text-neutral-900 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
            <span>A. Wilayah & Kelembagaan</span>
          </div>
          <ul className="space-y-1 text-neutral-600 text-[11px]">
            <li>1. <strong className="font-mono">ref_kecamatan</strong>: Kode & Nama Kecamatan</li>
            <li>2. <strong className="font-mono">ref_desa</strong>: Kode Kemendagri & Kantor Desa</li>
            <li>3. <strong className="font-mono">ref_jabatan</strong>: 4 Kategori SOTK Permendagri</li>
          </ul>
        </div>

        <div className="p-4 bg-white rounded-xl border border-neutral-200 space-y-2">
          <div className="font-bold text-neutral-900 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span>B. Data Induk & Keanggotaan</span>
          </div>
          <ul className="space-y-1 text-neutral-600 text-[11px]">
            <li>4. <strong className="font-mono">anggota</strong>: NIK 16 digit, NIAP, Tgl Lahir</li>
            <li>5. <strong className="font-mono">riwayat_jabatan</strong>: No SK, TMT, Status Aktif</li>
            <li>6. <strong className="font-mono">keanggotaan_ppdi</strong>: No KTA, Status KTA</li>
          </ul>
        </div>

        <div className="p-4 bg-white rounded-xl border border-neutral-200 space-y-2">
          <div className="font-bold text-neutral-900 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-neutral-700"></span>
            <span>C. Transaksional & RBAC</span>
          </div>
          <ul className="space-y-1 text-neutral-600 text-[11px]">
            <li>7. <strong className="font-mono">iuran_anggota</strong>: Kas Rp 35rb/bln, Verifikasi</li>
            <li>8. <strong className="font-mono">users</strong>: Akses Superadmin, Camat, Anggota</li>
            <li>+ <strong className="font-mono">Views</strong>: Agregat Aktif & Purna Tugas Alert</li>
          </ul>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-neutral-200">
        <div className="flex items-center gap-1 text-xs">
          <button
            onClick={() => setActiveTab('mysql')}
            className={`px-3 py-2 font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'mysql'
                ? 'border-emerald-700 text-emerald-800 font-semibold'
                : 'border-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            MySQL / MariaDB DDL
          </button>
          <button
            onClick={() => setActiveTab('erd')}
            className={`px-3 py-2 font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'erd'
                ? 'border-emerald-700 text-emerald-800 font-semibold'
                : 'border-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Visual Skema Relasi (ERD)
          </button>
          <button
            onClick={() => setActiveTab('laravel')}
            className={`px-3 py-2 font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'laravel'
                ? 'border-emerald-700 text-emerald-800 font-semibold'
                : 'border-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Migrasi Laravel 11 (PHP)
          </button>
          <button
            onClick={() => setActiveTab('ci4')}
            className={`px-3 py-2 font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'ci4'
                ? 'border-emerald-700 text-emerald-800 font-semibold'
                : 'border-transparent text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Migrasi CodeIgniter 4 (PHP)
          </button>
        </div>

        <button
          onClick={() => {
            if (activeTab === 'mysql') handleCopy(MYSQL_SCHEMA_SQL);
            else if (activeTab === 'laravel') handleCopy(LARAVEL_MIGRATION_CODE);
            else if (activeTab === 'ci4') handleCopy(CODEIGNITER4_MIGRATION_CODE);
          }}
          className="text-xs text-neutral-600 hover:text-neutral-900 flex items-center gap-1.5 py-1 px-2.5 rounded hover:bg-neutral-100 cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Tersalin!' : 'Salin Kode'}</span>
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'mysql' && (
        <div className="bg-neutral-900 text-neutral-100 rounded-xl p-4 overflow-x-auto font-mono text-xs leading-relaxed max-h-[600px] border border-neutral-800">
          <pre>{MYSQL_SCHEMA_SQL}</pre>
        </div>
      )}

      {activeTab === 'erd' && (
        <div className="bg-white p-6 rounded-xl border border-neutral-200 space-y-6">
          <div className="text-xs text-neutral-600">
            Berikut peta relasi entitas basis data (Entity Relationship) dengan integritas referensial (Foreign Keys) dan indexing:
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
            {/* Table 1 */}
            <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-300 space-y-1">
              <div className="font-bold text-emerald-800 pb-1 border-b border-neutral-200 flex items-center justify-between">
                <span>ref_kecamatan</span>
                <span className="text-[10px] text-neutral-400 font-sans">Master</span>
              </div>
              <div className="text-neutral-800 font-semibold">🔑 id_kecamatan (PK)</div>
              <div className="text-neutral-600">nama_kecamatan</div>
            </div>

            {/* Table 2 */}
            <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-300 space-y-1">
              <div className="font-bold text-emerald-800 pb-1 border-b border-neutral-200 flex items-center justify-between">
                <span>ref_desa</span>
                <span className="text-[10px] text-neutral-400 font-sans">Master</span>
              </div>
              <div className="text-neutral-800 font-semibold">🔑 id_desa (PK)</div>
              <div className="text-emerald-700">🔗 id_kecamatan (FK)</div>
              <div className="text-neutral-600">nama_desa</div>
              <div className="text-neutral-600">alamat_kantor_desa</div>
            </div>

            {/* Table 3 */}
            <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-300 space-y-1">
              <div className="font-bold text-emerald-800 pb-1 border-b border-neutral-200 flex items-center justify-between">
                <span>ref_jabatan</span>
                <span className="text-[10px] text-neutral-400 font-sans">Master</span>
              </div>
              <div className="text-neutral-800 font-semibold">🔑 id_jabatan (PK)</div>
              <div className="text-neutral-600">nama_jabatan</div>
              <div className="text-neutral-600">kategori_jabatan (ENUM)</div>
            </div>

            {/* Table 4 */}
            <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-300 space-y-1">
              <div className="font-bold text-neutral-900 pb-1 border-b border-neutral-200 flex items-center justify-between">
                <span>anggota</span>
                <span className="text-[10px] text-amber-600 font-sans">Entitas Induk</span>
              </div>
              <div className="text-neutral-800 font-semibold">🔑 id_anggota (PK)</div>
              <div className="text-amber-800">⚡ nik (16 digit UNIQUE)</div>
              <div className="text-neutral-600">nipd</div>
              <div className="text-neutral-600">nama_lengkap</div>
              <div className="text-amber-700 font-semibold">tanggal_lahir (60 Th)</div>
              <div className="text-neutral-600">no_hp_wa</div>
            </div>

            {/* Table 5 */}
            <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-300 space-y-1">
              <div className="font-bold text-neutral-900 pb-1 border-b border-neutral-200 flex items-center justify-between">
                <span>riwayat_jabatan</span>
                <span className="text-[10px] text-neutral-400 font-sans">Transaksional</span>
              </div>
              <div className="text-neutral-800 font-semibold">🔑 id_riwayat (PK)</div>
              <div className="text-emerald-700">🔗 id_anggota (FK)</div>
              <div className="text-emerald-700">🔗 id_desa (FK)</div>
              <div className="text-emerald-700">🔗 id_jabatan (FK)</div>
              <div className="text-neutral-600">no_sk_pengangkatan</div>
              <div className="text-neutral-600">status_aktif (ENUM)</div>
            </div>

            {/* Table 6 */}
            <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-300 space-y-1">
              <div className="font-bold text-neutral-900 pb-1 border-b border-neutral-200 flex items-center justify-between">
                <span>keanggotaan_ppdi</span>
                <span className="text-[10px] text-neutral-400 font-sans">KTA</span>
              </div>
              <div className="text-neutral-800 font-semibold">🔑 id_ppdi (PK)</div>
              <div className="text-emerald-700">🔗 id_anggota (FK)</div>
              <div className="text-amber-800">⚡ no_kta (UNIQUE)</div>
              <div className="text-neutral-600">jabatan_pengurus</div>
              <div className="text-neutral-600">status_kta (ENUM)</div>
            </div>

            {/* Table 7 */}
            <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-300 space-y-1">
              <div className="font-bold text-neutral-900 pb-1 border-b border-neutral-200 flex items-center justify-between">
                <span>iuran_anggota</span>
                <span className="text-[10px] text-neutral-400 font-sans">Keuangan</span>
              </div>
              <div className="text-neutral-800 font-semibold">🔑 id_iuran (PK)</div>
              <div className="text-emerald-700">🔗 id_anggota (FK)</div>
              <div className="text-neutral-600">tahun, bulan</div>
              <div className="text-neutral-600">jumlah (DECIMAL)</div>
              <div className="text-neutral-600">status_verifikasi</div>
            </div>

            {/* Table 8 */}
            <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-300 space-y-1">
              <div className="font-bold text-neutral-900 pb-1 border-b border-neutral-200 flex items-center justify-between">
                <span>users</span>
                <span className="text-[10px] text-neutral-400 font-sans">RBAC</span>
              </div>
              <div className="text-neutral-800 font-semibold">🔑 id_user (PK)</div>
              <div className="text-neutral-600">username, email</div>
              <div className="text-neutral-600">role (ENUM)</div>
              <div className="text-emerald-700">🔗 id_anggota (FK)</div>
              <div className="text-emerald-700">🔗 id_kecamatan (FK)</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'laravel' && (
        <div className="bg-neutral-900 text-neutral-100 rounded-xl p-4 overflow-x-auto font-mono text-xs leading-relaxed max-h-[600px] border border-neutral-800">
          <pre>{LARAVEL_MIGRATION_CODE}</pre>
        </div>
      )}

      {activeTab === 'ci4' && (
        <div className="bg-neutral-900 text-neutral-100 rounded-xl p-4 overflow-x-auto font-mono text-xs leading-relaxed max-h-[600px] border border-neutral-800">
          <pre>{CODEIGNITER4_MIGRATION_CODE}</pre>
        </div>
      )}
    </div>
  );
};
