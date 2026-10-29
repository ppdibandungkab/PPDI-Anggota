import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import mysql from 'mysql2/promise';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Detect .env in multiple candidate directories (critical for hosting / cPanel)
const envCandidatePaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '..', '.env'),
  path.join(process.cwd(), '..', '.env'),
];

let detectedEnvPath: string = path.resolve(process.cwd(), '.env');
let envFoundOnDisk = false;

for (const p of envCandidatePaths) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p, override: true });
    detectedEnvPath = p;
    envFoundOnDisk = true;
    console.log(`[Database Init] File .env terdeteksi di: ${p}`);
    break;
  }
}
if (!envFoundOnDisk) {
  dotenv.config(); // default fallback
  console.warn('[Database Init] File .env tidak ditemukan secara langsung di folder root hosting, menggunakan env process.');
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Enable CORS for local cross-port development (e.g. Vite on 5173/4173 connecting to Express on 3000)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Dynamic DB config getter matching environment variables
function getDbConfig(override?: any) {
  return {
    host: override?.host || process.env.DB_HOST || '',
    port: Number(override?.port || process.env.DB_PORT) || 3306,
    user: override?.user || process.env.DB_USER || '',
    password: override?.password !== undefined ? override.password : (process.env.DB_PASSWORD || ''),
    database: override?.database || process.env.DB_NAME || '',
    connectTimeout: 8000,
  };
}

let activeDbConfig = getDbConfig();
let pool: mysql.Pool | null = null;

function createOrGetPool(overrideConfig?: any, forceRecreate = false): mysql.Pool {
  if (pool && !forceRecreate && !overrideConfig) {
    return pool;
  }
  if (forceRecreate && pool) {
    try {
      pool.end();
    } catch (_) {}
    pool = null;
  }

  activeDbConfig = overrideConfig ? getDbConfig(overrideConfig) : getDbConfig();
  pool = mysql.createPool({
    ...activeDbConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });
  return pool;
}

// Initial pool creation
createOrGetPool();


// File Upload storage directories configuration
const UPLOADS_ROOT = path.resolve(process.cwd(), 'public', 'uploads');
const FOTO_DIR = path.join(UPLOADS_ROOT, 'foto');
const SK_DIR = path.join(UPLOADS_ROOT, 'sk');

try {
  fs.mkdirSync(FOTO_DIR, { recursive: true });
  fs.mkdirSync(SK_DIR, { recursive: true });
} catch (e) {
  console.error('Failed to create upload directories:', e);
}

// Serve uploaded static files
app.use('/uploads', express.static(UPLOADS_ROOT));
app.use(express.static(path.resolve(process.cwd(), 'public')));

// ====================================================================
// 0. UPLOAD FOTO & BERKAS SK (DEDICATED FOLDERS: /uploads/foto & /uploads/sk)
// ====================================================================
app.post('/api/upload', async (req, res) => {
  try {
    const { type, fileName, fileData, nik } = req.body;
    if (!fileData) {
      return res.status(400).json({ success: false, message: 'Data file base64 tidak ditemukan' });
    }

    const folderType = type === 'sk' ? 'sk' : 'foto';
    const targetFolder = folderType === 'sk' ? SK_DIR : FOTO_DIR;

    // Extract base64 payload & mime
    let mimeType = '';
    let base64Clean = fileData;
    const matches = fileData.match(/^data:([A-Za-z0-9\-+/.]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      mimeType = matches[1];
      base64Clean = matches[2];
    }

    // Determine extension
    let ext = path.extname(fileName || '').toLowerCase();
    if (!ext) {
      if (mimeType.includes('pdf')) ext = '.pdf';
      else if (mimeType.includes('png')) ext = '.png';
      else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = '.jpg';
      else if (mimeType.includes('webp')) ext = '.webp';
      else ext = folderType === 'sk' ? '.pdf' : '.jpg';
    }

    const cleanBase = (fileName || `${folderType}_doc`)
      .replace(ext, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40);

    const prefix = nik ? `${nik}_` : '';
    const timestamp = Date.now().toString().slice(-6);
    const finalFileName = `${folderType}_${prefix}${cleanBase}_${timestamp}${ext}`;
    const filePath = path.join(targetFolder, finalFileName);

    const buffer = Buffer.from(base64Clean, 'base64');
    fs.writeFileSync(filePath, buffer);

    const fileUrl = `/uploads/${folderType}/${finalFileName}`;
    return res.json({
      success: true,
      message: `File ${folderType.toUpperCase()} berhasil diunggah ke folder server`,
      url: fileUrl,
      fileName: finalFileName,
      folder: folderType,
      sizeBytes: buffer.length,
      mimeType: mimeType || ext,
    });
  } catch (err: any) {
    console.error('Upload handling error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// List files in upload directories
app.get('/api/uploads/list', (_req, res) => {
  try {
    const listFiles = (dir: string, type: 'foto' | 'sk') => {
      if (!fs.existsSync(dir)) return [];
      const files = fs.readdirSync(dir);
      return files
        .filter((f) => f !== '.gitkeep')
        .map((f) => {
          const stat = fs.statSync(path.join(dir, f));
          return {
            name: f,
            type,
            url: `/uploads/${type}/${f}`,
            sizeBytes: stat.size,
            mtime: stat.mtime,
          };
        });
    };

    const fotoFiles = listFiles(FOTO_DIR, 'foto');
    const skFiles = listFiles(SK_DIR, 'sk');

    return res.json({
      success: true,
      folders: {
        fotoDir: FOTO_DIR,
        skDir: SK_DIR,
      },
      foto: {
        count: fotoFiles.length,
        files: fotoFiles,
      },
      sk: {
        count: skFiles.length,
        files: skFiles,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Delete file from upload directory
app.delete('/api/uploads/:folder/:fileName', (req, res) => {
  try {
    const { folder, fileName } = req.params;
    if (folder !== 'foto' && folder !== 'sk') {
      return res.status(400).json({ success: false, message: 'Folder tidak valid' });
    }
    const targetDir = folder === 'sk' ? SK_DIR : FOTO_DIR;
    const safeFileName = path.basename(fileName);
    const filePath = path.join(targetDir, safeFileName);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return res.json({ success: true, message: `Berkas ${safeFileName} berhasil dihapus dari folder /uploads/${folder}` });
    } else {
      return res.status(404).json({ success: false, message: 'Berkas tidak ditemukan' });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ====================================================================
// 1. DATABASE STATUS, HEALTH CHECK & HOSTING DIAGNOSTICS
// ====================================================================
app.get('/api/db/status', async (_req, res) => {
  const startTime = Date.now();
  const currentConfig = getDbConfig();
  const envFileExists = fs.existsSync(detectedEnvPath);

  try {
    const currentPool = createOrGetPool();
    const connection = await currentPool.getConnection();
    const [rows]: [any[], any] = await connection.query(
      'SELECT VERSION() AS version, DATABASE() as db_name, NOW() as server_time'
    );
    const [tables]: [any[], any] = await connection.query('SHOW TABLES');
    connection.release();

    const latencyMs = Date.now() - startTime;
    return res.json({
      success: true,
      status: 'Connected',
      latencyMs,
      host: currentConfig.host,
      port: currentConfig.port,
      database: currentConfig.database,
      user: currentConfig.user,
      envDetected: envFileExists,
      envPath: detectedEnvPath,
      serverVersion: rows[0]?.version || 'MySQL / MariaDB',
      serverTime: rows[0]?.server_time,
      tablesCount: tables.length,
      tables: tables.map((t: any) => Object.values(t)[0]),
      message: `Koneksi aktif ke database MySQL hosting (${currentConfig.host}:${currentConfig.port}) dengan ${tables.length} tabel.`,
    });
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    let hint = error.message;
    let diagnosis = 'Koneksi ke database MySQL gagal.';
    const hostingTips: string[] = [];

    if (error.code === 'ETIMEDOUT') {
      diagnosis = `Koneksi ke ${currentConfig.host}:${currentConfig.port} waktu habis (Connection Timed Out).`;
      hint = 'Firewall cPanel/hosting memblokir port 3306 atau IP remote belum di-whitelist di cPanel.';
      hostingTips.push('Buka cPanel server database -> menu "Remote MySQL" -> Tambahkan IP hosting aplikasi Anda atau tanda "%" (izinkan semua host).');
      hostingTips.push('Jika aplikasi Node.js dan database berada di hosting cPanel yang SAMA, ubah DB_HOST menjadi "localhost" atau "127.0.0.1", karena firewall CSF cPanel biasanya memblokir koneksi ke IP publik dirinya sendiri.');
    } else if (error.code === 'ECONNREFUSED') {
      diagnosis = `Port ${currentConfig.port} pada host ${currentConfig.host} menolak sambungan (Connection Refused).`;
      hint = 'Service MySQL tidak aktif di port tersebut atau host belum tepat.';
      hostingTips.push('Pastikan port database adalah 3306.');
      hostingTips.push('Coba ubah DB_HOST menjadi "localhost" di file .env jika berada di server yang sama.');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      diagnosis = `Autentikasi ditolak untuk user "${currentConfig.user}" ke database "${currentConfig.database}".`;
      hint = 'Username atau password MySQL salah, atau user belum diberi hak akses (privileges) ke database.';
      hostingTips.push('Buka cPanel -> MySQL Databases -> periksa User dan Password.');
      hostingTips.push('Pastikan user telah di-assign ke database dan diberi centang "ALL PRIVILEGES".');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      diagnosis = `Database "${currentConfig.database}" tidak ditemukan di server MySQL.`;
      hint = 'Nama database salah atau belum dibuat di cPanel MySQL Databases.';
      hostingTips.push('Pastikan nama database di .env persis dengan yang ada di cPanel (perhatikan prefix username cPanel jika ada).');
    } else if (!envFileExists) {
      diagnosis = 'File .env tidak terdeteksi di folder root hosting!';
      hint = 'Di cPanel File Manager, file berawalan titik (.env) tersembunyi secara default.';
      hostingTips.push('Buka cPanel File Manager -> klik Settings di pojok kanan atas -> centang "Show Hidden Files (dotfiles)" -> simpan.');
      hostingTips.push('Pastikan file .env ada di folder yang sama dengan server.js.');
    }

    return res.status(200).json({
      success: false,
      status: 'Disconnected / Offline',
      latencyMs,
      host: currentConfig.host,
      port: currentConfig.port,
      database: currentConfig.database,
      user: currentConfig.user,
      envDetected: envFileExists,
      envPath: detectedEnvPath,
      error: error.message || 'Connection failed',
      code: error.code || 'UNKNOWN_ERROR',
      hint,
      diagnosis,
      hostingTips,
    });
  }
});

// Endpoint untuk menguji koneksi fleksibel (misal tes host lokal vs remote hosting)
app.post('/api/db/test-connection', async (req, res) => {
  const { host, port, user, password, database } = req.body;
  const testConfig = {
    host: host || activeDbConfig.host,
    port: Number(port) || activeDbConfig.port || 3306,
    user: user || activeDbConfig.user,
    password: password !== undefined ? password : activeDbConfig.password,
    database: database || activeDbConfig.database,
    connectTimeout: 6000,
  };
  const startTime = Date.now();
  let tempConn: mysql.Connection | null = null;
  try {
    tempConn = await mysql.createConnection(testConfig);
    const [rows]: [any[], any] = await tempConn.query('SELECT VERSION() as version, DATABASE() as db_name, NOW() as server_time');
    const [tables]: [any[], any] = await tempConn.query('SHOW TABLES');
    await tempConn.end();
    return res.json({
      success: true,
      latencyMs: Date.now() - startTime,
      serverVersion: rows[0]?.version,
      serverTime: rows[0]?.server_time,
      tablesCount: tables.length,
      config: { host: testConfig.host, port: testConfig.port, user: testConfig.user, database: testConfig.database },
      message: `Berhasil tersambung ke MySQL di host "${testConfig.host}"! (${tables.length} tabel ditemukan)`,
    });
  } catch (err: any) {
    if (tempConn) {
      try { await tempConn.end(); } catch (_) {}
    }
    return res.json({
      success: false,
      latencyMs: Date.now() - startTime,
      error: err.message,
      code: err.code || 'TEST_FAILED',
      config: { host: testConfig.host, port: testConfig.port, user: testConfig.user, database: testConfig.database },
      hint:
        err.code === 'ETIMEDOUT'
          ? `Timeout ke ${testConfig.host}:3306. Pastikan port 3306 dibuka atau izinkan Remote MySQL di cPanel.`
          : err.message,
    });
  }
});

// Endpoint untuk memuat ulang koneksi (reconnect) & reload .env
app.post('/api/db/reconnect', async (req, res) => {
  try {
    if (fs.existsSync(detectedEnvPath)) {
      dotenv.config({ path: detectedEnvPath, override: true });
    }
    const newPool = createOrGetPool(req.body.config, true);
    const conn = await newPool.getConnection();
    const [rows]: [any[], any] = await conn.query('SELECT VERSION() as version, DATABASE() as db');
    conn.release();
    return res.json({
      success: true,
      message: `Koneksi database berhasil dimuat ulang (Reconnected)! Host: ${activeDbConfig.host}`,
      version: rows[0]?.version,
      database: rows[0]?.db,
    });
  } catch (err: any) {
    return res.status(200).json({
      success: false,
      message: `Gagal menghubungkan ulang: ${err.message}`,
      error: err.message,
      code: err.code,
    });
  }
});

// Endpoint untuk menyimpan perubahan konfigurasi ke file .env di hosting
app.post('/api/db/save-env', async (req, res) => {
  try {
    const { host, port, user, password, database } = req.body;
    const targetEnv = detectedEnvPath || path.resolve(process.cwd(), '.env');

    let currentEnvContent = '';
    if (fs.existsSync(targetEnv)) {
      currentEnvContent = fs.readFileSync(targetEnv, 'utf-8');
    }

    const updateKey = (content: string, key: string, val: string) => {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(content)) {
        return content.replace(regex, `${key}="${val}"`);
      }
      return content + `\n${key}="${val}"`;
    };

    let newContent = currentEnvContent;
    if (host !== undefined) newContent = updateKey(newContent, 'DB_HOST', host);
    if (port !== undefined) newContent = updateKey(newContent, 'DB_PORT', String(port));
    if (user !== undefined) newContent = updateKey(newContent, 'DB_USER', user);
    if (password !== undefined) newContent = updateKey(newContent, 'DB_PASSWORD', password);
    if (database !== undefined) newContent = updateKey(newContent, 'DB_NAME', database);

    fs.writeFileSync(targetEnv, newContent.trim() + '\n', 'utf-8');
    dotenv.config({ path: targetEnv, override: true });

    // Recreate pool immediately with new settings
    createOrGetPool({ host, port, user, password, database }, true);

    return res.json({
      success: true,
      message: 'Konfigurasi .env berhasil disimpan dan pool koneksi MySQL telah diperbarui.',
      envPath: targetEnv,
      activeHost: host || activeDbConfig.host,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint untuk inisialisasi / sinkronisasi struktur seluruh tabel database PPDI
app.post('/api/db/init-tables', async (_req, res) => {
  try {
    const currentPool = createOrGetPool();
    const conn = await currentPool.getConnection();

    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    // 1. ref_kecamatan
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`ref_kecamatan\` (
        \`id_kecamatan\` VARCHAR(10) NOT NULL,
        \`nama_kecamatan\` VARCHAR(100) NOT NULL,
        PRIMARY KEY (\`id_kecamatan\`),
        KEY \`idx_nama_kecamatan\` (\`nama_kecamatan\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 2. ref_desa
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`ref_desa\` (
        \`id_desa\` VARCHAR(20) NOT NULL,
        \`id_kecamatan\` VARCHAR(10) NOT NULL,
        \`nama_desa\` VARCHAR(100) NOT NULL,
        \`alamat_kantor_desa\` TEXT NULL,
        PRIMARY KEY (\`id_desa\`),
        KEY \`idx_desa_kecamatan\` (\`id_kecamatan\`),
        KEY \`idx_nama_desa\` (\`nama_desa\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 3. ref_jabatan
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`ref_jabatan\` (
        \`id_jabatan\` INT AUTO_INCREMENT NOT NULL,
        \`nama_jabatan\` VARCHAR(100) NOT NULL,
        \`kategori_jabatan\` VARCHAR(50) NOT NULL,
        PRIMARY KEY (\`id_jabatan\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 4. anggota
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`anggota\` (
        \`id_anggota\` VARCHAR(36) NOT NULL,
        \`nik\` VARCHAR(16) NOT NULL,
        \`nipd\` VARCHAR(30) NULL,
        \`nama_lengkap\` VARCHAR(150) NOT NULL,
        \`gelar_depan\` VARCHAR(30) NULL,
        \`gelar_belakang\` VARCHAR(50) NULL,
        \`tempat_lahir\` VARCHAR(100) NOT NULL,
        \`tanggal_lahir\` DATE NOT NULL,
        \`jenis_kelamin\` ENUM('L', 'P') NOT NULL,
        \`agama\` VARCHAR(30) NOT NULL DEFAULT 'Islam',
        \`pendidikan_terakhir\` VARCHAR(30) NOT NULL,
        \`no_hp_wa\` VARCHAR(20) NOT NULL,
        \`email\` VARCHAR(100) NULL,
        \`foto\` VARCHAR(255) NULL,
        \`alamat_rumah\` TEXT NOT NULL,
        \`status_pernikahan\` VARCHAR(30) NOT NULL DEFAULT 'Kawin',
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id_anggota\`),
        UNIQUE KEY \`uq_anggota_nik\` (\`nik\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Migration: drop niap column if exists, rename niap_nipd to nipd if exists
    try { await conn.query(`ALTER TABLE anggota DROP COLUMN niap`); } catch (_) {}
    try { await conn.query(`ALTER TABLE anggota CHANGE COLUMN niap_nipd nipd VARCHAR(30) NULL`); } catch (_) {
      try { await conn.query(`ALTER TABLE anggota RENAME COLUMN niap_nipd TO nipd`); } catch (_) {}
    }

    // 5. riwayat_jabatan
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`riwayat_jabatan\` (
        \`id_riwayat\` VARCHAR(36) NOT NULL,
        \`id_anggota\` VARCHAR(36) NOT NULL,
        \`id_desa\` VARCHAR(20) NOT NULL,
        \`id_jabatan\` INT NOT NULL,
        \`no_sk_pengangkatan\` VARCHAR(100) NOT NULL,
        \`tgl_sk_pengangkatan\` DATE NOT NULL,
        \`tmt_jabatan\` DATE NOT NULL,
        \`status_aktif\` VARCHAR(30) NOT NULL DEFAULT 'Aktif',
        \`file_sk\` VARCHAR(255) NULL,
        \`keterangan\` TEXT NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id_riwayat\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 6. keanggotaan_ppdi
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`keanggotaan_ppdi\` (
        \`id_ppdi\` VARCHAR(36) NOT NULL,
        \`id_anggota\` VARCHAR(36) NOT NULL,
        \`no_kta\` VARCHAR(50) NOT NULL,
        \`tgl_bergabung\` DATE NOT NULL,
        \`jabatan_pengurus\` VARCHAR(100) NOT NULL DEFAULT 'Anggota Biasa',
        \`status_kta\` VARCHAR(30) NOT NULL DEFAULT 'Aktif',
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id_ppdi\`),
        UNIQUE KEY \`uq_ppdi_no_kta\` (\`no_kta\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 7. iuran_anggota
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`iuran_anggota\` (
        \`id_iuran\` VARCHAR(36) NOT NULL,
        \`id_anggota\` VARCHAR(36) NOT NULL,
        \`tahun\` SMALLINT NOT NULL,
        \`bulan\` TINYINT NOT NULL,
        \`jumlah\` DECIMAL(12,2) NOT NULL DEFAULT 35000.00,
        \`tgl_bayar\` DATETIME NOT NULL,
        \`bukti_trf\` VARCHAR(255) NULL,
        \`status_verifikasi\` VARCHAR(30) NOT NULL DEFAULT 'Pending',
        \`catatan\` VARCHAR(255) NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id_iuran\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Role Pengguna
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`roles\` (
        \`id_role\` INT AUTO_INCREMENT NOT NULL,
        \`nama_role\` VARCHAR(50) NOT NULL,
        PRIMARY KEY (\`id_role\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Group Pengguna
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`user_groups\` (
        \`id_group\` INT AUTO_INCREMENT NOT NULL,
        \`nama_group\` VARCHAR(50) NOT NULL,
        PRIMARY KEY (\`id_group\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 8. users
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`users\` (
        \`id_user\` INT AUTO_INCREMENT NOT NULL,
        \`username\` VARCHAR(50) NOT NULL,
        \`email\` VARCHAR(100) NOT NULL,
        \`nama\` VARCHAR(150) NULL,
        \`password\` VARCHAR(255) NOT NULL,
        \`role\` VARCHAR(50) NOT NULL DEFAULT 'Admin_Kecamatan',
        \`id_anggota\` VARCHAR(36) NULL,
        \`id_kecamatan_scope\` VARCHAR(10) NULL,
        \`id_kecamatan\` VARCHAR(10) NULL,
        \`id_desa\` VARCHAR(20) NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id_user\`),
        UNIQUE KEY \`uq_user_username\` (\`username\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 9. pendaftaran_perangkat_desa
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`pendaftaran_perangkat_desa\` (
        \`id_pendaftaran\` INT AUTO_INCREMENT NOT NULL,
        \`nik\` VARCHAR(16) NOT NULL,
        \`nama_lengkap\` VARCHAR(150) NOT NULL,
        \`gelar_depan\` VARCHAR(30) NULL,
        \`gelar_belakang\` VARCHAR(50) NULL,
        \`tempat_lahir\` VARCHAR(100) NOT NULL,
        \`tanggal_lahir\` DATE NOT NULL,
        \`jenis_kelamin\` ENUM('L', 'P') NOT NULL,
        \`agama\` VARCHAR(30) NOT NULL DEFAULT 'Islam',
        \`pendidikan_terakhir\` VARCHAR(30) NOT NULL,
        \`no_hp_wa\` VARCHAR(20) NOT NULL,
        \`email\` VARCHAR(100) NULL,
        \`alamat_rumah\` TEXT NOT NULL,
        \`status_pernikahan\` VARCHAR(30) NOT NULL DEFAULT 'Kawin',
        \`id_kecamatan\` VARCHAR(10) NOT NULL,
        \`id_desa\` VARCHAR(20) NOT NULL,
        \`id_jabatan\` INT NOT NULL,
        \`no_sk_pengangkatan\` VARCHAR(100) NULL,
        \`tgl_sk_pengangkatan\` DATE NULL,
        \`tmt_jabatan\` DATE NULL,
        \`file_sk\` VARCHAR(255) NULL,
        \`status_approval\` VARCHAR(30) NOT NULL DEFAULT 'Menunggu',
        \`catatan_approval\` TEXT NULL,
        \`tgl_pendaftaran\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`tgl_approval\` DATETIME NULL,
        \`approved_by\` VARCHAR(100) NULL,
        PRIMARY KEY (\`id_pendaftaran\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Migration for pendaftaran_perangkat_desa columns
    try { await conn.query(`ALTER TABLE pendaftaran_perangkat_desa ADD COLUMN gelar_depan VARCHAR(30) NULL AFTER nama_lengkap`); } catch (_) {}
    try { await conn.query(`ALTER TABLE pendaftaran_perangkat_desa ADD COLUMN gelar_belakang VARCHAR(50) NULL AFTER gelar_depan`); } catch (_) {}

    // Seed default superadmin if users table empty
    const [userRows]: [any[], any] = await conn.query('SELECT COUNT(*) as cnt FROM users');
    const defaultAdminPass = process.env.ADMIN_PASSWORD || 'admin';
    if (userRows[0]?.cnt === 0) {
      await conn.query(`
        INSERT INTO users (id_user, username, email, nama, password, role)
        VALUES (1, 'superadmin', 'admin.kabupaten@ppdi-bandungkab.id', 'SUPERADMIN KABUPATEN', ?, 'Superadmin_Kabupaten')
      `, [defaultAdminPass]);
    } else {
      // Ensure superadmin without password has defaultAdminPass so authentication succeeds
      await conn.query(`
        UPDATE users SET password = ? WHERE username = 'superadmin' AND (password = '' OR password IS NULL)
      `, [defaultAdminPass]);
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    conn.release();

    return res.json({
      success: true,
      message: 'Seluruh tabel dan struktur database PPDI Kabupaten Bandung berhasil diinisialisasi di MySQL!',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ====================================================================
// 2. MASTER WILAYAH & JABATAN (ref_kecamatan, ref_desa, ref_jabatan)
// ====================================================================
app.get('/api/ref/all', async (_req, res) => {
  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();
    const [kecamatan] = await conn.query('SELECT * FROM ref_kecamatan ORDER BY nama_kecamatan');
    const [desa] = await conn.query('SELECT * FROM ref_desa ORDER BY nama_desa');
    const [jabatan] = await conn.query('SELECT * FROM ref_jabatan ORDER BY id_jabatan');
    conn.release();

    return res.json({
      success: true,
      kecamatan,
      desa,
      jabatan,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ====================================================================
// 3. ANGGOTA (DATA INDUK PERANGKAT DESA)
// ====================================================================
app.get('/api/anggota', async (_req, res) => {
  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();

    const [anggotaRows]: [any[], any] = await conn.query(`
      SELECT 
        a.id_anggota,
        a.nik,
        a.nipd,
        a.nama_lengkap,
        a.gelar_depan,
        a.gelar_belakang,
        a.tempat_lahir,
        DATE_FORMAT(a.tanggal_lahir, '%Y-%m-%d') as tanggal_lahir,
        a.jenis_kelamin,
        a.agama,
        a.pendidikan_terakhir,
        a.no_hp_wa,
        a.email,
        a.foto,
        a.alamat_rumah,
        a.status_pernikahan,
        a.created_at,
        a.updated_at
      FROM anggota a
      ORDER BY a.created_at DESC, a.id_anggota ASC
    `);

    const [riwayatRows]: [any[], any] = await conn.query(`
      SELECT 
        id_riwayat,
        id_anggota,
        id_desa,
        id_jabatan,
        no_sk_pengangkatan,
        DATE_FORMAT(tgl_sk_pengangkatan, '%Y-%m-%d') as tgl_sk_pengangkatan,
        DATE_FORMAT(tmt_jabatan, '%Y-%m-%d') as tmt_jabatan,
        status_aktif,
        file_sk
      FROM riwayat_jabatan
    `);

    const [ktaRows]: [any[], any] = await conn.query(`
      SELECT 
        id_ppdi,
        id_anggota,
        no_kta,
        DATE_FORMAT(tgl_bergabung, '%Y-%m-%d') as tgl_bergabung,
        jabatan_pengurus,
        CASE 
          WHEN status_kta IN ('Approved', 'Verified_Kecamatan', 'Aktif') THEN 'Aktif'
          WHEN status_kta IN ('Pending_Verifikasi', 'Draft', 'Pending') THEN 'Pending'
          ELSE 'Non-Aktif'
        END as status_kta
      FROM keanggotaan_ppdi
    `);

    conn.release();

    return res.json({
      success: true,
      anggota: anggotaRows,
      riwayat: riwayatRows,
      keanggotaan: ktaRows,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Helper to resolve valid id_desa in ref_desa
async function resolveDesaId(conn: any, rawIdDesa: any, rawNamaDesa?: string): Promise<string> {
  const clean = String(rawIdDesa || '').replace(/\./g, '').trim();
  if (clean) {
    const [matches]: [any[], any] = await conn.query(
      'SELECT id_desa FROM ref_desa WHERE id_desa = ? OR id_desa = ? LIMIT 1',
      [clean, rawIdDesa]
    );
    if (matches.length > 0) return matches[0].id_desa;
  }
  if (rawNamaDesa) {
    const [byName]: [any[], any] = await conn.query(
      'SELECT id_desa FROM ref_desa WHERE LOWER(nama_desa) = LOWER(?) LIMIT 1',
      [rawNamaDesa.trim()]
    );
    if (byName.length > 0) return byName[0].id_desa;
  }
  // Fallback to any valid desa ID in ref_desa to prevent foreign key errors
  const [anyDesa]: [any[], any] = await conn.query('SELECT id_desa FROM ref_desa LIMIT 1');
  return anyDesa.length > 0 ? anyDesa[0].id_desa : '3204052001';
}

function generateServerNIPD(params: {
  tanggal_lahir?: string;
  tmt_jabatan?: string;
  jenis_kelamin?: string;
  id_jabatan?: any;
  id_kecamatan?: string;
  id_desa?: string;
}): string {
  let lahirStr = '19900101';
  if (params.tanggal_lahir) {
    const clean = String(params.tanggal_lahir).replace(/[^0-9]/g, '');
    if (clean.length >= 8) lahirStr = clean.slice(0, 8);
    else if (clean.length === 6) lahirStr = clean + '01';
  }

  let tmtStr = '202001';
  if (params.tmt_jabatan) {
    const cleanTmt = String(params.tmt_jabatan).replace(/[^0-9]/g, '');
    if (cleanTmt.length >= 6) tmtStr = cleanTmt.slice(0, 6);
    else if (cleanTmt.length >= 4) tmtStr = cleanTmt.slice(0, 4) + '01';
  }

  const jk = (params.jenis_kelamin || 'L').toUpperCase();
  const jkCode = (jk === 'P' || jk === 'PEREMPUAN') ? '2' : '1';
  const devCode = '02';

  let jabCode = '2';
  const jId = Number(params.id_jabatan) || 2;
  if (jId === 1) jabCode = '1';
  else if (jId === 2) jabCode = '2';
  else if (jId === 3) jabCode = '3';
  else if (jId === 4) jabCode = '4';
  else jabCode = '2';

  let kecCode = '01';
  if (params.id_kecamatan) {
    const cleanKec = String(params.id_kecamatan).replace(/\./g, '').trim();
    if (cleanKec.length >= 6) kecCode = cleanKec.slice(4, 6);
    else if (cleanKec.length >= 2) kecCode = cleanKec.slice(-2);
    else kecCode = cleanKec.padStart(2, '0');
  }

  let desaCode = '0001';
  if (params.id_desa) {
    const cleanDesa = String(params.id_desa).replace(/\./g, '').trim();
    if (cleanDesa.length >= 10) desaCode = cleanDesa.slice(6, 10);
    else if (cleanDesa.length >= 4) desaCode = cleanDesa.slice(-4);
    else desaCode = cleanDesa.padStart(4, '0');
  }

  const wilayahCode = `3204${kecCode}${desaCode}`;
  return `${lahirStr}${tmtStr}${jkCode}${devCode}${jabCode}${wilayahCode}`;
}

// Add Member with Unique NIK enforcement & Safe Desa FK
app.post('/api/anggota', async (req, res) => {
  const { anggota, riwayat, keanggotaan } = req.body;
  if (!anggota || !anggota.nik || !anggota.nama_lengkap) {
    return res.status(400).json({ success: false, message: 'Data anggota tidak lengkap' });
  }

  let conn;
  try {
    if (!pool) throw new Error('Pool not ready');
    conn = await pool.getConnection();

    // 0. Cek NIK Unik - Tidak Boleh Duplikat
    const [existingNik]: [any[], any] = await conn.query(
      'SELECT id_anggota, nama_lengkap FROM anggota WHERE nik = ? LIMIT 1',
      [anggota.nik]
    );
    if (existingNik.length > 0) {
      conn.release();
      return res.status(409).json({
        success: false,
        message: `NIK ${anggota.nik} sudah terdaftar atas nama "${existingNik[0].nama_lengkap}". NIK perangkat desa bersifat unik dan tidak boleh duplikat!`,
      });
    }

    await conn.beginTransaction();

    const newIdAnggota = (anggota.id_anggota && anggota.id_anggota.length > 10) ? String(anggota.id_anggota) : crypto.randomUUID();
    const newIdRiwayat = crypto.randomUUID();
    const newIdPpdi = crypto.randomUUID();

    const nipdValue = anggota.nipd || anggota.niap_nipd || anggota.niap || generateServerNIPD({
      tanggal_lahir: anggota.tanggal_lahir,
      tmt_jabatan: riwayat?.tmt_jabatan,
      jenis_kelamin: anggota.jenis_kelamin,
      id_jabatan: riwayat?.id_jabatan,
      id_kecamatan: riwayat?.id_kecamatan,
      id_desa: riwayat?.id_desa,
    });

    // 1. Insert into anggota
    await conn.query(
      `INSERT INTO anggota (id_anggota, nik, nipd, nama_lengkap, gelar_depan, gelar_belakang, tempat_lahir, tanggal_lahir, jenis_kelamin, agama, pendidikan_terakhir, no_hp_wa, email, foto, alamat_rumah, status_pernikahan)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newIdAnggota,
        anggota.nik,
        nipdValue,
        (anggota.nama_lengkap || '').trim().toUpperCase(),
        anggota.gelar_depan || null,
        anggota.gelar_belakang || null,
        anggota.tempat_lahir || 'Bandung',
        anggota.tanggal_lahir || '1990-01-01',
        anggota.jenis_kelamin || 'L',
        anggota.agama || 'Islam',
        anggota.pendidikan_terakhir || 'S1',
        anggota.no_hp_wa || '081234567890',
        anggota.email || null,
        anggota.foto || null,
        anggota.alamat_rumah || 'Kabupaten Bandung',
        anggota.status_pernikahan || 'Kawin',
      ]
    );

    // 2. Insert into riwayat_jabatan with resolved valid foreign key id_desa
    if (riwayat) {
      const validDesaId = await resolveDesaId(conn, riwayat.id_desa);
      await conn.query(
        `INSERT INTO riwayat_jabatan (id_riwayat, id_anggota, id_desa, id_jabatan, no_sk_pengangkatan, tgl_sk_pengangkatan, tmt_jabatan, status_aktif, file_sk)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newIdRiwayat,
          newIdAnggota,
          validDesaId,
          riwayat.id_jabatan || 2,
          riwayat.no_sk_pengangkatan || `141.1/Kep.01-Desa/${new Date().getFullYear()}`,
          riwayat.tgl_sk_pengangkatan || new Date().toISOString().split('T')[0],
          riwayat.tmt_jabatan || new Date().toISOString().split('T')[0],
          'Aktif',
          riwayat.file_sk || `SK_${(anggota.nama_lengkap || '').replace(/\s+/g, '_').toUpperCase()}.pdf`,
        ]
      );
    }

    // 3. Insert into keanggotaan_ppdi
    if (keanggotaan) {
      const dbStatusKta = keanggotaan.status_kta === 'Aktif' ? 'Aktif' : 'Pending_Verifikasi';
      await conn.query(
        `INSERT INTO keanggotaan_ppdi (id_ppdi, id_anggota, no_kta, tgl_bergabung, jabatan_pengurus, status_kta)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          newIdPpdi,
          newIdAnggota,
          keanggotaan.no_kta,
          keanggotaan.tgl_bergabung || new Date().toISOString().split('T')[0],
          keanggotaan.jabatan_pengurus || 'Anggota Biasa',
          dbStatusKta,
        ]
      );
    }

    await conn.commit();
    conn.release();

    return res.json({
      success: true,
      id_anggota: newIdAnggota,
      message: 'Perangkat desa berhasil didaftarkan ke database MySQL',
    });
  } catch (err: any) {
    if (conn) {
      try { await conn.rollback(); } catch (_) {}
      conn.release();
    }
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Batch Import Members from Excel / CSV
app.post('/api/anggota/batch-import', async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Data import kosong atau format salah' });
  }

  let conn;
  try {
    if (!pool) throw new Error('Koneksi database pool belum siap');
    conn = await pool.getConnection();

    await conn.beginTransaction();

    let insertedCount = 0;
    const skipped: any[] = [];

    // Pre-fetch all existing NIKs
    const [allNiks]: [any[], any] = await conn.query('SELECT nik FROM anggota');
    const existingNikSet = new Set(allNiks.map((r: any) => String(r.nik)));

    // Fetch existing KTAs
    const [allKtas]: [any[], any] = await conn.query('SELECT no_kta FROM keanggotaan_ppdi');
    const existingKtaSet = new Set(allKtas.map((r: any) => String(r.no_kta)));

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const ang = item.anggota || item;
      const rw = item.riwayat || {};
      const kta = item.keanggotaan || {};

      const nikStr = String(ang.nik || '').replace(/\D/g, '');
      if (nikStr.length !== 16) {
        skipped.push({ row: i + 1, nik: ang.nik, nama: ang.nama_lengkap, reason: 'NIK harus tepat 16 digit angka' });
        continue;
      }

      if (existingNikSet.has(nikStr)) {
        skipped.push({ row: i + 1, nik: nikStr, nama: ang.nama_lengkap, reason: `NIK ${nikStr} sudah terdaftar di database (duplikat)` });
        continue;
      }

      if (!ang.nama_lengkap || !String(ang.nama_lengkap).trim()) {
        skipped.push({ row: i + 1, nik: nikStr, nama: '-', reason: 'Nama lengkap wajib diisi' });
        continue;
      }

      const newIdAnggota = crypto.randomUUID();
      const newIdRiwayat = crypto.randomUUID();
      const newIdPpdi = crypto.randomUUID();
      const nipdVal = ang.nipd || ang.niap || ang.niap_nipd || generateServerNIPD({
        tanggal_lahir: ang.tanggal_lahir,
        tmt_jabatan: ang.tmt_jabatan,
        jenis_kelamin: ang.jenis_kelamin,
        id_jabatan: ang.id_jabatan,
        id_kecamatan: ang.id_kecamatan,
        id_desa: ang.id_desa || ang.desa,
      });

      // Insert anggota
      await conn.query(
        `INSERT INTO anggota (id_anggota, nik, nipd, nama_lengkap, gelar_depan, gelar_belakang, tempat_lahir, tanggal_lahir, jenis_kelamin, agama, pendidikan_terakhir, no_hp_wa, email, foto, alamat_rumah, status_pernikahan)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newIdAnggota,
          nikStr,
          nipdVal,
          ang.nama_lengkap.trim().toUpperCase(),
          ang.gelar_depan || null,
          ang.gelar_belakang || null,
          ang.tempat_lahir || 'Bandung',
          ang.tanggal_lahir || '1990-01-01',
          ang.jenis_kelamin || 'L',
          ang.agama || 'Islam',
          ang.pendidikan_terakhir || 'S1',
          ang.no_hp_wa || '081234567890',
          ang.email || null,
          ang.foto || null,
          ang.alamat_rumah || 'Kabupaten Bandung',
          ang.status_pernikahan || 'Kawin',
        ]
      );

      existingNikSet.add(nikStr);

      // Resolve valid id_desa
      const validDesaId = await resolveDesaId(conn, rw.id_desa, rw.nama_desa);

      // Insert riwayat
      await conn.query(
        `INSERT INTO riwayat_jabatan (id_riwayat, id_anggota, id_desa, id_jabatan, no_sk_pengangkatan, tgl_sk_pengangkatan, tmt_jabatan, status_aktif, file_sk)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newIdRiwayat,
          newIdAnggota,
          validDesaId,
          rw.id_jabatan || 2,
          rw.no_sk_pengangkatan || `141.1/Kep.01-Desa/${new Date().getFullYear()}`,
          rw.tgl_sk_pengangkatan || new Date().toISOString().split('T')[0],
          rw.tmt_jabatan || new Date().toISOString().split('T')[0],
          'Aktif',
          rw.file_sk || `SK_${ang.nama_lengkap.replace(/\s+/g, '_').toUpperCase()}.pdf`,
        ]
      );

      // Generate or use KTA
      let autoKta = kta.no_kta;
      if (!autoKta || existingKtaSet.has(autoKta)) {
        const cleanKec = (rw.id_kecamatan || validDesaId.slice(0, 6)).replace(/\./g, '').trim();
        const kecCode = cleanKec.length >= 6 ? cleanKec.slice(4, 6) : (cleanKec.slice(-2) || '00');
        const cleanDesa = validDesaId.replace(/\./g, '').trim();
        const desaCode = cleanDesa.length >= 10 ? cleanDesa.slice(6, 10) : (cleanDesa.slice(-4) || '0000');
        const seq = String(insertedCount + 101).padStart(4, '0');
        autoKta = `32.04.${kecCode}.${desaCode}.${seq}`;
      }
      existingKtaSet.add(autoKta);

      await conn.query(
        `INSERT INTO keanggotaan_ppdi (id_ppdi, id_anggota, no_kta, tgl_bergabung, jabatan_pengurus, status_kta)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          newIdPpdi,
          newIdAnggota,
          autoKta,
          kta.tgl_bergabung || new Date().toISOString().split('T')[0],
          kta.jabatan_pengurus || 'Anggota Biasa',
          'Aktif',
        ]
      );

      insertedCount++;
    }

    await conn.commit();
    conn.release();

    return res.json({
      success: true,
      message: `Berhasil mengimpor ${insertedCount} data perangkat desa ke database MySQL.`,
      insertedCount,
      skippedCount: skipped.length,
      skipped,
    });
  } catch (err: any) {
    if (conn) {
      try { await conn.rollback(); } catch (_) {}
      conn.release();
    }
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Update Member with Unique NIK check
app.put('/api/anggota/:id', async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  let conn;

  try {
    if (!pool) throw new Error('Pool not ready');
    conn = await pool.getConnection();

    // Check NIK uniqueness if changed
    if (data.nik) {
      const [existingNik]: [any[], any] = await conn.query(
        'SELECT id_anggota, nama_lengkap FROM anggota WHERE nik = ? AND id_anggota != ? LIMIT 1',
        [data.nik, id]
      );
      if (existingNik.length > 0) {
        conn.release();
        return res.status(409).json({
          success: false,
          message: `NIK ${data.nik} sudah digunakan oleh anggota lain "${existingNik[0].nama_lengkap}". NIK harus unik!`,
        });
      }
    }

    await conn.query(
      `UPDATE anggota SET
        nik = COALESCE(?, nik),
        nipd = COALESCE(?, nipd),
        nama_lengkap = COALESCE(?, nama_lengkap),
        gelar_depan = ?,
        gelar_belakang = ?,
        tempat_lahir = COALESCE(?, tempat_lahir),
        tanggal_lahir = COALESCE(?, tanggal_lahir),
        jenis_kelamin = COALESCE(?, jenis_kelamin),
        agama = COALESCE(?, agama),
        pendidikan_terakhir = COALESCE(?, pendidikan_terakhir),
        no_hp_wa = COALESCE(?, no_hp_wa),
        email = ?,
        alamat_rumah = COALESCE(?, alamat_rumah),
        status_pernikahan = COALESCE(?, status_pernikahan),
        foto = COALESCE(?, foto)
      WHERE id_anggota = ?`,
      [
        data.nik,
        data.nipd || data.niap_nipd || data.niap,
        data.nama_lengkap ? data.nama_lengkap.trim().toUpperCase() : null,
        data.gelar_depan !== undefined ? data.gelar_depan : null,
        data.gelar_belakang !== undefined ? data.gelar_belakang : null,
        data.tempat_lahir,
        data.tanggal_lahir,
        data.jenis_kelamin,
        data.agama,
        data.pendidikan_terakhir,
        data.no_hp_wa,
        data.email !== undefined ? data.email : null,
        data.alamat_rumah,
        data.status_pernikahan,
        data.foto,
        id,
      ]
    );

    conn.release();
    return res.json({ success: true, message: 'Data anggota berhasil diperbarui di MySQL' });
  } catch (err: any) {
    if (conn) conn.release();
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Delete Member with Safe Cascade and Fallback matching (ID / NIK)
app.delete('/api/anggota/:id', async (req, res) => {
  const { id } = req.params;
  let conn;

  try {
    if (!pool) throw new Error('Koneksi database pool belum siap');
    conn = await pool.getConnection();

    // 1. Cari anggota berdasarkan id_anggota ATAU nik
    const [found]: [any[], any] = await conn.query(
      'SELECT id_anggota, nik, nama_lengkap FROM anggota WHERE id_anggota = ? OR nik = ? LIMIT 1',
      [id, id]
    );

    const targetId = found.length > 0 ? found[0].id_anggota : id;
    const targetNik = found.length > 0 ? found[0].nik : id;
    const targetNama = found.length > 0 ? found[0].nama_lengkap : 'Perangkat Desa';

    await conn.beginTransaction();

    // 2. Hapus relasi anak secara aman
    try {
      await conn.query('DELETE FROM iuran_anggota WHERE id_anggota = ? OR id_anggota = ?', [targetId, id]);
    } catch (_) {}

    try {
      await conn.query('DELETE FROM keanggotaan_ppdi WHERE id_anggota = ? OR id_anggota = ?', [targetId, id]);
    } catch (_) {}

    try {
      await conn.query('DELETE FROM riwayat_jabatan WHERE id_anggota = ? OR id_anggota = ?', [targetId, id]);
    } catch (_) {}

    try {
      await conn.query('DELETE FROM users WHERE id_anggota = ? OR id_anggota = ?', [targetId, id]);
    } catch (_) {}

    // 3. Hapus data utama di tabel anggota
    const [delRes]: [any, any] = await conn.query(
      'DELETE FROM anggota WHERE id_anggota = ? OR id_anggota = ? OR nik = ?',
      [targetId, id, targetNik]
    );

    await conn.commit();
    conn.release();

    return res.json({
      success: true,
      affectedRows: delRes.affectedRows,
      message: `Data anggota "${targetNama}" (NIK: ${targetNik}) berhasil dihapus dari database MySQL`,
    });
  } catch (err: any) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (_) {}
      conn.release();
    }
    console.error('Error deleting anggota from MySQL:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ====================================================================
// 4. RIWAYAT JABATAN & MUTASI
// ====================================================================
app.post('/api/riwayat', async (req, res) => {
  const { id_anggota, id_desa, id_jabatan, no_sk_pengangkatan, tgl_sk_pengangkatan, tmt_jabatan, status_aktif, file_sk } = req.body;

  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();

    const validDesaId = await resolveDesaId(conn, id_desa);

    await conn.query(
      `INSERT INTO riwayat_jabatan (id_anggota, id_desa, id_jabatan, no_sk_pengangkatan, tgl_sk_pengangkatan, tmt_jabatan, status_aktif, file_sk)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id_anggota,
        validDesaId,
        id_jabatan || 2,
        no_sk_pengangkatan,
        tgl_sk_pengangkatan,
        tmt_jabatan,
        status_aktif || 'Aktif',
        file_sk || 'SK_RESMI.pdf',
      ]
    );

    conn.release();
    return res.json({ success: true, message: 'Riwayat mutasi/jabatan berhasil disimpan di MySQL' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Update Riwayat Status (e.g. Purna Tugas)
app.put('/api/riwayat/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status_aktif } = req.body;

  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();
    await conn.query('UPDATE riwayat_jabatan SET status_aktif = ? WHERE id_riwayat = ?', [status_aktif, id]);
    conn.release();
    return res.json({ success: true, message: 'Status jabatan diperbarui di MySQL' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Update Full Riwayat Jabatan
app.put('/api/riwayat/:id', async (req, res) => {
  const { id } = req.params;
  const { id_desa, id_jabatan, no_sk_pengangkatan, tgl_sk_pengangkatan, tmt_jabatan, status_aktif, file_sk } = req.body;

  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();

    let validDesaId = null;
    if (id_desa) {
      validDesaId = await resolveDesaId(conn, id_desa);
    }

    await conn.query(
      `UPDATE riwayat_jabatan SET
        id_desa = COALESCE(?, id_desa),
        id_jabatan = COALESCE(?, id_jabatan),
        no_sk_pengangkatan = COALESCE(?, no_sk_pengangkatan),
        tgl_sk_pengangkatan = COALESCE(?, tgl_sk_pengangkatan),
        tmt_jabatan = COALESCE(?, tmt_jabatan),
        status_aktif = COALESCE(?, status_aktif),
        file_sk = COALESCE(?, file_sk)
      WHERE id_riwayat = ?`,
      [validDesaId, id_jabatan, no_sk_pengangkatan, tgl_sk_pengangkatan, tmt_jabatan, status_aktif, file_sk, id]
    );
    conn.release();
    return res.json({ success: true, message: 'Riwayat jabatan berhasil diperbarui di MySQL' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Delete Riwayat Jabatan
app.delete('/api/riwayat/:id', async (req, res) => {
  const { id } = req.params;

  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();
    await conn.query('DELETE FROM riwayat_jabatan WHERE id_riwayat = ?', [id]);
    conn.release();
    return res.json({ success: true, message: 'Riwayat jabatan berhasil dihapus dari MySQL' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Update KTA Status
app.put('/api/kta/:idAnggota/status', async (req, res) => {
  const { idAnggota } = req.params;
  const { status_kta } = req.body;

  const dbStatusKta = status_kta === 'Aktif' ? 'Approved' : status_kta === 'Pending' ? 'Pending_Verifikasi' : 'Non-Aktif';

  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();
    await conn.query('UPDATE keanggotaan_ppdi SET status_kta = ? WHERE id_anggota = ?', [dbStatusKta, idAnggota]);
    conn.release();
    return res.json({ success: true, message: 'Status KTA diperbarui di MySQL' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ====================================================================
// 5. IURAN ANGGOTA
// ====================================================================
app.get('/api/iuran', async (_req, res) => {
  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();
    const [rows]: [any[], any] = await conn.query(`
      SELECT 
        id_iuran,
        id_anggota,
        tahun,
        bulan,
        jumlah,
        DATE_FORMAT(tgl_bayar, '%Y-%m-%d %H:%i:%s') as tgl_bayar,
        bukti_trf,
        status_verifikasi
      FROM iuran_anggota
      ORDER BY id_iuran DESC
    `);
    conn.release();
    return res.json({ success: true, iuran: rows });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/iuran', async (req, res) => {
  const { id_anggota, tahun, bulan, jumlah, tgl_bayar, bukti_trf, status_verifikasi } = req.body;

  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();

    await conn.query(
      `INSERT INTO iuran_anggota (id_anggota, tahun, bulan, jumlah, tgl_bayar, bukti_trf, status_verifikasi)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id_anggota,
        tahun,
        bulan,
        jumlah || 35000,
        tgl_bayar || new Date().toISOString().slice(0, 19).replace('T', ' '),
        bukti_trf || 'TRF_BJB_STRUK.png',
        status_verifikasi || 'Pending',
      ]
    );

    conn.release();
    return res.json({ success: true, message: 'Iuran berhasil disimpan di MySQL' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/iuran/:id/verify', async (req, res) => {
  const { id } = req.params;
  const { status_verifikasi } = req.body;

  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();
    await conn.query('UPDATE iuran_anggota SET status_verifikasi = ? WHERE id_iuran = ?', [status_verifikasi, id]);
    conn.release();
    return res.json({ success: true, message: 'Status iuran diverifikasi di MySQL' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ====================================================================
// 6. AUTH LOGIN (Menggunakan database users di MySQL)
// ====================================================================
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' });
  }

  // 1. Check against MySQL database users table
  try {
    if (pool) {
      const conn = await pool.getConnection();
      const [rows]: [any[], any] = await conn.query(
        `SELECT u.*, COALESCE(r.nama_role, u.id_role) as role_name, a.nama_lengkap 
         FROM users u 
         LEFT JOIN roles r ON (CAST(u.id_role AS CHAR) = CAST(r.id_role AS CHAR) OR u.id_role = r.nama_role)
         LEFT JOIN anggota a ON u.id_anggota = a.id_anggota 
         WHERE u.username = ? OR u.email = ? 
         LIMIT 1`,
        [username.trim(), username.trim()]
      );
      conn.release();

      if (rows && rows.length > 0) {
        const dbUser = rows[0];
        // Strict password verification: MUST match stored password
        if (!dbUser.password || dbUser.password !== String(password).trim()) {
          return res.status(401).json({
            success: false,
            message: 'Password yang Anda masukkan salah. Silakan periksa kembali password akun Anda.',
          });
        }

        return res.json({
          success: true,
          source: 'mysql',
          user: {
            id_user: dbUser.id_user,
            username: dbUser.username,
            email: dbUser.email,
            nama: dbUser.nama_lengkap || dbUser.nama || dbUser.username,
            role: dbUser.role_name || dbUser.id_role || 'Superadmin_Kabupaten',
            id_role: dbUser.id_role,
            id_anggota: dbUser.id_anggota ? String(dbUser.id_anggota) : undefined,
            id_kecamatan: dbUser.id_kecamatan_scope || dbUser.id_kecamatan || undefined,
          },
        });
      }
    }
  } catch (err) {
    console.error('MySQL Auth Check Error:', err);
  }

  // Fallback to local accounts ONLY if password matches
  const defaultAccounts: Record<string, { pass: string; user: any }> = {
    superadmin: {
      pass: process.env.ADMIN_PASSWORD || 'admin',
      user: {
        id_user: 1,
        username: 'superadmin',
        email: 'admin.kabupaten@ppdi-bandungkab.id',
        nama: 'ADMINISTRATOR KABUPATEN',
        role: 'Superadmin_Kabupaten',
      },
    },
    'admin.soreang': {
      pass: process.env.ADMIN_PASSWORD || 'admin',
      user: {
        id_user: 2,
        username: 'admin.soreang',
        email: 'admin.soreang@ppdi-bandungkab.id',
        nama: 'ADMIN PK PPDI SOREANG',
        role: 'Admin_Kecamatan',
        id_kecamatan: '320437',
      },
    },
    'admin.banjaran': {
      pass: process.env.ADMIN_PASSWORD || 'admin',
      user: {
        id_user: 3,
        username: 'admin.banjaran',
        email: 'admin.banjaran@ppdi-bandungkab.id',
        nama: 'ADMIN PK PPDI BANJARAN',
        role: 'Admin_Kecamatan',
        id_kecamatan: '320413',
      },
    },
  };

  const clean = username.trim().toLowerCase();
  const matchedDefault = defaultAccounts[clean];
  if (matchedDefault) {
    if (String(password).trim() !== matchedDefault.pass) {
      return res.status(401).json({
        success: false,
        message: 'Password yang Anda masukkan salah. Silakan periksa kembali password akun Anda.',
      });
    }
    return res.json({
      success: true,
      source: 'local_auth',
      user: matchedDefault.user,
    });
  }

  return res.status(401).json({
    success: false,
    message: 'Kredensial tidak valid. Silakan periksa kembali username dan password Anda.',
  });
});

// ====================================================================
// 7. USER MANAGEMENT CRUD
// ====================================================================
function mapRoleNameToId(roleName?: string): string {
  if (!roleName) return '3';
  const clean = String(roleName).trim();
  const map: Record<string, string> = {
    'Superadmin_Kabupaten': '1',
    'Admin_Kabupaten': '2',
    'Admin_Kecamatan': '3',
    'Admin_Desa': '4',
    'Anggota': '5',
  };
  return map[clean] || clean;
}

app.get('/api/users', async (_req, res) => {
  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();
    const [rows]: [any[], any] = await conn.query(`
      SELECT 
        u.id_user,
        u.username,
        u.email,
        COALESCE(u.nama, u.username) as nama,
        COALESCE(r.nama_role, u.id_role) as role,
        u.id_role,
        u.id_anggota,
        u.id_kecamatan_scope,
        u.id_kecamatan,
        u.id_desa,
        u.created_at
      FROM users u
      LEFT JOIN roles r ON (CAST(u.id_role AS CHAR) = CAST(r.id_role AS CHAR) OR u.id_role = r.nama_role)
      ORDER BY u.id_user ASC
    `);
    conn.release();
    return res.json({ success: true, users: rows });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  const { username, email, nama, password, role, id_role, id_kecamatan_scope, id_kecamatan, id_desa } = req.body;
  if (!username || !email) {
    return res.status(400).json({ success: false, message: 'Username dan email wajib diisi' });
  }

  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();

    // Check unique username / email
    const [exists]: [any[], any] = await conn.query(
      'SELECT id_user FROM users WHERE username = ? OR email = ? LIMIT 1',
      [username.trim(), email.trim()]
    );
    if (exists.length > 0) {
      conn.release();
      return res.status(409).json({ success: false, message: 'Username atau email sudah digunakan' });
    }

    const effectiveRoleId = id_role || mapRoleNameToId(role);

    const [insertRes]: [any, any] = await conn.query(
      `INSERT INTO users (username, email, nama, password, id_role, id_kecamatan_scope, id_kecamatan, id_desa)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        username.trim(),
        email.trim(),
        (nama || username).trim().toUpperCase(),
        password || '',
        effectiveRoleId,
        id_kecamatan_scope || id_kecamatan || null,
        id_kecamatan || null,
        id_desa || null,
      ]
    );

    conn.release();
    return res.json({
      success: true,
      message: 'Pengguna baru berhasil ditambahkan',
      id_user: insertRes.insertId,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { username, email, nama, password, role, id_role, id_kecamatan_scope, id_kecamatan, id_desa } = req.body;

  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();

    const formattedNama = nama ? nama.trim().toUpperCase() : undefined;
    const effectiveRoleId = id_role || (role ? mapRoleNameToId(role) : undefined);

    if (password) {
      await conn.query(
        `UPDATE users SET
          username = COALESCE(?, username),
          email = COALESCE(?, email),
          nama = COALESCE(?, nama),
          password = ?,
          id_role = COALESCE(?, id_role),
          id_kecamatan_scope = ?,
          id_kecamatan = ?,
          id_desa = ?
        WHERE id_user = ?`,
        [
          username,
          email,
          formattedNama,
          password,
          effectiveRoleId,
          id_kecamatan_scope || id_kecamatan || null,
          id_kecamatan || null,
          id_desa || null,
          id,
        ]
      );
    } else {
      await conn.query(
        `UPDATE users SET
          username = COALESCE(?, username),
          email = COALESCE(?, email),
          nama = COALESCE(?, nama),
          id_role = COALESCE(?, id_role),
          id_kecamatan_scope = ?,
          id_kecamatan = ?,
          id_desa = ?
        WHERE id_user = ?`,
        [
          username,
          email,
          formattedNama,
          effectiveRoleId,
          id_kecamatan_scope || id_kecamatan || null,
          id_kecamatan || null,
          id_desa || null,
          id,
        ]
      );
    }

    conn.release();
    return res.json({ success: true, message: 'Data pengguna berhasil diperbarui' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  if (String(id) === '1') {
    return res.status(403).json({ success: false, message: 'Akun Superadmin Utama (ID: 1) tidak dapat dihapus!' });
  }

  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();
    await conn.query('DELETE FROM users WHERE id_user = ?', [id]);
    conn.release();
    return res.json({ success: true, message: 'Akun pengguna berhasil dihapus dari sistem' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ====================================================================
// 8. PENDAFTARAN PERANGKAT DESA (FORMULIR INDUK) & APPROVAL
// ====================================================================
app.get('/api/pendaftaran', async (_req, res) => {
  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();
    const [rows]: [any[], any] = await conn.query(`
      SELECT 
        p.*,
        DATE_FORMAT(p.tanggal_lahir, '%Y-%m-%d') as tanggal_lahir,
        DATE_FORMAT(p.tgl_sk_pengangkatan, '%Y-%m-%d') as tgl_sk_pengangkatan,
        DATE_FORMAT(p.tmt_jabatan, '%Y-%m-%d') as tmt_jabatan,
        DATE_FORMAT(p.tgl_pendaftaran, '%Y-%m-%d %H:%i:%s') as tgl_pendaftaran,
        DATE_FORMAT(p.tgl_approval, '%Y-%m-%d %H:%i:%s') as tgl_approval,
        k.nama_kecamatan,
        d.nama_desa,
        j.nama_jabatan
      FROM pendaftaran_perangkat_desa p
      LEFT JOIN ref_kecamatan k ON p.id_kecamatan = k.id_kecamatan
      LEFT JOIN ref_desa d ON p.id_desa = d.id_desa
      LEFT JOIN ref_jabatan j ON p.id_jabatan = j.id_jabatan
      ORDER BY p.id_pendaftaran DESC
    `);
    conn.release();
    return res.json({ success: true, pendaftaran: rows });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/pendaftaran', async (req, res) => {
  const data = req.body;
  if (!data.nik || !data.nama_lengkap || !data.id_desa) {
    return res.status(400).json({ success: false, message: 'NIK, Nama Lengkap, dan Desa penempatan wajib diisi' });
  }

  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();

    // Cek apakah NIK sudah ada di pendaftaran aktif atau di anggota
    const [existsInAnggota]: [any[], any] = await conn.query(
      'SELECT nama_lengkap FROM anggota WHERE nik = ? LIMIT 1',
      [data.nik]
    );
    if (existsInAnggota.length > 0) {
      conn.release();
      return res.status(409).json({
        success: false,
        message: `NIK ${data.nik} sudah terdaftar aktif sebagai perangkat desa atas nama ${existsInAnggota[0].nama_lengkap}`,
      });
    }

    const [existsInPending]: [any[], any] = await conn.query(
      'SELECT id_pendaftaran FROM pendaftaran_perangkat_desa WHERE nik = ? AND status_approval = "Menunggu" LIMIT 1',
      [data.nik]
    );
    if (existsInPending.length > 0) {
      conn.release();
      return res.status(409).json({
        success: false,
        message: `NIK ${data.nik} sudah memiliki pengajuan pendaftaran yang sedang menunggu approval.`,
      });
    }

    const validDesaId = await resolveDesaId(conn, data.id_desa);
    const cleanKecId = data.id_kecamatan || validDesaId.slice(0, 6);

    const [insertRes]: [any, any] = await conn.query(
      `INSERT INTO pendaftaran_perangkat_desa (
        nik, nama_lengkap, gelar_depan, gelar_belakang, tempat_lahir, tanggal_lahir, jenis_kelamin, agama,
        pendidikan_terakhir, no_hp_wa, email, alamat_rumah, status_pernikahan,
        id_kecamatan, id_desa, id_jabatan, no_sk_pengangkatan, tgl_sk_pengangkatan, tmt_jabatan,
        status_approval
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Menunggu')`,
      [
        data.nik,
        data.nama_lengkap.trim().toUpperCase(),
        data.gelar_depan ? data.gelar_depan.trim() : null,
        data.gelar_belakang ? data.gelar_belakang.trim() : null,
        data.tempat_lahir || 'Bandung',
        data.tanggal_lahir || '1990-01-01',
        data.jenis_kelamin || 'L',
        data.agama || 'Islam',
        data.pendidikan_terakhir || 'S1',
        data.no_hp_wa,
        data.email || null,
        data.alamat_rumah || 'Kabupaten Bandung',
        data.status_pernikahan || 'Kawin',
        cleanKecId,
        validDesaId,
        data.id_jabatan || 1,
        data.no_sk_pengangkatan || `141.1/Kep.Reg-${new Date().getFullYear()}`,
        data.tgl_sk_pengangkatan || new Date().toISOString().split('T')[0],
        data.tmt_jabatan || new Date().toISOString().split('T')[0],
      ]
    );

    conn.release();
    return res.json({
      success: true,
      id_pendaftaran: insertRes.insertId,
      message: 'Formulir induk pendaftaran berhasil dikirim. Menunggu verifikasi & approval admin.',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Approve Registration and Migrate directly into Anggota, Riwayat, and Keanggotaan
app.put('/api/pendaftaran/:id/approve', async (req, res) => {
  const { id } = req.params;
  const { approved_by, no_kta_custom } = req.body;

  let conn;
  try {
    if (!pool) throw new Error('Pool not ready');
    conn = await pool.getConnection();

    const [rows]: [any[], any] = await conn.query(
      'SELECT * FROM pendaftaran_perangkat_desa WHERE id_pendaftaran = ? LIMIT 1',
      [id]
    );
    if (rows.length === 0) {
      conn.release();
      return res.status(404).json({ success: false, message: 'Data pendaftaran tidak ditemukan' });
    }

    const p = rows[0];
    if (p.status_approval === 'Disetujui') {
      conn.release();
      return res.status(400).json({ success: false, message: 'Pendaftaran ini sudah disetujui sebelumnya' });
    }

    await conn.beginTransaction();

    // Check if NIK already exists in anggota table
    const [existingAng]: [any[], any] = await conn.query(
      'SELECT id_anggota, nama_lengkap FROM anggota WHERE nik = ? LIMIT 1',
      [p.nik]
    );

    let effectiveIdAnggota: string;
    const nipdVal = `NIPD.${p.nik.slice(-6)}`;
    const validDesaId = await resolveDesaId(conn, p.id_desa);
    const newIdRiwayat = crypto.randomUUID();
    const newIdPpdi = crypto.randomUUID();

    if (existingAng.length > 0) {
      effectiveIdAnggota = existingAng[0].id_anggota;
      // Update existing member record
      await conn.query(
        `UPDATE anggota SET
          nama_lengkap = ?,
          gelar_depan = COALESCE(?, gelar_depan),
          gelar_belakang = COALESCE(?, gelar_belakang),
          tempat_lahir = COALESCE(?, tempat_lahir),
          tanggal_lahir = COALESCE(?, tanggal_lahir),
          jenis_kelamin = COALESCE(?, jenis_kelamin),
          agama = COALESCE(?, agama),
          pendidikan_terakhir = COALESCE(?, pendidikan_terakhir),
          no_hp_wa = COALESCE(?, no_hp_wa),
          email = COALESCE(?, email),
          alamat_rumah = COALESCE(?, alamat_rumah),
          status_pernikahan = COALESCE(?, status_pernikahan)
         WHERE id_anggota = ?`,
        [
          p.nama_lengkap.trim().toUpperCase(),
          p.gelar_depan || null,
          p.gelar_belakang || null,
          p.tempat_lahir,
          p.tanggal_lahir,
          p.jenis_kelamin,
          p.agama,
          p.pendidikan_terakhir,
          p.no_hp_wa,
          p.email,
          p.alamat_rumah,
          p.status_pernikahan,
          effectiveIdAnggota,
        ]
      );
    } else {
      effectiveIdAnggota = crypto.randomUUID();
      await conn.query(
        `INSERT INTO anggota (id_anggota, nik, nipd, nama_lengkap, gelar_depan, gelar_belakang, tempat_lahir, tanggal_lahir, jenis_kelamin, agama, pendidikan_terakhir, no_hp_wa, email, alamat_rumah, status_pernikahan)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          effectiveIdAnggota,
          p.nik,
          nipdVal,
          p.nama_lengkap.trim().toUpperCase(),
          p.gelar_depan || null,
          p.gelar_belakang || null,
          p.tempat_lahir || 'Bandung',
          p.tanggal_lahir || '1990-01-01',
          p.jenis_kelamin || 'L',
          p.agama || 'Islam',
          p.pendidikan_terakhir || 'S1',
          p.no_hp_wa,
          p.email || null,
          p.alamat_rumah || 'Kabupaten Bandung',
          p.status_pernikahan || 'Kawin',
        ]
      );
    }

    // 2. Insert or update riwayat_jabatan
    const [existingRw]: [any[], any] = await conn.query(
      'SELECT id_riwayat FROM riwayat_jabatan WHERE id_anggota = ? AND status_aktif = "Aktif" LIMIT 1',
      [effectiveIdAnggota]
    );

    if (existingRw.length === 0) {
      await conn.query(
        `INSERT INTO riwayat_jabatan (id_riwayat, id_anggota, id_desa, id_jabatan, no_sk_pengangkatan, tgl_sk_pengangkatan, tmt_jabatan, status_aktif, file_sk)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Aktif', ?)`,
        [
          newIdRiwayat,
          effectiveIdAnggota,
          validDesaId,
          p.id_jabatan || 1,
          p.no_sk_pengangkatan || `141.1/Kep.01-Desa/${new Date().getFullYear()}`,
          p.tgl_sk_pengangkatan || new Date().toISOString().split('T')[0],
          p.tmt_jabatan || new Date().toISOString().split('T')[0],
          `SK_${p.nama_lengkap.replace(/\s+/g, '_').toUpperCase()}.pdf`,
        ]
      );
    }

    // 3. Generate KTA & Insert/Update keanggotaan_ppdi
    const [existingKta]: [any[], any] = await conn.query(
      'SELECT id_ppdi, no_kta FROM keanggotaan_ppdi WHERE id_anggota = ? LIMIT 1',
      [effectiveIdAnggota]
    );

    let finalKta: string;
    if (existingKta.length > 0) {
      finalKta = existingKta[0].no_kta;
      await conn.query(
        'UPDATE keanggotaan_ppdi SET status_kta = "Aktif" WHERE id_anggota = ?',
        [effectiveIdAnggota]
      );
    } else {
      const [ktaCount]: [any[], any] = await conn.query('SELECT COUNT(*) as cnt FROM keanggotaan_ppdi');
      let seq = (ktaCount[0]?.cnt || 0) + 1;
      const cleanKec = (p.id_kecamatan || validDesaId.slice(0, 6)).replace(/\./g, '').trim();
      const kecCode = cleanKec.length >= 6 ? cleanKec.slice(4, 6) : (cleanKec.slice(-2) || '00');
      const cleanDesa = validDesaId.replace(/\./g, '').trim();
      const desaCode = cleanDesa.length >= 10 ? cleanDesa.slice(6, 10) : (cleanDesa.slice(-4) || '0000');
      
      let candidateKta = no_kta_custom || `32.04.${kecCode}.${desaCode}.${String(seq).padStart(4, '0')}`;
      while (true) {
        const [dup]: [any[], any] = await conn.query('SELECT id_ppdi FROM keanggotaan_ppdi WHERE no_kta = ? LIMIT 1', [candidateKta]);
        if (dup.length === 0) break;
        seq++;
        candidateKta = `32.04.${kecCode}.${desaCode}.${String(seq).padStart(4, '0')}`;
      }
      finalKta = candidateKta;

      await conn.query(
        `INSERT INTO keanggotaan_ppdi (id_ppdi, id_anggota, no_kta, tgl_bergabung, jabatan_pengurus, status_kta)
         VALUES (?, ?, ?, CURDATE(), 'Anggota Biasa', 'Aktif')`,
        [newIdPpdi, effectiveIdAnggota, finalKta]
      );
    }

    // 4. Update status pendaftaran to Disetujui
    await conn.query(
      `UPDATE pendaftaran_perangkat_desa SET
        status_approval = 'Disetujui',
        tgl_approval = NOW(),
        approved_by = ?
       WHERE id_pendaftaran = ?`,
      [approved_by || 'Admin Kabupaten', id]
    );

    await conn.commit();
    conn.release();

    return res.json({
      success: true,
      message: `Pendaftaran atas nama ${p.nama_lengkap.toUpperCase()} berhasil disetujui! Telah diterbitkan ke Data Induk Anggota dengan No. KTA ${finalKta}`,
      id_anggota: effectiveIdAnggota,
      no_kta: finalKta,
    });
  } catch (err: any) {
    if (conn) {
      try { await conn.rollback(); } catch (_) {}
      conn.release();
    }
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Reject Registration
app.put('/api/pendaftaran/:id/reject', async (req, res) => {
  const { id } = req.params;
  const { catatan_approval, approved_by } = req.body;

  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();

    await conn.query(
      `UPDATE pendaftaran_perangkat_desa SET
        status_approval = 'Ditolak',
        catatan_approval = ?,
        tgl_approval = NOW(),
        approved_by = ?
       WHERE id_pendaftaran = ?`,
      [catatan_approval || 'Dokumen belum lengkap atau data tidak valid', approved_by || 'Admin', id]
    );

    conn.release();
    return res.json({ success: true, message: 'Pendaftaran telah ditolak' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/pendaftaran/:id', async (req, res) => {
  const { id } = req.params;
  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();
    await conn.query('DELETE FROM pendaftaran_perangkat_desa WHERE id_pendaftaran = ?', [id]);
    conn.release();
    return res.json({ success: true, message: 'Data pendaftaran berhasil dihapus' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ====================================================================
// 9. APP SETTINGS (LOGO, LOGIN BACKGROUND, BRANDING)
// ====================================================================
const SETTINGS_FILE = path.resolve(process.cwd(), 'app_settings.json');

const DEFAULT_ROLE_PERMISSIONS = {
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

const DEFAULT_SETTINGS = {
  appName: 'PPDI KABUPATEN BANDUNG',
  appSubtitle: 'SISTEM INFORMASI DATABASE & E-KTA PERANGKAT DESA',
  logoUrl: '', // Kosong = pakai default icon Garuda Shield
  loginBackgroundType: 'preset_emerald', // 'preset_emerald' | 'gradient_mesh' | 'custom_image' | 'dark_slate'
  loginBackgroundImage: '',
  loginOverlayOpacity: '0.4',
  syncIntervalSeconds: 60,
  rolePermissions: DEFAULT_ROLE_PERMISSIONS,
};

app.get('/api/settings', (_req, res) => {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      return res.json({
        success: true,
        settings: {
          ...DEFAULT_SETTINGS,
          ...data,
          rolePermissions: (data.rolePermissions && Object.keys(data.rolePermissions).length > 0)
            ? data.rolePermissions
            : DEFAULT_ROLE_PERMISSIONS,
        },
      });
    }
    return res.json({ success: true, settings: DEFAULT_SETTINGS });
  } catch (err: any) {
    return res.json({ success: true, settings: DEFAULT_SETTINGS });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const newSettings = { ...DEFAULT_SETTINGS, ...req.body };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(newSettings, null, 2), 'utf-8');
    return res.json({ success: true, message: 'Pengaturan aplikasi berhasil disimpan', settings: newSettings });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ====================================================================
// 9.5. DATABASE VIEWS (PELAPORAN & REKAPITULASI DARI STRUKTUR DATABASE)
// ====================================================================
app.get('/api/views/rekap-kecamatan', async (_req, res) => {
  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();
    const [rows]: [any[], any] = await conn.query('SELECT * FROM v_rekap_ppdi_kecamatan ORDER BY nama_kecamatan ASC');
    conn.release();
    return res.json({ success: true, rekap: rows });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/views/rekap-desa', async (req, res) => {
  const { id_kecamatan } = req.query;
  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();
    let query = 'SELECT * FROM v_rekap_ppdi_desa';
    const params: any[] = [];
    if (id_kecamatan) {
      query += ' WHERE id_kecamatan = ?';
      params.push(id_kecamatan);
    }
    query += ' ORDER BY nama_kecamatan ASC, nama_desa ASC';
    const [rows]: [any[], any] = await conn.query(query, params);
    conn.release();
    return res.json({ success: true, rekap: rows });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/views/purna-tugas', async (_req, res) => {
  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();
    const [rows]: [any[], any] = await conn.query('SELECT * FROM v_purna_tugas_alert');
    conn.release();
    return res.json({ success: true, purna_tugas: rows });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/views/monitoring-pensiun', async (_req, res) => {
  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();
    const [rows]: [any[], any] = await conn.query('SELECT * FROM v_monitoring_pensiun_perangkat');
    conn.release();
    return res.json({ success: true, monitoring: rows });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/views/rekap-iuran-kecamatan', async (req, res) => {
  const { tahun, bulan } = req.query;
  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();
    let query = 'SELECT * FROM v_rekap_iuran_kecamatan';
    const params: any[] = [];
    const conditions: string[] = [];
    if (tahun) { conditions.push('tahun = ?'); params.push(Number(tahun)); }
    if (bulan) { conditions.push('bulan = ?'); params.push(Number(bulan)); }
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY nama_kecamatan ASC';
    const [rows]: [any[], any] = await conn.query(query, params);
    conn.release();
    return res.json({ success: true, rekap_iuran: rows });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/views/rekap-iuran-desa', async (req, res) => {
  const { id_kecamatan, tahun, bulan } = req.query;
  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();
    let query = 'SELECT * FROM v_rekap_iuran_desa';
    const params: any[] = [];
    const conditions: string[] = [];
    if (id_kecamatan) { conditions.push('id_kecamatan = ?'); params.push(id_kecamatan); }
    if (tahun) { conditions.push('tahun = ?'); params.push(Number(tahun)); }
    if (bulan) { conditions.push('bulan = ?'); params.push(Number(bulan)); }
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY nama_kecamatan ASC, nama_desa ASC';
    const [rows]: [any[], any] = await conn.query(query, params);
    conn.release();
    return res.json({ success: true, rekap_iuran: rows });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/views/antrean-verifikasi', async (req, res) => {
  const { id_kecamatan } = req.query;
  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();
    let query = 'SELECT * FROM v_antrean_verifikasi_kecamatan';
    const params: any[] = [];
    if (id_kecamatan) {
      query += ' WHERE id_kecamatan = ?';
      params.push(id_kecamatan);
    }
    query += ' ORDER BY tanggal_pengajuan DESC';
    const [rows]: [any[], any] = await conn.query(query, params);
    conn.release();
    return res.json({ success: true, antrean: rows });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/views/anggota-aktif', async (_req, res) => {
  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();
    const [rows]: [any[], any] = await conn.query('SELECT * FROM v_anggota_aktif_kabupaten ORDER BY nama_lengkap ASC');
    conn.release();
    return res.json({ success: true, anggota: rows });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ====================================================================
// 10. GENERIC DATABASE TABLE CRUD API FOR SETTING DATABASE
// ====================================================================
const ALLOWED_TABLES = [
  'anggota',
  'riwayat_jabatan',
  'keanggotaan_ppdi',
  'pendaftaran_perangkat_desa',
  'iuran_anggota',
  'users',
  'roles',
  'ref_kecamatan',
  'ref_desa',
  'ref_jabatan',
  'v_anggota_aktif_kabupaten',
  'v_purna_tugas_alert',
  'v_monitoring_pensiun_perangkat',
  'v_rekap_ppdi_kecamatan',
  'v_rekap_ppdi_desa',
  'v_rekap_iuran_kecamatan',
  'v_rekap_iuran_desa',
  'v_antrean_verifikasi_kecamatan',
];

app.get('/api/db/table/:tableName', async (req, res) => {
  const { tableName } = req.params;
  if (!ALLOWED_TABLES.includes(tableName)) {
    return res.status(400).json({ success: false, message: 'Tabel tidak diizinkan atau tidak valid' });
  }
  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();
    const [rows]: [any[], any] = await conn.query(`SELECT * FROM \`${tableName}\` LIMIT 200`);
    const [fields]: [any[], any] = await conn.query(`DESCRIBE \`${tableName}\``);
    conn.release();
    return res.json({ success: true, table: tableName, rows, fields: fields.map((f: any) => f.Field) });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/db/table/:tableName', async (req, res) => {
  const { tableName } = req.params;
  if (!ALLOWED_TABLES.includes(tableName)) {
    return res.status(400).json({ success: false, message: 'Tabel tidak diizinkan' });
  }
  if (tableName.startsWith('v_')) {
    return res.status(400).json({ success: false, message: 'View database bersifat read-only dan tidak dapat diubah langsung' });
  }
  try {
    if (!pool) throw new Error('Pool not ready');
    const data = req.body;
    const keys = Object.keys(data);
    const values = Object.values(data);
    if (keys.length === 0) return res.status(400).json({ success: false, message: 'Data kosong' });

    const placeholders = keys.map(() => '?').join(', ');
    const columns = keys.map(k => `\`${k}\``).join(', ');
    const sql = `INSERT INTO \`${tableName}\` (${columns}) VALUES (${placeholders})`;

    const conn = await pool.getConnection();
    await conn.query(sql, values);
    conn.release();
    return res.json({ success: true, message: `Baris baru berhasil ditambahkan ke tabel ${tableName}` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/db/table/:tableName/:idKey/:idVal', async (req, res) => {
  const { tableName, idKey, idVal } = req.params;
  if (!ALLOWED_TABLES.includes(tableName)) {
    return res.status(400).json({ success: false, message: 'Tabel tidak diizinkan' });
  }
  if (tableName.startsWith('v_')) {
    return res.status(400).json({ success: false, message: 'View database bersifat read-only dan tidak dapat diubah langsung' });
  }
  try {
    if (!pool) throw new Error('Pool not ready');
    const data = req.body;
    delete data[idKey];
    const keys = Object.keys(data);
    const values = Object.values(data);
    if (keys.length === 0) return res.status(400).json({ success: false, message: 'Data update kosong' });

    const setClause = keys.map(k => `\`${k}\` = ?`).join(', ');
    const sql = `UPDATE \`${tableName}\` SET ${setClause} WHERE \`${idKey}\` = ?`;

    const conn = await pool.getConnection();
    await conn.query(sql, [...values, idVal]);
    conn.release();
    return res.json({ success: true, message: `Data pada tabel ${tableName} berhasil diperbarui` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/db/table/:tableName/:idKey/:idVal', async (req, res) => {
  const { tableName, idKey, idVal } = req.params;
  if (!ALLOWED_TABLES.includes(tableName)) {
    return res.status(400).json({ success: false, message: 'Tabel tidak diizinkan' });
  }
  if (tableName.startsWith('v_')) {
    return res.status(400).json({ success: false, message: 'View database bersifat read-only dan tidak dapat dihapus melalui tabel' });
  }
  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();
    await conn.query(`DELETE FROM \`${tableName}\` WHERE \`${idKey}\` = ?`, [idVal]);
    conn.release();
    return res.json({ success: true, message: `Data pada tabel ${tableName} berhasil dihapus` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ====================================================================
// 11. API 404 & ERROR HANDLING (CRITICAL: PREVENTS RETURNING HTML FOR /api/*)
// ====================================================================
app.all(['/api', '/api/*'], (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(404).json({
    success: false,
    error: 'API_ENDPOINT_NOT_FOUND',
    message: `Endpoint API tidak ditemukan: ${req.method} ${req.originalUrl}`,
  });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.originalUrl && (req.originalUrl.startsWith('/api') || req.path.startsWith('/api'))) {
    console.error('Unhandled API Error:', err);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(err.status || 500).json({
      success: false,
      error: err.message || 'Internal Server Error',
    });
  }
  next(err);
});

// Configure Vite middleware in dev or static serving in production
async function startServer() {
  const candidateDistPaths = [
    path.resolve(process.cwd(), 'dist'),
    path.resolve(__dirname, 'dist'),
    path.resolve(__dirname, '..', 'dist'),
  ];
  const activeDistPath = candidateDistPaths.find((p) => fs.existsSync(path.join(p, 'index.html'))) || candidateDistPaths[0];
  const hasDist = fs.existsSync(path.join(activeDistPath, 'index.html'));

  // Detect if running as compiled bundle (e.g. node server.js on hosting/cPanel)
  const isCompiledBundle = process.argv[1]?.endsWith('.js') || !process.argv[1]?.endsWith('.ts');
  const isProduction = process.env.NODE_ENV === 'production' || isCompiledBundle || (hasDist && process.env.NODE_ENV !== 'development');

  if (!isProduction) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      console.log('[Server] Vite middleware mode aktif untuk development.');
    } catch (viteErr) {
      console.warn('[Server] Gagal memuat Vite middleware, beralih ke static hosting:', viteErr);
      if (hasDist) {
        app.use(express.static(activeDistPath));
        app.get('*', (req, res) => {
          if (req.originalUrl.startsWith('/api') || req.path.startsWith('/api')) {
            return res.status(404).json({ success: false, error: 'API_ENDPOINT_NOT_FOUND' });
          }
          res.sendFile(path.join(activeDistPath, 'index.html'));
        });
      }
    }
  } else {
    console.log(`[Server] Production mode aktif. Menyajikan dist dari: ${activeDistPath}`);
    app.use(express.static(activeDistPath));
    app.get('*', (req, res) => {
      // Guard against returning HTML for API requests in production
      if (req.originalUrl.startsWith('/api') || req.path.startsWith('/api')) {
        return res.status(404).json({
          success: false,
          error: 'API_ENDPOINT_NOT_FOUND',
          message: `Endpoint API tidak ditemukan: ${req.method} ${req.originalUrl}`,
        });
      }
      const indexPath = path.join(activeDistPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('File index.html tidak ditemukan. Pastikan sudah menjalankan "npm run build".');
      }
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server PPDI Kab. Bandung berjalan pada port ${PORT}`);
    console.log(`MySQL Live Connected: ${activeDbConfig.user}@${activeDbConfig.host}:${activeDbConfig.port}/${activeDbConfig.database}`);
  });
}

startServer();

