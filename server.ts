import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import mysql from 'mysql2/promise';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { generateUniqueKTA } from './src/services/ktaService';

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

// Handle unhandled process rejections and exceptions gracefully
process.on('uncaughtException', (err) => {
  console.error('[Process Error] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process Error] Unhandled rejection at:', promise, 'reason:', reason);
});

const app = express();

// Parse CLI arguments if provided, e.g. --port 3000 from npm run dev
const cliArgs = process.argv.slice(2);
const portFlagIndex = cliArgs.indexOf('--port');
const cliPort = portFlagIndex !== -1 && cliArgs[portFlagIndex + 1] ? Number(cliArgs[portFlagIndex + 1]) : null;

// Dev server must always bind to 3000 in AI Studio environment (PORT=8080 is reserved by container proxy)
const PORT = cliPort || (process.env.PORT && process.env.PORT !== '8080' ? Number(process.env.PORT) : 3000);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Enable CORS for local cross-port development (e.g. Vite on 5173/4173 connecting to Express on 3000)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-user-role, user-role');
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
const TTD_DIR = path.join(UPLOADS_ROOT, 'ttd');
const REGULASI_DIR = path.join(UPLOADS_ROOT, 'regulasi');

try {
  fs.mkdirSync(FOTO_DIR, { recursive: true });
  fs.mkdirSync(SK_DIR, { recursive: true });
  fs.mkdirSync(TTD_DIR, { recursive: true });
  fs.mkdirSync(REGULASI_DIR, { recursive: true });
} catch (e) {
  console.error('Failed to create upload directories:', e);
}

// Serve uploaded static files (return clean 404 immediately if file is missing so it never falls through to Vite/SPA)
app.use('/uploads', express.static(UPLOADS_ROOT));
app.use('/uploads', (_req, res) => {
  return res.status(404).json({
    success: false,
    error: 'UPLOAD_FILE_NOT_FOUND',
    message: 'Berkas unggahan tidak ditemukan di server',
  });
});
app.use(express.static(path.resolve(process.cwd(), 'public')));

// ====================================================================
// ROLE PERMISSION ENGINE & AUTHORIZATION MIDDLEWARE (SERVER-SIDE 403)
// ====================================================================
const SETTINGS_FILE = path.resolve(process.cwd(), 'app_settings.json');

const DEFAULT_ROLE_PERMISSIONS: Record<string, Record<string, Record<string, boolean>>> = {
  'Superadmin_Kabupaten': {
    'dashboard': { view: true, add: true, edit: true, delete: true },
    'pendaftaran': { view: true, add: true, edit: true, delete: true },
    'anggota': { view: true, add: true, edit: true, delete: true },
    'ekta': { view: true, add: true, edit: true, delete: true },
    'pensiun': { view: true, add: true, edit: true, delete: true },
    'arsip': { view: true, add: true, edit: true, delete: true },
    'regulasi': { view: true, add: true, edit: true, delete: true },
    'kalender': { view: true, add: true, edit: true, delete: true },
    'iuran': { view: true, add: true, edit: true, delete: true },
    'settings-app': { view: true, add: true, edit: true, delete: true },
    'settings-user': { view: true, add: true, edit: true, delete: true },
    'settings-role': { view: true, add: true, edit: true, delete: true },
    'settings-db': { view: true, add: true, edit: true, delete: true },
    'settings-telemetry': { view: true, add: true, edit: true, delete: true },
    'settings-whatsapp': { view: true, add: true, edit: true, delete: true },
    'skema': { view: true, add: true, edit: true, delete: true },
  },
  'Admin_Kabupaten': {
    'dashboard': { view: true, add: false, edit: false, delete: false },
    'pendaftaran': { view: true, add: true, edit: true, delete: true },
    'anggota': { view: true, add: true, edit: true, delete: true },
    'ekta': { view: true, add: true, edit: true, delete: true },
    'pensiun': { view: true, add: false, edit: false, delete: false },
    'arsip': { view: true, add: true, edit: true, delete: true },
    'regulasi': { view: true, add: true, edit: true, delete: true },
    'kalender': { view: true, add: true, edit: true, delete: true },
    'iuran': { view: true, add: true, edit: true, delete: true },
    'settings-user': { view: true, add: true, edit: true, delete: true },
    'settings-app': { view: false, add: false, edit: false, delete: false },
    'settings-role': { view: false, add: false, edit: false, delete: false },
    'settings-db': { view: false, add: false, edit: false, delete: false },
    'settings-telemetry': { view: true, add: false, edit: false, delete: false },
    'settings-whatsapp': { view: true, add: true, edit: true, delete: false },
    'skema': { view: false, add: false, edit: false, delete: false },
  },
  'Admin_Kecamatan': {
    'dashboard': { view: true, add: false, edit: false, delete: false },
    'pendaftaran': { view: true, add: true, edit: true, delete: false },
    'anggota': { view: true, add: true, edit: true, delete: false },
    'ekta': { view: true, add: true, edit: false, delete: false },
    'pensiun': { view: true, add: false, edit: false, delete: false },
    'arsip': { view: true, add: true, edit: false, delete: false },
    'regulasi': { view: true, add: false, edit: false, delete: false },
    'kalender': { view: true, add: true, edit: true, delete: false },
    'iuran': { view: true, add: true, edit: true, delete: false },
    'settings-user': { view: false, add: false, edit: false, delete: false },
    'settings-app': { view: false, add: false, edit: false, delete: false },
    'settings-role': { view: false, add: false, edit: false, delete: false },
    'settings-db': { view: false, add: false, edit: false, delete: false },
    'settings-telemetry': { view: false, add: false, edit: false, delete: false },
    'settings-whatsapp': { view: false, add: false, edit: false, delete: false },
    'skema': { view: false, add: false, edit: false, delete: false },
  },
  'Admin_Desa': {
    'dashboard': { view: true, add: false, edit: false, delete: false },
    'pendaftaran': { view: true, add: true, edit: false, delete: false },
    'anggota': { view: true, add: false, edit: true, delete: false },
    'ekta': { view: true, add: false, edit: false, delete: false },
    'pensiun': { view: true, add: false, edit: false, delete: false },
    'arsip': { view: true, add: true, edit: false, delete: false },
    'regulasi': { view: true, add: false, edit: false, delete: false },
    'kalender': { view: true, add: false, edit: false, delete: false },
    'iuran': { view: true, add: true, edit: false, delete: false },
    'settings-user': { view: false, add: false, edit: false, delete: false },
    'settings-app': { view: false, add: false, edit: false, delete: false },
    'settings-role': { view: false, add: false, edit: false, delete: false },
    'settings-db': { view: false, add: false, edit: false, delete: false },
    'settings-telemetry': { view: false, add: false, edit: false, delete: false },
    'settings-whatsapp': { view: false, add: false, edit: false, delete: false },
    'skema': { view: false, add: false, edit: false, delete: false },
  },
  'Anggota': {
    'dashboard': { view: true, add: false, edit: false, delete: false },
    'pendaftaran': { view: false, add: false, edit: false, delete: false },
    'anggota': { view: true, add: false, edit: false, delete: false },
    'ekta': { view: true, add: false, edit: false, delete: false },
    'pensiun': { view: false, add: false, edit: false, delete: false },
    'arsip': { view: false, add: false, edit: false, delete: false },
    'regulasi': { view: true, add: false, edit: false, delete: false },
    'kalender': { view: true, add: false, edit: false, delete: false },
    'iuran': { view: true, add: true, edit: false, delete: false },
    'settings-user': { view: false, add: false, edit: false, delete: false },
    'settings-app': { view: false, add: false, edit: false, delete: false },
    'settings-role': { view: false, add: false, edit: false, delete: false },
    'settings-db': { view: false, add: false, edit: false, delete: false },
    'settings-telemetry': { view: false, add: false, edit: false, delete: false },
    'settings-whatsapp': { view: false, add: false, edit: false, delete: false },
    'skema': { view: false, add: false, edit: false, delete: false },
  },
};

function getActiveRolePermissions(): Record<string, any> {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      if (data.rolePermissions && Object.keys(data.rolePermissions).length > 0) {
        return data.rolePermissions;
      }
    }
  } catch (_) {}
  return DEFAULT_ROLE_PERMISSIONS;
}

function normalizePermissionBoolean(val: any): boolean {
  return val === true || val === 1 || val === 'true' || val === '1';
}

function checkServerPermission(
  userRole: string | undefined | null,
  moduleId: string,
  action: 'view' | 'add' | 'edit' | 'delete'
): boolean {
  if (!userRole) return false;
  if (userRole === 'Superadmin_Kabupaten') return true;

  const roleConfig = getActiveRolePermissions();
  const activeRole = roleConfig[userRole];
  if (activeRole && activeRole[moduleId]) {
    const val = activeRole[moduleId][action];
    if (val !== undefined && val !== null) {
      return normalizePermissionBoolean(val);
    }
  }

  const defaultRole = DEFAULT_ROLE_PERMISSIONS[userRole];
  if (defaultRole && defaultRole[moduleId]) {
    const val = defaultRole[moduleId][action];
    return normalizePermissionBoolean(val);
  }

  return false;
}

function requirePermission(moduleId: string, action: 'view' | 'add' | 'edit' | 'delete') {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const userRole = (req.headers['x-user-role'] || req.headers['user-role'] || '').toString().trim();

    if (!userRole) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Akses ditolak: Anda tidak memiliki izin untuk melakukan aksi ini (Header x-user-role tidak ditemukan)',
      });
    }

    if (!checkServerPermission(userRole, moduleId, action)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: `Akses ditolak: Peran '${userRole}' tidak memiliki izin (${action.toUpperCase()}) pada modul '${moduleId}'.`,
      });
    }

    next();
  };
}

// Helper to save base64 upload data URL to disk and return /uploads/<folder>/<fileName>
function saveBase64UploadToDisk(
  type: 'foto' | 'sk' | 'ttd' | 'regulasi',
  fileData: string,
  fileName?: string,
  nik?: string
): { url: string; fileName: string; sizeBytes: number; mimeType: string } {
  const folderType =
    type === 'sk' ? 'sk' : type === 'ttd' ? 'ttd' : type === 'regulasi' ? 'regulasi' : 'foto';
  const targetFolder =
    folderType === 'sk'
      ? SK_DIR
      : folderType === 'ttd'
      ? TTD_DIR
      : folderType === 'regulasi'
      ? REGULASI_DIR
      : FOTO_DIR;

  let mimeType = '';
  let base64Clean = fileData;
  const matches = fileData.match(/^data:([A-Za-z0-9\-+/.]+);base64,(.+)$/);
  if (matches && matches.length === 3) {
    mimeType = matches[1];
    base64Clean = matches[2];
  }

  let ext = path.extname(fileName || '').toLowerCase();
  if (!ext) {
    if (mimeType.includes('pdf')) ext = '.pdf';
    else if (mimeType.includes('png')) ext = '.png';
    else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = '.jpg';
    else if (mimeType.includes('webp')) ext = '.webp';
    else ext = folderType === 'sk' || folderType === 'regulasi' ? '.pdf' : folderType === 'ttd' ? '.png' : '.jpg';
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

  return {
    url: `/uploads/${folderType}/${finalFileName}`,
    fileName: finalFileName,
    sizeBytes: buffer.length,
    mimeType: mimeType || ext,
  };
}

// ====================================================================
// 0. UPLOAD FOTO, BERKAS SK & TANDA TANGAN (/uploads/foto, /uploads/sk, /uploads/ttd)
// ====================================================================
app.post('/api/upload', async (req, res) => {
  try {
    const { type, fileName, fileData, nik } = req.body;
    if (!fileData) {
      return res.status(400).json({ success: false, message: 'Data file base64 tidak ditemukan' });
    }

    const folderType =
      type === 'sk' ? 'sk' : type === 'ttd' ? 'ttd' : type === 'regulasi' ? 'regulasi' : 'foto';
    const saved = saveBase64UploadToDisk(folderType, fileData, fileName, nik);

    return res.json({
      success: true,
      message: `File ${folderType.toUpperCase()} berhasil diunggah ke folder server`,
      url: saved.url,
      fileName: saved.fileName,
      folder: folderType,
      sizeBytes: saved.sizeBytes,
      mimeType: saved.mimeType,
    });
  } catch (err: any) {
    console.error('Upload handling error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// List files in upload directories
app.get('/api/uploads/list', (_req, res) => {
  try {
    const listFiles = (dir: string, type: 'foto' | 'sk' | 'ttd' | 'regulasi') => {
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
        })
        .sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
    };

    const fotoFiles = listFiles(FOTO_DIR, 'foto');
    const skFiles = listFiles(SK_DIR, 'sk');
    const ttdFiles = listFiles(TTD_DIR, 'ttd');
    const regulasiFiles = listFiles(REGULASI_DIR, 'regulasi');

    return res.json({
      success: true,
      folders: {
        fotoDir: FOTO_DIR,
        skDir: SK_DIR,
        ttdDir: TTD_DIR,
        regulasiDir: REGULASI_DIR,
      },
      foto: {
        count: fotoFiles.length,
        files: fotoFiles,
      },
      sk: {
        count: skFiles.length,
        files: skFiles,
      },
      ttd: {
        count: ttdFiles.length,
        files: ttdFiles,
      },
      regulasi: {
        count: regulasiFiles.length,
        files: regulasiFiles,
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
    if (folder !== 'foto' && folder !== 'sk' && folder !== 'ttd' && folder !== 'regulasi') {
      return res.status(400).json({ success: false, message: 'Folder tidak valid' });
    }
    const targetDir =
      folder === 'sk' ? SK_DIR : folder === 'ttd' ? TTD_DIR : folder === 'regulasi' ? REGULASI_DIR : FOTO_DIR;
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

// Proxy external images to prevent cross-origin issues during PDF export / canvas render
app.get('/api/proxy-image', async (req, res) => {
  const imageUrl = req.query.url as string;
  if (!imageUrl || !imageUrl.startsWith('http')) {
    return res.status(400).send('Invalid url');
  }
  try {
    const fetchRes = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });
    if (!fetchRes.ok) {
      return res.status(fetchRes.status).send('Failed to fetch image');
    }
    const contentType = fetchRes.headers.get('content-type') || 'image/png';
    const buffer = Buffer.from(await fetchRes.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.send(buffer);
  } catch (err: any) {
    return res.status(500).send(err.message || 'Error proxying image');
  }
});

// ====================================================================
// 1. BACKEND SERVICE & PROXY HANDSHAKE DIAGNOSTICS
// ====================================================================
app.get('/api/health', (_req, res) => {
  return res.json({
    success: true,
    status: 'ok',
    port: Number(PORT),
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.get('/api/diagnostic', async (req, res) => {
  const mem = process.memoryUsage();
  const dbConfig = getDbConfig();
  let dbReachable = false;
  let dbLatencyMs = 0;
  let dbError = null;

  try {
    const t0 = Date.now();
    const currentPool = createOrGetPool();
    const conn = await currentPool.getConnection();
    await conn.query('SELECT 1');
    conn.release();
    dbLatencyMs = Date.now() - t0;
    dbReachable = true;
  } catch (err: any) {
    dbError = err.message || 'Database unreachable';
  }

  return res.json({
    success: true,
    status: 'ONLINE',
    service: 'PPDI Kabupaten Bandung Backend Service',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    server: {
      port: PORT,
      pid: process.pid,
      nodeVersion: process.version,
      targetNodeVersion: '22.23.4',
      platform: process.platform,
      arch: process.arch,
      env: process.env.NODE_ENV || 'development',
      memoryMb: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      },
    },
    clientRequest: {
      ip: req.ip,
      host: req.headers.host,
      forwardedFor: req.headers['x-forwarded-for'] || null,
      userAgent: req.headers['user-agent'] || null,
    },
    database: {
      configuredHost: dbConfig.host || 'localhost',
      port: dbConfig.port,
      databaseName: dbConfig.database,
      reachable: dbReachable,
      latencyMs: dbLatencyMs,
      error: dbError,
    },
    handshake: {
      message: 'Backend Express service handshake successful. Connection is healthy.',
      proxyTargetRecommendation: `http://127.0.0.1:${PORT}`,
    },
  });
});

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
app.post('/api/db/reconnect', requirePermission('settings-db', 'edit'), async (req, res) => {
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
app.post('/api/db/save-env', requirePermission('settings-db', 'edit'), async (req, res) => {
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

async function ensureWhatsAppTables(conn: any): Promise<void> {
  // 11. whatsapp_senders (Tabel Penyimpan Konfigurasi & Pengirim WhatsApp)
  await conn.query(`
    CREATE TABLE IF NOT EXISTS \`whatsapp_senders\` (
      \`id_sender\` INT AUTO_INCREMENT NOT NULL,
      \`sender_label\` VARCHAR(100) NOT NULL DEFAULT 'Gateway Utama PPDI',
      \`sender_number\` VARCHAR(30) NOT NULL DEFAULT '',
      \`provider\` VARCHAR(30) NOT NULL DEFAULT 'fonnte',
      \`fonnte_token\` VARCHAR(255) NOT NULL DEFAULT '',
      \`webhook_url\` VARCHAR(500) NULL,
      \`webhook_secret\` VARCHAR(255) NULL,
      \`country_code\` VARCHAR(10) NOT NULL DEFAULT '62',
      \`is_enabled\` TINYINT(1) NOT NULL DEFAULT 0,
      \`auto_reply_enabled\` TINYINT(1) NOT NULL DEFAULT 1,
      \`is_default\` TINYINT(1) NOT NULL DEFAULT 1,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id_sender\`),
      KEY \`idx_wa_sender_number\` (\`sender_number\`),
      KEY \`idx_wa_sender_default\` (\`is_default\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 12. whatsapp_logs (Tabel Log Pengirim, Pesan Keluar/Masuk & Webhook Fonnte)
  await conn.query(`
    CREATE TABLE IF NOT EXISTS \`whatsapp_logs\` (
      \`id\` VARCHAR(64) NOT NULL,
      \`timestamp\` VARCHAR(40) NOT NULL,
      \`direction\` ENUM('outbound', 'inbound', 'status') NOT NULL DEFAULT 'outbound',
      \`provider\` VARCHAR(30) NOT NULL DEFAULT 'fonnte',
      \`sender_number\` VARCHAR(30) NULL,
      \`target_or_sender\` VARCHAR(50) NOT NULL,
      \`sender_name\` VARCHAR(150) NULL,
      \`id_anggota\` VARCHAR(36) NULL,
      \`category\` VARCHAR(50) NULL,
      \`status\` VARCHAR(30) NOT NULL DEFAULT 'sent',
      \`message\` TEXT NOT NULL,
      \`fonnte_id\` VARCHAR(100) NULL,
      \`batch_id\` VARCHAR(64) NULL,
      \`raw_payload\` LONGTEXT NULL,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`idx_wa_logs_created\` (\`created_at\`),
      KEY \`idx_wa_logs_direction\` (\`direction\`),
      KEY \`idx_wa_logs_status\` (\`status\`),
      KEY \`idx_wa_logs_target\` (\`target_or_sender\`),
      KEY \`idx_wa_logs_fonnte_id\` (\`fonnte_id\`),
      KEY \`idx_wa_logs_batch_id\` (\`batch_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function ensureAppSettingsTable(conn: any): Promise<void> {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS \`app_settings\` (
      \`setting_key\` VARCHAR(64) NOT NULL,
      \`setting_value\` LONGTEXT NOT NULL,
      \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`setting_key\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

let signatureColumnsEnsured = false;
async function ensureSignatureColumns(conn: any): Promise<void> {
  if (signatureColumnsEnsured) return;
  try {
    await conn.query(`ALTER TABLE riwayat_jabatan ADD COLUMN tanda_tangan MEDIUMTEXT NULL AFTER file_sk`);
  } catch (_) {}
  try {
    await conn.query(`ALTER TABLE pendaftaran_perangkat_desa ADD COLUMN tanda_tangan MEDIUMTEXT NULL AFTER file_sk`);
  } catch (_) {}
  signatureColumnsEnsured = true;
}

// Endpoint untuk inisialisasi / sinkronisasi struktur seluruh tabel database PPDI
app.post('/api/db/init-tables', requirePermission('settings-db', 'edit'), async (_req, res) => {
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
        \`kode_kecamatan\` VARCHAR(10) NULL,
        \`nomor_urut\` INT NULL,
        \`no_kta\` VARCHAR(50) NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id_anggota\`),
        UNIQUE KEY \`uq_anggota_nik\` (\`nik\`),
        UNIQUE KEY \`uq_anggota_no_kta\` (\`no_kta\`),
        KEY \`idx_anggota_kecamatan_urut\` (\`kode_kecamatan\`, \`nomor_urut\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Migration: drop niap column if exists, rename niap_nipd to nipd if exists
    try { await conn.query(`ALTER TABLE anggota DROP COLUMN niap`); } catch (_) {}
    try { await conn.query(`ALTER TABLE anggota CHANGE COLUMN niap_nipd nipd VARCHAR(30) NULL`); } catch (_) {
      try { await conn.query(`ALTER TABLE anggota RENAME COLUMN niap_nipd TO nipd`); } catch (_) {}
    }
    try { await conn.query(`ALTER TABLE anggota ADD COLUMN kode_kecamatan VARCHAR(10) NULL AFTER status_pernikahan`); } catch (_) {}
    try { await conn.query(`ALTER TABLE anggota ADD COLUMN nomor_urut INT NULL AFTER kode_kecamatan`); } catch (_) {}
    try { await conn.query(`ALTER TABLE anggota ADD COLUMN no_kta VARCHAR(50) NULL AFTER nomor_urut`); } catch (_) {}
    try { await conn.query(`ALTER TABLE anggota ADD UNIQUE KEY uq_anggota_no_kta (no_kta)`); } catch (_) {}
    try { await conn.query(`ALTER TABLE anggota ADD INDEX idx_anggota_kecamatan_urut (kode_kecamatan, nomor_urut)`); } catch (_) {}

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
        \`tanda_tangan\` MEDIUMTEXT NULL,
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

    // Migration for keanggotaan_ppdi jabatan_pengurus column
    try {
      await conn.query(`ALTER TABLE keanggotaan_ppdi ADD COLUMN jabatan_pengurus VARCHAR(100) NOT NULL DEFAULT 'Anggota Biasa' AFTER tgl_bergabung`);
    } catch (_) {}

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
        \`update_at\` TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id_user\`),
        UNIQUE KEY \`uq_user_username\` (\`username\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Migration for users table update_at column
    try { await conn.query('ALTER TABLE users ADD COLUMN update_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP'); } catch (_) {}
    try { await conn.query('ALTER TABLE users ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP'); } catch (_) {}

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
        \`foto\` VARCHAR(255) NULL,
        \`file_sk\` VARCHAR(255) NULL,
        \`tanda_tangan\` MEDIUMTEXT NULL,
        \`status_approval\` VARCHAR(30) NOT NULL DEFAULT 'Menunggu',
        \`catatan_approval\` TEXT NULL,
        \`tgl_pendaftaran\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`tgl_approval\` DATETIME NULL,
        \`approved_by\` VARCHAR(100) NULL,
        PRIMARY KEY (\`id_pendaftaran\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Migration for pendaftaran_perangkat_desa & riwayat_jabatan columns
    try { await conn.query(`ALTER TABLE pendaftaran_perangkat_desa ADD COLUMN gelar_depan VARCHAR(30) NULL AFTER nama_lengkap`); } catch (_) {}
    try { await conn.query(`ALTER TABLE pendaftaran_perangkat_desa ADD COLUMN gelar_belakang VARCHAR(50) NULL AFTER gelar_depan`); } catch (_) {}
    try { await conn.query(`ALTER TABLE pendaftaran_perangkat_desa ADD COLUMN foto VARCHAR(255) NULL AFTER tmt_jabatan`); } catch (_) {}
    signatureColumnsEnsured = false;
    await ensureSignatureColumns(conn);

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

    // 10, 11, 12, 13 & 14. WhatsApp, App Settings, Pustaka Regulasi, dan Kalender Acara
    await ensureWhatsAppTables(conn);
    await ensureAppSettingsTable(conn);
    await ensureRegulasiTable(conn);
    await ensureKalenderTable(conn);

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

    await ensureSignatureColumns(conn);

    let riwayatRows: any[] = [];
    try {
      const [rows]: [any[], any] = await conn.query(`
        SELECT 
          id_riwayat,
          id_anggota,
          id_desa,
          id_jabatan,
          no_sk_pengangkatan,
          DATE_FORMAT(tgl_sk_pengangkatan, '%Y-%m-%d') as tgl_sk_pengangkatan,
          DATE_FORMAT(tmt_jabatan, '%Y-%m-%d') as tmt_jabatan,
          status_aktif,
          file_sk,
          tanda_tangan,
          created_at
        FROM riwayat_jabatan
        ORDER BY created_at DESC, tgl_sk_pengangkatan DESC, id_riwayat DESC
      `);
      riwayatRows = rows;
    } catch {
      const [rows]: [any[], any] = await conn.query(`
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
        ORDER BY tgl_sk_pengangkatan DESC, id_riwayat DESC
      `);
      riwayatRows = rows;
    }

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

// Check NIK uniqueness directly against MySQL database before saving
app.get('/api/anggota/check-nik', async (req, res) => {
  const rawNik = String(req.query.nik || '').replace(/\D/g, '').trim();
  const excludeId = String(req.query.excludeId || '').trim();

  if (rawNik.length !== 16) {
    return res.status(400).json({
      success: false,
      available: false,
      message: 'NIK KTP harus terdiri dari tepat 16 digit angka.',
    });
  }

  let conn;
  try {
    if (!pool) {
      return res.status(503).json({
        success: false,
        offline: true,
        message: 'Koneksi database MySQL belum tersedia.',
      });
    }

    conn = await pool.getConnection();

    const [existingAnggota]: [any[], any] = excludeId
      ? await conn.query(
          'SELECT id_anggota, nama_lengkap, nipd FROM anggota WHERE nik = ? AND id_anggota != ? LIMIT 1',
          [rawNik, excludeId]
        )
      : await conn.query(
          'SELECT id_anggota, nama_lengkap, nipd FROM anggota WHERE nik = ? LIMIT 1',
          [rawNik]
        );

    const [pendingPendaftaran]: [any[], any] = await conn.query(
      "SELECT id_pendaftaran, nama_lengkap, status_approval FROM pendaftaran_perangkat_desa WHERE nik = ? AND status_approval = 'Menunggu' LIMIT 1",
      [rawNik]
    );

    conn.release();

    const duplicate = existingAnggota.length > 0 ? existingAnggota[0] : null;
    const pending = pendingPendaftaran.length > 0 ? pendingPendaftaran[0] : null;

    return res.json({
      success: true,
      available: !duplicate,
      duplicateInAnggota: duplicate,
      pendingPendaftaran: pending,
    });
  } catch (err: any) {
    if (conn) conn.release();
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
app.post('/api/anggota', requirePermission('anggota', 'add'), async (req, res) => {
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
          riwayat.file_sk || null,
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
app.post('/api/anggota/batch-import', requirePermission('anggota', 'add'), async (req, res) => {
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
          rw.file_sk || null,
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
app.put('/api/anggota/:id', requirePermission('anggota', 'edit'), async (req, res) => {
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

    // Update or insert keanggotaan_ppdi jabatan_pengurus if provided
    const effectiveJabatanPengurus = data.jabatan_pengurus || data.jabatanPengurus;
    if (effectiveJabatanPengurus) {
      const [existingPpdi]: [any[], any] = await conn.query(
        'SELECT id_ppdi FROM keanggotaan_ppdi WHERE id_anggota = ? LIMIT 1',
        [id]
      );
      if (existingPpdi.length > 0) {
        await conn.query(
          'UPDATE keanggotaan_ppdi SET jabatan_pengurus = ? WHERE id_anggota = ?',
          [effectiveJabatanPengurus, id]
        );
      } else {
        const newIdPpdi = crypto.randomUUID();
        const defaultKta = `32.04.PPDI.${Date.now().toString().slice(-6)}`;
        await conn.query(
          `INSERT INTO keanggotaan_ppdi (id_ppdi, id_anggota, no_kta, tgl_bergabung, jabatan_pengurus, status_kta)
           VALUES (?, ?, ?, CURDATE(), ?, 'Aktif')`,
          [newIdPpdi, id, defaultKta, effectiveJabatanPengurus]
        );
      }
    }

    conn.release();
    return res.json({ success: true, message: 'Data anggota dan jabatan kepengurusan PPDI berhasil diperbarui di MySQL' });
  } catch (err: any) {
    if (conn) conn.release();
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Delete Member with Safe Cascade and Fallback matching (ID / NIK)
app.delete('/api/anggota/:id', requirePermission('anggota', 'delete'), async (req, res) => {
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
app.post('/api/riwayat', requirePermission('anggota', 'add'), async (req, res) => {
  const { id_anggota, id_desa, id_jabatan, no_sk_pengangkatan, tgl_sk_pengangkatan, tmt_jabatan, status_aktif, file_sk, tanda_tangan, keterangan } = req.body;

  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();
    await ensureSignatureColumns(conn);

    const validDesaId = await resolveDesaId(conn, id_desa);
    const newIdRiwayat = crypto.randomUUID();

    let savedTtdPath: string | null = tanda_tangan ? String(tanda_tangan).trim() : null;
    if (savedTtdPath && savedTtdPath.startsWith('data:')) {
      try {
        const saved = saveBase64UploadToDisk('ttd', savedTtdPath, 'ttd_sk', id_anggota);
        savedTtdPath = saved.url;
      } catch (e) {
        console.warn('Gagal menyimpan file tanda tangan SK ke disk:', e);
      }
    }

    await conn.query(
      `INSERT INTO riwayat_jabatan (id_riwayat, id_anggota, id_desa, id_jabatan, no_sk_pengangkatan, tgl_sk_pengangkatan, tmt_jabatan, status_aktif, file_sk, tanda_tangan, keterangan)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newIdRiwayat,
        id_anggota,
        validDesaId,
        id_jabatan || 2,
        no_sk_pengangkatan,
        tgl_sk_pengangkatan,
        tmt_jabatan,
        status_aktif || 'Aktif',
        file_sk || null,
        savedTtdPath,
        keterangan || null,
      ]
    );

    conn.release();
    return res.json({ success: true, id_riwayat: newIdRiwayat, message: 'Riwayat mutasi/jabatan berhasil disimpan di MySQL' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Update Riwayat Status (e.g. Purna Tugas)
app.put('/api/riwayat/:id/status', requirePermission('anggota', 'edit'), async (req, res) => {
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
app.put('/api/riwayat/:id', requirePermission('anggota', 'edit'), async (req, res) => {
  const { id } = req.params;
  const { id_desa, id_jabatan, no_sk_pengangkatan, tgl_sk_pengangkatan, tmt_jabatan, status_aktif, file_sk, tanda_tangan } = req.body;

  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();
    await ensureSignatureColumns(conn);

    let validDesaId = null;
    if (id_desa) {
      validDesaId = await resolveDesaId(conn, id_desa);
    }

    let savedTtdPath: string | null = tanda_tangan ? String(tanda_tangan).trim() : null;
    if (savedTtdPath && savedTtdPath.startsWith('data:')) {
      try {
        const saved = saveBase64UploadToDisk('ttd', savedTtdPath, 'ttd_sk_upd', id);
        savedTtdPath = saved.url;
      } catch (e) {
        console.warn('Gagal menyimpan pembaruan file tanda tangan ke disk:', e);
      }
    }

    await conn.query(
      `UPDATE riwayat_jabatan SET
        id_desa = COALESCE(?, id_desa),
        id_jabatan = COALESCE(?, id_jabatan),
        no_sk_pengangkatan = COALESCE(?, no_sk_pengangkatan),
        tgl_sk_pengangkatan = COALESCE(?, tgl_sk_pengangkatan),
        tmt_jabatan = COALESCE(?, tmt_jabatan),
        status_aktif = COALESCE(?, status_aktif),
        file_sk = COALESCE(?, file_sk),
        tanda_tangan = COALESCE(?, tanda_tangan)
      WHERE id_riwayat = ?`,
      [validDesaId, id_jabatan, no_sk_pengangkatan, tgl_sk_pengangkatan, tmt_jabatan, status_aktif, file_sk, savedTtdPath, id]
    );
    conn.release();
    return res.json({ success: true, message: 'Riwayat jabatan berhasil diperbarui di MySQL' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Delete Riwayat Jabatan
app.delete('/api/riwayat/:id', requirePermission('anggota', 'delete'), async (req, res) => {
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
app.put('/api/kta/:idAnggota/status', requirePermission('ekta', 'edit'), async (req, res) => {
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

// Update PPDI Organization Role (Jabatan Kepengurusan PPDI)
app.put('/api/kta/:idAnggota/jabatan-pengurus', requirePermission('anggota', 'edit'), async (req, res) => {
  const { idAnggota } = req.params;
  const { jabatan_pengurus, jabatanPengurus } = req.body;
  const val = jabatan_pengurus || jabatanPengurus || 'Anggota Biasa';

  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();

    const [existingPpdi]: [any[], any] = await conn.query(
      'SELECT id_ppdi FROM keanggotaan_ppdi WHERE id_anggota = ? LIMIT 1',
      [idAnggota]
    );

    if (existingPpdi.length > 0) {
      await conn.query(
        'UPDATE keanggotaan_ppdi SET jabatan_pengurus = ? WHERE id_anggota = ?',
        [val, idAnggota]
      );
    } else {
      const newIdPpdi = crypto.randomUUID();
      const defaultKta = `32.04.PPDI.${Date.now().toString().slice(-6)}`;
      await conn.query(
        `INSERT INTO keanggotaan_ppdi (id_ppdi, id_anggota, no_kta, tgl_bergabung, jabatan_pengurus, status_kta)
         VALUES (?, ?, ?, CURDATE(), ?, 'Aktif')`,
        [newIdPpdi, idAnggota, defaultKta, val]
      );
    }

    conn.release();
    return res.json({ success: true, message: 'Jabatan kepengurusan PPDI berhasil diperbarui di MySQL' });
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

app.post('/api/iuran', requirePermission('iuran', 'add'), async (req, res) => {
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

app.put('/api/iuran/:id/verify', requirePermission('iuran', 'edit'), async (req, res) => {
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
        const cleanReqPass = String(password).trim();
        const storedPass = String(dbUser.password || '').trim();
        console.log(`[AUTH DEBUG] Username: ${username}, storedPass: "${storedPass}", enteredPass: "${cleanReqPass}"`);

        // Strict password verification: MUST match stored password
        if (!storedPass || storedPass !== cleanReqPass) {
          return res.status(401).json({
            success: false,
            message: 'Password yang Anda masukkan salah (MySQL). Silakan periksa kembali password akun Anda.',
          });
        }

        const effectiveUpdatedAt = dbUser.updated_at || dbUser.update_at || null;
        const cleanPass = String(storedPass || '').trim();
        const isDefaultList = ['PPDIJaya#2006', 'PPDIJaya2026', 'PPDIJaya#2026'];
        const hasValidUpdatedTs = Boolean(
          effectiveUpdatedAt &&
            String(effectiveUpdatedAt).trim() !== '' &&
            String(effectiveUpdatedAt).trim() !== 'null' &&
            !String(effectiveUpdatedAt).startsWith('0000-00-00')
        );
        const isPasswordAlreadyChanged =
          Boolean(cleanPass) && !isDefaultList.includes(cleanPass) && hasValidUpdatedTs;
        const isDefaultPassword = !isPasswordAlreadyChanged;

        return res.json({
          success: true,
          source: 'mysql',
          is_default_password: isDefaultPassword,
          user: {
            id_user: dbUser.id_user,
            username: dbUser.username,
            email: dbUser.email,
            nama: dbUser.nama_lengkap || dbUser.nama || dbUser.username,
            role: dbUser.role_name || dbUser.id_role || 'Superadmin_Kabupaten',
            id_role: dbUser.id_role,
            id_anggota: dbUser.id_anggota ? String(dbUser.id_anggota) : undefined,
            id_kecamatan: dbUser.id_kecamatan_scope || dbUser.id_kecamatan || undefined,
            id_desa: dbUser.id_desa || undefined,
            created_at: dbUser.created_at,
            update_at: effectiveUpdatedAt,
            updated_at: effectiveUpdatedAt,
            is_default_password: isDefaultPassword,
          },
        });
      }
    }
  } catch (err: any) {
    console.error('MySQL Auth Check Error:', err?.message);
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
    'admin.kabupaten': {
      pass: process.env.ADMIN_PASSWORD || 'admin',
      user: {
        id_user: 2,
        username: 'admin.kabupaten',
        email: 'admin.pd@ppdi-bandungkab.id',
        nama: 'PENGURUS DAERAH KAB. BANDUNG',
        role: 'Admin_Kabupaten',
      },
    },
    'admin.soreang': {
      pass: process.env.ADMIN_PASSWORD || 'admin',
      user: {
        id_user: 3,
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
        id_user: 4,
        username: 'admin.banjaran',
        email: 'admin.banjaran@ppdi-bandungkab.id',
        nama: 'ADMIN PK PPDI BANJARAN',
        role: 'Admin_Kecamatan',
        id_kecamatan: '320413',
      },
    },
    'admin.sekarwangi': {
      pass: process.env.ADMIN_PASSWORD || 'admin',
      user: {
        id_user: 5,
        username: 'admin.sekarwangi',
        email: 'admin.sekarwangi@ppdi-bandungkab.id',
        nama: 'OPERATOR DESA SEKARWANGI',
        role: 'Admin_Desa',
        id_kecamatan: '320437',
        id_desa: '3204372021',
      },
    },
  };

  const clean = username.trim().toLowerCase();
  const matchedDefault = defaultAccounts[clean];
  if (matchedDefault) {
    const cleanPass = String(password).trim();
    const isDefaultList = ['PPDIJaya#2006', 'PPDIJaya2026', 'PPDIJaya#2026'];
    const isPassValid = cleanPass === matchedDefault.pass || cleanPass === 'PPDIJaya#2006';
    if (!isPassValid) {
      return res.status(401).json({
        success: false,
        message: 'Password yang Anda masukkan salah. Silakan periksa kembali password akun Anda.',
      });
    }
    const isDefault = isDefaultList.includes(cleanPass);
    const localUpdatedAt = isDefault ? null : new Date().toISOString();
    return res.json({
      success: true,
      source: 'local_auth',
      is_default_password: isDefault,
      user: {
        ...matchedDefault.user,
        update_at: localUpdatedAt,
        updated_at: localUpdatedAt,
        is_default_password: isDefault,
      },
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
    let rows: any[] = [];
    try {
      const [result]: [any[], any] = await conn.query(`
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
          u.created_at,
          COALESCE(u.updated_at, u.update_at) as updated_at,
          COALESCE(u.update_at, u.updated_at) as update_at,
          CASE
            WHEN TRIM(COALESCE(u.password, '')) NOT IN ('PPDIJaya#2006', 'PPDIJaya2026', 'PPDIJaya#2026', '')
              AND COALESCE(u.updated_at, u.update_at) IS NOT NULL
            THEN 0
            ELSE 1
          END as is_default_password
        FROM users u
        LEFT JOIN roles r ON (CAST(u.id_role AS CHAR) = CAST(r.id_role AS CHAR) OR u.id_role = r.nama_role)
        ORDER BY u.id_user ASC
      `);
      rows = result;
    } catch (_colErr) {
      const [resultFallback]: [any[], any] = await conn.query(`
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
          u.created_at,
          u.update_at as updated_at,
          u.update_at,
          CASE
            WHEN TRIM(COALESCE(u.password, '')) NOT IN ('PPDIJaya#2006', 'PPDIJaya2026', 'PPDIJaya#2026', '')
              AND u.update_at IS NOT NULL
            THEN 0
            ELSE 1
          END as is_default_password
        FROM users u
        LEFT JOIN roles r ON (CAST(u.id_role AS CHAR) = CAST(r.id_role AS CHAR) OR u.id_role = r.nama_role)
        ORDER BY u.id_user ASC
      `);
      rows = resultFallback;
    }
    conn.release();
    return res.json({ success: true, users: rows });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/users', requirePermission('settings-user', 'add'), async (req, res) => {
  const { username, email, nama, password, role, id_role, id_anggota, id_kecamatan_scope, id_kecamatan, id_desa } = req.body;
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
    const assignedPass = (password && String(password).trim()) || 'PPDIJaya#2006';
    const isUsingDefaultPass = ['PPDIJaya#2006', 'PPDIJaya2026', 'PPDIJaya#2026'].includes(assignedPass);
    const passUpdatedValue = isUsingDefaultPass ? null : new Date();

    let insertRes: any;
    try {
      const [resInsert]: [any, any] = await conn.query(
        `INSERT INTO users (username, email, nama, password, id_role, id_anggota, id_kecamatan_scope, id_kecamatan, id_desa, update_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          username.trim(),
          email.trim(),
          (nama || username).trim().toUpperCase(),
          assignedPass,
          effectiveRoleId,
          id_anggota || null,
          id_kecamatan_scope || id_kecamatan || null,
          id_kecamatan || null,
          id_desa || null,
          passUpdatedValue,
          passUpdatedValue,
        ]
      );
      insertRes = resInsert;
    } catch (_colErr) {
      try {
        const [resInsertUpdateAtOnly]: [any, any] = await conn.query(
          `INSERT INTO users (username, email, nama, password, id_role, id_anggota, id_kecamatan_scope, id_kecamatan, id_desa, update_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            username.trim(),
            email.trim(),
            (nama || username).trim().toUpperCase(),
            assignedPass,
            effectiveRoleId,
            id_anggota || null,
            id_kecamatan_scope || id_kecamatan || null,
            id_kecamatan || null,
            id_desa || null,
            passUpdatedValue,
          ]
        );
        insertRes = resInsertUpdateAtOnly;
      } catch (_colErr2) {
        const [resInsertFallback]: [any, any] = await conn.query(
          `INSERT INTO users (username, email, nama, password, id_role, id_anggota, id_kecamatan_scope, id_kecamatan, id_desa)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            username.trim(),
            email.trim(),
            (nama || username).trim().toUpperCase(),
            assignedPass,
            effectiveRoleId,
            id_anggota || null,
            id_kecamatan_scope || id_kecamatan || null,
            id_kecamatan || null,
            id_desa || null,
          ]
        );
        insertRes = resInsertFallback;
      }
    }

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

app.put('/api/users/:id', requirePermission('settings-user', 'edit'), async (req, res) => {
  const { id } = req.params;
  const { username, email, nama, password, role, id_role, id_anggota, id_kecamatan_scope, id_kecamatan, id_desa } = req.body;

  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();

    const formattedNama = nama ? nama.trim().toUpperCase() : undefined;
    const effectiveRoleId = id_role || (role ? mapRoleNameToId(role) : undefined);

    if (password && String(password).trim()) {
      const cleanPass = String(password).trim();
      const isResetToDefault = ['PPDIJaya#2006', 'PPDIJaya2026', 'PPDIJaya#2026'].includes(cleanPass);
      const nextUpdatedTs = isResetToDefault ? null : new Date();
      try {
        await conn.query(
          `UPDATE users SET
            username = COALESCE(?, username),
            email = COALESCE(?, email),
            nama = COALESCE(?, nama),
            password = ?,
            id_role = COALESCE(?, id_role),
            id_anggota = ?,
            id_kecamatan_scope = ?,
            id_kecamatan = ?,
            id_desa = ?,
            update_at = ?,
            updated_at = ?
          WHERE id_user = ?`,
          [
            username,
            email,
            formattedNama,
            cleanPass,
            effectiveRoleId,
            id_anggota !== undefined ? id_anggota : null,
            id_kecamatan_scope || id_kecamatan || null,
            id_kecamatan || null,
            id_desa || null,
            nextUpdatedTs,
            nextUpdatedTs,
            id,
          ]
        );
      } catch (_colErr) {
        try {
          await conn.query(
            `UPDATE users SET
              username = COALESCE(?, username),
              email = COALESCE(?, email),
              nama = COALESCE(?, nama),
              password = ?,
              id_role = COALESCE(?, id_role),
              id_anggota = ?,
              id_kecamatan_scope = ?,
              id_kecamatan = ?,
              id_desa = ?,
              update_at = ?
            WHERE id_user = ?`,
            [
              username,
              email,
              formattedNama,
              cleanPass,
              effectiveRoleId,
              id_anggota !== undefined ? id_anggota : null,
              id_kecamatan_scope || id_kecamatan || null,
              id_kecamatan || null,
              id_desa || null,
              nextUpdatedTs,
              id,
            ]
          );
        } catch (_colErr2) {
          await conn.query(
            `UPDATE users SET
              username = COALESCE(?, username),
              email = COALESCE(?, email),
              nama = COALESCE(?, nama),
              password = ?,
              id_role = COALESCE(?, id_role),
              id_anggota = ?,
              id_kecamatan_scope = ?,
              id_kecamatan = ?,
              id_desa = ?
            WHERE id_user = ?`,
            [
              username,
              email,
              formattedNama,
              cleanPass,
              effectiveRoleId,
              id_anggota !== undefined ? id_anggota : null,
              id_kecamatan_scope || id_kecamatan || null,
              id_kecamatan || null,
              id_desa || null,
              id,
            ]
          );
        }
      }
    } else {
      await conn.query(
        `UPDATE users SET
          username = COALESCE(?, username),
          email = COALESCE(?, email),
          nama = COALESCE(?, nama),
          id_role = COALESCE(?, id_role),
          id_anggota = ?,
          id_kecamatan_scope = ?,
          id_kecamatan = ?,
          id_desa = ?
        WHERE id_user = ?`,
        [
          username,
          email,
          formattedNama,
          effectiveRoleId,
          id_anggota !== undefined ? id_anggota : null,
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

app.delete('/api/users/:id', requirePermission('settings-user', 'delete'), async (req, res) => {
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

// Endpoint untuk ganti password pengguna dengan verifikasi password lama
app.post('/api/users/change-password', async (req, res) => {
  const { id_user, username, oldPassword, newPassword, requireOldPassword = true } = req.body;
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || req.ip || '127.0.0.1';

  if (!id_user && !username) {
    return res.status(400).json({ success: false, message: 'ID Pengguna atau username wajib disertakan' });
  }

  if (!newPassword || String(newPassword).trim().length < 6) {
    return res.status(400).json({ success: false, message: 'Password baru minimal harus 6 karakter' });
  }

  const cleanNewPass = String(newPassword).trim();
  const cleanOldPass = oldPassword ? String(oldPassword).trim() : '';

  if (requireOldPassword && !cleanOldPass) {
    return res.status(400).json({ success: false, message: 'Password lama wajib diisi' });
  }

  if (requireOldPassword && cleanOldPass === cleanNewPass) {
    return res.status(400).json({ success: false, message: 'Password baru tidak boleh sama dengan password lama' });
  }

  if (['PPDIJaya#2006', 'PPDIJaya2026', 'PPDIJaya#2026'].includes(cleanNewPass)) {
    return res.status(400).json({
      success: false,
      message: 'Password baru tidak boleh menggunakan password default. Silakan buat kata sandi baru yang aman dan unik.',
    });
  }

  const nowIso = new Date().toISOString().slice(0, 19).replace('T', ' ');

  try {
    if (pool) {
      const conn = await pool.getConnection();
      const [rows]: [any[], any] = await conn.query(
        `SELECT u.*, COALESCE(r.nama_role, u.id_role) as role_name 
         FROM users u 
         LEFT JOIN roles r ON (CAST(u.id_role AS CHAR) = CAST(r.id_role AS CHAR) OR u.id_role = r.nama_role)
         WHERE u.id_user = ? OR u.username = ? 
         LIMIT 1`,
        [id_user || 0, username || '']
      );

      if (!rows || rows.length === 0) {
        conn.release();
        return res.status(404).json({ success: false, message: 'Data pengguna tidak ditemukan di database' });
      }

      const dbUser = rows[0];
      const storedPass = String(dbUser.password || '').trim();

      if (requireOldPassword) {
        if (storedPass && storedPass !== cleanOldPass) {
          conn.release();
          return res.status(400).json({
            success: false,
            message: 'Password lama yang Anda masukkan salah / tidak sesuai.',
          });
        }
      }

      // Update password dan tanggal update_at di tabel users
      try {
        await conn.query(
          'UPDATE users SET password = ?, update_at = NOW(), updated_at = NOW() WHERE id_user = ?',
          [cleanNewPass, dbUser.id_user]
        );
      } catch (_) {
        try {
          await conn.query('UPDATE users SET password = ?, update_at = NOW() WHERE id_user = ?', [
            cleanNewPass,
            dbUser.id_user,
          ]);
        } catch (_) {
          try {
            await conn.query('ALTER TABLE users ADD COLUMN update_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP');
            await conn.query('UPDATE users SET password = ?, update_at = NOW() WHERE id_user = ?', [
              cleanNewPass,
              dbUser.id_user,
            ]);
          } catch (_) {
            await conn.query('UPDATE users SET password = ? WHERE id_user = ?', [
              cleanNewPass,
              dbUser.id_user,
            ]);
          }
        }
      }

      // Log activity entry
      const logEntry = {
        timestamp: nowIso,
        ip_address: clientIp,
        user_id: dbUser.id_user,
        user_name: dbUser.nama || dbUser.username,
        user_role: dbUser.role_name || dbUser.role || dbUser.id_role || 'User',
        modul: 'Keamanan & Password',
        aksi: 'EDIT',
        keterangan: `Pengguna ${dbUser.username} (ID: ${dbUser.id_user}) berhasil memperbarui password dari IP ${clientIp}`,
      };

      try {
        await conn.query(
          `CREATE TABLE IF NOT EXISTS activity_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            timestamp DATETIME,
            ip_address VARCHAR(45),
            user_id INT,
            user_name VARCHAR(150),
            user_role VARCHAR(50),
            modul VARCHAR(100),
            aksi VARCHAR(50),
            keterangan TEXT
          )`
        );
        await conn.query(
          `INSERT INTO activity_logs (timestamp, ip_address, user_id, user_name, user_role, modul, aksi, keterangan)
           VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?)`,
          [
            logEntry.ip_address,
            logEntry.user_id,
            logEntry.user_name,
            logEntry.user_role,
            logEntry.modul,
            logEntry.aksi,
            logEntry.keterangan,
          ]
        );
      } catch (logErr) {
        console.warn('Failed to insert activity log:', logErr);
      }

      conn.release();

      return res.json({
        success: true,
        message: 'Password akun berhasil diperbarui! Tanggal updated_at telah tercatat di tabel users.',
        update_at: nowIso,
        updated_at: nowIso,
        is_default_password: false,
        activity_log: logEntry,
      });
    }

    return res.json({
      success: true,
      message: 'Password berhasil diperbarui (mode offline).',
      update_at: nowIso,
      updated_at: nowIso,
      is_default_password: false,
      activity_log: {
        timestamp: nowIso,
        ip_address: clientIp,
        user_id: id_user || 0,
        user_name: username || 'User',
        user_role: 'User',
        modul: 'Keamanan & Password',
        aksi: 'EDIT',
        keterangan: `Pengguna ${username || id_user} memperbarui password dalam mode offline.`,
      },
    });
  } catch (err: any) {
    console.error('Change password error:', err);
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || !activeDbConfig.host || err.message?.includes('connect')) {
      return res.json({
        success: true,
        message: 'Password berhasil diperbarui (mode offline). Tanggal updated_at telah tercatat di profil pengguna.',
        update_at: nowIso,
        updated_at: nowIso,
        is_default_password: false,
        activity_log: {
          timestamp: nowIso,
          ip_address: clientIp,
          user_id: id_user || 0,
          user_name: username || 'User',
          user_role: 'User',
          modul: 'Keamanan & Password',
          aksi: 'EDIT',
          keterangan: `Pengguna ${username || id_user} memperbarui password (mode offline).`,
        },
      });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ====================================================================
// 8. PENDAFTARAN PERANGKAT DESA (FORMULIR INDUK) & APPROVAL
// ====================================================================
app.get('/api/pendaftaran', async (req, res) => {
  try {
    if (!pool) throw new Error('Pool not ready');
    const { id_kecamatan, id_desa, nik } = req.query;

    let querySql = `
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
    `;

    const whereClauses: string[] = [];
    const queryParams: any[] = [];

    if (id_desa && String(id_desa).trim() !== '' && String(id_desa).toLowerCase() !== 'all') {
      const cleanDesa = String(id_desa).replace(/\./g, '').trim();
      whereClauses.push('(p.id_desa = ? OR REPLACE(p.id_desa, \'.\', \'\') = ?)');
      queryParams.push(String(id_desa), cleanDesa);
    } else if (id_kecamatan && String(id_kecamatan).trim() !== '' && String(id_kecamatan).toLowerCase() !== 'all') {
      const cleanKec = String(id_kecamatan).replace(/\./g, '').trim();
      whereClauses.push('(p.id_kecamatan = ? OR REPLACE(p.id_kecamatan, \'.\', \'\') = ? OR REPLACE(p.id_desa, \'.\', \'\') LIKE CONCAT(?, \'%\'))');
      queryParams.push(String(id_kecamatan), cleanKec, cleanKec);
    }

    if (nik && String(nik).trim() !== '') {
      whereClauses.push('p.nik = ?');
      queryParams.push(String(nik).trim());
    }

    if (whereClauses.length > 0) {
      querySql += ' WHERE ' + whereClauses.join(' AND ');
    }

    querySql += ' ORDER BY p.id_pendaftaran DESC';

    const conn = await pool.getConnection();
    await ensureSignatureColumns(conn);
    const [rows]: [any[], any] = await conn.query(querySql, queryParams);
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
    await ensureSignatureColumns(conn);

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

    // If foto / file_sk / tanda_tangan is sent as base64 data URL, save physically to /uploads/foto, /uploads/sk, /uploads/ttd
    let savedFotoPath: string | null = data.foto ? String(data.foto).trim() : null;
    if (savedFotoPath && savedFotoPath.startsWith('data:')) {
      try {
        const saved = saveBase64UploadToDisk('foto', savedFotoPath, 'pendaftaran_foto', data.nik);
        savedFotoPath = saved.url;
      } catch (e) {
        console.warn('Gagal menyimpan file foto pendaftaran ke disk:', e);
      }
    }

    let savedSkPath: string | null = data.file_sk ? String(data.file_sk).trim() : null;
    if (savedSkPath && savedSkPath.startsWith('data:')) {
      try {
        const saved = saveBase64UploadToDisk('sk', savedSkPath, 'pendaftaran_sk', data.nik);
        savedSkPath = saved.url;
      } catch (e) {
        console.warn('Gagal menyimpan file SK pendaftaran ke disk:', e);
      }
    }

    let savedTtdPath: string | null = data.tanda_tangan ? String(data.tanda_tangan).trim() : null;
    if (savedTtdPath && savedTtdPath.startsWith('data:')) {
      try {
        const saved = saveBase64UploadToDisk('ttd', savedTtdPath, 'pendaftaran_ttd', data.nik);
        savedTtdPath = saved.url;
      } catch (e) {
        console.warn('Gagal menyimpan file tanda tangan pendaftaran ke disk:', e);
      }
    }

    const [insertRes]: [any, any] = await conn.query(
      `INSERT INTO pendaftaran_perangkat_desa (
        nik, nama_lengkap, gelar_depan, gelar_belakang, tempat_lahir, tanggal_lahir, jenis_kelamin, agama,
        pendidikan_terakhir, no_hp_wa, email, alamat_rumah, status_pernikahan,
        id_kecamatan, id_desa, id_jabatan, no_sk_pengangkatan, tgl_sk_pengangkatan, tmt_jabatan,
        foto, file_sk, tanda_tangan, status_approval
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Menunggu')`,
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
        savedFotoPath,
        savedSkPath,
        savedTtdPath,
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
          foto = COALESCE(?, foto),
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
          p.foto || null,
          p.alamat_rumah,
          p.status_pernikahan,
          effectiveIdAnggota,
        ]
      );
    } else {
      effectiveIdAnggota = crypto.randomUUID();
      await conn.query(
        `INSERT INTO anggota (id_anggota, nik, nipd, nama_lengkap, gelar_depan, gelar_belakang, tempat_lahir, tanggal_lahir, jenis_kelamin, agama, pendidikan_terakhir, no_hp_wa, email, foto, alamat_rumah, status_pernikahan)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          p.foto || null,
          p.alamat_rumah || 'Kabupaten Bandung',
          p.status_pernikahan || 'Kawin',
        ]
      );
    }

    await ensureSignatureColumns(conn);

    // 2. Insert or update riwayat_jabatan
    const [existingRw]: [any[], any] = await conn.query(
      'SELECT id_riwayat FROM riwayat_jabatan WHERE id_anggota = ? AND status_aktif = "Aktif" LIMIT 1',
      [effectiveIdAnggota]
    );

    if (existingRw.length === 0) {
      await conn.query(
        `INSERT INTO riwayat_jabatan (id_riwayat, id_anggota, id_desa, id_jabatan, no_sk_pengangkatan, tgl_sk_pengangkatan, tmt_jabatan, status_aktif, file_sk, tanda_tangan)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Aktif', ?, ?)`,
        [
          newIdRiwayat,
          effectiveIdAnggota,
          validDesaId,
          p.id_jabatan || 1,
          p.no_sk_pengangkatan || `141.1/Kep.01-Desa/${new Date().getFullYear()}`,
          p.tgl_sk_pengangkatan || new Date().toISOString().split('T')[0],
          p.tmt_jabatan || new Date().toISOString().split('T')[0],
          p.file_sk || null,
          p.tanda_tangan || null,
        ]
      );
    }

    // 3. Generate Unique KTA & Insert/Update keanggotaan_ppdi and anggota
    const [existingKta]: [any[], any] = await conn.query(
      'SELECT id_ppdi, no_kta FROM keanggotaan_ppdi WHERE id_anggota = ? LIMIT 1',
      [effectiveIdAnggota]
    );

    let finalKta: string;
    let finalKecCode: string;
    let finalNomorUrut: number;

    if (existingKta.length > 0) {
      finalKta = existingKta[0].no_kta;
      const ktaParts = finalKta.split('.');
      finalKecCode = ktaParts.length >= 3 ? `32.04.${ktaParts[2]}` : (p.id_kecamatan || '32.04.05');
      finalNomorUrut = ktaParts.length >= 5 ? parseInt(ktaParts[4], 10) || 1 : 1;

      await conn.query(
        'UPDATE keanggotaan_ppdi SET status_kta = "Aktif", jabatan_pengurus = COALESCE(?, jabatan_pengurus) WHERE id_anggota = ?',
        [p.jabatan_pengurus || null, effectiveIdAnggota]
      );
    } else {
      const ktaResult = await generateUniqueKTA(
        conn,
        p.id_kecamatan || validDesaId,
        validDesaId,
        no_kta_custom
      );
      finalKta = ktaResult.noKta;
      finalKecCode = ktaResult.kodeKecamatan;
      finalNomorUrut = ktaResult.nomorUrut;

      // Check if applicant is Kepala Desa
      const [jabatanInfo]: [any[], any] = await conn.query(
        'SELECT nama_jabatan, kategori_jabatan FROM ref_jabatan WHERE id_jabatan = ? LIMIT 1',
        [p.id_jabatan || 1]
      );
      const isKades = jabatanInfo.length > 0 && (
        jabatanInfo[0].kategori_jabatan === 'Kepala Desa' ||
        String(jabatanInfo[0].nama_jabatan || '').toLowerCase().includes('kepala desa') ||
        String(jabatanInfo[0].nama_jabatan || '').toLowerCase().includes('kades')
      );

      let effectiveJabatanPengurus = p.jabatan_pengurus || (isKades ? 'Anggota Istimewa' : 'Anggota Biasa');
      if (isKades && effectiveJabatanPengurus !== 'Penasehat' && effectiveJabatanPengurus !== 'Anggota Istimewa') {
        effectiveJabatanPengurus = 'Anggota Istimewa';
      }

      await conn.query(
        `INSERT INTO keanggotaan_ppdi (id_ppdi, id_anggota, no_kta, tgl_bergabung, jabatan_pengurus, status_kta)
         VALUES (?, ?, ?, CURDATE(), ?, 'Aktif')`,
        [newIdPpdi, effectiveIdAnggota, finalKta, effectiveJabatanPengurus]
      );
    }

    // Sync kode_kecamatan, nomor_urut, and no_kta to anggota table
    try {
      await conn.query(
        `UPDATE anggota SET kode_kecamatan = ?, nomor_urut = ?, no_kta = ? WHERE id_anggota = ?`,
        [finalKecCode, finalNomorUrut, finalKta, effectiveIdAnggota]
      );
    } catch (_) {}

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
app.put('/api/pendaftaran/:id/reject', requirePermission('pendaftaran', 'edit'), async (req, res) => {
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

app.delete('/api/pendaftaran/:id', requirePermission('pendaftaran', 'delete'), async (req, res) => {
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


const DEFAULT_WHATSAPP_SETTINGS = {
  enabled: false,
  senderNumber: process.env.FONNTE_SENDER_NUMBER || '',
  fonnteToken: process.env.FONNTE_TOKEN || '',
  webhookUrl: '',
  webhookSecret: '',
  autoReplyEnabled: true,
  countryCode: '62',
};

const DEFAULT_SETTINGS = {
  appName: 'PPDI KABUPATEN BANDUNG',
  appSubtitle: 'SISTEM INFORMASI DATABASE & E-KTA PERANGKAT DESA',
  logoUrl: '/logo_kabupaten_bandung.svg',
  watermarkLogoUrl: '',
  watermarkOpacity: 0.09,
  watermarkOpacityFront: 0.09,
  watermarkOpacityBack: 0.07,
  loginBackgroundType: 'preset_emerald', // 'preset_emerald' | 'gradient_mesh' | 'custom_image' | 'dark_slate'
  loginBackgroundImage: '',
  loginOverlayOpacity: '0.4',
  syncIntervalSeconds: 60,
  rolePermissions: DEFAULT_ROLE_PERMISSIONS,
  whatsappSettings: DEFAULT_WHATSAPP_SETTINGS,
};

function mergeSettingsWithDefaults(data: any): any {
  const { success: _s, settings: _st, ...cleanData } = data || {};
  const sanitizedLogo = cleanData?.logoUrl && String(cleanData.logoUrl).includes('wikimedia.org')
    ? '/logo_kabupaten_bandung.svg'
    : (cleanData?.logoUrl || DEFAULT_SETTINGS.logoUrl);
  return {
    ...DEFAULT_SETTINGS,
    ...cleanData,
    logoUrl: sanitizedLogo,
    rolePermissions: (cleanData?.rolePermissions && Object.keys(cleanData.rolePermissions).length > 0)
      ? cleanData.rolePermissions
      : DEFAULT_ROLE_PERMISSIONS,
    whatsappSettings: {
      ...DEFAULT_WHATSAPP_SETTINGS,
      ...(cleanData?.whatsappSettings || {}),
    },
  };
}

function readSettingsFromDisk(): any {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      return mergeSettingsWithDefaults(data);
    }
  } catch (_) {}
  return { ...DEFAULT_SETTINGS };
}

async function readSettingsFromDbOrDisk(): Promise<any> {
  const diskSettings = readSettingsFromDisk();
  try {
    const activePool = createOrGetPool();
    if (!activePool) return diskSettings;
    const conn = await activePool.getConnection();
    try {
      await ensureAppSettingsTable(conn);
      const [rows]: [any[], any] = await conn.query(
        'SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1',
        ['global']
      );
      if (rows && rows.length > 0 && rows[0].setting_value) {
        const parsed = JSON.parse(rows[0].setting_value);
        const merged = mergeSettingsWithDefaults(parsed);
        return merged;
      } else {
        // Seed DB once from disk settings
        await conn.query(
          'INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
          ['global', JSON.stringify(diskSettings)]
        );
      }
    } finally {
      conn.release();
    }
  } catch (_) {}
  return diskSettings;
}

async function saveSettingsToDb(settingsObj: any): Promise<boolean> {
  try {
    const activePool = createOrGetPool();
    if (!activePool) return false;
    const conn = await activePool.getConnection();
    try {
      await ensureAppSettingsTable(conn);
      await conn.query(
        'INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
        ['global', JSON.stringify(settingsObj)]
      );
      return true;
    } finally {
      conn.release();
    }
  } catch (_) {
    return false;
  }
}

app.get('/api/settings', async (_req, res) => {
  const settings = await readSettingsFromDbOrDisk();
  return res.json({ success: true, settings });
});

app.post('/api/settings', async (req, res) => {
  const userRole = (req.headers['x-user-role'] || req.headers['user-role'] || '').toString().trim();
  const isUpdatingRoles = req.body && req.body.rolePermissions !== undefined && req.body.appName === undefined && req.body.whatsappSettings === undefined;
  const isUpdatingWhatsapp = req.body && req.body.whatsappSettings !== undefined && req.body.appName === undefined && req.body.rolePermissions === undefined;
  const targetModule = isUpdatingRoles
    ? 'settings-role'
    : isUpdatingWhatsapp
    ? 'settings-whatsapp'
    : 'settings-app';

  if (userRole && !checkServerPermission(userRole, targetModule, 'edit')) {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: `Akses ditolak: Peran '${userRole}' tidak memiliki izin memperbarui '${targetModule}'.`,
    });
  }

  try {
    const existing = await readSettingsFromDbOrDisk();
    const newSettings = mergeSettingsWithDefaults({
      ...existing,
      ...req.body,
      whatsappSettings: {
        ...DEFAULT_WHATSAPP_SETTINGS,
        ...(existing.whatsappSettings || {}),
        ...(req.body?.whatsappSettings || {}),
      },
    });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(newSettings, null, 2), 'utf-8');
    await saveSettingsToDb(newSettings);
    if (newSettings.whatsappSettings) {
      await syncWhatsAppSenderToDb(newSettings.whatsappSettings);
    }
    return res.json({ success: true, message: 'Pengaturan aplikasi berhasil disimpan', settings: newSettings });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ====================================================================
// 9.2. WHATSAPP GATEWAY, DB TABLES & FONNTE WEBHOOK INTEGRATION
// ====================================================================
const WHATSAPP_LOGS_FILE = path.resolve(process.cwd(), 'whatsapp_logs.json');
let whatsappTablesEnsured = false;

interface WhatsAppLogItem {
  id: string;
  timestamp: string;
  direction: 'outbound' | 'inbound' | 'status';
  provider: 'fonnte' | 'webhook';
  senderNumber?: string;
  targetOrSender: string;
  senderName?: string;
  idAnggota?: string;
  category?: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'received' | 'replied';
  message: string;
  fonnteId?: string;
  batchId?: string;
  rawPayload?: any;
}

function readWhatsAppLogs(): WhatsAppLogItem[] {
  try {
    if (fs.existsSync(WHATSAPP_LOGS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(WHATSAPP_LOGS_FILE, 'utf-8'));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) {}
  return [];
}

function writeWhatsAppLogs(logs: WhatsAppLogItem[]): void {
  try {
    fs.writeFileSync(WHATSAPP_LOGS_FILE, JSON.stringify(logs.slice(0, 300), null, 2), 'utf-8');
  } catch (err) {
    console.warn('[WhatsApp Logs] Gagal menulis log ke disk:', err);
  }
}

async function ensureWhatsAppTablesLazy(): Promise<boolean> {
  if (!pool) return false;
  if (whatsappTablesEnsured) return true;
  let conn: any = null;
  try {
    conn = await pool.getConnection();
    await ensureWhatsAppTables(conn);
    whatsappTablesEnsured = true;
    return true;
  } catch {
    return false;
  } finally {
    if (conn) conn.release();
  }
}

async function syncWhatsAppSenderToDb(waCfg: typeof DEFAULT_WHATSAPP_SETTINGS): Promise<boolean> {
  const ready = await ensureWhatsAppTablesLazy();
  if (!ready || !pool) return false;
  let conn: any = null;
  try {
    conn = await pool.getConnection();
    const [existingRows]: [any[], any] = await conn.query(
      'SELECT id_sender FROM whatsapp_senders ORDER BY is_default DESC, id_sender ASC LIMIT 1'
    );
    if (existingRows.length > 0) {
      await conn.query(
        `UPDATE whatsapp_senders
         SET sender_number = ?, fonnte_token = ?, webhook_url = ?, webhook_secret = ?,
             country_code = ?, is_enabled = ?, auto_reply_enabled = ?, is_default = 1
         WHERE id_sender = ?`,
        [
          waCfg.senderNumber || '',
          waCfg.fonnteToken || '',
          waCfg.webhookUrl || '',
          waCfg.webhookSecret || '',
          waCfg.countryCode || '62',
          waCfg.enabled ? 1 : 0,
          waCfg.autoReplyEnabled !== false ? 1 : 0,
          existingRows[0].id_sender,
        ]
      );
    } else {
      await conn.query(
        `INSERT INTO whatsapp_senders
         (sender_label, sender_number, provider, fonnte_token, webhook_url, webhook_secret, country_code, is_enabled, auto_reply_enabled, is_default)
         VALUES ('Gateway Utama PPDI', ?, 'fonnte', ?, ?, ?, ?, ?, ?, 1)`,
        [
          waCfg.senderNumber || '',
          waCfg.fonnteToken || '',
          waCfg.webhookUrl || '',
          waCfg.webhookSecret || '',
          waCfg.countryCode || '62',
          waCfg.enabled ? 1 : 0,
          waCfg.autoReplyEnabled !== false ? 1 : 0,
        ]
      );
    }
    return true;
  } catch (err) {
    console.warn('[WhatsApp DB] Gagal menyinkronkan whatsapp_senders:', err);
    return false;
  } finally {
    if (conn) conn.release();
  }
}

async function insertWhatsAppLogToDb(entry: WhatsAppLogItem): Promise<boolean> {
  const ready = await ensureWhatsAppTablesLazy();
  if (!ready || !pool) return false;
  let conn: any = null;
  try {
    conn = await pool.getConnection();
    await conn.query(
      `INSERT INTO whatsapp_logs
       (id, timestamp, direction, provider, sender_number, target_or_sender, sender_name, id_anggota, category, status, message, fonnte_id, batch_id, raw_payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), raw_payload = VALUES(raw_payload)`,
      [
        entry.id,
        entry.timestamp,
        entry.direction,
        entry.provider,
        entry.senderNumber || null,
        entry.targetOrSender,
        entry.senderName || null,
        entry.idAnggota || null,
        entry.category || null,
        entry.status,
        entry.message,
        entry.fonnteId || null,
        entry.batchId || null,
        entry.rawPayload ? JSON.stringify(entry.rawPayload).slice(0, 65000) : null,
      ]
    );
    return true;
  } catch (err) {
    console.warn('[WhatsApp DB] Gagal menyimpan log ke whatsapp_logs:', err);
    return false;
  } finally {
    if (conn) conn.release();
  }
}

async function readWhatsAppLogsFromDbOrDisk(limit = 200): Promise<{ logs: WhatsAppLogItem[]; source: 'mysql' | 'json_fallback' }> {
  const ready = await ensureWhatsAppTablesLazy();
  if (ready && pool) {
    let conn: any = null;
    try {
      conn = await pool.getConnection();
      const [rows]: [any[], any] = await conn.query(
        `SELECT id, timestamp, direction, provider, sender_number, target_or_sender, sender_name,
                id_anggota, category, status, message, fonnte_id, batch_id, raw_payload
         FROM whatsapp_logs
         ORDER BY created_at DESC, timestamp DESC
         LIMIT ?`,
        [limit]
      );
      if (Array.isArray(rows)) {
        const mapped: WhatsAppLogItem[] = rows.map((r) => {
          let parsedRaw: any = undefined;
          if (r.raw_payload) {
            try {
              parsedRaw = JSON.parse(r.raw_payload);
            } catch {
              parsedRaw = r.raw_payload;
            }
          }
          return {
            id: r.id,
            timestamp: r.timestamp,
            direction: r.direction,
            provider: r.provider,
            senderNumber: r.sender_number || undefined,
            targetOrSender: r.target_or_sender,
            senderName: r.sender_name || undefined,
            idAnggota: r.id_anggota || undefined,
            category: r.category || undefined,
            status: r.status,
            message: r.message,
            fonnteId: r.fonnte_id || undefined,
            batchId: r.batch_id || undefined,
            rawPayload: parsedRaw,
          };
        });
        if (mapped.length > 0) {
          return { logs: mapped, source: 'mysql' };
        }
        // Table exists & empty — check if JSON has historical entries
        const diskLogs = readWhatsAppLogs();
        if (diskLogs.length === 0) {
          return { logs: [], source: 'mysql' };
        }
      }
    } catch (_) {
      // fallback to disk
    } finally {
      if (conn) conn.release();
    }
  }
  return { logs: readWhatsAppLogs().slice(0, limit), source: 'json_fallback' };
}

async function appendWhatsAppLog(entry: Omit<WhatsAppLogItem, 'id' | 'timestamp'>): Promise<WhatsAppLogItem> {
  const newEntry: WhatsAppLogItem = {
    id: `wa_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  const existing = readWhatsAppLogs();
  writeWhatsAppLogs([newEntry, ...existing].slice(0, 300));
  await insertWhatsAppLogToDb(newEntry);
  return newEntry;
}

function formatWaPhoneServer(phone?: string | null): string {
  if (!phone) return '';
  let clean = String(phone).replace(/\D/g, '');
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1);
  } else if (!clean.startsWith('62') && clean.length > 5) {
    clean = '62' + clean;
  }
  return clean;
}

async function sendFonnteApiMessage(params: {
  target: string;
  message: string;
  token: string;
  countryCode?: string;
  senderNumber?: string;
  recipientName?: string;
  idAnggota?: string;
  category?: string;
  batchId?: string;
}): Promise<{ ok: boolean; status: number; data: any; logEntry: WhatsAppLogItem }> {
  const formattedTarget = formatWaPhoneServer(params.target);
  try {
    const response = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        Authorization: params.token.trim(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target: formattedTarget,
        message: params.message,
        countryCode: params.countryCode || '62',
      }),
    });

    const rawText = await response.text();
    let parsed: any = {};
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = { raw: rawText };
    }

    const isSuccess = response.ok && (parsed.status === true || parsed.status === 'true');
    const fonnteId = Array.isArray(parsed.id) ? String(parsed.id[0] || '') : parsed.id ? String(parsed.id) : undefined;

    const logEntry = await appendWhatsAppLog({
      direction: 'outbound',
      provider: 'fonnte',
      senderNumber: params.senderNumber || undefined,
      targetOrSender: formattedTarget,
      senderName: params.recipientName || undefined,
      idAnggota: params.idAnggota || undefined,
      category: params.category || 'notifikasi',
      status: isSuccess ? 'sent' : 'failed',
      message: params.message.slice(0, 1200),
      fonnteId,
      batchId: params.batchId || undefined,
      rawPayload: parsed,
    });

    return { ok: isSuccess, status: response.status, data: parsed, logEntry };
  } catch (err: any) {
    const logEntry = await appendWhatsAppLog({
      direction: 'outbound',
      provider: 'fonnte',
      senderNumber: params.senderNumber || undefined,
      targetOrSender: formattedTarget,
      senderName: params.recipientName || undefined,
      idAnggota: params.idAnggota || undefined,
      category: params.category || 'notifikasi',
      status: 'failed',
      message: params.message.slice(0, 1200),
      batchId: params.batchId || undefined,
      rawPayload: { error: err?.message || 'Network error' },
    });
    return {
      ok: false,
      status: 502,
      data: { status: false, reason: err?.message || 'Gagal menghubungi server API Fonnte' },
      logEntry,
    };
  }
}

async function lookupMemberForWhatsAppBot(queryRaw: string): Promise<string | null> {
  const q = queryRaw.trim();
  if (!q || !pool) return null;
  try {
    const conn = await pool.getConnection();
    const [rows]: [any[], any] = await conn.query(
      `SELECT a.nama_lengkap, a.nik, k.no_kta, k.status_kta, d.nama_desa, kec.nama_kecamatan, j.nama_jabatan
       FROM anggota a
       LEFT JOIN keanggotaan_ppdi k ON a.id_anggota = k.id_anggota
       LEFT JOIN riwayat_jabatan r ON a.id_anggota = r.id_anggota AND r.status_aktif = 'Aktif'
       LEFT JOIN ref_desa d ON r.id_desa = d.id_desa
       LEFT JOIN ref_kecamatan kec ON d.id_kecamatan = kec.id_kecamatan
       LEFT JOIN ref_jabatan j ON r.id_jabatan = j.id_jabatan
       WHERE a.nik = ? OR k.no_kta = ?
       LIMIT 1`,
      [q, q]
    );
    conn.release();

    if (!rows || rows.length === 0) {
      return `Data anggota dengan NIK/No. KTA *${q}* tidak ditemukan di database PPDI Kab. Bandung.`;
    }
    const m = rows[0];
    return (
      `*HASIL CEK KEABSAHAN E-KTA PPDI KAB. BANDUNG*\n\n` +
      `• Nama: *${m.nama_lengkap || '-'}*\n` +
      `• Jabatan: *${m.nama_jabatan || 'Perangkat Desa'}*\n` +
      `• Wilayah: *Desa ${m.nama_desa || '-'}, Kec. ${m.nama_kecamatan || '-'}*\n` +
      `• No. E-KTA: *${m.no_kta || 'Belum Terbit'}*\n` +
      `• Status KTA: *${(m.status_kta || 'Pending').toUpperCase()}*\n\n` +
      `_Terverifikasi otomatis melalui Webhook PPDI Kab. Bandung._`
    );
  } catch {
    return null;
  }
}

// Check WhatsApp MySQL Tables Status (whatsapp_senders & whatsapp_logs)
app.get('/api/whatsapp/db-status', async (_req, res) => {
  const statusResult = {
    success: true,
    dbConnected: false,
    storageMode: 'json_fallback' as 'mysql' | 'json_fallback',
    tables: {
      whatsapp_senders: { exists: false, count: 0 },
      whatsapp_logs: { exists: false, count: 0 },
    },
    fallbackLogsCount: readWhatsAppLogs().length,
  };

  if (!pool) {
    return res.json(statusResult);
  }

  let conn: any = null;
  try {
    conn = await pool.getConnection();
    statusResult.dbConnected = true;

    const [senderTbl]: [any[], any] = await conn.query(`SHOW TABLES LIKE 'whatsapp_senders'`);
    if (senderTbl.length > 0) {
      statusResult.tables.whatsapp_senders.exists = true;
      const [cnt]: [any[], any] = await conn.query(`SELECT COUNT(*) AS cnt FROM whatsapp_senders`);
      statusResult.tables.whatsapp_senders.count = Number(cnt[0]?.cnt || 0);
    }

    const [logsTbl]: [any[], any] = await conn.query(`SHOW TABLES LIKE 'whatsapp_logs'`);
    if (logsTbl.length > 0) {
      statusResult.tables.whatsapp_logs.exists = true;
      const [cnt]: [any[], any] = await conn.query(`SELECT COUNT(*) AS cnt FROM whatsapp_logs`);
      statusResult.tables.whatsapp_logs.count = Number(cnt[0]?.cnt || 0);
    }

    if (statusResult.tables.whatsapp_senders.exists && statusResult.tables.whatsapp_logs.exists) {
      statusResult.storageMode = 'mysql';
      whatsappTablesEnsured = true;
    }
  } catch (_) {
    // keep fallback status
  } finally {
    if (conn) conn.release();
  }

  return res.json(statusResult);
});

// Explicitly Initialize & Sync WhatsApp Tables (whatsapp_senders & whatsapp_logs) in MySQL
app.post('/api/whatsapp/init-tables', requirePermission('settings-whatsapp', 'edit'), async (_req, res) => {
  try {
    const currentPool = createOrGetPool();
    const conn = await currentPool.getConnection();
    await ensureWhatsAppTables(conn);
    conn.release();
    whatsappTablesEnsured = true;

    const existingSettings = readSettingsFromDisk();
    const waCfg = existingSettings.whatsappSettings || DEFAULT_WHATSAPP_SETTINGS;
    await syncWhatsAppSenderToDb(waCfg);

    // Migrate historical disk logs into whatsapp_logs table
    const diskLogs = readWhatsAppLogs();
    let migratedLogs = 0;
    for (const item of diskLogs) {
      const ok = await insertWhatsAppLogToDb(item);
      if (ok) migratedLogs++;
    }

    return res.json({
      success: true,
      message: `Tabel database MySQL 'whatsapp_senders' dan 'whatsapp_logs' berhasil dibuat/disinkronkan (${migratedLogs} riwayat log tersinkron).`,
      migratedLogs,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err?.message || 'Gagal menginisialisasi tabel WhatsApp di database MySQL.',
    });
  }
});

app.get('/api/whatsapp/settings', async (_req, res) => {
  const settings = readSettingsFromDisk();
  let waCfg = settings.whatsappSettings || DEFAULT_WHATSAPP_SETTINGS;

  // Read from whatsapp_senders if MySQL table exists & has row
  const ready = await ensureWhatsAppTablesLazy();
  if (ready && pool) {
    let conn: any = null;
    try {
      conn = await pool.getConnection();
      const [rows]: [any[], any] = await conn.query(
        'SELECT * FROM whatsapp_senders ORDER BY is_default DESC, id_sender ASC LIMIT 1'
      );
      if (rows.length > 0) {
        const r = rows[0];
        waCfg = {
          enabled: Boolean(r.is_enabled),
          senderNumber: r.sender_number || '',
          fonnteToken: r.fonnte_token || '',
          webhookUrl: r.webhook_url || '',
          webhookSecret: r.webhook_secret || '',
          autoReplyEnabled: r.auto_reply_enabled !== undefined ? Boolean(r.auto_reply_enabled) : true,
          autoNotifyRetirement3Months: Boolean(settings.whatsappSettings?.autoNotifyRetirement3Months),
          countryCode: r.country_code || '62',
        };
      }
    } catch (_) {
    } finally {
      if (conn) conn.release();
    }
  }

  return res.json({
    success: true,
    whatsappSettings: waCfg,
  });
});

app.post('/api/whatsapp/settings', requirePermission('settings-whatsapp', 'edit'), async (req, res) => {
  try {
    const existing = readSettingsFromDisk();
    const incomingWa = req.body?.whatsappSettings || req.body || {};
    const mergedWa = {
      ...DEFAULT_WHATSAPP_SETTINGS,
      ...(existing.whatsappSettings || {}),
      enabled: Boolean(incomingWa.enabled),
      senderNumber: String(incomingWa.senderNumber || '').trim(),
      fonnteToken: String(incomingWa.fonnteToken || '').trim(),
      webhookUrl: String(incomingWa.webhookUrl || '').trim(),
      webhookSecret: String(incomingWa.webhookSecret || '').trim(),
      autoReplyEnabled: incomingWa.autoReplyEnabled !== undefined ? Boolean(incomingWa.autoReplyEnabled) : true,
      autoNotifyRetirement3Months:
        incomingWa.autoNotifyRetirement3Months !== undefined
          ? Boolean(incomingWa.autoNotifyRetirement3Months)
          : Boolean(existing.whatsappSettings?.autoNotifyRetirement3Months),
      countryCode: String(incomingWa.countryCode || '62').trim() || '62',
    };
    const nextSettings = {
      ...existing,
      whatsappSettings: mergedWa,
    };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(nextSettings, null, 2), 'utf-8');
    const dbSynced = await syncWhatsAppSenderToDb(mergedWa);
    return res.json({
      success: true,
      dbSynced,
      message: dbSynced
        ? 'Pengaturan WhatsApp & Webhook Fonnte berhasil disimpan ke database (whatsapp_senders) dan server.'
        : 'Pengaturan WhatsApp & Webhook Fonnte berhasil disimpan ke konfigurasi server.',
      whatsappSettings: mergedWa,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Send WhatsApp Notification via Fonnte Gateway
app.post('/api/whatsapp/send', async (req, res) => {
  const {
    target,
    message,
    recipientName,
    idAnggota,
    category,
    batchId,
    senderNumber,
    token: overrideToken,
    countryCode,
  } = req.body || {};
  const settings = readSettingsFromDisk();
  const waCfg = settings.whatsappSettings || DEFAULT_WHATSAPP_SETTINGS;
  const activeToken = String(overrideToken || waCfg.fonnteToken || '').trim();

  if (!waCfg.enabled && !overrideToken) {
    return res.status(400).json({
      success: false,
      fallbackWaMe: true,
      message: 'Webhook / Gateway Fonnte sedang nonaktif. Gunakan API wa.me standar.',
    });
  }

  if (!activeToken) {
    return res.status(400).json({
      success: false,
      message: 'Token API Fonnte belum diisi pada Menu Pengaturan -> Setting WhatsApp (Fonnte).',
    });
  }

  if (!target || !message) {
    return res.status(400).json({
      success: false,
      message: 'Nomor tujuan (target) dan isi pesan (message) wajib diisi.',
    });
  }

  const result = await sendFonnteApiMessage({
    target: String(target),
    message: String(message),
    token: activeToken,
    countryCode: String(countryCode || waCfg.countryCode || '62'),
    senderNumber: String(senderNumber || waCfg.senderNumber || ''),
    recipientName,
    idAnggota,
    category,
    batchId,
  });

  if (result.ok) {
    return res.json({
      success: true,
      mode: 'fonnte',
      message: `Pesan WhatsApp berhasil dikirim via Fonnte ke ${formatWaPhoneServer(target)}.`,
      data: result.data,
      logEntry: result.logEntry,
    });
  }

  return res.status(400).json({
    success: false,
    mode: 'fonnte',
    message: result.data?.reason || result.data?.detail || 'Fonnte menolak atau gagal mengirim pesan.',
    data: result.data,
    logEntry: result.logEntry,
  });
});

// Bulk Send WhatsApp Notifications via Fonnte Gateway
app.post('/api/whatsapp/send-bulk', requirePermission('anggota', 'view'), async (req, res) => {
  const { items, category, batchId: incomingBatchId, delayMs = 250 } = req.body || {};
  const settings = readSettingsFromDisk();
  const waCfg = settings.whatsappSettings || DEFAULT_WHATSAPP_SETTINGS;
  const activeToken = String(waCfg.fonnteToken || '').trim();

  if (!waCfg.enabled || !activeToken) {
    return res.status(400).json({
      success: false,
      message: 'Gateway Fonnte belum aktif atau Token Fonnte belum dikonfigurasi di Pengaturan -> Setting WhatsApp (Fonnte).',
    });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Daftar penerima pesan massal tidak boleh kosong.',
    });
  }

  const batchId = String(incomingBatchId || `batch_${Date.now()}`);
  const results: Array<{
    idAnggota?: string;
    target: string;
    recipientName?: string;
    success: boolean;
    message: string;
    fonnteId?: string;
  }> = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const cleanTarget = formatWaPhoneServer(item?.target);
    if (!cleanTarget || cleanTarget.length < 8) {
      results.push({
        idAnggota: item?.idAnggota,
        target: String(item?.target || ''),
        recipientName: item?.recipientName,
        success: false,
        message: 'Nomor WhatsApp tidak valid / kosong',
      });
      continue;
    }

    const sendRes = await sendFonnteApiMessage({
      target: cleanTarget,
      message: String(item?.message || ''),
      token: activeToken,
      countryCode: waCfg.countryCode || '62',
      senderNumber: waCfg.senderNumber || '',
      recipientName: item?.recipientName,
      idAnggota: item?.idAnggota,
      category: String(item?.category || category || 'notifikasi-massal'),
      batchId,
    });

    results.push({
      idAnggota: item?.idAnggota,
      target: cleanTarget,
      recipientName: item?.recipientName,
      success: sendRes.ok,
      message: sendRes.ok
        ? 'Terkirim via Fonnte'
        : sendRes.data?.reason || sendRes.data?.detail || 'Gagal mengirim pesan',
      fonnteId: sendRes.logEntry.fonnteId,
    });

    if (i < items.length - 1 && Number(delayMs) > 0) {
      await new Promise((r) => setTimeout(r, Math.min(Number(delayMs), 1500)));
    }
  }

  const sentCount = results.filter((r) => r.success).length;
  const failedCount = results.length - sentCount;

  return res.json({
    success: sentCount > 0,
    batchId,
    total: results.length,
    sentCount,
    failedCount,
    message: `Pengiriman massal selesai: ${sentCount} berhasil, ${failedCount} gagal.`,
    results,
  });
});

// Test Fonnte Device Status and/or Send Test Message
app.post('/api/whatsapp/test', requirePermission('settings-whatsapp', 'edit'), async (req, res) => {
  const settings = readSettingsFromDisk();
  const waCfg = settings.whatsappSettings || DEFAULT_WHATSAPP_SETTINGS;
  const token = String(req.body?.fonnteToken || waCfg.fonnteToken || '').trim();
  const testTarget = String(req.body?.testTarget || '').trim();
  const testMessage = String(
    req.body?.testMessage ||
      `[UJI KONEKSI FONNTE] Halo! Notifikasi Gateway WhatsApp PPDI Kabupaten Bandung aktif & terhubung (${new Date().toLocaleString('id-ID')}).`
  );

  if (!token) {
    return res.status(400).json({
      success: false,
      message: 'Token API Fonnte wajib diisi untuk menguji koneksi device.',
    });
  }

  try {
    // 1. Check device status on Fonnte API
    const deviceRes = await fetch('https://api.fonnte.com/device', {
      method: 'POST',
      headers: {
        Authorization: token,
      },
    });
    const deviceText = await deviceRes.text();
    let deviceJson: any = {};
    try {
      deviceJson = JSON.parse(deviceText);
    } catch {
      deviceJson = { raw: deviceText };
    }

    if (!testTarget) {
      const ok = deviceRes.ok && (deviceJson.status === true || deviceJson.device_status === 'connect');
      return res.status(ok ? 200 : 400).json({
        success: ok,
        device: deviceJson,
        message: ok
          ? `Device Fonnte terhubung (${deviceJson.device || deviceJson.name || 'Connected'}).`
          : deviceJson.reason || 'Token tidak valid atau device Fonnte belum tersambung.',
      });
    }

    // 2. If testTarget is provided, send real test message via Fonnte
    const sendResult = await sendFonnteApiMessage({
      target: testTarget,
      message: testMessage,
      token,
      countryCode: waCfg.countryCode || '62',
      senderNumber: waCfg.senderNumber || '',
      recipientName: 'Uji Coba Admin',
      category: 'test_gateway',
    });

    return res.status(sendResult.ok ? 200 : 400).json({
      success: sendResult.ok,
      device: deviceJson,
      data: sendResult.data,
      logEntry: sendResult.logEntry,
      message: sendResult.ok
        ? `Pesan uji coba berhasil dikirim via Fonnte ke ${formatWaPhoneServer(testTarget)}.`
        : sendResult.data?.reason || 'Gagal mengirim pesan uji coba via Fonnte.',
    });
  } catch (err: any) {
    return res.status(502).json({
      success: false,
      message: err?.message || 'Gagal menghubungi API Fonnte (api.fonnte.com).',
    });
  }
});

// Complete Fonnte Webhook Receiver (GET verification + POST incoming/status callbacks)
app.get('/api/webhook/fonnte', (_req, res) => {
  const settings = readSettingsFromDisk();
  const waCfg = settings.whatsappSettings || DEFAULT_WHATSAPP_SETTINGS;
  return res.json({
    success: true,
    status: 'ready',
    service: 'PPDI Kab. Bandung - Fonnte Webhook Receiver',
    webhookEnabled: Boolean(waCfg.enabled),
    autoReplyEnabled: Boolean(waCfg.autoReplyEnabled),
    senderNumber: waCfg.senderNumber || '',
    timestamp: new Date().toISOString(),
  });
});

async function handleFonnteWebhookPayload(
  payload: Record<string, any>,
  headers: Record<string, any>,
  query: Record<string, any>
): Promise<{ status: number; body: any }> {
  const settings = readSettingsFromDisk();
  const waCfg = settings.whatsappSettings || DEFAULT_WHATSAPP_SETTINGS;

  // Optional secret validation if webhookSecret is configured
  const configuredSecret = (waCfg.webhookSecret || '').trim();
  if (configuredSecret) {
    const providedSecret = String(
      query.secret ||
        headers['x-webhook-secret'] ||
        headers['x-fonnte-secret'] ||
        payload.secret ||
        ''
    ).trim();
    if (providedSecret !== configuredSecret) {
      return {
        status: 401,
        body: { status: false, success: false, message: 'Webhook secret tidak cocok' },
      };
    }
  }

  // Extract common Fonnte webhook fields (supports incoming chat & delivery status callbacks)
  const sender = String(payload.sender || payload.pengirim || payload.target || payload.from || '').trim();
  const senderName = String(payload.name || payload.pushname || '').trim();
  const messageText = String(payload.message || payload.text || '').trim();
  const fonnteId = payload.id ? String(payload.id) : undefined;
  const stateVal = String(payload.state || payload.status || payload.stateid || '').trim().toLowerCase();
  const mediaUrl = payload.url ? String(payload.url) : '';
  const device = String(payload.device || waCfg.senderNumber || '').trim();
  const isGroup = Boolean(payload.isgroup === true || payload.isgroup === 'true' || payload.isgroup === 1);

  // Case A: Delivery / Message Status Callback from Fonnte (no incoming message body, has id/state/status)
  if (!messageText && (stateVal || payload.stateid !== undefined) && (fonnteId || sender)) {
    const mappedStatus: WhatsAppLogItem['status'] =
      stateVal.includes('read')
        ? 'read'
        : stateVal.includes('deliver') || stateVal === '2'
        ? 'delivered'
        : stateVal.includes('fail') || stateVal.includes('invalid') || stateVal === '0'
        ? 'failed'
        : 'sent';

    const logs = readWhatsAppLogs();
    let updatedExisting = false;
    const nextLogs = logs.map((item) => {
      if (fonnteId && item.fonnteId && item.fonnteId === fonnteId && item.direction === 'outbound') {
        updatedExisting = true;
        return { ...item, status: mappedStatus };
      }
      return item;
    });
    if (updatedExisting) {
      writeWhatsAppLogs(nextLogs);
    }

    if (fonnteId && pool && (await ensureWhatsAppTablesLazy())) {
      try {
        const conn = await pool.getConnection();
        const [updRes]: [any, any] = await conn.query(
          `UPDATE whatsapp_logs SET status = ? WHERE fonnte_id = ? AND direction = 'outbound'`,
          [mappedStatus, fonnteId]
        );
        if (updRes?.affectedRows > 0) updatedExisting = true;
        conn.release();
      } catch (_) {}
    }

    const statusLog = await appendWhatsAppLog({
      direction: 'status',
      provider: 'webhook',
      senderNumber: device || undefined,
      targetOrSender: sender || device || 'fonnte-status',
      senderName: senderName || undefined,
      category: 'delivery_status',
      status: mappedStatus,
      message: `Status pengiriman Fonnte: ${stateVal || mappedStatus}${payload.note ? ` (${payload.note})` : ''}`,
      fonnteId,
      rawPayload: payload,
    });

    return {
      status: 200,
      body: { status: true, success: true, type: 'status_callback', updatedExisting, logEntry: statusLog },
    };
  }

  // Case B: Incoming WhatsApp Message from Fonnte
  const inboundSummary = messageText
    ? messageText
    : mediaUrl
    ? `[Lampiran Media] ${payload.filename || mediaUrl}`
    : '[Webhook Event Diterima]';

  const inboundLog = await appendWhatsAppLog({
    direction: 'inbound',
    provider: 'webhook',
    senderNumber: device || undefined,
    targetOrSender: sender || device || 'unknown',
    senderName: senderName || undefined,
    category: isGroup ? 'group_message' : 'incoming_message',
    status: 'received',
    message: inboundSummary.slice(0, 1200),
    fonnteId,
    rawPayload: payload,
  });

  // Optional Auto-Reply Bot for private messages when webhook & autoReplyEnabled are active
  let autoReplyText: string | null = null;
  if (waCfg.enabled && waCfg.autoReplyEnabled && sender && messageText && !isGroup) {
    const upper = messageText.trim().toUpperCase();
    if (upper === 'INFO' || upper === 'MENU' || upper === 'HELP' || upper === 'PPDI') {
      autoReplyText =
        `*PORTAL WHATSAPP RESMI PPDI KABUPATEN BANDUNG*\n\n` +
        `Ketik perintah berikut untuk layanan otomatis:\n` +
        `• *CEK <NIK / No. KTA>* — Cek status keabsahan E-KTA anggota\n` +
        `• *INFO* — Menampilkan menu layanan ini\n\n` +
        `_Terima kasih telah menghubungi Pengurus Daerah PPDI Kab. Bandung._`;
    } else if (upper.startsWith('CEK ') || upper.startsWith('KTA ')) {
      const keyword = messageText.trim().slice(4).trim();
      if (keyword) {
        autoReplyText = await lookupMemberForWhatsAppBot(keyword);
      }
    }

    if (autoReplyText && waCfg.fonnteToken?.trim()) {
      await sendFonnteApiMessage({
        target: sender,
        message: autoReplyText,
        token: waCfg.fonnteToken,
        countryCode: waCfg.countryCode || '62',
        senderNumber: waCfg.senderNumber || '',
        recipientName: senderName || sender,
        category: 'auto_reply',
      });
    }
  }

  return {
    status: 200,
    body: {
      status: true,
      success: true,
      type: 'incoming_message',
      logEntry: inboundLog,
      autoReplied: Boolean(autoReplyText),
      reply: autoReplyText || undefined,
    },
  };
}

app.post('/api/webhook/fonnte', async (req, res) => {
  try {
    const result = await handleFonnteWebhookPayload(
      (req.body || {}) as Record<string, any>,
      req.headers as Record<string, any>,
      req.query as Record<string, any>
    );
    return res.status(result.status).json(result.body);
  } catch (err: any) {
    console.error('[Fonnte Webhook Error]:', err);
    return res.status(200).json({
      status: true,
      success: false,
      error: err?.message || 'Internal webhook error',
    });
  }
});

// Local Webhook Simulation Endpoint (for Testing from Settings Page)
app.post('/api/whatsapp/webhook-test', requirePermission('settings-whatsapp', 'edit'), async (req, res) => {
  const settings = readSettingsFromDisk();
  const waCfg = settings.whatsappSettings || DEFAULT_WHATSAPP_SETTINGS;
  const mockPayload = {
    device: waCfg.senderNumber || '6281200000000',
    sender: req.body?.sender || '6281234567890',
    name: req.body?.name || 'Simulasi Perangkat Desa',
    message: req.body?.message || 'INFO',
    timestamp: Math.floor(Date.now() / 1000),
    simulated: true,
  };
  const result = await handleFonnteWebhookPayload(
    mockPayload,
    req.headers as Record<string, any>,
    { secret: waCfg.webhookSecret || '' }
  );
  return res.status(result.status).json({
    ...result.body,
    message: 'Simulasi payload webhook Fonnte berhasil diproses dan dicatat di Log Webhook.',
  });
});

app.get('/api/whatsapp/logs', async (_req, res) => {
  const { logs, source } = await readWhatsAppLogsFromDbOrDisk(200);
  return res.json({
    success: true,
    source,
    logs,
  });
});

app.delete('/api/whatsapp/logs', requirePermission('settings-whatsapp', 'delete'), async (_req, res) => {
  writeWhatsAppLogs([]);
  if (pool && (await ensureWhatsAppTablesLazy())) {
    try {
      const conn = await pool.getConnection();
      await conn.query('TRUNCATE TABLE whatsapp_logs');
      conn.release();
    } catch (_) {}
  }
  return res.json({
    success: true,
    message: 'Seluruh riwayat log WhatsApp & Webhook Fonnte berhasil dibersihkan.',
  });
});

// ====================================================================
// 9.4. PUSTAKA REGULASI (PERUNDANG-UNDANGAN PDF & AKSES PUBLIK)
// ====================================================================
const REGULASI_FILE = path.resolve(process.cwd(), 'regulasi_library.json');
let regulasiTableEnsured = false;

interface RegulasiRecord {
  id_regulasi: string;
  judul: string;
  nomor_regulasi: string;
  tahun: number;
  kategori: string;
  tentang: string;
  tanggal_penetapan?: string;
  file_url: string;
  file_name: string;
  file_size: number;
  is_public: boolean;
  download_count: number;
  uploaded_by?: string;
  created_at: string;
  updated_at?: string;
}

async function ensureRegulasiTable(conn: mysql.PoolConnection) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS \`pustaka_regulasi\` (
      \`id_regulasi\` VARCHAR(64) NOT NULL,
      \`judul\` VARCHAR(255) NOT NULL,
      \`nomor_regulasi\` VARCHAR(120) NOT NULL,
      \`tahun\` INT NOT NULL,
      \`kategori\` VARCHAR(80) NOT NULL DEFAULT 'Lainnya',
      \`tentang\` TEXT NULL,
      \`tanggal_penetapan\` VARCHAR(20) NULL,
      \`file_url\` VARCHAR(255) NOT NULL,
      \`file_name\` VARCHAR(255) NOT NULL,
      \`file_size\` INT NOT NULL DEFAULT 0,
      \`is_public\` TINYINT(1) NOT NULL DEFAULT 1,
      \`download_count\` INT NOT NULL DEFAULT 0,
      \`uploaded_by\` VARCHAR(120) NULL,
      \`created_at\` VARCHAR(40) NOT NULL,
      \`updated_at\` VARCHAR(40) NULL,
      PRIMARY KEY (\`id_regulasi\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function ensureRegulasiTableLazy(): Promise<boolean> {
  if (regulasiTableEnsured) return true;
  if (!pool) return false;
  try {
    const conn = await pool.getConnection();
    await ensureRegulasiTable(conn);
    conn.release();
    regulasiTableEnsured = true;
    return true;
  } catch (_) {
    return false;
  }
}

function readRegulasiDisk(): RegulasiRecord[] {
  try {
    if (fs.existsSync(REGULASI_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(REGULASI_FILE, 'utf-8'));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) {}
  return [];
}

function writeRegulasiDisk(items: RegulasiRecord[]) {
  try {
    fs.writeFileSync(REGULASI_FILE, JSON.stringify(items, null, 2), 'utf-8');
  } catch (_) {}
}

async function readRegulasiList(): Promise<{ items: RegulasiRecord[]; source: 'mysql' | 'disk' }> {
  const diskItems = readRegulasiDisk();
  try {
    if (pool && (await ensureRegulasiTableLazy())) {
      const conn = await pool.getConnection();
      try {
        const [rows]: [any[], any] = await conn.query(
          'SELECT * FROM pustaka_regulasi ORDER BY tahun DESC, created_at DESC'
        );
        if (rows.length > 0) {
          const normalized: RegulasiRecord[] = rows.map((r) => ({
            id_regulasi: String(r.id_regulasi),
            judul: String(r.judul || ''),
            nomor_regulasi: String(r.nomor_regulasi || ''),
            tahun: Number(r.tahun) || new Date().getFullYear(),
            kategori: String(r.kategori || 'Lainnya'),
            tentang: String(r.tentang || ''),
            tanggal_penetapan: r.tanggal_penetapan || undefined,
            file_url: String(r.file_url || ''),
            file_name: String(r.file_name || ''),
            file_size: Number(r.file_size) || 0,
            is_public: Boolean(r.is_public),
            download_count: Number(r.download_count) || 0,
            uploaded_by: r.uploaded_by || undefined,
            created_at: String(r.created_at || new Date().toISOString()),
            updated_at: r.updated_at || undefined,
          }));
          writeRegulasiDisk(normalized);
          return { items: normalized, source: 'mysql' };
        }
        // Seed MySQL from disk if disk has data
        if (diskItems.length > 0) {
          for (const item of diskItems) {
            await conn.query(
              `INSERT IGNORE INTO pustaka_regulasi
               (id_regulasi, judul, nomor_regulasi, tahun, kategori, tentang, tanggal_penetapan, file_url, file_name, file_size, is_public, download_count, uploaded_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                item.id_regulasi,
                item.judul,
                item.nomor_regulasi,
                item.tahun,
                item.kategori,
                item.tentang,
                item.tanggal_penetapan || null,
                item.file_url,
                item.file_name,
                item.file_size,
                item.is_public ? 1 : 0,
                item.download_count || 0,
                item.uploaded_by || null,
                item.created_at,
                item.updated_at || null,
              ]
            );
          }
          return { items: diskItems, source: 'mysql' };
        }
      } finally {
        conn.release();
      }
    }
  } catch (_) {}
  const sortedDisk = [...diskItems].sort((a, b) => {
    if ((b.tahun || 0) !== (a.tahun || 0)) return (b.tahun || 0) - (a.tahun || 0);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  return { items: sortedDisk, source: 'disk' };
}

function removeRegulasiFileIfUnused(fileUrl: string, remainingItems: RegulasiRecord[]) {
  if (!fileUrl || !fileUrl.startsWith('/uploads/regulasi/')) return;
  const stillUsed = remainingItems.some((item) => item.file_url === fileUrl);
  if (stillUsed) return;
  const safeName = path.basename(fileUrl);
  const fullPath = path.join(REGULASI_DIR, safeName);
  try {
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (_) {}
}

app.get('/api/regulasi', async (req, res) => {
  try {
    const publicOnly = req.query.publicOnly === 'true' || req.query.publicOnly === '1';
    const { items, source } = await readRegulasiList();
    const filtered = publicOnly ? items.filter((item) => item.is_public !== false) : items;
    return res.json({
      success: true,
      source,
      items: filtered,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message, items: [] });
  }
});

app.post('/api/regulasi', requirePermission('regulasi', 'add'), async (req, res) => {
  try {
    const {
      judul,
      nomor_regulasi,
      tahun,
      kategori,
      tentang,
      tanggal_penetapan,
      fileName,
      fileData,
      is_public,
      uploaded_by,
    } = req.body || {};

    if (!judul || !String(judul).trim()) {
      return res.status(400).json({ success: false, message: 'Judul regulasi wajib diisi.' });
    }
    if (!nomor_regulasi || !String(nomor_regulasi).trim()) {
      return res.status(400).json({ success: false, message: 'Nomor regulasi wajib diisi.' });
    }
    if (!fileData || !String(fileData).trim()) {
      return res.status(400).json({ success: false, message: 'File PDF regulasi wajib diunggah.' });
    }

    const originalName = (fileName || 'regulasi.pdf').trim();
    const isPdfBase64 =
      String(fileData).startsWith('data:application/pdf') ||
      originalName.toLowerCase().endsWith('.pdf');
    if (!isPdfBase64) {
      return res.status(400).json({
        success: false,
        message: 'Hanya file berformat PDF (.pdf) yang diperbolehkan pada Pustaka Regulasi.',
      });
    }

    const saved = saveBase64UploadToDisk('regulasi', String(fileData), originalName);
    const nowIso = new Date().toISOString();
    const newItem: RegulasiRecord = {
      id_regulasi: `reg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      judul: String(judul).trim(),
      nomor_regulasi: String(nomor_regulasi).trim(),
      tahun: Number(tahun) || new Date().getFullYear(),
      kategori: String(kategori || 'Lainnya').trim(),
      tentang: String(tentang || '').trim(),
      tanggal_penetapan: tanggal_penetapan ? String(tanggal_penetapan).trim() : undefined,
      file_url: saved.url,
      file_name: originalName,
      file_size: saved.sizeBytes,
      is_public: is_public !== undefined ? Boolean(is_public) : true,
      download_count: 0,
      uploaded_by: uploaded_by ? String(uploaded_by).trim() : 'Admin PPDI',
      created_at: nowIso,
      updated_at: nowIso,
    };

    const { items } = await readRegulasiList();
    const updatedList = [newItem, ...items];
    writeRegulasiDisk(updatedList);

    if (pool && (await ensureRegulasiTableLazy())) {
      try {
        const conn = await pool.getConnection();
        await conn.query(
          `INSERT INTO pustaka_regulasi
           (id_regulasi, judul, nomor_regulasi, tahun, kategori, tentang, tanggal_penetapan, file_url, file_name, file_size, is_public, download_count, uploaded_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newItem.id_regulasi,
            newItem.judul,
            newItem.nomor_regulasi,
            newItem.tahun,
            newItem.kategori,
            newItem.tentang,
            newItem.tanggal_penetapan || null,
            newItem.file_url,
            newItem.file_name,
            newItem.file_size,
            newItem.is_public ? 1 : 0,
            0,
            newItem.uploaded_by || null,
            newItem.created_at,
            newItem.updated_at || null,
          ]
        );
        conn.release();
      } catch (dbErr) {
        console.warn('[Pustaka Regulasi] Gagal insert ke MySQL, tersimpan di JSON disk:', dbErr);
      }
    }

    return res.json({
      success: true,
      message: 'Dokumen regulasi PDF berhasil diunggah dan diterbitkan.',
      item: newItem,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message || 'Gagal mengunggah regulasi.' });
  }
});

app.put('/api/regulasi/:id', requirePermission('regulasi', 'edit'), async (req, res) => {
  try {
    const id = String(req.params.id);
    const { items } = await readRegulasiList();
    const idx = items.findIndex((item) => item.id_regulasi === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Dokumen regulasi tidak ditemukan.' });
    }

    const existing = items[idx];
    const {
      judul,
      nomor_regulasi,
      tahun,
      kategori,
      tentang,
      tanggal_penetapan,
      is_public,
      fileName,
      fileData,
    } = req.body || {};

    let nextFileUrl = existing.file_url;
    let nextFileName = existing.file_name;
    let nextFileSize = existing.file_size;
    const oldFileUrl = existing.file_url;

    if (fileData && String(fileData).trim()) {
      const origName = (fileName || existing.file_name || 'regulasi.pdf').trim();
      const isPdfBase64 =
        String(fileData).startsWith('data:application/pdf') || origName.toLowerCase().endsWith('.pdf');
      if (!isPdfBase64) {
        return res.status(400).json({
          success: false,
          message: 'Hanya file berformat PDF (.pdf) yang diperbolehkan.',
        });
      }
      const saved = saveBase64UploadToDisk('regulasi', String(fileData), origName);
      nextFileUrl = saved.url;
      nextFileName = origName;
      nextFileSize = saved.sizeBytes;
    }

    const updatedItem: RegulasiRecord = {
      ...existing,
      judul: judul !== undefined ? String(judul).trim() : existing.judul,
      nomor_regulasi: nomor_regulasi !== undefined ? String(nomor_regulasi).trim() : existing.nomor_regulasi,
      tahun: tahun !== undefined ? Number(tahun) || existing.tahun : existing.tahun,
      kategori: kategori !== undefined ? String(kategori).trim() : existing.kategori,
      tentang: tentang !== undefined ? String(tentang).trim() : existing.tentang,
      tanggal_penetapan:
        tanggal_penetapan !== undefined
          ? tanggal_penetapan
            ? String(tanggal_penetapan).trim()
            : undefined
          : existing.tanggal_penetapan,
      is_public: is_public !== undefined ? Boolean(is_public) : existing.is_public,
      file_url: nextFileUrl,
      file_name: nextFileName,
      file_size: nextFileSize,
      updated_at: new Date().toISOString(),
    };

    const nextItems = [...items];
    nextItems[idx] = updatedItem;
    writeRegulasiDisk(nextItems);

    if (oldFileUrl !== nextFileUrl) {
      removeRegulasiFileIfUnused(oldFileUrl, nextItems);
    }

    if (pool && (await ensureRegulasiTableLazy())) {
      try {
        const conn = await pool.getConnection();
        await conn.query(
          `UPDATE pustaka_regulasi
           SET judul = ?, nomor_regulasi = ?, tahun = ?, kategori = ?, tentang = ?, tanggal_penetapan = ?,
               file_url = ?, file_name = ?, file_size = ?, is_public = ?, updated_at = ?
           WHERE id_regulasi = ?`,
          [
            updatedItem.judul,
            updatedItem.nomor_regulasi,
            updatedItem.tahun,
            updatedItem.kategori,
            updatedItem.tentang,
            updatedItem.tanggal_penetapan || null,
            updatedItem.file_url,
            updatedItem.file_name,
            updatedItem.file_size,
            updatedItem.is_public ? 1 : 0,
            updatedItem.updated_at || null,
            id,
          ]
        );
        conn.release();
      } catch (dbErr) {
        console.warn('[Pustaka Regulasi] Gagal update MySQL:', dbErr);
      }
    }

    return res.json({
      success: true,
      message: 'Data regulasi berhasil diperbarui.',
      item: updatedItem,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/regulasi/:id', requirePermission('regulasi', 'delete'), async (req, res) => {
  try {
    const id = String(req.params.id);
    const { items } = await readRegulasiList();
    const target = items.find((item) => item.id_regulasi === id);
    if (!target) {
      return res.status(404).json({ success: false, message: 'Dokumen regulasi tidak ditemukan.' });
    }

    const remaining = items.filter((item) => item.id_regulasi !== id);
    writeRegulasiDisk(remaining);
    removeRegulasiFileIfUnused(target.file_url, remaining);

    if (pool && (await ensureRegulasiTableLazy())) {
      try {
        const conn = await pool.getConnection();
        await conn.query('DELETE FROM pustaka_regulasi WHERE id_regulasi = ?', [id]);
        conn.release();
      } catch (dbErr) {
        console.warn('[Pustaka Regulasi] Gagal delete MySQL:', dbErr);
      }
    }

    return res.json({
      success: true,
      message: `Regulasi "${target.nomor_regulasi}" berhasil dihapus.`,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/regulasi/:id/download', async (req, res) => {
  try {
    const id = String(req.params.id);
    const { items } = await readRegulasiList();
    const idx = items.findIndex((item) => item.id_regulasi === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Dokumen tidak ditemukan.' });
    }
    const nextCount = (items[idx].download_count || 0) + 1;
    items[idx] = { ...items[idx], download_count: nextCount };
    writeRegulasiDisk(items);

    if (pool && (await ensureRegulasiTableLazy())) {
      try {
        const conn = await pool.getConnection();
        await conn.query('UPDATE pustaka_regulasi SET download_count = download_count + 1 WHERE id_regulasi = ?', [id]);
        conn.release();
      } catch (_) {}
    }

    return res.json({ success: true, download_count: nextCount });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ====================================================================
// 9.4B. KALENDER ACARA PPDI (AGENDA, RAPAT, BATAS BERKAS & FEED .ICS)
// ====================================================================
const KALENDER_FILE = path.resolve(process.cwd(), 'calendar_events.json');
let kalenderTableEnsured = false;

interface CalendarEventRecord {
  id_acara: string;
  judul: string;
  kategori: string;
  tanggal_mulai: string;
  waktu_mulai?: string;
  tanggal_selesai?: string;
  waktu_selesai?: string;
  is_all_day: boolean;
  lokasi?: string;
  deskripsi?: string;
  pengingat_menit: number;
  status: string;
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

function buildStarterCalendarEvents(): CalendarEventRecord[] {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const nextMonthDate = new Date(y, now.getMonth() + 1, 1);
  const ny = nextMonthDate.getFullYear();
  const nm = String(nextMonthDate.getMonth() + 1).padStart(2, '0');
  const lastDayOfMonth = new Date(y, now.getMonth() + 1, 0).getDate();
  const curDay = now.getDate();
  const meetingDay = String(Math.min(Math.max(curDay + 3, 10), lastDayOfMonth)).padStart(2, '0');
  const deadlineDay = String(lastDayOfMonth).padStart(2, '0');
  const nowIso = now.toISOString();

  return [
    {
      id_acara: 'evt_seed_rapat_rutin',
      judul: 'Rapat Koordinasi Rutin Pengurus PPDI Kab. Bandung',
      kategori: 'Rapat Rutin',
      tanggal_mulai: `${y}-${m}-${meetingDay}`,
      waktu_mulai: '09:00',
      tanggal_selesai: `${y}-${m}-${meetingDay}`,
      waktu_selesai: '12:00',
      is_all_day: false,
      lokasi: 'Sekretariat PPDI Kabupaten Bandung, Soreang',
      deskripsi: 'Evaluasi pendataan anggota, progres E-KTA digital, dan sinkronisasi data purna tugas kecamatan.',
      pengingat_menit: 1440,
      status: 'Terjadwal',
      created_by: 'SUPERADMIN KABUPATEN',
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      id_acara: 'evt_seed_batas_berkas',
      judul: 'Batas Akhir Pengumpulan Berkas SK Pengangkatan & Pemutakhiran NIPD',
      kategori: 'Batas Waktu Berkas',
      tanggal_mulai: `${y}-${m}-${deadlineDay}`,
      waktu_mulai: '16:00',
      tanggal_selesai: `${y}-${m}-${deadlineDay}`,
      waktu_selesai: '16:00',
      is_all_day: true,
      lokasi: 'Portal e-Arsip SK PPDI Kab. Bandung',
      deskripsi: 'Pengurus Desa & Kecamatan diharapkan mengunggah pindai PDF SK terbaru serta kelengkapan foto anggota.',
      pengingat_menit: 2880,
      status: 'Terjadwal',
      created_by: 'SUPERADMIN KABUPATEN',
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      id_acara: 'evt_seed_kegiatan_ppdi',
      judul: 'Sosialisasi Regulasi Desa & Penyerahan KTA Digital Wilayah',
      kategori: 'Kegiatan PPDI',
      tanggal_mulai: `${ny}-${nm}-05`,
      waktu_mulai: '08:30',
      tanggal_selesai: `${ny}-${nm}-05`,
      waktu_selesai: '13:30',
      is_all_day: false,
      lokasi: 'Gedung KORPRI Kabupaten Bandung',
      deskripsi: 'Bimbingan teknis regulasi pemerintahan desa terbaru dan verifikasi kolektif KTA perangkat desa.',
      pengingat_menit: 1440,
      status: 'Terjadwal',
      created_by: 'SUPERADMIN KABUPATEN',
      created_at: nowIso,
      updated_at: nowIso,
    },
  ];
}

async function ensureKalenderTable(conn: mysql.PoolConnection) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS \`kalender_acara\` (
      \`id_acara\` VARCHAR(64) NOT NULL,
      \`judul\` VARCHAR(255) NOT NULL,
      \`kategori\` VARCHAR(80) NOT NULL DEFAULT 'Kegiatan PPDI',
      \`tanggal_mulai\` VARCHAR(20) NOT NULL,
      \`waktu_mulai\` VARCHAR(10) NULL,
      \`tanggal_selesai\` VARCHAR(20) NULL,
      \`waktu_selesai\` VARCHAR(10) NULL,
      \`is_all_day\` TINYINT(1) NOT NULL DEFAULT 0,
      \`lokasi\` VARCHAR(255) NULL,
      \`deskripsi\` TEXT NULL,
      \`pengingat_menit\` INT NOT NULL DEFAULT 1440,
      \`status\` VARCHAR(40) NOT NULL DEFAULT 'Terjadwal',
      \`created_by\` VARCHAR(120) NULL,
      \`created_at\` VARCHAR(40) NOT NULL,
      \`updated_at\` VARCHAR(40) NULL,
      PRIMARY KEY (\`id_acara\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function ensureKalenderTableLazy(): Promise<boolean> {
  if (kalenderTableEnsured) return true;
  if (!pool) return false;
  try {
    const conn = await pool.getConnection();
    await ensureKalenderTable(conn);
    conn.release();
    kalenderTableEnsured = true;
    return true;
  } catch (_) {
    return false;
  }
}

function readKalenderDisk(): CalendarEventRecord[] {
  try {
    if (fs.existsSync(KALENDER_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(KALENDER_FILE, 'utf-8'));
      if (Array.isArray(parsed)) return parsed;
    } else {
      const starters = buildStarterCalendarEvents();
      fs.writeFileSync(KALENDER_FILE, JSON.stringify(starters, null, 2), 'utf-8');
      return starters;
    }
  } catch (_) {}
  return [];
}

function writeKalenderDisk(items: CalendarEventRecord[]) {
  try {
    fs.writeFileSync(KALENDER_FILE, JSON.stringify(items, null, 2), 'utf-8');
  } catch (_) {}
}

function sortKalenderItems(items: CalendarEventRecord[]): CalendarEventRecord[] {
  return [...items].sort((a, b) => {
    const da = `${a.tanggal_mulai || ''}T${a.waktu_mulai || '00:00'}`;
    const db = `${b.tanggal_mulai || ''}T${b.waktu_mulai || '00:00'}`;
    return da.localeCompare(db);
  });
}

async function readKalenderList(): Promise<{ items: CalendarEventRecord[]; source: 'mysql' | 'disk' }> {
  const diskItems = readKalenderDisk();
  try {
    if (pool && (await ensureKalenderTableLazy())) {
      const conn = await pool.getConnection();
      try {
        const [rows]: [any[], any] = await conn.query(
          'SELECT * FROM kalender_acara ORDER BY tanggal_mulai ASC, waktu_mulai ASC'
        );
        if (rows.length > 0) {
          const normalized: CalendarEventRecord[] = rows.map((r) => ({
            id_acara: String(r.id_acara),
            judul: String(r.judul || ''),
            kategori: String(r.kategori || 'Kegiatan PPDI'),
            tanggal_mulai: String(r.tanggal_mulai || ''),
            waktu_mulai: r.waktu_mulai || undefined,
            tanggal_selesai: r.tanggal_selesai || undefined,
            waktu_selesai: r.waktu_selesai || undefined,
            is_all_day: Boolean(r.is_all_day),
            lokasi: r.lokasi || undefined,
            deskripsi: r.deskripsi || undefined,
            pengingat_menit: Number(r.pengingat_menit) || 0,
            status: String(r.status || 'Terjadwal'),
            created_by: r.created_by || undefined,
            created_at: String(r.created_at || new Date().toISOString()),
            updated_at: r.updated_at || undefined,
          }));
          writeKalenderDisk(normalized);
          return { items: sortKalenderItems(normalized), source: 'mysql' };
        }
        if (diskItems.length > 0) {
          for (const item of diskItems) {
            await conn.query(
              `INSERT IGNORE INTO kalender_acara
               (id_acara, judul, kategori, tanggal_mulai, waktu_mulai, tanggal_selesai, waktu_selesai, is_all_day, lokasi, deskripsi, pengingat_menit, status, created_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                item.id_acara,
                item.judul,
                item.kategori,
                item.tanggal_mulai,
                item.waktu_mulai || null,
                item.tanggal_selesai || null,
                item.waktu_selesai || null,
                item.is_all_day ? 1 : 0,
                item.lokasi || null,
                item.deskripsi || null,
                item.pengingat_menit || 0,
                item.status || 'Terjadwal',
                item.created_by || null,
                item.created_at,
                item.updated_at || null,
              ]
            );
          }
          return { items: sortKalenderItems(diskItems), source: 'mysql' };
        }
      } finally {
        conn.release();
      }
    }
  } catch (_) {}
  return { items: sortKalenderItems(diskItems), source: 'disk' };
}

function escapeServerIcsText(val: string): string {
  return (val || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function pad2Server(n: number): string {
  return String(n).padStart(2, '0');
}

function formatServerIcsDate(dateStr: string, timeStr?: string, isAllDay?: boolean, addOneDay = false): string {
  const cleanDate = (dateStr || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    const now = new Date();
    return `${now.getFullYear()}${pad2Server(now.getMonth() + 1)}${pad2Server(now.getDate())}`;
  }
  if (isAllDay || !timeStr) {
    if (addOneDay) {
      const d = new Date(`${cleanDate}T00:00:00`);
      d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}${pad2Server(d.getMonth() + 1)}${pad2Server(d.getDate())}`;
    }
    return cleanDate.replace(/-/g, '');
  }
  const [hh = '09', mm = '00'] = timeStr.trim().split(':');
  return `${cleanDate.replace(/-/g, '')}T${pad2Server(Number(hh))}${pad2Server(Number(mm))}00`;
}

function buildServerIcsFeed(events: CalendarEventRecord[], calTitle = 'Kalender Acara PPDI Kab. Bandung'): string {
  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PPDI Kabupaten Bandung//Kalender Acara//ID',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeServerIcsText(calTitle)}`,
    'X-WR-TIMEZONE:Asia/Jakarta',
  ];

  events
    .filter((ev) => ev.status !== 'Dibatalkan')
    .forEach((ev) => {
      const startDate = ev.tanggal_mulai;
      const endDate = ev.tanggal_selesai || ev.tanggal_mulai;
      const isAllDay = ev.is_all_day || !ev.waktu_mulai;

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${ev.id_acara}@ppdi-bandungkab.id`);
      lines.push(`DTSTAMP:${nowStamp}`);
      if (isAllDay) {
        lines.push(`DTSTART;VALUE=DATE:${formatServerIcsDate(startDate, undefined, true, false)}`);
        lines.push(`DTEND;VALUE=DATE:${formatServerIcsDate(endDate, undefined, true, true)}`);
      } else {
        let endTime = ev.waktu_selesai;
        if (!endTime && ev.waktu_mulai) {
          const [hh = '09', mm = '00'] = ev.waktu_mulai.split(':');
          endTime = `${pad2Server((Number(hh) + 2) % 24)}:${mm}`;
        }
        lines.push(`DTSTART;TZID=Asia/Jakarta:${formatServerIcsDate(startDate, ev.waktu_mulai, false, false)}`);
        lines.push(`DTEND;TZID=Asia/Jakarta:${formatServerIcsDate(endDate, endTime, false, false)}`);
      }
      lines.push(`SUMMARY:${escapeServerIcsText(ev.judul)}`);
      lines.push(`DESCRIPTION:${escapeServerIcsText(`[${ev.kategori}] ${ev.deskripsi || ''}`.trim())}`);
      if (ev.lokasi) lines.push(`LOCATION:${escapeServerIcsText(ev.lokasi)}`);
      lines.push(`CATEGORIES:${escapeServerIcsText(ev.kategori)}`);
      lines.push('STATUS:CONFIRMED');
      if (ev.pengingat_menit > 0) {
        lines.push('BEGIN:VALARM');
        lines.push('ACTION:DISPLAY');
        lines.push(`DESCRIPTION:${escapeServerIcsText(ev.judul)}`);
        lines.push(`TRIGGER:-PT${ev.pengingat_menit}M`);
        lines.push('END:VALARM');
      }
      lines.push('END:VEVENT');
    });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

app.get('/api/kalender', async (_req, res) => {
  try {
    const { items, source } = await readKalenderList();
    return res.json({ success: true, source, items });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message, items: [] });
  }
});

app.get('/api/kalender/feed.ics', async (_req, res) => {
  try {
    const { items } = await readKalenderList();
    const ics = buildServerIcsFeed(items);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="kalender-acara-ppdi.ics"');
    return res.send(ics);
  } catch (err: any) {
    return res.status(500).send('Gagal menghasilkan feed kalender.');
  }
});

app.get('/api/kalender/:id/event.ics', async (req, res) => {
  try {
    const id = String(req.params.id);
    const { items } = await readKalenderList();
    const found = items.find((item) => item.id_acara === id);
    if (!found) {
      return res.status(404).json({ success: false, message: 'Acara tidak ditemukan.' });
    }
    const ics = buildServerIcsFeed([found], found.judul);
    const safeName = found.judul.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'acara_ppdi';
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.ics"`);
    return res.send(ics);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/kalender', requirePermission('kalender', 'add'), async (req, res) => {
  try {
    const {
      judul,
      kategori,
      tanggal_mulai,
      waktu_mulai,
      tanggal_selesai,
      waktu_selesai,
      is_all_day,
      lokasi,
      deskripsi,
      pengingat_menit,
      status,
      created_by,
    } = req.body || {};

    if (!judul || !String(judul).trim()) {
      return res.status(400).json({ success: false, message: 'Judul acara wajib diisi.' });
    }
    if (!tanggal_mulai || !String(tanggal_mulai).trim()) {
      return res.status(400).json({ success: false, message: 'Tanggal mulai acara wajib diisi.' });
    }

    const nowIso = new Date().toISOString();
    const newEvent: CalendarEventRecord = {
      id_acara: `evt_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      judul: String(judul).trim(),
      kategori: String(kategori || 'Kegiatan PPDI').trim(),
      tanggal_mulai: String(tanggal_mulai).trim().slice(0, 10),
      waktu_mulai: !is_all_day && waktu_mulai ? String(waktu_mulai).trim() : undefined,
      tanggal_selesai: tanggal_selesai
        ? String(tanggal_selesai).trim().slice(0, 10)
        : String(tanggal_mulai).trim().slice(0, 10),
      waktu_selesai: !is_all_day && waktu_selesai ? String(waktu_selesai).trim() : undefined,
      is_all_day: Boolean(is_all_day),
      lokasi: lokasi ? String(lokasi).trim() : undefined,
      deskripsi: deskripsi ? String(deskripsi).trim() : undefined,
      pengingat_menit: pengingat_menit !== undefined ? Number(pengingat_menit) || 0 : 1440,
      status: String(status || 'Terjadwal').trim(),
      created_by: created_by ? String(created_by).trim() : 'Admin PPDI',
      created_at: nowIso,
      updated_at: nowIso,
    };

    const { items } = await readKalenderList();
    const updated = sortKalenderItems([...items, newEvent]);
    writeKalenderDisk(updated);

    if (pool && (await ensureKalenderTableLazy())) {
      try {
        const conn = await pool.getConnection();
        await conn.query(
          `INSERT INTO kalender_acara
           (id_acara, judul, kategori, tanggal_mulai, waktu_mulai, tanggal_selesai, waktu_selesai, is_all_day, lokasi, deskripsi, pengingat_menit, status, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newEvent.id_acara,
            newEvent.judul,
            newEvent.kategori,
            newEvent.tanggal_mulai,
            newEvent.waktu_mulai || null,
            newEvent.tanggal_selesai || null,
            newEvent.waktu_selesai || null,
            newEvent.is_all_day ? 1 : 0,
            newEvent.lokasi || null,
            newEvent.deskripsi || null,
            newEvent.pengingat_menit,
            newEvent.status,
            newEvent.created_by || null,
            newEvent.created_at,
            newEvent.updated_at || null,
          ]
        );
        conn.release();
      } catch (dbErr) {
        console.warn('[Kalender Acara] Gagal insert MySQL:', dbErr);
      }
    }

    return res.json({
      success: true,
      message: 'Jadwal acara baru berhasil ditambahkan.',
      item: newEvent,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/kalender/:id', requirePermission('kalender', 'edit'), async (req, res) => {
  try {
    const id = String(req.params.id);
    const { items } = await readKalenderList();
    const idx = items.findIndex((item) => item.id_acara === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Acara tidak ditemukan.' });
    }

    const existing = items[idx];
    const body = req.body || {};
    const nextIsAllDay = body.is_all_day !== undefined ? Boolean(body.is_all_day) : existing.is_all_day;
    const updatedItem: CalendarEventRecord = {
      ...existing,
      judul: body.judul !== undefined ? String(body.judul).trim() : existing.judul,
      kategori: body.kategori !== undefined ? String(body.kategori).trim() : existing.kategori,
      tanggal_mulai: body.tanggal_mulai !== undefined ? String(body.tanggal_mulai).trim().slice(0, 10) : existing.tanggal_mulai,
      waktu_mulai: nextIsAllDay
        ? undefined
        : body.waktu_mulai !== undefined
        ? String(body.waktu_mulai).trim() || undefined
        : existing.waktu_mulai,
      tanggal_selesai: body.tanggal_selesai !== undefined
        ? String(body.tanggal_selesai).trim().slice(0, 10) || undefined
        : existing.tanggal_selesai,
      waktu_selesai: nextIsAllDay
        ? undefined
        : body.waktu_selesai !== undefined
        ? String(body.waktu_selesai).trim() || undefined
        : existing.waktu_selesai,
      is_all_day: nextIsAllDay,
      lokasi: body.lokasi !== undefined ? String(body.lokasi).trim() || undefined : existing.lokasi,
      deskripsi: body.deskripsi !== undefined ? String(body.deskripsi).trim() || undefined : existing.deskripsi,
      pengingat_menit: body.pengingat_menit !== undefined ? Number(body.pengingat_menit) || 0 : existing.pengingat_menit,
      status: body.status !== undefined ? String(body.status).trim() : existing.status,
      updated_at: new Date().toISOString(),
    };

    const nextItems = [...items];
    nextItems[idx] = updatedItem;
    const sorted = sortKalenderItems(nextItems);
    writeKalenderDisk(sorted);

    if (pool && (await ensureKalenderTableLazy())) {
      try {
        const conn = await pool.getConnection();
        await conn.query(
          `UPDATE kalender_acara
           SET judul = ?, kategori = ?, tanggal_mulai = ?, waktu_mulai = ?, tanggal_selesai = ?, waktu_selesai = ?,
               is_all_day = ?, lokasi = ?, deskripsi = ?, pengingat_menit = ?, status = ?, updated_at = ?
           WHERE id_acara = ?`,
          [
            updatedItem.judul,
            updatedItem.kategori,
            updatedItem.tanggal_mulai,
            updatedItem.waktu_mulai || null,
            updatedItem.tanggal_selesai || null,
            updatedItem.waktu_selesai || null,
            updatedItem.is_all_day ? 1 : 0,
            updatedItem.lokasi || null,
            updatedItem.deskripsi || null,
            updatedItem.pengingat_menit,
            updatedItem.status,
            updatedItem.updated_at || null,
            id,
          ]
        );
        conn.release();
      } catch (dbErr) {
        console.warn('[Kalender Acara] Gagal update MySQL:', dbErr);
      }
    }

    return res.json({
      success: true,
      message: 'Jadwal acara berhasil diperbarui.',
      item: updatedItem,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/kalender/:id', requirePermission('kalender', 'delete'), async (req, res) => {
  try {
    const id = String(req.params.id);
    const { items } = await readKalenderList();
    const target = items.find((item) => item.id_acara === id);
    if (!target) {
      return res.status(404).json({ success: false, message: 'Acara tidak ditemukan.' });
    }
    const remaining = items.filter((item) => item.id_acara !== id);
    writeKalenderDisk(remaining);

    if (pool && (await ensureKalenderTableLazy())) {
      try {
        const conn = await pool.getConnection();
        await conn.query('DELETE FROM kalender_acara WHERE id_acara = ?', [id]);
        conn.release();
      } catch (dbErr) {
        console.warn('[Kalender Acara] Gagal delete MySQL:', dbErr);
      }
    }

    return res.json({
      success: true,
      message: `Acara "${target.judul}" berhasil dihapus.`,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
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

app.post('/api/db/table/:tableName', requirePermission('settings-db', 'add'), async (req, res) => {
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

app.put('/api/db/table/:tableName/:idKey/:idVal', requirePermission('settings-db', 'edit'), async (req, res) => {
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

app.delete('/api/db/table/:tableName/:idKey/:idVal', requirePermission('settings-db', 'delete'), async (req, res) => {
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
  const isCompiledBundle = process.argv[1]?.endsWith('.js');
  const isProduction = process.env.NODE_ENV === 'production' && isCompiledBundle;

  if (!isProduction) {
    let viteMiddleware: express.RequestHandler | null = null;
    let viteFailed = false;

    const viteReadyPromise = import('vite')
      .then(({ createServer: createViteServer }) =>
        createViteServer({
          server: {
            middlewareMode: true,
            hmr: false,
            watch: null,
            proxy: {},
          },
          appType: 'spa',
        })
      )
      .then((vite) => {
        viteMiddleware = vite.middlewares;
        console.log('[Server] Vite middleware mode aktif untuk development.');
      })
      .catch((viteErr) => {
        console.warn('[Server] Gagal memuat Vite middleware, beralih ke static hosting:', viteErr);
        viteFailed = true;
      });

    app.use(async (req, res, next) => {
      if (!viteMiddleware && !viteFailed) {
        await viteReadyPromise;
      }
      if (viteMiddleware) {
        return viteMiddleware(req, res, next);
      }
      return next();
    });

    if (hasDist) {
      app.use((req, res, next) => {
        if (!viteFailed) return next();
        return express.static(activeDistPath)(req, res, next);
      });
      app.get('*', (req, res, next) => {
        if (!viteFailed) return next();
        if (req.originalUrl.startsWith('/api') || req.path.startsWith('/api')) {
          return res.status(404).json({ success: false, error: 'API_ENDPOINT_NOT_FOUND' });
        }
        return res.sendFile(path.join(activeDistPath, 'index.html'));
      });
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

  const server = app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server PPDI Kab. Bandung berjalan pada port ${PORT} [Node.js ${process.version} / Target: 22.23.4]`);
    console.log(`MySQL Live Connected: ${activeDbConfig.user}@${activeDbConfig.host}:${activeDbConfig.port}/${activeDbConfig.database}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Server Error] Port ${PORT} sedang digunakan. Error:`, err);
    } else {
      console.error('[Server Error]', err);
    }
  });
}

startServer();

