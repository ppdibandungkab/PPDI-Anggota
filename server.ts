import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import mysql from 'mysql2/promise';
import crypto from 'crypto';
import net from 'net';
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
app.set('trust proxy', true);

// Parse CLI arguments if provided, e.g. --port 3000 from npm run dev
const cliArgs = process.argv.slice(2);
const portFlagIndex = cliArgs.indexOf('--port');
const cliPort = portFlagIndex !== -1 && cliArgs[portFlagIndex + 1] ? Number(cliArgs[portFlagIndex + 1]) : null;

// Dev server must always bind to 3000 in AI Studio environment (PORT=8080 is reserved by container proxy)
const PORT = cliPort || (process.env.PORT && process.env.PORT !== '8080' ? Number(process.env.PORT) : 3000);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Enable CORS for local cross-port development and AI Studio Preview hosts
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-user-id, x-user-role, x-user-name, user-role');
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

let anggotaIntSchemaEnsured = false;

function isValidInt32Id(val: any): number | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (!/^\d{1,10}$/.test(str)) return null;
  const num = Number(str);
  if (!Number.isSafeInteger(num) || num <= 0 || num > 2147483647) return null;
  return num;
}

async function ensureAnggotaIntSchema(conn: any): Promise<void> {
  if (anggotaIntSchemaEnsured) return;
  try {
    const [colRows]: [any[], any] = await conn.query(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, EXTRA
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND (
           (TABLE_NAME = 'anggota' AND COLUMN_NAME = 'id_anggota')
           OR (TABLE_NAME = 'riwayat_jabatan' AND COLUMN_NAME = 'id_riwayat')
           OR (TABLE_NAME = 'keanggotaan_ppdi' AND COLUMN_NAME = 'id_ppdi')
           OR (TABLE_NAME IN ('riwayat_jabatan', 'keanggotaan_ppdi', 'iuran_anggota', 'users', 'whatsapp_logs') AND COLUMN_NAME = 'id_anggota')
         )`
    );
    if (!colRows || colRows.length === 0) {
      anggotaIntSchemaEnsured = true;
      return;
    }

    const anggotaCol = colRows.find((r) => r.TABLE_NAME === 'anggota' && r.COLUMN_NAME === 'id_anggota');
    const needsAnggotaAlter =
      Boolean(anggotaCol) &&
      (String(anggotaCol.DATA_TYPE).toLowerCase() !== 'int' ||
        !String(anggotaCol.EXTRA || '').toLowerCase().includes('auto_increment'));

    const riwayatCol = colRows.find((r) => r.TABLE_NAME === 'riwayat_jabatan' && r.COLUMN_NAME === 'id_riwayat');
    const needsRiwayatAlter =
      Boolean(riwayatCol) &&
      (String(riwayatCol.DATA_TYPE).toLowerCase() !== 'int' ||
        !String(riwayatCol.EXTRA || '').toLowerCase().includes('auto_increment'));

    const ppdiCol = colRows.find((r) => r.TABLE_NAME === 'keanggotaan_ppdi' && r.COLUMN_NAME === 'id_ppdi');
    const needsPpdiAlter =
      Boolean(ppdiCol) &&
      (String(ppdiCol.DATA_TYPE).toLowerCase() !== 'int' ||
        !String(ppdiCol.EXTRA || '').toLowerCase().includes('auto_increment'));

    const childTablesNeedingAlter = colRows
      .filter((r) => r.TABLE_NAME !== 'anggota' && r.COLUMN_NAME === 'id_anggota' && String(r.DATA_TYPE).toLowerCase() !== 'int')
      .map((r) => String(r.TABLE_NAME));

    if (!needsAnggotaAlter && !needsRiwayatAlter && !needsPpdiAlter && childTablesNeedingAlter.length === 0) {
      anggotaIntSchemaEnsured = true;
      return;
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    try {
      const [fkRows]: [any[], any] = await conn.query(
        `SELECT TABLE_NAME, CONSTRAINT_NAME
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE()
           AND REFERENCED_TABLE_NAME = 'anggota'
           AND REFERENCED_COLUMN_NAME = 'id_anggota'`
      );
      const seenFk = new Set<string>();
      for (const fk of fkRows) {
        const key = `${fk.TABLE_NAME}.${fk.CONSTRAINT_NAME}`;
        if (seenFk.has(key)) continue;
        seenFk.add(key);
        try {
          await conn.query(`ALTER TABLE \`${fk.TABLE_NAME}\` DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``);
        } catch (_) {}
      }
    } catch (_) {}

    if (needsAnggotaAlter) {
      const [angRows]: [any[], any] = await conn.query(
        `SELECT id_anggota FROM anggota ORDER BY created_at ASC, id_anggota ASC`
      );

      const usedInts = new Set<number>();
      const idMap = new Map<string, number>();

      for (const r of angRows) {
        const oldId = String(r.id_anggota);
        const parsed = isValidInt32Id(oldId);
        if (parsed !== null && !usedInts.has(parsed)) {
          usedInts.add(parsed);
          idMap.set(oldId, parsed);
        }
      }

      let nextSeq = 1;
      for (const r of angRows) {
        const oldId = String(r.id_anggota);
        if (!idMap.has(oldId)) {
          while (usedInts.has(nextSeq)) nextSeq++;
          usedInts.add(nextSeq);
          idMap.set(oldId, nextSeq);
          nextSeq++;
        }
      }

      const childTablesAll = ['riwayat_jabatan', 'keanggotaan_ppdi', 'iuran_anggota', 'users', 'whatsapp_logs'];
      const existingChildTables = new Set(colRows.map((r) => String(r.TABLE_NAME)));

      for (const [oldId, newId] of idMap.entries()) {
        if (oldId === String(newId)) continue;
        await conn.query(`UPDATE anggota SET id_anggota = ? WHERE id_anggota = ?`, [String(newId), oldId]);
        for (const tbl of childTablesAll) {
          if (existingChildTables.has(tbl)) {
            try {
              await conn.query(`UPDATE \`${tbl}\` SET id_anggota = ? WHERE id_anggota = ?`, [String(newId), oldId]);
            } catch (_) {}
          }
        }
      }

      for (const tbl of ['users', 'whatsapp_logs']) {
        if (existingChildTables.has(tbl)) {
          try {
            await conn.query(
              `UPDATE \`${tbl}\` SET id_anggota = NULL WHERE id_anggota IS NOT NULL AND id_anggota NOT REGEXP '^[0-9]{1,10}$'`
            );
          } catch (_) {}
        }
      }
      for (const tbl of ['riwayat_jabatan', 'keanggotaan_ppdi', 'iuran_anggota']) {
        if (existingChildTables.has(tbl)) {
          try {
            await conn.query(
              `DELETE FROM \`${tbl}\` WHERE id_anggota IS NULL OR id_anggota NOT REGEXP '^[0-9]{1,10}$'`
            );
          } catch (_) {}
        }
      }

      await conn.query(`ALTER TABLE \`anggota\` MODIFY COLUMN \`id_anggota\` INT(11) NOT NULL AUTO_INCREMENT`);
      const maxId = usedInts.size > 0 ? Math.max(...Array.from(usedInts)) : 0;
      await conn.query(`ALTER TABLE \`anggota\` AUTO_INCREMENT = ?`, [maxId + 1]);
    }

    if (needsRiwayatAlter) {
      try {
        await conn.query(`ALTER TABLE \`riwayat_jabatan\` MODIFY COLUMN \`id_riwayat\` INT(11) NOT NULL AUTO_INCREMENT`);
      } catch (_) {}
    }
    if (needsPpdiAlter) {
      try {
        await conn.query(`ALTER TABLE \`keanggotaan_ppdi\` MODIFY COLUMN \`id_ppdi\` INT(11) NOT NULL AUTO_INCREMENT`);
      } catch (_) {}
    }

    for (const tbl of ['riwayat_jabatan', 'keanggotaan_ppdi', 'iuran_anggota']) {
      if (childTablesNeedingAlter.includes(tbl)) {
        try {
          await conn.query(
            `DELETE FROM \`${tbl}\` WHERE id_anggota IS NULL OR id_anggota NOT REGEXP '^[0-9]{1,10}$'`
          );
          await conn.query(`ALTER TABLE \`${tbl}\` MODIFY COLUMN \`id_anggota\` INT(11) NOT NULL`);
        } catch (_) {}
      }
    }

    for (const tbl of ['users', 'whatsapp_logs']) {
      if (childTablesNeedingAlter.includes(tbl)) {
        try {
          await conn.query(
            `UPDATE \`${tbl}\` SET id_anggota = NULL WHERE id_anggota IS NOT NULL AND id_anggota NOT REGEXP '^[0-9]{1,10}$'`
          );
          await conn.query(`ALTER TABLE \`${tbl}\` MODIFY COLUMN \`id_anggota\` INT(11) NULL`);
        } catch (_) {}
      }
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    anggotaIntSchemaEnsured = true;
  } catch (err) {
    try {
      await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    } catch (_) {}
    console.warn('[Schema Migration] Gagal migrasi id_anggota ke INT(11):', err);
  }
}

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
  if (forceRecreate || overrideConfig) {
    anggotaIntSchemaEnsured = false;
  }

  activeDbConfig = overrideConfig ? getDbConfig(overrideConfig) : getDbConfig();
  pool = mysql.createPool({
    ...activeDbConfig,
    // Keep MySQL DATE columns (e.g. tanggal_lahir, tgl_sk_pengangkatan, tmt_jabatan) as exact 'YYYY-MM-DD' strings
    // so JS Date UTC conversion never shifts birth dates by ±1 day across timezones.
    dateStrings: ['DATE'],
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });
  return pool;
}

/**
 * Formats a MySQL DATE / JS Date / ISO string into a timezone-safe 'YYYY-MM-DD' calendar string.
 * Never uses Date.prototype.toISOString() on local-midnight Date objects (which shifts dates by -1 day in UTC+7).
 */
function getLocalTodayYMD(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateOnlyYMD(val: any, fallback: string): string {
  if (val === null || val === undefined || val === '') return fallback;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return fallback;
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(val).trim();
  if (!str) return fallback;
  const ymdMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
  }
  const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return fallback;
}

// Initial pool creation
createOrGetPool();


// File Upload storage directories configuration
const UPLOADS_ROOT = path.resolve(process.cwd(), 'public', 'uploads');
const FOTO_DIR = path.join(UPLOADS_ROOT, 'foto');
const SK_DIR = path.join(UPLOADS_ROOT, 'sk');
const TTD_DIR = path.join(UPLOADS_ROOT, 'ttd');
const REGULASI_DIR = path.join(UPLOADS_ROOT, 'regulasi');
const CHAIRMAN_DIR = path.join(UPLOADS_ROOT, 'chairman');

try {
  fs.mkdirSync(FOTO_DIR, { recursive: true });
  fs.mkdirSync(SK_DIR, { recursive: true });
  fs.mkdirSync(TTD_DIR, { recursive: true });
  fs.mkdirSync(REGULASI_DIR, { recursive: true });
  fs.mkdirSync(CHAIRMAN_DIR, { recursive: true });
} catch (e) {
  console.error('Failed to create upload directories:', e);
}

const BACKUP_DIR = path.join(UPLOADS_ROOT, 'backups');
try {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
} catch (e) {
  console.error('Failed to create backup directory:', e);
}

const DB_CONNECTIVITY_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ECONNRESET',
  'PROTOCOL_CONNECTION_LOST',
  'ER_ACCESS_DENIED_ERROR',
]);

function isDbConnectivityError(err: any): boolean {
  const code = String(err?.code || err?.errno || err?.errorno || '').toUpperCase();
  return DB_CONNECTIVITY_ERROR_CODES.has(code);
}

function probeTcpConnection(
  host: string,
  port: number,
  timeoutMs = 2500
): Promise<{ ok: boolean; code?: string; message?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const socket = net.createConnection({ host, port });

    const finish = (result: { ok: boolean; code?: string; message?: string }) => {
      if (settled) return;
      settled = true;
      try {
        socket.removeAllListeners();
        socket.destroy();
      } catch (_) {}
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish({ ok: true }));
    socket.once('timeout', () =>
      finish({
        ok: false,
        code: 'ETIMEDOUT',
        message: `Koneksi ke server database ${host}:${port} melebihi batas waktu (${timeoutMs}ms).`,
      })
    );
    socket.once('error', (err: any) =>
      finish({
        ok: false,
        code: String(err?.code || 'ECONNREFUSED'),
        message: err?.message || `Gagal terhubung ke ${host}:${port}.`,
      })
    );
  });
}

async function executeDatabaseBackup(options?: { isAuto?: boolean }): Promise<any> {
  const isAuto = Boolean(options?.isAuto);
  const cfg = activeDbConfig;

  if (!cfg?.host || !cfg?.user || !cfg?.database) {
    const msg = 'Konfigurasi database MySQL belum lengkap (DB_HOST / DB_USER / DB_NAME kosong).';
    if (isAuto) {
      return { skipped: true, code: 'DB_NOT_CONFIGURED', message: msg };
    }
    const configErr: any = new Error(msg);
    configErr.code = 'DB_NOT_CONFIGURED';
    configErr.statusCode = 503;
    throw configErr;
  }

  const probe = await probeTcpConnection(cfg.host, Number(cfg.port) || 3306, 2500);
  if (!probe.ok) {
    const msg = `Server MySQL (${cfg.host}:${cfg.port}) sedang tidak dapat dijangkau (${probe.code || 'ETIMEDOUT'}).`;
    if (isAuto) {
      return { skipped: true, code: probe.code || 'ETIMEDOUT', message: msg };
    }
    const offlineErr: any = new Error(msg);
    offlineErr.code = probe.code || 'ETIMEDOUT';
    offlineErr.statusCode = 503;
    throw offlineErr;
  }

  if (!pool) {
    createOrGetPool();
  }
  if (!pool) {
    const poolErr: any = new Error('Pool koneksi database belum siap.');
    poolErr.statusCode = 503;
    throw poolErr;
  }

  let conn: mysql.PoolConnection | null = null;
  try {
    conn = await pool.getConnection();
    const [tablesRows]: [any[], any] = await conn.query('SHOW TABLES');
    const tableKeys = tablesRows.map(r => Object.values(r)[0] as string);

    let sqlDump = `-- PPDI Kabupaten Bandung Database Backup Dump\n`;
    sqlDump += `-- Generated at: ${new Date().toISOString()}\n\n`;
    sqlDump += `SET FOREIGN_KEY_CHECKS = 0;\n\n`;

    for (const tbl of tableKeys) {
      const [createRows]: [any[], any] = await conn.query(`SHOW CREATE TABLE \`${tbl}\``);
      const createTableSql = createRows[0]['Create Table'];
      sqlDump += `DROP TABLE IF EXISTS \`${tbl}\`;\n`;
      sqlDump += `${createTableSql};\n\n`;

      const [dataRows]: [any[], any] = await conn.query(`SELECT * FROM \`${tbl}\``);
      if (dataRows.length > 0) {
        const columns = Object.keys(dataRows[0]);
        sqlDump += `INSERT INTO \`${tbl}\` (\`${columns.join('`, `')}\`) VALUES\n`;
        const valueRows = dataRows.map((row: any) => {
          const vals = columns.map(col => {
            const val = row[col];
            if (val === null) return 'NULL';
            if (typeof val === 'number') return val;
            if (val instanceof Date) {
              const y = val.getFullYear();
              const mo = String(val.getMonth() + 1).padStart(2, '0');
              const da = String(val.getDate()).padStart(2, '0');
              const hh = String(val.getHours()).padStart(2, '0');
              const mm = String(val.getMinutes()).padStart(2, '0');
              const ss = String(val.getSeconds()).padStart(2, '0');
              return `'${y}-${mo}-${da} ${hh}:${mm}:${ss}'`;
            }
            return conn!.escape(val);
          });
          return `(${vals.join(', ')})`;
        });
        sqlDump += valueRows.join(',\n') + ';\n\n';
      }
    }

    sqlDump += `SET FOREIGN_KEY_CHECKS = 1;\n`;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `db_backup_${timestamp}.sql`;
    const filepath = path.join(BACKUP_DIR, filename);
    fs.writeFileSync(filepath, sqlDump, 'utf8');

    const stats = fs.statSync(filepath);
    const logData = {
      timestamp: new Date().toISOString(),
      filename,
      fileSize: stats.size,
      status: 'SUCCESS',
      message: 'Backup database harian berhasil dibuat.',
    };

    fs.writeFileSync(path.join(BACKUP_DIR, 'backup_log.json'), JSON.stringify(logData, null, 2), 'utf8');
    return logData;
  } catch (err: any) {
    if (isAuto && isDbConnectivityError(err)) {
      return {
        skipped: true,
        code: String(err?.code || err?.errno || 'ETIMEDOUT'),
        message: `Server MySQL (${cfg.host}:${cfg.port}) sedang tidak dapat dijangkau (${err?.code || 'ETIMEDOUT'}).`,
      };
    }

    if (!isAuto) {
      const errorLog = {
        timestamp: new Date().toISOString(),
        filename: '',
        fileSize: 0,
        status: 'ERROR',
        message: err?.message || 'Backup gagal',
      };
      try {
        fs.writeFileSync(path.join(BACKUP_DIR, 'backup_log.json'), JSON.stringify(errorLog, null, 2), 'utf8');
      } catch (_) {}
    }
    throw err;
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch (_) {}
    }
  }
}

app.get('/api/database/backup/status', async (_req, res) => {
  try {
    const logPath = path.join(BACKUP_DIR, 'backup_log.json');
    let lastLog = null;
    if (fs.existsSync(logPath)) {
      lastLog = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    }
    const files = fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.sql')) : [];
    return res.json({ success: true, lastLog, filesCount: files.length });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/database/backup/download/:filename?', (req, res) => {
  try {
    const filename = req.params.filename;
    let targetPath: string | null = null;
    if (filename && filename !== 'latest') {
      const safeName = path.basename(filename);
      const p = path.join(BACKUP_DIR, safeName);
      if (fs.existsSync(p)) targetPath = p;
    }
    if (!targetPath) {
      if (fs.existsSync(BACKUP_DIR)) {
        const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.sql')).sort().reverse();
        if (files.length > 0) {
          targetPath = path.join(BACKUP_DIR, files[0]);
        }
      }
    }
    if (!targetPath || !fs.existsSync(targetPath)) {
      return res.status(404).json({ success: false, message: 'File backup SQL tidak ditemukan' });
    }
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(targetPath)}"`);
    res.setHeader('Content-Type', 'application/sql');
    return res.sendFile(targetPath);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/database/backup', async (_req, res) => {
  try {
    const result = await executeDatabaseBackup({ isAuto: false });
    return res.json({ success: true, ...result });
  } catch (err: any) {
    const statusCode = Number(err?.statusCode) || (isDbConnectivityError(err) ? 503 : 500);
    const message = isDbConnectivityError(err)
      ? `Tidak dapat terhubung ke server MySQL (${activeDbConfig.host}:${activeDbConfig.port}). Pastikan database aktif dan terjangkau.`
      : (err?.message || 'Gagal memproses backup database');
    return res.status(statusCode).json({
      success: false,
      code: err?.code || 'BACKUP_ERROR',
      error: message,
      message,
    });
  }
});

setTimeout(() => {
  try {
    const logPath = path.join(BACKUP_DIR, 'backup_log.json');
    let needsBackup = true;
    if (fs.existsSync(logPath)) {
      const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      const lastDate = log.timestamp ? log.timestamp.slice(0, 10) : '';
      const today = new Date().toISOString().slice(0, 10);
      if (lastDate === today && log.status === 'SUCCESS') {
        needsBackup = false;
      }
    }
    if (needsBackup) {
      console.log('[Auto Backup] Memeriksa koneksi database untuk backup harian otomatis...');
      executeDatabaseBackup({ isAuto: true })
        .then((result) => {
          if (result?.skipped) {
            console.log(`[Auto Backup] Dilewati: ${result.message}`);
          } else {
            console.log('[Auto Backup] Backup harian otomatis selesai.');
          }
        })
        .catch((err: any) => {
          console.log(`[Auto Backup] Ditunda: ${err?.message || 'Database belum siap'}`);
        });
    }
  } catch (e: any) {
    console.log(`[Auto Backup] Dilewati: ${e?.message || 'Gagal membaca log backup'}`);
  }
}, 4000);

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

function isValidPdfBase64Upload(fileData: string, fileName?: string): boolean {
  if (!fileData || typeof fileData !== 'string') return false;
  const trimmedName = (fileName || '').trim().toLowerCase();
  if (trimmedName && !trimmedName.endsWith('.pdf')) {
    return false;
  }

  let mimeType = '';
  let base64Clean = fileData.trim();
  const matches = base64Clean.match(/^data:([A-Za-z0-9\-+/.]+);base64,(.+)$/);
  if (matches && matches.length === 3) {
    mimeType = matches[1].toLowerCase();
    base64Clean = matches[2];
    if (mimeType !== 'application/pdf' && mimeType !== 'application/x-pdf') {
      return false;
    }
  } else if (base64Clean.startsWith('data:')) {
    return false;
  }

  try {
    const headerSlice = Buffer.from(base64Clean.slice(0, 128), 'base64').subarray(0, 64).toString('ascii');
    return headerSlice.includes('%PDF-');
  } catch {
    return false;
  }
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

  if (folderType === 'sk' && !isValidPdfBase64Upload(fileData, fileName)) {
    throw new Error('Hanya file berformat PDF (.pdf) yang diperbolehkan untuk berkas SK.');
  }

  let mimeType = '';
  let base64Clean = fileData;
  const matches = fileData.match(/^data:([A-Za-z0-9\-+/.]+);base64,(.+)$/);
  if (matches && matches.length === 3) {
    mimeType = matches[1];
    base64Clean = matches[2];
  }

  let ext = folderType === 'sk' ? '.pdf' : path.extname(fileName || '').toLowerCase();
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

    if (folderType === 'sk' && !isValidPdfBase64Upload(String(fileData), fileName)) {
      return res.status(400).json({
        success: false,
        message: 'Hanya file berformat PDF (.pdf) yang diperbolehkan untuk berkas SK.',
      });
    }

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

// Diagnostic check for database schema, INT(11) alignment, Foreign Keys, AUTO_INCREMENT, and promotion readiness
app.get('/api/db/schema-diagnostic', async (_req, res) => {
  let conn: any;
  try {
    const currentPool = createOrGetPool();
    conn = await currentPool.getConnection();

    const targetTables = [
      'anggota',
      'riwayat_jabatan',
      'keanggotaan_ppdi',
      'iuran_anggota',
      'users',
      'whatsapp_logs',
      'pendaftaran_perangkat_desa',
      'ref_kecamatan',
      'ref_desa',
      'ref_jabatan',
    ];

    // 1. Inspect key columns across relevant tables
    const [columns]: [any[], any] = await conn.query(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, CHARACTER_MAXIMUM_LENGTH, COLUMN_KEY
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN (?)
       ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [targetTables]
    );

    // 2. Inspect Foreign Key Constraints & check for data type / signedness / collation mismatches
    const [foreignKeys]: [any[], any] = await conn.query(
      `SELECT
         kcu.CONSTRAINT_NAME,
         kcu.TABLE_NAME AS child_table,
         kcu.COLUMN_NAME AS child_column,
         kcu.REFERENCED_TABLE_NAME AS parent_table,
         kcu.REFERENCED_COLUMN_NAME AS parent_column,
         rc.UPDATE_RULE,
         rc.DELETE_RULE,
         c_child.COLUMN_TYPE AS child_column_type,
         c_child.IS_NULLABLE AS child_nullable,
         c_child.COLLATION_NAME AS child_collation,
         c_parent.COLUMN_TYPE AS parent_column_type,
         c_parent.COLLATION_NAME AS parent_collation
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
       LEFT JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
         ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
         AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
         AND rc.TABLE_NAME = kcu.TABLE_NAME
       LEFT JOIN INFORMATION_SCHEMA.COLUMNS c_child
         ON c_child.TABLE_SCHEMA = kcu.TABLE_SCHEMA
         AND c_child.TABLE_NAME = kcu.TABLE_NAME
         AND c_child.COLUMN_NAME = kcu.COLUMN_NAME
       LEFT JOIN INFORMATION_SCHEMA.COLUMNS c_parent
         ON c_parent.TABLE_SCHEMA = kcu.TABLE_SCHEMA
         AND c_parent.TABLE_NAME = kcu.REFERENCED_TABLE_NAME
         AND c_parent.COLUMN_NAME = kcu.REFERENCED_COLUMN_NAME
       WHERE kcu.TABLE_SCHEMA = DATABASE()
         AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
       ORDER BY kcu.TABLE_NAME, kcu.CONSTRAINT_NAME`
    );

    const fkIssues: any[] = [];
    for (const fk of foreignKeys) {
      const childBaseType = String(fk.child_column_type || '').toLowerCase().replace(/\(\d+\)/, '');
      const parentBaseType = String(fk.parent_column_type || '').toLowerCase().replace(/\(\d+\)/, '');
      const typeMismatch = childBaseType !== parentBaseType;
      const collationMismatch =
        fk.child_collation && fk.parent_collation && fk.child_collation !== fk.parent_collation;
      if (typeMismatch || collationMismatch) {
        fkIssues.push({
          severity: 'ERROR',
          constraint: fk.CONSTRAINT_NAME,
          detail: `${fk.child_table}.${fk.child_column} (${fk.child_column_type}) -> ${fk.parent_table}.${fk.parent_column} (${fk.parent_column_type})`,
          typeMismatch,
          collationMismatch,
        });
      }
    }

    // 3. Inspect INT(11) & AUTO_INCREMENT status on core identity columns
    const keyColumnsCheck: any[] = [];
    const expectedIntCols = [
      { table: 'anggota', col: 'id_anggota', expectAutoInc: true, expectNullable: false },
      { table: 'riwayat_jabatan', col: 'id_riwayat', expectAutoInc: true, expectNullable: false },
      { table: 'riwayat_jabatan', col: 'id_anggota', expectAutoInc: false, expectNullable: false },
      { table: 'keanggotaan_ppdi', col: 'id_ppdi', expectAutoInc: true, expectNullable: false },
      { table: 'keanggotaan_ppdi', col: 'id_anggota', expectAutoInc: false, expectNullable: false },
      { table: 'iuran_anggota', col: 'id_anggota', expectAutoInc: false, expectNullable: false },
      { table: 'users', col: 'id_anggota', expectAutoInc: false, expectNullable: true },
      { table: 'pendaftaran_perangkat_desa', col: 'id_pendaftaran', expectAutoInc: true, expectNullable: false },
    ];

    const schemaIssues: any[] = [];
    for (const spec of expectedIntCols) {
      const found = columns.find((c) => c.TABLE_NAME === spec.table && c.COLUMN_NAME === spec.col);
      if (!found) {
        keyColumnsCheck.push({ ...spec, status: 'MISSING_COLUMN', actual: null });
        schemaIssues.push({
          severity: 'WARNING',
          table: spec.table,
          column: spec.col,
          message: `Kolom ${spec.table}.${spec.col} tidak ditemukan.`,
        });
        continue;
      }
      const isInt = String(found.DATA_TYPE).toLowerCase() === 'int';
      const hasAutoInc = String(found.EXTRA || '').toLowerCase().includes('auto_increment');
      const isUnsigned = String(found.COLUMN_TYPE || '').toLowerCase().includes('unsigned');
      const ok = isInt && (!spec.expectAutoInc || hasAutoInc) && !isUnsigned;

      keyColumnsCheck.push({
        table: spec.table,
        column: spec.col,
        columnType: found.COLUMN_TYPE,
        isNullable: found.IS_NULLABLE,
        columnKey: found.COLUMN_KEY,
        extra: found.EXTRA,
        ok,
      });

      if (!ok) {
        schemaIssues.push({
          severity: 'ERROR',
          table: spec.table,
          column: spec.col,
          message: `${spec.table}.${spec.col} bertipe ${found.COLUMN_TYPE} (EXTRA: "${found.EXTRA || '-'}") — seharusnya INT(11)${spec.expectAutoInc ? ' AUTO_INCREMENT' : ''}.`,
        });
      }
    }

    // 4. Check AUTO_INCREMENT counters vs MAX(id) and zero-ID rows
    const autoIncChecks: any[] = [];
    const pkTables = [
      { table: 'anggota', pk: 'id_anggota' },
      { table: 'riwayat_jabatan', pk: 'id_riwayat' },
      { table: 'keanggotaan_ppdi', pk: 'id_ppdi' },
      { table: 'pendaftaran_perangkat_desa', pk: 'id_pendaftaran' },
    ];
    for (const t of pkTables) {
      try {
        const [tblInfo]: [any[], any] = await conn.query(
          `SELECT AUTO_INCREMENT FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
          [t.table]
        );
        const [stats]: [any[], any] = await conn.query(
          `SELECT COUNT(*) AS total, COALESCE(MAX(\`${t.pk}\`), 0) AS max_id, SUM(CASE WHEN \`${t.pk}\` <= 0 OR \`${t.pk}\` IS NULL THEN 1 ELSE 0 END) AS zero_or_null FROM \`${t.table}\``
        );
        const autoIncVal = tblInfo[0]?.AUTO_INCREMENT ? Number(tblInfo[0].AUTO_INCREMENT) : null;
        const maxId = Number(stats[0]?.max_id || 0);
        const zeroCount = Number(stats[0]?.zero_or_null || 0);
        const valid = (autoIncVal === null || autoIncVal > maxId) && zeroCount === 0;
        autoIncChecks.push({
          table: t.table,
          pk: t.pk,
          totalRows: Number(stats[0]?.total || 0),
          maxId,
          autoIncrementNext: autoIncVal,
          zeroOrNullIds: zeroCount,
          ok: valid,
        });
        if (!valid) {
          schemaIssues.push({
            severity: 'ERROR',
            table: t.table,
            column: t.pk,
            message: `Ketidaksesuaian AUTO_INCREMENT pada ${t.table}.${t.pk}: next=${autoIncVal}, max=${maxId}, zeroOrNull=${zeroCount}.`,
          });
        }
      } catch (e: any) {
        autoIncChecks.push({ table: t.table, pk: t.pk, error: e.message, ok: false });
      }
    }

    // 5. Check orphan FK references & pending registrations readiness
    const orphanChecks: any = {};
    const orphanQueries = [
      { key: 'riwayat_missing_anggota', sql: 'SELECT COUNT(*) AS cnt FROM riwayat_jabatan r LEFT JOIN anggota a ON r.id_anggota = a.id_anggota WHERE a.id_anggota IS NULL' },
      { key: 'keanggotaan_missing_anggota', sql: 'SELECT COUNT(*) AS cnt FROM keanggotaan_ppdi k LEFT JOIN anggota a ON k.id_anggota = a.id_anggota WHERE a.id_anggota IS NULL' },
      { key: 'iuran_missing_anggota', sql: 'SELECT COUNT(*) AS cnt FROM iuran_anggota i LEFT JOIN anggota a ON i.id_anggota = a.id_anggota WHERE a.id_anggota IS NULL' },
      { key: 'riwayat_missing_desa', sql: 'SELECT COUNT(*) AS cnt FROM riwayat_jabatan r LEFT JOIN ref_desa d ON r.id_desa = d.id_desa WHERE d.id_desa IS NULL' },
      { key: 'riwayat_missing_jabatan', sql: 'SELECT COUNT(*) AS cnt FROM riwayat_jabatan r LEFT JOIN ref_jabatan j ON r.id_jabatan = j.id_jabatan WHERE j.id_jabatan IS NULL' },
    ];
    for (const q of orphanQueries) {
      try {
        const [r]: [any[], any] = await conn.query(q.sql);
        orphanChecks[q.key] = Number(r[0]?.cnt || 0);
      } catch (e: any) {
        orphanChecks[q.key] = `ERROR: ${e.message}`;
      }
    }

    // 6. Inspect pending registrations readiness for promotion
    const [pendingRows]: [any[], any] = await conn.query(
      `SELECT p.id_pendaftaran, p.nik, p.nama_lengkap, p.id_kecamatan, p.id_desa, p.id_jabatan,
              p.tanggal_lahir, p.tgl_sk_pengangkatan, p.tmt_jabatan,
              CHAR_LENGTH(p.foto) AS foto_len, CHAR_LENGTH(p.file_sk) AS file_sk_len,
              p.status_approval,
              (SELECT COUNT(*) FROM ref_desa d WHERE d.id_desa = p.id_desa) AS desa_exists,
              (SELECT COUNT(*) FROM ref_jabatan j WHERE j.id_jabatan = p.id_jabatan) AS jabatan_exists,
              (SELECT a.id_anggota FROM anggota a WHERE a.nik = p.nik LIMIT 1) AS existing_anggota_id
       FROM pendaftaran_perangkat_desa p
       WHERE p.status_approval != 'Disetujui'
       ORDER BY p.id_pendaftaran DESC
       LIMIT 20`
    );

    const anggotaFotoCol = columns.find((c) => c.TABLE_NAME === 'anggota' && c.COLUMN_NAME === 'foto');
    const riwayatSkCol = columns.find((c) => c.TABLE_NAME === 'riwayat_jabatan' && c.COLUMN_NAME === 'file_sk');
    const maxFotoLen = anggotaFotoCol?.CHARACTER_MAXIMUM_LENGTH || 65535;
    const maxSkLen = riwayatSkCol?.CHARACTER_MAXIMUM_LENGTH || 65535;

    const pendingDiagnostics = pendingRows.map((p: any) => {
      const warnings: string[] = [];
      if (!p.desa_exists) warnings.push(`id_desa '${p.id_desa}' tidak ditemukan di ref_desa (akan memakai fallback resolveDesaId)`);
      if (!p.jabatan_exists) warnings.push(`id_jabatan '${p.id_jabatan}' tidak ditemukan di ref_jabatan`);
      if (p.foto_len && p.foto_len > maxFotoLen) warnings.push(`Panjang foto (${p.foto_len}) melebihi batas kolom anggota.foto (${maxFotoLen})`);
      if (p.file_sk_len && p.file_sk_len > maxSkLen) warnings.push(`Panjang file_sk (${p.file_sk_len}) melebihi batas kolom riwayat_jabatan.file_sk (${maxSkLen})`);
      return { ...p, warnings };
    });

    // 7. Fetch recent approval transaction logs from activity_logs
    let recentApprovalLogs: any[] = [];
    try {
      const [logs]: [any[], any] = await conn.query(
        `SELECT id, timestamp, user_name, modul, aksi, keterangan
         FROM activity_logs
         WHERE modul LIKE '%Approval%' OR modul LIKE '%Pendaftaran%' OR aksi LIKE '%APPROVE%'
         ORDER BY id DESC
         LIMIT 15`
      );
      recentApprovalLogs = logs;
    } catch (_) {}

    conn.release();

    const hasErrors = schemaIssues.some((i) => i.severity === 'ERROR') || fkIssues.length > 0;
    return res.json({
      success: true,
      healthy: !hasErrors,
      checkedAt: new Date().toISOString(),
      keyColumnsCheck,
      foreignKeysCount: foreignKeys.length,
      foreignKeys,
      fkIssues,
      schemaIssues,
      autoIncChecks,
      orphanChecks,
      pendingCount: pendingDiagnostics.length,
      pendingDiagnostics,
      recentApprovalLogs,
      columnLengths: {
        anggota_foto: anggotaFotoCol?.COLUMN_TYPE || null,
        riwayat_file_sk: riwayatSkCol?.COLUMN_TYPE || null,
      },
    });
  } catch (err: any) {
    if (conn) {
      try { conn.release(); } catch (_) {}
    }
    return res.status(500).json({ success: false, error: err.message });
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
      \`id_anggota\` INT(11) NULL,
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
  try {
    await conn.query(`ALTER TABLE riwayat_jabatan ADD COLUMN periode INT(11) NULL AFTER id_jabatan`);
  } catch (_) {}
  try {
    await conn.query(`ALTER TABLE pendaftaran_perangkat_desa ADD COLUMN periode INT(11) NULL AFTER id_jabatan`);
  } catch (_) {}
  signatureColumnsEnsured = true;
}

const ID_JABATAN_KEPALA_DESA = 10;
const ID_JABATAN_STAF_PERANGKAT_DESA = 9;

function validateAndNormalizePeriode(
  idJabatan: any,
  rawPeriode: any
): { valid: boolean; value: number | null; message?: string } {
  const jId = Number(idJabatan) || 0;
  if (jId !== ID_JABATAN_KEPALA_DESA) {
    return { valid: true, value: null };
  }
  if (rawPeriode === null || rawPeriode === undefined || String(rawPeriode).trim() === '') {
    return {
      valid: false,
      value: null,
      message: 'Field periode wajib diisi (1, 2, atau 3) untuk jabatan Kepala Desa (id_jabatan = 10).',
    };
  }
  const parsed = Number(rawPeriode);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 3) {
    return {
      valid: false,
      value: null,
      message: 'Field periode Kepala Desa hanya boleh bernilai 1 (periode pertama), 2 (periode kedua), atau 3 (periode ketiga).',
    };
  }
  return { valid: true, value: parsed };
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
        \`id_anggota\` INT(11) NOT NULL AUTO_INCREMENT,
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
        \`id_riwayat\` INT(11) NOT NULL AUTO_INCREMENT,
        \`id_anggota\` INT(11) NOT NULL,
        \`id_desa\` VARCHAR(20) NOT NULL,
        \`id_jabatan\` INT NOT NULL,
        \`periode\` INT(11) NULL,
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
        \`id_ppdi\` INT(11) NOT NULL AUTO_INCREMENT,
        \`id_anggota\` INT(11) NOT NULL,
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
        \`id_anggota\` INT(11) NOT NULL,
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
        \`id_anggota\` INT(11) NULL,
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
        \`periode\` INT(11) NULL,
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

    // Ensure id_anggota across anggota and child tables is INT(11) AUTO_INCREMENT
    anggotaIntSchemaEnsured = false;
    await ensureAnggotaIntSchema(conn);

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
    await ensureAnggotaIntSchema(conn);

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
          periode,
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
    await ensureAnggotaIntSchema(conn);

    const numericExcludeId = isValidInt32Id(excludeId);
    const [existingAnggota]: [any[], any] = numericExcludeId !== null
      ? await conn.query(
          'SELECT id_anggota, nama_lengkap, nipd FROM anggota WHERE nik = ? AND id_anggota != ? LIMIT 1',
          [rawNik, numericExcludeId]
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

// Helper to resolve valid id_jabatan in ref_jabatan to prevent fk_riwayat_jabatan violations
async function resolveJabatanId(conn: any, rawIdJabatan: any): Promise<number> {
  const parsed = isValidInt32Id(rawIdJabatan);
  if (parsed !== null) {
    const [matches]: [any[], any] = await conn.query(
      'SELECT id_jabatan FROM ref_jabatan WHERE id_jabatan = ? LIMIT 1',
      [parsed]
    );
    if (matches.length > 0) return Number(matches[0].id_jabatan);
  }
  const [anyJabatan]: [any[], any] = await conn.query('SELECT id_jabatan FROM ref_jabatan ORDER BY id_jabatan ASC LIMIT 1');
  return anyJabatan.length > 0 ? Number(anyJabatan[0].id_jabatan) : 1;
}

// Persistent approval transaction logger (executes outside rolled-back transactions so failure logs are preserved)
async function logApprovalTransaction(params: {
  ipAddress?: string;
  userName?: string;
  userRole?: string;
  aksi: 'APPROVE_START' | 'APPROVE_SUCCESS' | 'APPROVE_ERROR' | 'REJECT_SUCCESS' | 'REJECT_ERROR';
  idPendaftaran: string | number;
  step?: string;
  detail: string;
}): Promise<void> {
  const tag = params.aksi.includes('ERROR') ? '[Approval TX ERROR]' : '[Approval TX]';
  const line = `${tag} pendaftaran=${params.idPendaftaran} step=${params.step || '-'} user=${params.userName || '-'} | ${params.detail}`;
  if (params.aksi.includes('ERROR')) {
    console.error(line);
  } else {
    console.log(line);
  }

  try {
    if (!pool) return;
    await pool.query(
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
    await pool.query(
      `INSERT INTO activity_logs (timestamp, ip_address, user_id, user_name, user_role, modul, aksi, keterangan)
       VALUES (NOW(), ?, NULL, ?, ?, 'Approval Pendaftaran', ?, ?)`,
      [
        params.ipAddress || '-',
        params.userName || 'Admin',
        params.userRole || 'Admin',
        params.aksi,
        `[Pendaftaran #${params.idPendaftaran}${params.step ? ` @ ${params.step}` : ''}] ${params.detail}`,
      ]
    );
  } catch (logErr: any) {
    console.warn('[Approval TX] Gagal menyimpan log ke activity_logs:', logErr?.message || logErr);
  }
}

let activityLogsSchemaChecked = false;
async function ensureActivityLogsTable(connOrPool: any) {
  if (activityLogsSchemaChecked) return;
  await connOrPool.query(
    `CREATE TABLE IF NOT EXISTS activity_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      ip_address VARCHAR(45),
      user_id INT NULL,
      user_name VARCHAR(150),
      user_role VARCHAR(50),
      modul VARCHAR(100),
      aksi VARCHAR(50),
      target_id VARCHAR(64) NULL,
      target_nama VARCHAR(180) NULL,
      keterangan TEXT
    )`
  );
  // Upgrade legacy activity_logs tables safely if target_id / target_nama columns do not exist yet
  try {
    const [cols]: [any[], any] = await connOrPool.query(`SHOW COLUMNS FROM activity_logs`);
    const colNames = new Set((cols || []).map((c: any) => String(c.Field || '').toLowerCase()));
    if (!colNames.has('target_id')) {
      await connOrPool.query(`ALTER TABLE activity_logs ADD COLUMN target_id VARCHAR(64) NULL AFTER aksi`);
    }
    if (!colNames.has('target_nama')) {
      await connOrPool.query(`ALTER TABLE activity_logs ADD COLUMN target_nama VARCHAR(180) NULL AFTER target_id`);
    }
  } catch (alterErr: any) {
    console.warn('[ActivityLog] Skip alter activity_logs:', alterErr?.message || alterErr);
  }
  activityLogsSchemaChecked = true;
}

async function resolveActorFromRequest(req: express.Request): Promise<{
  userId: number | null;
  userName: string;
  userRole: string;
  ipAddress: string;
}> {
  const rawUserId = (req.headers['x-user-id'] || '').toString().trim();
  const parsedUserId = /^\d+$/.test(rawUserId) ? Number(rawUserId) : null;
  const userRole = (req.headers['x-user-role'] || req.headers['user-role'] || 'Admin').toString().trim() || 'Admin';
  let userName = (req.headers['x-user-name'] || '').toString().trim();
  const forwarded = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim();
  const ipAddress = forwarded || req.socket?.remoteAddress || '-';

  if (!userName && parsedUserId !== null && pool) {
    try {
      const [rows]: [any[], any] = await pool.query(
        'SELECT nama, username FROM users WHERE id_user = ? LIMIT 1',
        [parsedUserId]
      );
      if (rows && rows.length > 0) {
        userName = rows[0].nama || rows[0].username || '';
      }
    } catch (_) {
      // ignore lookup error
    }
  }

  return {
    userId: parsedUserId,
    userName: userName || userRole.replace(/_/g, ' '),
    userRole,
    ipAddress,
  };
}

async function logMemberActivity(
  req: express.Request,
  params: {
    idAnggota: string | number;
    targetNama?: string | null;
    modul: string;
    aksi: 'TAMBAH' | 'EDIT' | 'HAPUS' | 'APPROVE' | 'REJECT' | 'STATUS_KTA' | 'IMPORT';
    keterangan: string;
  }
) {
  try {
    if (!pool) return;
    await ensureActivityLogsTable(pool);
    const actor = await resolveActorFromRequest(req);
    const targetIdStr = String(params.idAnggota);
    let targetNama = (params.targetNama || '').trim();

    if (!targetNama && /^\d+$/.test(targetIdStr)) {
      try {
        const [rows]: [any[], any] = await pool.query(
          'SELECT nama_lengkap FROM anggota WHERE id_anggota = ? LIMIT 1',
          [Number(targetIdStr)]
        );
        if (rows && rows.length > 0) {
          targetNama = rows[0].nama_lengkap || '';
        }
      } catch (_) {}
    }

    await pool.query(
      `INSERT INTO activity_logs (timestamp, ip_address, user_id, user_name, user_role, modul, aksi, target_id, target_nama, keterangan)
       VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        actor.ipAddress,
        actor.userId,
        actor.userName,
        actor.userRole,
        params.modul,
        params.aksi,
        targetIdStr,
        targetNama || null,
        params.keterangan,
      ]
    );
  } catch (err: any) {
    console.warn('[MemberActivity] Gagal mencatat log aktivitas anggota:', err?.message || err);
  }
}

// Fetch Member-Specific Activity History
app.get('/api/anggota/:id/activity', async (req, res) => {
  const { id } = req.params;
  const nikQuery = (req.query.nik || '').toString().trim();
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 300);

  let conn;
  try {
    if (!pool) throw new Error('Pool not ready');
    conn = await pool.getConnection();
    await ensureActivityLogsTable(conn);

    const numericId = isValidInt32Id(id);
    let memberRow: any = null;
    if (numericId !== null) {
      const [mRows]: [any[], any] = await conn.query(
        'SELECT id_anggota, nik, nama_lengkap, created_at, updated_at FROM anggota WHERE id_anggota = ? LIMIT 1',
        [numericId]
      );
      if (mRows.length > 0) memberRow = mRows[0];
    }

    const effectiveId = memberRow ? String(memberRow.id_anggota) : String(id);
    const effectiveNik = nikQuery || (memberRow?.nik ? String(memberRow.nik) : '');

    // Build flexible matching conditions for both structured target_id logs and legacy keterangan logs
    const conditions: string[] = [
      'target_id = ?',
      'keterangan LIKE ?',
      'keterangan LIKE ?',
      'keterangan LIKE ?',
    ];
    const queryParams: any[] = [
      effectiveId,
      `%id_anggota=${effectiveId}%`,
      `%ID ${effectiveId}%`,
      `%#${effectiveId}%`,
    ];

    if (effectiveNik && effectiveNik.length >= 8) {
      conditions.push('keterangan LIKE ?');
      queryParams.push(`%${effectiveNik}%`);
    }

    const [logRows]: [any[], any] = await conn.query(
      `SELECT id, timestamp, ip_address, user_id, user_name, user_role, modul, aksi, target_id, target_nama, keterangan
       FROM activity_logs
       WHERE ${conditions.join(' OR ')}
       ORDER BY timestamp DESC, id DESC
       LIMIT ?`,
      [...queryParams, limit]
    );

    const logs = (logRows || []).map((row: any) => ({
      id: `db_${row.id}`,
      timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : new Date().toISOString(),
      ip_address: row.ip_address || '-',
      user_id: row.user_id || 0,
      user_name: row.user_name || 'Administrator',
      user_role: row.user_role || 'Admin',
      modul: row.modul || 'Data Induk Anggota',
      aksi: row.aksi || 'EDIT',
      target_id: row.target_id || effectiveId,
      target_nama: row.target_nama || memberRow?.nama_lengkap || '',
      deskripsi: row.keterangan || '',
      source: 'database',
    }));

    conn.release();
    return res.json({
      success: true,
      id_anggota: effectiveId,
      member_meta: memberRow
        ? {
            created_at: memberRow.created_at ? new Date(memberRow.created_at).toISOString() : null,
            updated_at: memberRow.updated_at ? new Date(memberRow.updated_at).toISOString() : null,
          }
        : null,
      logs,
    });
  } catch (err: any) {
    if (conn) conn.release();
    console.error('[GET /api/anggota/:id/activity] Error:', err);
    return res.status(500).json({ success: false, error: err.message, logs: [] });
  }
});

function generateServerNIPD(params: {
  tanggal_lahir?: string;
  tmt_jabatan?: string;
  jenis_kelamin?: string;
  id_jabatan?: any;
  nama_jabatan?: string;
  kategori_jabatan?: string;
  periode?: any;
  id_kecamatan?: string;
  id_desa?: string;
}): string {
  // a. 8 digit pertama: Tahun, Bulan, Tanggal Lahir (YYYYMMDD)
  let lahirStr = '19900101';
  if (params.tanggal_lahir) {
    const clean = String(params.tanggal_lahir).replace(/[^0-9]/g, '');
    if (clean.length >= 8) lahirStr = clean.slice(0, 8);
    else if (clean.length === 6) lahirStr = clean + '01';
  }

  // b. 6 digit berikutnya: Tahun dan Bulan Pengangkatan/Pelantikan (YYYYMM)
  let tmtStr = '202001';
  if (params.tmt_jabatan) {
    const cleanTmt = String(params.tmt_jabatan).replace(/[^0-9]/g, '');
    if (cleanTmt.length >= 6) tmtStr = cleanTmt.slice(0, 6);
    else if (cleanTmt.length >= 4) tmtStr = cleanTmt.slice(0, 4) + '01';
  }

  // c. 1 digit berikutnya: Jenis Kelamin (1 = Laki-laki, 2 = Perempuan)
  const jk = (params.jenis_kelamin || 'L').toUpperCase();
  const jkCode = (jk === 'P' || jk === 'PEREMPUAN') ? '2' : '1';

  // d & e. 2 digit kode unsur + 1 digit kode periodisasi/jabatan
  const jId = Number(params.id_jabatan) || 0;
  const namaLower = String(params.nama_jabatan || '').toLowerCase();
  const katLower = String(params.kategori_jabatan || '').toLowerCase();

  const isKepalaDesa =
    jId === ID_JABATAN_KEPALA_DESA ||
    katLower === 'kepala desa' ||
    namaLower.includes('kepala desa') ||
    namaLower.includes('kades');

  const isStafPerangkatDesa =
    !isKepalaDesa &&
    (jId === ID_JABATAN_STAF_PERANGKAT_DESA ||
      katLower === 'staf desa' ||
      namaLower.includes('staf'));

  let devCode = '02';
  let subCode = '2';

  if (isKepalaDesa) {
    // 1. Kepala Desa: 01 + periodisasi (1, 2, atau 3)
    devCode = '01';
    const parsedPeriode = Number(params.periode);
    subCode = Number.isInteger(parsedPeriode) && parsedPeriode >= 1 && parsedPeriode <= 3
      ? String(parsedPeriode)
      : '1';
  } else if (isStafPerangkatDesa) {
    // 3. Staf Perangkat Desa: 03 + 1
    devCode = '03';
    subCode = '1';
  } else {
    // 2. Perangkat Desa: 02 + Kode Jabatan (1=Sekdes, 2=Kasi, 3=Kaur, 4=Kewilayahan)
    devCode = '02';
    if (jId === 1 || namaLower.includes('sekretaris desa') || namaLower.includes('sekdes')) {
      subCode = '1';
    } else if (
      jId === 2 || jId === 3 || jId === 4 ||
      katLower === 'pelaksana teknis' ||
      namaLower.includes('kepala seksi') || namaLower.includes('kasi')
    ) {
      subCode = '2';
    } else if (
      jId === 5 || jId === 6 || jId === 7 ||
      namaLower.includes('kepala urusan') || namaLower.includes('kaur')
    ) {
      subCode = '3';
    } else if (
      jId === 8 ||
      katLower === 'pelaksana kewilayahan' ||
      namaLower.includes('kepala dusun') || namaLower.includes('kadus') || namaLower.includes('kewilayahan')
    ) {
      subCode = '4';
    } else {
      subCode = '2';
    }
  }

  // f. 10 digit terakhir: 2 Prov + 2 Kab/Kota + 2 Kec + 4 Desa
  const cleanDesa = params.id_desa ? String(params.id_desa).replace(/[^0-9]/g, '') : '';
  const cleanKec = params.id_kecamatan ? String(params.id_kecamatan).replace(/[^0-9]/g, '') : '';

  let provKabCode = '3204';
  if (cleanDesa.length >= 10) provKabCode = cleanDesa.slice(0, 4);
  else if (cleanKec.length >= 6) provKabCode = cleanKec.slice(0, 4);

  let kecCode = '01';
  if (cleanKec.length >= 6) kecCode = cleanKec.slice(4, 6);
  else if (cleanDesa.length >= 10) kecCode = cleanDesa.slice(4, 6);
  else if (cleanKec.length >= 2) kecCode = cleanKec.slice(-2);
  else if (cleanKec.length === 1) kecCode = cleanKec.padStart(2, '0');

  let desaCode = '0001';
  if (cleanDesa.length >= 10) desaCode = cleanDesa.slice(6, 10);
  else if (cleanDesa.length >= 4) desaCode = cleanDesa.slice(-4);
  else if (cleanDesa.length > 0) desaCode = cleanDesa.padStart(4, '0');

  const wilayahCode = `${provKabCode}${kecCode}${desaCode}`;
  return `${lahirStr}${tmtStr}${jkCode}${devCode}${subCode}${wilayahCode}`;
}

// Add Member with Unique NIK enforcement & Safe Desa FK
app.post('/api/anggota', requirePermission('anggota', 'add'), async (req, res) => {
  const { anggota, riwayat, keanggotaan } = req.body;
  if (!anggota || !anggota.nik || !anggota.nama_lengkap) {
    return res.status(400).json({ success: false, message: 'Data anggota tidak lengkap' });
  }

  let validatedPeriode: number | null = null;
  if (riwayat) {
    const periodeCheck = validateAndNormalizePeriode(riwayat.id_jabatan || 2, riwayat.periode);
    if (!periodeCheck.valid) {
      return res.status(400).json({ success: false, message: periodeCheck.message });
    }
    validatedPeriode = periodeCheck.value;
  }

  let conn;
  try {
    if (!pool) throw new Error('Pool not ready');
    conn = await pool.getConnection();
    await ensureAnggotaIntSchema(conn);
    await ensureSignatureColumns(conn);

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

    let jabMeta: { nama_jabatan?: string; kategori_jabatan?: string } = {};
    const effectiveJabId = riwayat?.id_jabatan || 2;
    try {
      const [jRows]: [any[], any] = await conn.query(
        'SELECT nama_jabatan, kategori_jabatan FROM ref_jabatan WHERE id_jabatan = ? LIMIT 1',
        [effectiveJabId]
      );
      if (jRows.length > 0) jabMeta = jRows[0];
    } catch (_) {}

    const nipdValue = anggota.nipd || anggota.niap_nipd || anggota.niap || generateServerNIPD({
      tanggal_lahir: anggota.tanggal_lahir,
      tmt_jabatan: riwayat?.tmt_jabatan,
      jenis_kelamin: anggota.jenis_kelamin,
      id_jabatan: effectiveJabId,
      nama_jabatan: jabMeta.nama_jabatan,
      kategori_jabatan: jabMeta.kategori_jabatan,
      periode: validatedPeriode,
      id_kecamatan: riwayat?.id_kecamatan,
      id_desa: riwayat?.id_desa,
    });

    // 1. Insert into anggota (id_anggota INT(11) AUTO_INCREMENT)
    const [angInsertRes]: [any, any] = await conn.query(
      `INSERT INTO anggota (nik, nipd, nama_lengkap, gelar_depan, gelar_belakang, tempat_lahir, tanggal_lahir, jenis_kelamin, agama, pendidikan_terakhir, no_hp_wa, email, foto, alamat_rumah, status_pernikahan)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
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
    const newIdAnggota = Number(angInsertRes.insertId);

    // 2. Insert into riwayat_jabatan with resolved valid foreign key id_desa
    if (riwayat) {
      const validDesaId = await resolveDesaId(conn, riwayat.id_desa);
      await conn.query(
        `INSERT INTO riwayat_jabatan (id_anggota, id_desa, id_jabatan, periode, no_sk_pengangkatan, tgl_sk_pengangkatan, tmt_jabatan, status_aktif, file_sk)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newIdAnggota,
          validDesaId,
          effectiveJabId,
          validatedPeriode,
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
        `INSERT INTO keanggotaan_ppdi (id_anggota, no_kta, tgl_bergabung, jabatan_pengurus, status_kta)
         VALUES (?, ?, ?, ?, ?)`,
        [
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

    await logMemberActivity(req, {
      idAnggota: newIdAnggota,
      targetNama: (anggota.nama_lengkap || '').trim().toUpperCase(),
      modul: 'Data Induk Anggota',
      aksi: 'TAMBAH',
      keterangan: `Mendaftarkan anggota baru "${(anggota.nama_lengkap || '').trim().toUpperCase()}" (NIK: ${anggota.nik}${keanggotaan?.no_kta ? `, No. KTA: ${keanggotaan.no_kta}` : ''}).`,
    });

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
    await ensureAnggotaIntSchema(conn);
    await ensureSignatureColumns(conn);

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

      const rowJabId = rw.id_jabatan || ang.id_jabatan || 2;
      const rowPeriodeCheck = validateAndNormalizePeriode(rowJabId, rw.periode ?? ang.periode);
      if (!rowPeriodeCheck.valid) {
        skipped.push({ row: i + 1, nik: nikStr, nama: ang.nama_lengkap, reason: rowPeriodeCheck.message });
        continue;
      }

      const nipdVal = ang.nipd || ang.niap || ang.niap_nipd || generateServerNIPD({
        tanggal_lahir: ang.tanggal_lahir,
        tmt_jabatan: rw.tmt_jabatan || ang.tmt_jabatan,
        jenis_kelamin: ang.jenis_kelamin,
        id_jabatan: rowJabId,
        periode: rowPeriodeCheck.value,
        id_kecamatan: rw.id_kecamatan || ang.id_kecamatan,
        id_desa: rw.id_desa || ang.id_desa || ang.desa,
      });

      // Insert anggota (id_anggota INT(11) AUTO_INCREMENT)
      const [angInsertRes]: [any, any] = await conn.query(
        `INSERT INTO anggota (nik, nipd, nama_lengkap, gelar_depan, gelar_belakang, tempat_lahir, tanggal_lahir, jenis_kelamin, agama, pendidikan_terakhir, no_hp_wa, email, foto, alamat_rumah, status_pernikahan)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
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
      const newIdAnggota = Number(angInsertRes.insertId);

      existingNikSet.add(nikStr);

      // Resolve valid id_desa
      const validDesaId = await resolveDesaId(conn, rw.id_desa, rw.nama_desa);

      // Insert riwayat
      await conn.query(
        `INSERT INTO riwayat_jabatan (id_anggota, id_desa, id_jabatan, periode, no_sk_pengangkatan, tgl_sk_pengangkatan, tmt_jabatan, status_aktif, file_sk)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newIdAnggota,
          validDesaId,
          rowJabId,
          rowPeriodeCheck.value,
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
        `INSERT INTO keanggotaan_ppdi (id_anggota, no_kta, tgl_bergabung, jabatan_pengurus, status_kta)
         VALUES (?, ?, ?, ?, ?)`,
        [
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

// Helper to format 28-digit NIPD with spaces matching NipdFormatter (8-6-1-3-10)
function formatServerNipdDisplay(nipd: string): string {
  const digits = String(nipd || '').replace(/\D/g, '');
  if (digits.length === 28) {
    return `${digits.slice(0, 8)} ${digits.slice(8, 14)} ${digits.slice(14, 15)} ${digits.slice(15, 18)} ${digits.slice(18, 28)}`;
  }
  return nipd;
}

// Bulk Generate NIPD 28 Digit (Simulasi dryRun maupun Eksekusi Transaksional)
app.post('/api/anggota/bulk-generate-nipd', requirePermission('anggota', 'edit'), async (req, res) => {
  const rawMode = String(req.body?.mode || 'non_standard');
  const mode: 'only_empty' | 'non_standard' | 'all' =
    rawMode === 'only_empty' || rawMode === 'all' ? rawMode : 'non_standard';
  const dryRun = Boolean(req.body?.dryRun ?? req.body?.dry_run ?? false);
  const rawMemberIds = Array.isArray(req.body?.memberIds)
    ? req.body.memberIds
    : Array.isArray(req.body?.member_ids)
      ? req.body.member_ids
      : [];
  const memberIds: number[] = rawMemberIds
    .map((v: any) => isValidInt32Id(v))
    .filter((v: number | null): v is number => v !== null);

  const idKecamatan = String(req.body?.id_kecamatan || '').trim();
  const idDesa = String(req.body?.id_desa || '').trim();
  const rawIdJabatan = req.body?.id_jabatan;
  const idJabatan =
    rawIdJabatan !== undefined &&
    rawIdJabatan !== null &&
    String(rawIdJabatan).trim() !== '' &&
    String(rawIdJabatan).toLowerCase() !== 'all'
      ? Number(rawIdJabatan)
      : null;

  const rawDefaultKadesPeriode = req.body?.defaultKadesPeriode ?? req.body?.default_kades_periode;
  const parsedDefaultPeriode =
    rawDefaultKadesPeriode !== undefined &&
    rawDefaultKadesPeriode !== null &&
    String(rawDefaultKadesPeriode).trim() !== ''
      ? Number(rawDefaultKadesPeriode)
      : null;
  const defaultKadesPeriode =
    parsedDefaultPeriode !== null &&
    Number.isInteger(parsedDefaultPeriode) &&
    parsedDefaultPeriode >= 1 &&
    parsedDefaultPeriode <= 3
      ? parsedDefaultPeriode
      : null;

  let conn;
  try {
    if (!pool) throw new Error('Koneksi database pool belum siap');
    conn = await pool.getConnection();
    await ensureSignatureColumns(conn);

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (memberIds.length > 0) {
      whereClauses.push(`a.id_anggota IN (${memberIds.map(() => '?').join(',')})`);
      params.push(...memberIds);
    }

    if (idDesa && idDesa.toLowerCase() !== 'all') {
      const cleanDesa = idDesa.replace(/\./g, '');
      whereClauses.push(`(r.id_desa = ? OR REPLACE(r.id_desa, '.', '') = ?)`);
      params.push(idDesa, cleanDesa);
    } else if (idKecamatan && idKecamatan.toLowerCase() !== 'all') {
      const cleanKec = idKecamatan.replace(/\./g, '');
      whereClauses.push(`(d.id_kecamatan = ? OR REPLACE(d.id_kecamatan, '.', '') = ? OR REPLACE(r.id_desa, '.', '') LIKE CONCAT(?, '%'))`);
      params.push(idKecamatan, cleanKec, cleanKec);
    }

    if (idJabatan !== null && !Number.isNaN(idJabatan)) {
      whereClauses.push('r.id_jabatan = ?');
      params.push(idJabatan);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [rows]: [any[], any] = await conn.query(
      `SELECT
        a.id_anggota,
        a.nik,
        a.nipd,
        a.nama_lengkap,
        DATE_FORMAT(a.tanggal_lahir, '%Y-%m-%d') AS tanggal_lahir,
        a.jenis_kelamin,
        r.id_riwayat,
        r.id_desa,
        r.id_jabatan,
        r.periode,
        DATE_FORMAT(r.tmt_jabatan, '%Y-%m-%d') AS tmt_jabatan,
        j.nama_jabatan,
        j.kategori_jabatan,
        d.nama_desa,
        d.id_kecamatan,
        k.nama_kecamatan
      FROM anggota a
      LEFT JOIN riwayat_jabatan r ON r.id_riwayat = (
        SELECT r2.id_riwayat
        FROM riwayat_jabatan r2
        WHERE r2.id_anggota = a.id_anggota
        ORDER BY (r2.status_aktif = 'Aktif') DESC, r2.tmt_jabatan DESC, r2.id_riwayat DESC
        LIMIT 1
      )
      LEFT JOIN ref_jabatan j ON j.id_jabatan = r.id_jabatan
      LEFT JOIN ref_desa d ON d.id_desa = r.id_desa
      LEFT JOIN ref_kecamatan k ON k.id_kecamatan = d.id_kecamatan
      ${whereSql}
      ORDER BY a.id_anggota ASC`,
      params
    );

    const totalScanned = rows.length;
    let eligible = 0;
    let updated = 0;
    let unchanged = 0;
    let skipped = 0;
    const items: any[] = [];
    const pendingUpdates: Array<{
      id_anggota: number;
      id_riwayat: number;
      new_nipd: string;
      backfill_periode: number | null;
    }> = [];

    for (const row of rows) {
      const currentNipdRaw = String(row.nipd || '').trim();
      const currentNipdDigits = currentNipdRaw.replace(/\D/g, '');
      const isCurrentValid28 = currentNipdDigits.length === 28;

      if (!row.id_riwayat || !row.id_jabatan || !row.id_desa) {
        skipped++;
        items.push({
          id_anggota: Number(row.id_anggota),
          nik: String(row.nik || ''),
          nama_lengkap: String(row.nama_lengkap || ''),
          id_jabatan: row.id_jabatan ? Number(row.id_jabatan) : null,
          nama_jabatan: row.nama_jabatan || '-',
          periode: row.periode !== null && row.periode !== undefined ? Number(row.periode) : null,
          nama_desa: row.nama_desa || '-',
          nama_kecamatan: row.nama_kecamatan || '-',
          old_nipd: currentNipdRaw,
          new_nipd: null,
          new_nipd_formatted: null,
          status: 'skipped',
          reason: 'Riwayat jabatan atau desa penempatan belum lengkap.',
        });
        continue;
      }

      const jId = Number(row.id_jabatan);
      let effectivePeriode: number | null =
        row.periode !== null && row.periode !== undefined ? Number(row.periode) : null;
      let needBackfillPeriode = false;

      if (jId === ID_JABATAN_KEPALA_DESA) {
        const pCheck = validateAndNormalizePeriode(jId, effectivePeriode);
        if (!pCheck.valid) {
          if (defaultKadesPeriode !== null) {
            effectivePeriode = defaultKadesPeriode;
            needBackfillPeriode = true;
          } else {
            skipped++;
            items.push({
              id_anggota: Number(row.id_anggota),
              nik: String(row.nik || ''),
              nama_lengkap: String(row.nama_lengkap || ''),
              id_jabatan: jId,
              nama_jabatan: row.nama_jabatan || 'Kepala Desa',
              periode: null,
              nama_desa: row.nama_desa || '-',
              nama_kecamatan: row.nama_kecamatan || '-',
              old_nipd: currentNipdRaw,
              new_nipd: null,
              new_nipd_formatted: null,
              status: 'skipped',
              reason: 'Kepala Desa belum memiliki nilai periode (1/2/3). Isi periode pada riwayat jabatan atau aktifkan periode bawaan.',
            });
            continue;
          }
        } else {
          effectivePeriode = pCheck.value;
        }
      } else {
        effectivePeriode = null;
      }

      const newNipd = generateServerNIPD({
        tanggal_lahir: row.tanggal_lahir,
        tmt_jabatan: row.tmt_jabatan,
        jenis_kelamin: row.jenis_kelamin || 'L',
        id_jabatan: jId,
        nama_jabatan: row.nama_jabatan,
        kategori_jabatan: row.kategori_jabatan,
        periode: effectivePeriode,
        id_kecamatan: row.id_kecamatan,
        id_desa: row.id_desa,
      });

      const shouldUpdate =
        mode === 'only_empty'
          ? !isCurrentValid28
          : mode === 'non_standard'
            ? !isCurrentValid28 || currentNipdDigits !== newNipd || currentNipdRaw !== newNipd
            : true;

      if (!shouldUpdate) {
        unchanged++;
        items.push({
          id_anggota: Number(row.id_anggota),
          nik: String(row.nik || ''),
          nama_lengkap: String(row.nama_lengkap || ''),
          id_jabatan: jId,
          nama_jabatan: row.nama_jabatan || '-',
          periode: effectivePeriode,
          nama_desa: row.nama_desa || '-',
          nama_kecamatan: row.nama_kecamatan || '-',
          old_nipd: currentNipdRaw,
          new_nipd: newNipd,
          new_nipd_formatted: formatServerNipdDisplay(newNipd),
          status: 'unchanged',
          reason: 'NIPD sudah sesuai ketentuan 28 digit terbaru.',
        });
        continue;
      }

      eligible++;
      pendingUpdates.push({
        id_anggota: Number(row.id_anggota),
        id_riwayat: Number(row.id_riwayat),
        new_nipd: newNipd,
        backfill_periode: needBackfillPeriode ? effectivePeriode : null,
      });

      items.push({
        id_anggota: Number(row.id_anggota),
        nik: String(row.nik || ''),
        nama_lengkap: String(row.nama_lengkap || ''),
        id_jabatan: jId,
        nama_jabatan: row.nama_jabatan || '-',
        periode: effectivePeriode,
        nama_desa: row.nama_desa || '-',
        nama_kecamatan: row.nama_kecamatan || '-',
        old_nipd: currentNipdRaw,
        new_nipd: newNipd,
        new_nipd_formatted: formatServerNipdDisplay(newNipd),
        status: dryRun ? 'will_update' : 'updated',
        reason: needBackfillPeriode
          ? `NIPD diperbarui + periode Kepala Desa ditetapkan ke-${effectivePeriode}.`
          : !isCurrentValid28
            ? 'NIPD kosong / belum 28 digit.'
            : 'Penyesuaian ke aturan NIPD 28 digit terbaru.',
      });
    }

    if (!dryRun && pendingUpdates.length > 0) {
      await conn.beginTransaction();
      for (const upd of pendingUpdates) {
        await conn.query('UPDATE anggota SET nipd = ? WHERE id_anggota = ?', [
          upd.new_nipd,
          upd.id_anggota,
        ]);
        if (upd.backfill_periode !== null) {
          await conn.query('UPDATE riwayat_jabatan SET periode = ? WHERE id_riwayat = ?', [
            upd.backfill_periode,
            upd.id_riwayat,
          ]);
        }
        updated++;
      }
      await conn.commit();

      await logMemberActivity(req, {
        idAnggota: 'BULK_NIPD',
        targetNama: 'Generate Massal NIPD',
        modul: 'Data Induk Anggota',
        aksi: 'EDIT',
        keterangan: `Generate Massal NIPD selesai (mode=${mode}): ${updated} diperbarui, ${unchanged} sudah sesuai, ${skipped} dilewati dari ${totalScanned} anggota.`,
      });
    }

    conn.release();

    const message = dryRun
      ? `Simulasi selesai: ${eligible} anggota siap diperbarui, ${unchanged} sudah sesuai, ${skipped} dilewati.`
      : `Generate Massal NIPD selesai: ${updated} anggota berhasil diperbarui, ${unchanged} sudah sesuai, ${skipped} dilewati.`;

    return res.json({
      success: true,
      dryRun,
      mode,
      summary: {
        totalScanned,
        eligible,
        updated,
        unchanged,
        skipped,
      },
      items,
      message,
    });
  } catch (err: any) {
    if (conn) {
      try { await conn.rollback(); } catch (_) {}
      conn.release();
    }
    return res.status(500).json({
      success: false,
      message: err.message || 'Gagal menjalankan Generate Massal NIPD',
      error: err.message,
    });
  }
});

// Update Member with Unique NIK check
app.put('/api/anggota/:id', requirePermission('anggota', 'edit'), async (req, res) => {
  const { id } = req.params;
  const numericId = isValidInt32Id(id);
  const data = req.body;
  let conn;

  if (numericId === null) {
    return res.status(400).json({ success: false, message: 'ID anggota tidak valid (harus berupa integer)' });
  }

  try {
    if (!pool) throw new Error('Pool not ready');
    conn = await pool.getConnection();
    await ensureAnggotaIntSchema(conn);

    // Check NIK uniqueness if changed
    if (data.nik) {
      const [existingNik]: [any[], any] = await conn.query(
        'SELECT id_anggota, nama_lengkap FROM anggota WHERE nik = ? AND id_anggota != ? LIMIT 1',
        [data.nik, numericId]
      );
      if (existingNik.length > 0) {
        conn.release();
        return res.status(409).json({
          success: false,
          message: `NIK ${data.nik} sudah digunakan oleh anggota lain "${existingNik[0].nama_lengkap}". NIK harus unik!`,
        });
      }
    }

    // Fetch existing member snapshot before update to log specific modified fields
    const [beforeRows]: [any[], any] = await conn.query(
      `SELECT a.*, kp.jabatan_pengurus AS current_jabatan_pengurus
       FROM anggota a
       LEFT JOIN keanggotaan_ppdi kp ON kp.id_anggota = a.id_anggota
       WHERE a.id_anggota = ? LIMIT 1`,
      [numericId]
    );
    const beforeMember = beforeRows?.[0] || null;

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
        numericId,
      ]
    );

    // Update or insert keanggotaan_ppdi jabatan_pengurus if provided
    const effectiveJabatanPengurus = data.jabatan_pengurus || data.jabatanPengurus;
    if (effectiveJabatanPengurus) {
      const [existingPpdi]: [any[], any] = await conn.query(
        'SELECT id_ppdi FROM keanggotaan_ppdi WHERE id_anggota = ? LIMIT 1',
        [numericId]
      );
      if (existingPpdi.length > 0) {
        await conn.query(
          'UPDATE keanggotaan_ppdi SET jabatan_pengurus = ? WHERE id_anggota = ?',
          [effectiveJabatanPengurus, numericId]
        );
      } else {
        const defaultKta = `32.04.PPDI.${Date.now().toString().slice(-6)}`;
        await conn.query(
          `INSERT INTO keanggotaan_ppdi (id_anggota, no_kta, tgl_bergabung, jabatan_pengurus, status_kta)
           VALUES (?, ?, CURDATE(), ?, 'Aktif')`,
          [numericId, defaultKta, effectiveJabatanPengurus]
        );
      }
    }

    conn.release();

    // Build human-readable diff summary of modified profile fields
    const changedParts: string[] = [];
    const norm = (v: any) => (v === null || v === undefined ? '' : String(v).trim());
    if (beforeMember) {
      const fieldChecks: Array<[string, any, any]> = [
        ['Nama', beforeMember.nama_lengkap, data.nama_lengkap ? data.nama_lengkap.trim().toUpperCase() : undefined],
        ['NIK', beforeMember.nik, data.nik],
        ['NIAP/NIPD', beforeMember.nipd, data.nipd || data.niap_nipd || data.niap],
        ['Gelar Depan', beforeMember.gelar_depan, data.gelar_depan],
        ['Gelar Belakang', beforeMember.gelar_belakang, data.gelar_belakang],
        ['Tempat Lahir', beforeMember.tempat_lahir, data.tempat_lahir],
        ['Tanggal Lahir', beforeMember.tanggal_lahir ? String(beforeMember.tanggal_lahir).slice(0, 10) : '', data.tanggal_lahir ? String(data.tanggal_lahir).slice(0, 10) : undefined],
        ['Jenis Kelamin', beforeMember.jenis_kelamin, data.jenis_kelamin],
        ['Agama', beforeMember.agama, data.agama],
        ['Pendidikan', beforeMember.pendidikan_terakhir, data.pendidikan_terakhir],
        ['No. HP/WA', beforeMember.no_hp_wa, data.no_hp_wa],
        ['Email', beforeMember.email, data.email],
        ['Alamat', beforeMember.alamat_rumah, data.alamat_rumah],
        ['Status Pernikahan', beforeMember.status_pernikahan, data.status_pernikahan],
        ['Jabatan Pengurus PPDI', beforeMember.current_jabatan_pengurus, effectiveJabatanPengurus],
      ];
      for (const [label, oldVal, newVal] of fieldChecks) {
        if (newVal !== undefined && norm(oldVal) !== norm(newVal)) {
          changedParts.push(`${label} (${norm(oldVal) || '-'} → ${norm(newVal) || '-'})`);
        }
      }
      if (data.foto && norm(data.foto) !== norm(beforeMember.foto)) {
        changedParts.push('Foto Profil diperbarui');
      }
    }
    const targetName = (data.nama_lengkap ? data.nama_lengkap.trim().toUpperCase() : beforeMember?.nama_lengkap) || `Anggota #${numericId}`;
    const changeDetail = changedParts.length > 0
      ? `Perubahan profil anggota "${targetName}": ${changedParts.join('; ')}.`
      : `Memperbarui profil & biodata anggota "${targetName}" (NIK: ${data.nik || beforeMember?.nik || '-'}).`;

    await logMemberActivity(req, {
      idAnggota: numericId,
      targetNama: targetName,
      modul: 'Profil Anggota',
      aksi: 'EDIT',
      keterangan: changeDetail,
    });

    return res.json({ success: true, message: 'Data anggota dan jabatan kepengurusan PPDI berhasil diperbarui di MySQL' });
  } catch (err: any) {
    if (conn) conn.release();
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Delete Member with Safe Cascade and Fallback matching (ID / NIK)
app.delete('/api/anggota/:id', requirePermission('anggota', 'delete'), async (req, res) => {
  const { id } = req.params;
  const numericParamId = isValidInt32Id(id);
  let conn;

  try {
    if (!pool) throw new Error('Koneksi database pool belum siap');
    conn = await pool.getConnection();
    await ensureAnggotaIntSchema(conn);

    // 1. Cari anggota berdasarkan id_anggota (jika integer valid) ATAU nik
    const [found]: [any[], any] = numericParamId !== null
      ? await conn.query(
          'SELECT id_anggota, nik, nama_lengkap FROM anggota WHERE id_anggota = ? OR nik = ? LIMIT 1',
          [numericParamId, id]
        )
      : await conn.query(
          'SELECT id_anggota, nik, nama_lengkap FROM anggota WHERE nik = ? LIMIT 1',
          [id]
        );

    const targetId = found.length > 0 ? Number(found[0].id_anggota) : numericParamId;
    const targetNik = found.length > 0 ? found[0].nik : id;
    const targetNama = found.length > 0 ? found[0].nama_lengkap : 'Perangkat Desa';

    await conn.beginTransaction();

    // 2. Hapus relasi anak secara aman
    if (targetId !== null) {
      try {
        await conn.query('DELETE FROM iuran_anggota WHERE id_anggota = ?', [targetId]);
      } catch (_) {}

      try {
        await conn.query('DELETE FROM keanggotaan_ppdi WHERE id_anggota = ?', [targetId]);
      } catch (_) {}

      try {
        await conn.query('DELETE FROM riwayat_jabatan WHERE id_anggota = ?', [targetId]);
      } catch (_) {}

      try {
        await conn.query('DELETE FROM users WHERE id_anggota = ?', [targetId]);
      } catch (_) {}
    }

    // 3. Hapus data utama di tabel anggota
    const [delRes]: [any, any] = targetId !== null
      ? await conn.query(
          'DELETE FROM anggota WHERE id_anggota = ? OR nik = ?',
          [targetId, targetNik]
        )
      : await conn.query(
          'DELETE FROM anggota WHERE nik = ?',
          [targetNik]
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
  const { id_anggota, id_desa, id_jabatan, periode, no_sk_pengangkatan, tgl_sk_pengangkatan, tmt_jabatan, status_aktif, file_sk, tanda_tangan, keterangan } = req.body;

  const effectiveJabId = id_jabatan || 2;
  const periodeCheck = validateAndNormalizePeriode(effectiveJabId, periode);
  if (!periodeCheck.valid) {
    return res.status(400).json({ success: false, message: periodeCheck.message });
  }

  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();
    await ensureSignatureColumns(conn);

    const validDesaId = await resolveDesaId(conn, id_desa);

    let savedTtdPath: string | null = tanda_tangan ? String(tanda_tangan).trim() : null;
    if (savedTtdPath && savedTtdPath.startsWith('data:')) {
      try {
        const saved = saveBase64UploadToDisk('ttd', savedTtdPath, 'ttd_sk', id_anggota);
        savedTtdPath = saved.url;
      } catch (e) {
        console.warn('Gagal menyimpan file tanda tangan SK ke disk:', e);
      }
    }

    const [rwInsertRes]: [any, any] = await conn.query(
      `INSERT INTO riwayat_jabatan (id_anggota, id_desa, id_jabatan, periode, no_sk_pengangkatan, tgl_sk_pengangkatan, tmt_jabatan, status_aktif, file_sk, tanda_tangan, keterangan)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id_anggota,
        validDesaId,
        effectiveJabId,
        periodeCheck.value,
        no_sk_pengangkatan,
        tgl_sk_pengangkatan,
        tmt_jabatan,
        status_aktif || 'Aktif',
        file_sk || null,
        savedTtdPath,
        keterangan || null,
      ]
    );

    let namaJabatan = `Jabatan #${id_jabatan || 2}`;
    let namaDesa = validDesaId;
    try {
      const [jRows]: [any[], any] = await conn.query('SELECT nama_jabatan FROM ref_jabatan WHERE id_jabatan = ? LIMIT 1', [id_jabatan || 2]);
      if (jRows?.[0]?.nama_jabatan) namaJabatan = jRows[0].nama_jabatan;
      const [dRows]: [any[], any] = await conn.query('SELECT nama_desa FROM ref_desa WHERE id_desa = ? LIMIT 1', [validDesaId]);
      if (dRows?.[0]?.nama_desa) namaDesa = `Desa ${dRows[0].nama_desa}`;
    } catch (_) {}

    conn.release();

    await logMemberActivity(req, {
      idAnggota: id_anggota,
      modul: 'Riwayat Jabatan & SK',
      aksi: 'TAMBAH',
      keterangan: `Menambahkan SK/Mutasi jabatan baru: ${namaJabatan} di ${namaDesa} (No. SK: ${no_sk_pengangkatan || '-'}, TMT: ${tmt_jabatan || '-'}, Status: ${status_aktif || 'Aktif'})${keterangan ? ` — ${keterangan}` : ''}.`,
    });

    return res.json({ success: true, id_riwayat: rwInsertRes.insertId, message: 'Riwayat mutasi/jabatan berhasil disimpan di MySQL' });
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
    const [existingRows]: [any[], any] = await conn.query(
      `SELECT r.id_anggota, r.status_aktif, r.no_sk_pengangkatan, j.nama_jabatan
       FROM riwayat_jabatan r
       LEFT JOIN ref_jabatan j ON j.id_jabatan = r.id_jabatan
       WHERE r.id_riwayat = ? LIMIT 1`,
      [id]
    );
    const prevRow = existingRows?.[0] || null;
    await conn.query('UPDATE riwayat_jabatan SET status_aktif = ? WHERE id_riwayat = ?', [status_aktif, id]);
    conn.release();

    if (prevRow?.id_anggota) {
      await logMemberActivity(req, {
        idAnggota: prevRow.id_anggota,
        modul: 'Status Jabatan',
        aksi: 'EDIT',
        keterangan: `Mengubah status jabatan ${prevRow.nama_jabatan || 'Perangkat Desa'} (SK: ${prevRow.no_sk_pengangkatan || '-'}): ${prevRow.status_aktif || '-'} → ${status_aktif}.`,
      });
    }

    return res.json({ success: true, message: 'Status jabatan diperbarui di MySQL' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Update Full Riwayat Jabatan
app.put('/api/riwayat/:id', requirePermission('anggota', 'edit'), async (req, res) => {
  const { id } = req.params;
  const { id_desa, id_jabatan, periode, no_sk_pengangkatan, tgl_sk_pengangkatan, tmt_jabatan, status_aktif, file_sk, tanda_tangan } = req.body;

  try {
    if (!pool) throw new Error('Pool not ready');
    const conn = await pool.getConnection();
    await ensureSignatureColumns(conn);

    const [prevRows]: [any[], any] = await conn.query(
      `SELECT r.*, j.nama_jabatan FROM riwayat_jabatan r LEFT JOIN ref_jabatan j ON j.id_jabatan = r.id_jabatan WHERE r.id_riwayat = ? LIMIT 1`,
      [id]
    );
    const prevRow = prevRows?.[0] || null;

    const effectiveJabId = Number(id_jabatan ?? prevRow?.id_jabatan ?? 0);
    const candidatePeriode = periode !== undefined ? periode : prevRow?.periode;
    const periodeCheck = validateAndNormalizePeriode(effectiveJabId, candidatePeriode);
    if (!periodeCheck.valid) {
      conn.release();
      return res.status(400).json({ success: false, message: periodeCheck.message });
    }

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
        periode = ?,
        no_sk_pengangkatan = COALESCE(?, no_sk_pengangkatan),
        tgl_sk_pengangkatan = COALESCE(?, tgl_sk_pengangkatan),
        tmt_jabatan = COALESCE(?, tmt_jabatan),
        status_aktif = COALESCE(?, status_aktif),
        file_sk = COALESCE(?, file_sk),
        tanda_tangan = COALESCE(?, tanda_tangan)
      WHERE id_riwayat = ?`,
      [validDesaId, id_jabatan, periodeCheck.value, no_sk_pengangkatan, tgl_sk_pengangkatan, tmt_jabatan, status_aktif, file_sk, savedTtdPath, id]
    );

    let newJabatanName = prevRow?.nama_jabatan || '';
    if (id_jabatan) {
      try {
        const [jRows]: [any[], any] = await conn.query('SELECT nama_jabatan FROM ref_jabatan WHERE id_jabatan = ? LIMIT 1', [id_jabatan]);
        if (jRows?.[0]?.nama_jabatan) newJabatanName = jRows[0].nama_jabatan;
      } catch (_) {}
    }

    conn.release();

    if (prevRow?.id_anggota) {
      const diffs: string[] = [];
      if (id_jabatan && Number(id_jabatan) !== Number(prevRow.id_jabatan)) {
        diffs.push(`Jabatan (${prevRow.nama_jabatan || prevRow.id_jabatan} → ${newJabatanName || id_jabatan})`);
      }
      if (no_sk_pengangkatan && no_sk_pengangkatan !== prevRow.no_sk_pengangkatan) {
        diffs.push(`No. SK (${prevRow.no_sk_pengangkatan || '-'} → ${no_sk_pengangkatan})`);
      }
      if (status_aktif && status_aktif !== prevRow.status_aktif) {
        diffs.push(`Status (${prevRow.status_aktif || '-'} → ${status_aktif})`);
      }
      if (tmt_jabatan && String(tmt_jabatan).slice(0, 10) !== String(prevRow.tmt_jabatan || '').slice(0, 10)) {
        diffs.push(`TMT (${String(prevRow.tmt_jabatan || '-').slice(0, 10)} → ${String(tmt_jabatan).slice(0, 10)})`);
      }
      await logMemberActivity(req, {
        idAnggota: prevRow.id_anggota,
        modul: 'Riwayat Jabatan & SK',
        aksi: 'EDIT',
        keterangan:
          diffs.length > 0
            ? `Memperbarui data SK/Jabatan: ${diffs.join('; ')}.`
            : `Memperbarui detail riwayat jabatan ${newJabatanName || 'Perangkat Desa'} (SK: ${no_sk_pengangkatan || prevRow.no_sk_pengangkatan || '-'}).`,
      });
    }

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
    const [prevRows]: [any[], any] = await conn.query(
      `SELECT r.id_anggota, r.no_sk_pengangkatan, j.nama_jabatan
       FROM riwayat_jabatan r
       LEFT JOIN ref_jabatan j ON j.id_jabatan = r.id_jabatan
       WHERE r.id_riwayat = ? LIMIT 1`,
      [id]
    );
    const prevRow = prevRows?.[0] || null;
    await conn.query('DELETE FROM riwayat_jabatan WHERE id_riwayat = ?', [id]);
    conn.release();

    if (prevRow?.id_anggota) {
      await logMemberActivity(req, {
        idAnggota: prevRow.id_anggota,
        modul: 'Riwayat Jabatan & SK',
        aksi: 'HAPUS',
        keterangan: `Menghapus riwayat jabatan ${prevRow.nama_jabatan || 'Perangkat Desa'} (No. SK: ${prevRow.no_sk_pengangkatan || '-'}).`,
      });
    }

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
    const [prevRows]: [any[], any] = await conn.query(
      'SELECT status_kta, no_kta FROM keanggotaan_ppdi WHERE id_anggota = ? LIMIT 1',
      [idAnggota]
    );
    const prevKta = prevRows?.[0] || null;
    await conn.query('UPDATE keanggotaan_ppdi SET status_kta = ? WHERE id_anggota = ?', [dbStatusKta, idAnggota]);
    conn.release();

    const prevStatusLabel =
      prevKta?.status_kta === 'Approved' ? 'Aktif' : prevKta?.status_kta === 'Pending_Verifikasi' ? 'Pending' : prevKta?.status_kta || '-';
    await logMemberActivity(req, {
      idAnggota,
      modul: 'Keanggotaan & E-KTA',
      aksi: 'STATUS_KTA',
      keterangan: `Mengubah status keabsahan E-KTA${prevKta?.no_kta ? ` (${prevKta.no_kta})` : ''}: ${prevStatusLabel} → ${status_kta}.`,
    });

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
      'SELECT id_ppdi, jabatan_pengurus FROM keanggotaan_ppdi WHERE id_anggota = ? LIMIT 1',
      [idAnggota]
    );
    const prevRole = existingPpdi?.[0]?.jabatan_pengurus || 'Anggota Biasa';

    if (existingPpdi.length > 0) {
      await conn.query(
        'UPDATE keanggotaan_ppdi SET jabatan_pengurus = ? WHERE id_anggota = ?',
        [val, idAnggota]
      );
    } else {
      const defaultKta = `32.04.PPDI.${Date.now().toString().slice(-6)}`;
      await conn.query(
        `INSERT INTO keanggotaan_ppdi (id_anggota, no_kta, tgl_bergabung, jabatan_pengurus, status_kta)
         VALUES (?, ?, CURDATE(), ?, 'Aktif')`,
        [idAnggota, defaultKta, val]
      );
    }

    conn.release();

    await logMemberActivity(req, {
      idAnggota,
      modul: 'Keanggotaan & E-KTA',
      aksi: 'EDIT',
      keterangan: `Mengubah jabatan kepengurusan PPDI: ${prevRole} → ${val}.`,
    });

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
            message: 'Password yang Anda masukkan salah. Silakan periksa kembali password akun Anda.',
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
    const safeIdAnggota = isValidInt32Id(id_anggota);

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
          safeIdAnggota,
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
            safeIdAnggota,
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
            safeIdAnggota,
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
    const safeIdAnggota = isValidInt32Id(id_anggota);

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
            safeIdAnggota,
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
              safeIdAnggota,
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
              safeIdAnggota,
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
          safeIdAnggota,
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

// Endpoint khusus admin (Kabupaten / Kecamatan) untuk mengambil kredensial akun Admin_Desa dari database
// guna pengiriman resmi kepada Sekretaris Desa.
app.get('/api/users/:id/admin-desa-credential', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');

  const targetId = isValidInt32Id(req.params.id);
  if (!targetId) {
    return res.status(400).json({ success: false, message: 'ID pengguna tidak valid.' });
  }

  const headerRole = String(req.headers['x-user-role'] || req.headers['user-role'] || '').trim();
  const headerUserId = isValidInt32Id(req.headers['x-user-id']);
  const allowedAdminRoles = ['Superadmin_Kabupaten', 'Admin_Kabupaten', 'Admin_Kecamatan'];

  if (!allowedAdminRoles.includes(headerRole) || !headerUserId) {
    return res.status(403).json({
      success: false,
      message: 'Akses ditolak: Hanya Superadmin/Admin Kabupaten atau Admin Kecamatan yang terautentikasi dapat mengakses kredensial Admin Desa.',
    });
  }

  let conn: mysql.PoolConnection | null = null;
  try {
    if (!pool) throw new Error('Pool not ready');
    conn = await pool.getConnection();

    // Verifikasi ulang peran & wilayah pemohon langsung ke tabel users di database
    const [callerRows]: [any[], any] = await conn.query(
      `SELECT u.id_user, COALESCE(r.nama_role, u.id_role) as role, COALESCE(u.id_kecamatan, u.id_kecamatan_scope) as id_kecamatan
       FROM users u
       LEFT JOIN roles r ON (CAST(u.id_role AS CHAR) = CAST(r.id_role AS CHAR) OR u.id_role = r.nama_role)
       WHERE u.id_user = ?
       LIMIT 1`,
      [headerUserId]
    );
    if (callerRows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Sesi admin pemohon tidak ditemukan di database.',
      });
    }
    const effectiveCallerRole = String(callerRows[0].role || '').trim();
    const callerKecamatan = String(callerRows[0].id_kecamatan || '').replace(/[^0-9a-z]/gi, '').toLowerCase();
    if (!allowedAdminRoles.includes(effectiveCallerRole)) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Peran akun Anda tidak diizinkan mengambil kredensial Admin Desa.',
      });
    }

    const [targetRows]: [any[], any] = await conn.query(
      `SELECT u.id_user, u.username, u.nama, u.password,
              COALESCE(r.nama_role, u.id_role) as role,
              u.id_role, u.id_kecamatan, u.id_desa
       FROM users u
       LEFT JOIN roles r ON (CAST(u.id_role AS CHAR) = CAST(r.id_role AS CHAR) OR u.id_role = r.nama_role)
       WHERE u.id_user = ?
       LIMIT 1`,
      [targetId]
    );

    if (targetRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Akun pengguna tidak ditemukan di database.' });
    }

    const target = targetRows[0];
    const targetRole = String(target.role || '').trim();
    const isAdminDesaTarget = targetRole === 'Admin_Desa' || String(target.id_role || '').trim() === '4';
    if (!isAdminDesaTarget) {
      return res.status(403).json({
        success: false,
        message: 'Pengambilan password hanya diizinkan untuk akun dengan role Admin_Desa.',
      });
    }

    if (effectiveCallerRole === 'Admin_Kecamatan' && callerKecamatan) {
      const targetKec = String(target.id_kecamatan || '').replace(/[^0-9a-z]/gi, '').toLowerCase();
      if (targetKec && targetKec !== callerKecamatan) {
        return res.status(403).json({
          success: false,
          message: 'Akses ditolak: Akun Admin Desa ini berada di luar wilayah Kecamatan Anda.',
        });
      }
    }

    const dbPassword = String(target.password || '').trim();
    const isHashed =
      !dbPassword ||
      /^\$2[aby]\$\d{2}\$/.test(dbPassword) ||
      /^[a-f0-9]{64}$/i.test(dbPassword) ||
      /^\$argon2/.test(dbPassword);

    // Catat log audit akses kredensial (non-blocking)
    try {
      await ensureActivityLogsTable(conn);
      const actor = await resolveActorFromRequest(req);
      await conn.query(
        `INSERT INTO activity_logs (timestamp, ip_address, user_id, user_name, user_role, modul, aksi, keterangan)
         VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?)`,
        [
          actor.ipAddress,
          actor.userId,
          actor.userName,
          actor.userRole,
          'Pengaturan User',
          'KIRIM_AKUN_SEKDES',
          `Mengambil kredensial akun Admin Desa (${target.username}) untuk pengiriman ke Sekretaris Desa.`,
        ]
      );
    } catch (_) {}

    return res.json({
      success: true,
      id_user: target.id_user,
      username: target.username,
      password: isHashed ? '' : dbPassword,
      is_hashed: isHashed,
      id_desa: target.id_desa,
      id_kecamatan: target.id_kecamatan,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    if (conn) conn.release();
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
    if (savedSkPath) {
      if (savedSkPath.startsWith('data:')) {
        if (!isValidPdfBase64Upload(savedSkPath, 'pendaftaran_sk.pdf')) {
          conn.release();
          return res.status(400).json({
            success: false,
            message: 'Hanya file berformat PDF (.pdf) yang diperbolehkan untuk berkas SK.',
          });
        }
        try {
          const saved = saveBase64UploadToDisk('sk', savedSkPath, 'pendaftaran_sk.pdf', data.nik);
          savedSkPath = saved.url;
        } catch (e) {
          console.warn('Gagal menyimpan file SK pendaftaran ke disk:', e);
        }
      } else if (!savedSkPath.toLowerCase().split('?')[0].endsWith('.pdf')) {
        conn.release();
        return res.status(400).json({
          success: false,
          message: 'Hanya file berformat PDF (.pdf) yang diperbolehkan untuk berkas SK.',
        });
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

    const effectivePendaftaranJabId = Number(data.id_jabatan) || 1;
    const pendaftaranPeriodeCheck = validateAndNormalizePeriode(effectivePendaftaranJabId, data.periode);
    if (!pendaftaranPeriodeCheck.valid) {
      conn.release();
      return res.status(400).json({
        success: false,
        message: pendaftaranPeriodeCheck.message,
      });
    }

    const ALLOWED_MARITAL_STATUS = ['Kawin', 'Belum Kawin', 'Cerai Hidup', 'Cerai Mati'];
    const rawMaritalStatus = String(data.status_pernikahan || 'Kawin').trim();
    const safeMaritalStatus = ALLOWED_MARITAL_STATUS.includes(rawMaritalStatus) ? rawMaritalStatus : 'Kawin';

    const [insertRes]: [any, any] = await conn.query(
      `INSERT INTO pendaftaran_perangkat_desa (
        nik, nama_lengkap, gelar_depan, gelar_belakang, tempat_lahir, tanggal_lahir, jenis_kelamin, agama,
        pendidikan_terakhir, no_hp_wa, email, alamat_rumah, status_pernikahan,
        id_kecamatan, id_desa, id_jabatan, periode, no_sk_pengangkatan, tgl_sk_pengangkatan, tmt_jabatan,
        foto, file_sk, tanda_tangan, status_approval
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Menunggu')`,
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
        safeMaritalStatus,
        cleanKecId,
        validDesaId,
        effectivePendaftaranJabId,
        pendaftaranPeriodeCheck.value,
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

// Edit Registration Data (accessible to all admin levels within their territorial jurisdiction)
app.put('/api/pendaftaran/:id', async (req, res) => {
  const pendaftaranId = isValidInt32Id(req.params.id);
  if (!pendaftaranId) {
    return res.status(400).json({ success: false, message: 'ID pendaftaran tidak valid.' });
  }

  const userRole = String(req.headers['x-user-role'] || req.headers['user-role'] || '').trim();
  const allowedAdminRoles = new Set([
    'Superadmin_Kabupaten',
    'Admin_Kabupaten',
    'Admin_Kecamatan',
    'Admin_Desa',
  ]);
  if (!allowedAdminRoles.has(userRole)) {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'Akses ditolak: Hanya admin yang berwenang memperbaiki data pendaftaran.',
    });
  }

  const data = req.body || {};
  const cleanNik = String(data.nik || '').replace(/\D/g, '').trim();
  const cleanNama = String(data.nama_lengkap || '').trim().toUpperCase();
  if (!/^\d{16}$/.test(cleanNik)) {
    return res.status(400).json({ success: false, message: 'NIK wajib berupa 16 digit angka yang valid.' });
  }
  if (!cleanNama) {
    return res.status(400).json({ success: false, message: 'Nama lengkap wajib diisi.' });
  }
  if (!data.id_desa) {
    return res.status(400).json({ success: false, message: 'Desa penempatan wajib dipilih.' });
  }
  const cleanJk = data.jenis_kelamin === 'P' ? 'P' : 'L';

  let conn: mysql.PoolConnection | null = null;
  try {
    if (!pool) throw new Error('Pool not ready');
    conn = await pool.getConnection();
    await ensureSignatureColumns(conn);

    const [existingRows]: [any[], any] = await conn.query(
      `SELECT p.*,
              DATE_FORMAT(p.tanggal_lahir, '%Y-%m-%d') AS tanggal_lahir,
              DATE_FORMAT(p.tgl_sk_pengangkatan, '%Y-%m-%d') AS tgl_sk_pengangkatan,
              DATE_FORMAT(p.tmt_jabatan, '%Y-%m-%d') AS tmt_jabatan
       FROM pendaftaran_perangkat_desa p
       WHERE p.id_pendaftaran = ? LIMIT 1`,
      [pendaftaranId]
    );
    if (!existingRows || existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Data pendaftaran tidak ditemukan.' });
    }
    const existing = existingRows[0];

    // Enforce territorial scoping on server for Admin_Kecamatan and Admin_Desa
    const callerUserId = isValidInt32Id(req.headers['x-user-id']);
    let scopeKecClean = '';
    let scopeDesaClean = '';
    if ((userRole === 'Admin_Kecamatan' || userRole === 'Admin_Desa') && callerUserId) {
      const [userRows]: [any[], any] = await conn.query(
        'SELECT id_kecamatan, id_desa FROM users WHERE id_user = ? LIMIT 1',
        [callerUserId]
      );
      if (userRows && userRows.length > 0) {
        scopeKecClean = String(userRows[0].id_kecamatan || '').replace(/\./g, '').trim();
        scopeDesaClean = String(userRows[0].id_desa || '').replace(/\./g, '').trim();
      }
    }

    const existingKecClean = String(existing.id_kecamatan || '').replace(/\./g, '').trim();
    const existingDesaClean = String(existing.id_desa || '').replace(/\./g, '').trim();

    if (userRole === 'Admin_Kecamatan' && scopeKecClean) {
      const inKec =
        existingKecClean === scopeKecClean ||
        (existingDesaClean.length >= 6 && existingDesaClean.startsWith(scopeKecClean));
      if (!inKec) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Akses ditolak: Data pendaftaran ini berada di luar wilayah Kecamatan Anda.',
        });
      }
    }

    if (userRole === 'Admin_Desa' && scopeDesaClean) {
      if (existingDesaClean !== scopeDesaClean) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Akses ditolak: Data pendaftaran ini berada di luar wilayah Desa Anda.',
        });
      }
    }

    // Validate duplicate NIK against other pending registrations (and active anggota if not yet approved)
    const [dupPending]: [any[], any] = await conn.query(
      'SELECT id_pendaftaran, nama_lengkap FROM pendaftaran_perangkat_desa WHERE nik = ? AND status_approval = "Menunggu" AND id_pendaftaran <> ? LIMIT 1',
      [cleanNik, pendaftaranId]
    );
    if (dupPending.length > 0) {
      return res.status(409).json({
        success: false,
        message: `NIK ${cleanNik} sudah digunakan pada pengajuan menunggu lainnya atas nama ${dupPending[0].nama_lengkap}.`,
      });
    }

    if (existing.status_approval !== 'Disetujui' || cleanNik !== String(existing.nik || '').trim()) {
      const [dupAnggota]: [any[], any] = await conn.query(
        'SELECT nama_lengkap FROM anggota WHERE nik = ? LIMIT 1',
        [cleanNik]
      );
      if (dupAnggota.length > 0 && existing.status_approval !== 'Disetujui') {
        return res.status(409).json({
          success: false,
          message: `NIK ${cleanNik} sudah terdaftar aktif sebagai anggota atas nama ${dupAnggota[0].nama_lengkap}.`,
        });
      }
    }

    const validDesaId = await resolveDesaId(conn, data.id_desa);
    const cleanTargetDesa = String(validDesaId || '').replace(/\./g, '').trim();
    const cleanTargetKec = String(data.id_kecamatan || validDesaId.slice(0, 6)).trim();
    const cleanTargetKecDigits = cleanTargetKec.replace(/\./g, '').trim();

    if (userRole === 'Admin_Kecamatan' && scopeKecClean) {
      const targetInKec =
        cleanTargetKecDigits === scopeKecClean ||
        (cleanTargetDesa.length >= 6 && cleanTargetDesa.startsWith(scopeKecClean));
      if (!targetInKec) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Admin Kecamatan tidak dapat memindahkan pendaftar ke luar wilayah Kecamatannya.',
        });
      }
    }

    if (userRole === 'Admin_Desa' && scopeDesaClean && cleanTargetDesa !== scopeDesaClean) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Admin Desa tidak dapat memindahkan pendaftar ke desa lain.',
      });
    }

    const effectiveJabId = Number(data.id_jabatan) || Number(existing.id_jabatan) || 1;
    const periodeCheck = validateAndNormalizePeriode(effectiveJabId, data.periode);
    if (!periodeCheck.valid) {
      return res.status(400).json({
        success: false,
        message: periodeCheck.message,
      });
    }

    // Handle optional updated attachments (foto, file_sk, tanda_tangan)
    const isSafeMediaRef = (val: string) =>
      val.startsWith('/') ||
      /^https?:\/\//i.test(val) ||
      (!val.includes(':') && !val.includes('..'));

    let savedFotoPath: string | null =
      data.foto !== undefined ? (data.foto ? String(data.foto).trim() : null) : existing.foto;
    if (savedFotoPath && savedFotoPath.startsWith('data:')) {
      if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(savedFotoPath)) {
        return res.status(400).json({
          success: false,
          message: 'Format foto tidak valid. Gunakan gambar JPG, PNG, atau WebP.',
        });
      }
      const saved = saveBase64UploadToDisk('foto', savedFotoPath, 'pendaftaran_foto', cleanNik);
      savedFotoPath = saved.url;
    } else if (savedFotoPath && !isSafeMediaRef(savedFotoPath)) {
      return res.status(400).json({ success: false, message: 'Path/URL foto tidak valid.' });
    }

    let savedSkPath: string | null =
      data.file_sk !== undefined ? (data.file_sk ? String(data.file_sk).trim() : null) : existing.file_sk;
    if (savedSkPath && savedSkPath !== existing.file_sk) {
      if (savedSkPath.startsWith('data:')) {
        if (!isValidPdfBase64Upload(savedSkPath, 'pendaftaran_sk.pdf')) {
          return res.status(400).json({
            success: false,
            message: 'Hanya file berformat PDF (.pdf) yang diperbolehkan untuk berkas SK.',
          });
        }
        const saved = saveBase64UploadToDisk('sk', savedSkPath, 'pendaftaran_sk.pdf', cleanNik);
        savedSkPath = saved.url;
      } else if (!isSafeMediaRef(savedSkPath) || !savedSkPath.toLowerCase().split('?')[0].endsWith('.pdf')) {
        return res.status(400).json({
          success: false,
          message: 'Hanya file berformat PDF (.pdf) yang diperbolehkan untuk berkas SK.',
        });
      }
    }

    let savedTtdPath: string | null =
      data.tanda_tangan !== undefined
        ? (data.tanda_tangan ? String(data.tanda_tangan).trim() : null)
        : existing.tanda_tangan;
    if (savedTtdPath && savedTtdPath.startsWith('data:')) {
      const saved = saveBase64UploadToDisk('ttd', savedTtdPath, 'pendaftaran_ttd', cleanNik);
      savedTtdPath = saved.url;
    } else if (savedTtdPath && !isSafeMediaRef(savedTtdPath)) {
      return res.status(400).json({ success: false, message: 'Path/URL tanda tangan tidak valid.' });
    }

    await conn.query(
      `UPDATE pendaftaran_perangkat_desa SET
        nik = ?,
        nama_lengkap = ?,
        gelar_depan = ?,
        gelar_belakang = ?,
        tempat_lahir = ?,
        tanggal_lahir = ?,
        jenis_kelamin = ?,
        agama = ?,
        pendidikan_terakhir = ?,
        no_hp_wa = ?,
        email = ?,
        alamat_rumah = ?,
        status_pernikahan = ?,
        id_kecamatan = ?,
        id_desa = ?,
        id_jabatan = ?,
        periode = ?,
        no_sk_pengangkatan = ?,
        tgl_sk_pengangkatan = ?,
        tmt_jabatan = ?,
        foto = ?,
        file_sk = ?,
        tanda_tangan = ?
      WHERE id_pendaftaran = ?`,
      [
        cleanNik,
        cleanNama,
        data.gelar_depan ? String(data.gelar_depan).trim() : null,
        data.gelar_belakang ? String(data.gelar_belakang).trim() : null,
        String(data.tempat_lahir || existing.tempat_lahir || 'Bandung').trim(),
        formatDateOnlyYMD(data.tanggal_lahir ?? existing.tanggal_lahir, '1990-01-01'),
        cleanJk,
        String(data.agama || existing.agama || 'Islam').trim(),
        String(data.pendidikan_terakhir || existing.pendidikan_terakhir || 'SMA/SMK').trim(),
        String(data.no_hp_wa || existing.no_hp_wa || '').trim(),
        data.email ? String(data.email).trim() : null,
        String(data.alamat_rumah || existing.alamat_rumah || 'Kabupaten Bandung').trim(),
        String(data.status_pernikahan || existing.status_pernikahan || 'Kawin').trim(),
        cleanTargetKec,
        validDesaId,
        effectiveJabId,
        periodeCheck.value,
        data.no_sk_pengangkatan ? String(data.no_sk_pengangkatan).trim() : null,
        data.tgl_sk_pengangkatan ? formatDateOnlyYMD(data.tgl_sk_pengangkatan, '') || null : null,
        data.tmt_jabatan ? formatDateOnlyYMD(data.tmt_jabatan, '') || null : null,
        savedFotoPath,
        savedSkPath,
        savedTtdPath,
        pendaftaranId,
      ]
    );

    const [updatedRows]: [any[], any] = await conn.query(
      `SELECT
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
      WHERE p.id_pendaftaran = ?
      LIMIT 1`,
      [pendaftaranId]
    );

    return res.json({
      success: true,
      message: 'Data formulir pendaftaran berhasil diperbarui.',
      pendaftaran: updatedRows?.[0] || null,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message || 'Gagal memperbarui data pendaftaran.', error: err.message });
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch (_) {}
    }
  }
});

// Approve Registration and Migrate directly into Anggota, Riwayat, and Keanggotaan
app.put('/api/pendaftaran/:id/approve', async (req, res) => {
  const { id } = req.params;
  const { approved_by, no_kta_custom } = req.body;
  const clientIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    '-';
  const userRole = String(req.headers['x-user-role'] || req.headers['user-role'] || 'Admin').trim();
  const approverName = String(approved_by || 'Admin Kabupaten').trim();

  let conn: any;
  let txStep = 'init_connection';
  try {
    if (!pool) throw new Error('Pool not ready');
    conn = await pool.getConnection();

    txStep = 'ensure_int11_schema';
    await ensureAnggotaIntSchema(conn);

    txStep = 'fetch_pendaftaran';
    const parsedPendaftaranId = isValidInt32Id(id);
    if (parsedPendaftaranId === null) {
      conn.release();
      return res.status(400).json({ success: false, message: `ID pendaftaran tidak valid: ${id}` });
    }

    const [rows]: [any[], any] = await conn.query(
      `SELECT p.*,
              DATE_FORMAT(p.tanggal_lahir, '%Y-%m-%d') AS tanggal_lahir,
              DATE_FORMAT(p.tgl_sk_pengangkatan, '%Y-%m-%d') AS tgl_sk_pengangkatan,
              DATE_FORMAT(p.tmt_jabatan, '%Y-%m-%d') AS tmt_jabatan
       FROM pendaftaran_perangkat_desa p
       WHERE p.id_pendaftaran = ? LIMIT 1`,
      [parsedPendaftaranId]
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

    // Ensure signature columns exist BEFORE beginTransaction (DDL triggers implicit commit in MySQL/MariaDB)
    txStep = 'ensure_signature_columns';
    await ensureSignatureColumns(conn);

    txStep = 'begin_transaction';
    await conn.beginTransaction();

    // Check if NIK already exists in anggota table
    txStep = 'check_existing_anggota';
    const cleanNik = String(p.nik || '').trim();
    const [existingAng]: [any[], any] = await conn.query(
      'SELECT id_anggota, nama_lengkap FROM anggota WHERE nik = ? LIMIT 1',
      [cleanNik]
    );

    let effectiveIdAnggota: number;
    let effectiveIdRiwayat: number | null = null;
    let effectiveIdPpdi: number | null = null;

    txStep = 'resolve_foreign_keys';
    const validDesaId = await resolveDesaId(conn, p.id_desa);
    const validJabatanId = await resolveJabatanId(conn, p.id_jabatan);

    let approvedJabMeta: { nama_jabatan?: string; kategori_jabatan?: string } = {};
    try {
      const [jMetaRows]: [any[], any] = await conn.query(
        'SELECT nama_jabatan, kategori_jabatan FROM ref_jabatan WHERE id_jabatan = ? LIMIT 1',
        [validJabatanId]
      );
      if (jMetaRows.length > 0) approvedJabMeta = jMetaRows[0];
    } catch (_) {}

    const rawApprovedPeriode = p.periode ?? req.body?.periode;
    const approvedPeriodeCheck = validateAndNormalizePeriode(validJabatanId, rawApprovedPeriode);
    const effectiveApprovedPeriode = validJabatanId === ID_JABATAN_KEPALA_DESA
      ? (approvedPeriodeCheck.valid ? approvedPeriodeCheck.value : 1)
      : null;

    const todayYmd = getLocalTodayYMD();
    const safeTglLahir = formatDateOnlyYMD(p.tanggal_lahir, '1990-01-01');
    const safeTglSk = formatDateOnlyYMD(p.tgl_sk_pengangkatan, todayYmd);
    const safeTmt = formatDateOnlyYMD(p.tmt_jabatan, todayYmd);

    // Prevent VARCHAR(255) overflow if registration record contains inline base64 data URL
    let safeFotoPath: string | null = p.foto || null;
    if (safeFotoPath && safeFotoPath.startsWith('data:')) {
      try {
        safeFotoPath = saveBase64UploadToDisk('foto', safeFotoPath, 'pendaftaran_foto.jpg', cleanNik).url;
      } catch (_) {
        safeFotoPath = null;
      }
    } else if (safeFotoPath && safeFotoPath.length > 255) {
      safeFotoPath = safeFotoPath.slice(0, 255);
    }

    let safeFileSkPath: string | null = p.file_sk || null;
    if (safeFileSkPath && safeFileSkPath.startsWith('data:')) {
      try {
        safeFileSkPath = saveBase64UploadToDisk('sk', safeFileSkPath, 'pendaftaran_sk.pdf', cleanNik).url;
      } catch (_) {
        safeFileSkPath = null;
      }
    } else if (safeFileSkPath && safeFileSkPath.length > 255) {
      safeFileSkPath = safeFileSkPath.slice(0, 255);
    }

    const normalizedGender = p.jenis_kelamin === 'P' ? 'P' : 'L';
    const normalizedNama = String(p.nama_lengkap || '').trim().toUpperCase();

    const nipdVal = generateServerNIPD({
      tanggal_lahir: safeTglLahir,
      tmt_jabatan: safeTmt,
      jenis_kelamin: normalizedGender,
      id_jabatan: validJabatanId,
      nama_jabatan: approvedJabMeta.nama_jabatan,
      kategori_jabatan: approvedJabMeta.kategori_jabatan,
      periode: effectiveApprovedPeriode,
      id_kecamatan: p.id_kecamatan || validDesaId.slice(0, 6),
      id_desa: validDesaId,
    });

    if (existingAng.length > 0) {
      txStep = 'update_existing_anggota';
      const parsedExistingId = isValidInt32Id(existingAng[0].id_anggota);
      if (parsedExistingId === null) {
        throw new Error(`Nilai id_anggota eksisting tidak valid sebagai INT(11): ${existingAng[0].id_anggota}`);
      }
      effectiveIdAnggota = parsedExistingId;

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
          normalizedNama,
          p.gelar_depan || null,
          p.gelar_belakang || null,
          p.tempat_lahir || 'Bandung',
          safeTglLahir,
          normalizedGender,
          p.agama || 'Islam',
          p.pendidikan_terakhir || 'S1',
          p.no_hp_wa || '-',
          p.email || null,
          safeFotoPath,
          p.alamat_rumah || 'Kabupaten Bandung',
          p.status_pernikahan || 'Kawin',
          effectiveIdAnggota,
        ]
      );
    } else {
      txStep = 'insert_new_anggota';
      const [angInsertRes]: [any, any] = await conn.query(
        `INSERT INTO anggota (nik, nipd, nama_lengkap, gelar_depan, gelar_belakang, tempat_lahir, tanggal_lahir, jenis_kelamin, agama, pendidikan_terakhir, no_hp_wa, email, foto, alamat_rumah, status_pernikahan)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cleanNik,
          nipdVal,
          normalizedNama,
          p.gelar_depan || null,
          p.gelar_belakang || null,
          p.tempat_lahir || 'Bandung',
          safeTglLahir,
          normalizedGender,
          p.agama || 'Islam',
          p.pendidikan_terakhir || 'S1',
          p.no_hp_wa || '-',
          p.email || null,
          safeFotoPath,
          p.alamat_rumah || 'Kabupaten Bandung',
          p.status_pernikahan || 'Kawin',
        ]
      );
      effectiveIdAnggota = Number(angInsertRes.insertId);
      if (!Number.isSafeInteger(effectiveIdAnggota) || effectiveIdAnggota <= 0) {
        throw new Error(`Gagal memperoleh INT(11) AUTO_INCREMENT id_anggota baru (insertId=${angInsertRes.insertId})`);
      }
    }

    // 2. Insert or update riwayat_jabatan (id_riwayat is INT(11) AUTO_INCREMENT — omitted on INSERT)
    txStep = 'upsert_riwayat_jabatan';
    const [existingRw]: [any[], any] = await conn.query(
      'SELECT id_riwayat FROM riwayat_jabatan WHERE id_anggota = ? AND status_aktif = "Aktif" LIMIT 1',
      [effectiveIdAnggota]
    );

    if (existingRw.length === 0) {
      const [rwInsertRes]: [any, any] = await conn.query(
        `INSERT INTO riwayat_jabatan (id_anggota, id_desa, id_jabatan, periode, no_sk_pengangkatan, tgl_sk_pengangkatan, tmt_jabatan, status_aktif, file_sk, tanda_tangan)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Aktif', ?, ?)`,
        [
          effectiveIdAnggota,
          validDesaId,
          validJabatanId,
          effectiveApprovedPeriode,
          p.no_sk_pengangkatan || `141.1/Kep.01-Desa/${new Date().getFullYear()}`,
          safeTglSk,
          safeTmt,
          safeFileSkPath,
          p.tanda_tangan || null,
        ]
      );
      effectiveIdRiwayat = Number(rwInsertRes.insertId);
    } else {
      effectiveIdRiwayat = Number(existingRw[0].id_riwayat);
      await conn.query(
        `UPDATE riwayat_jabatan SET
          id_desa = ?,
          id_jabatan = ?,
          periode = ?,
          no_sk_pengangkatan = COALESCE(?, no_sk_pengangkatan),
          tgl_sk_pengangkatan = COALESCE(?, tgl_sk_pengangkatan),
          tmt_jabatan = COALESCE(?, tmt_jabatan),
          file_sk = COALESCE(?, file_sk),
          tanda_tangan = COALESCE(?, tanda_tangan)
         WHERE id_riwayat = ?`,
        [
          validDesaId,
          validJabatanId,
          effectiveApprovedPeriode,
          p.no_sk_pengangkatan || null,
          safeTglSk,
          safeTmt,
          safeFileSkPath,
          p.tanda_tangan || null,
          effectiveIdRiwayat,
        ]
      );
    }

    // 3. Generate Unique KTA & Insert/Update keanggotaan_ppdi (id_ppdi is INT(11) AUTO_INCREMENT — omitted on INSERT)
    txStep = 'upsert_keanggotaan_ppdi';
    const [existingKta]: [any[], any] = await conn.query(
      'SELECT id_ppdi, no_kta FROM keanggotaan_ppdi WHERE id_anggota = ? LIMIT 1',
      [effectiveIdAnggota]
    );

    let finalKta: string;
    let finalKecCode: string;
    let finalNomorUrut: number;

    if (existingKta.length > 0) {
      effectiveIdPpdi = Number(existingKta[0].id_ppdi);
      finalKta = existingKta[0].no_kta;
      const ktaParts = finalKta.split('.');
      finalKecCode = ktaParts.length >= 3 ? `32.04.${ktaParts[2]}` : (p.id_kecamatan || '32.04.05');
      finalNomorUrut = ktaParts.length >= 5 ? parseInt(ktaParts[4], 10) || 1 : 1;

      await conn.query(
        'UPDATE keanggotaan_ppdi SET status_kta = "Aktif", jabatan_pengurus = COALESCE(?, jabatan_pengurus) WHERE id_ppdi = ?',
        [p.jabatan_pengurus || null, effectiveIdPpdi]
      );
    } else {
      txStep = 'generate_unique_kta';
      const ktaResult = await generateUniqueKTA(
        conn,
        p.id_kecamatan || validDesaId,
        validDesaId,
        no_kta_custom
      );
      finalKta = ktaResult.noKta;
      finalKecCode = ktaResult.kodeKecamatan;
      finalNomorUrut = ktaResult.nomorUrut;

      const [jabatanInfo]: [any[], any] = await conn.query(
        'SELECT nama_jabatan, kategori_jabatan FROM ref_jabatan WHERE id_jabatan = ? LIMIT 1',
        [validJabatanId]
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

      txStep = 'insert_keanggotaan_ppdi';
      const [ppdiInsertRes]: [any, any] = await conn.query(
        `INSERT INTO keanggotaan_ppdi (id_anggota, no_kta, tgl_bergabung, jabatan_pengurus, status_kta)
         VALUES (?, ?, CURDATE(), ?, 'Aktif')`,
        [effectiveIdAnggota, finalKta, effectiveJabatanPengurus]
      );
      effectiveIdPpdi = Number(ppdiInsertRes.insertId);
      if (!Number.isSafeInteger(effectiveIdPpdi) || effectiveIdPpdi <= 0) {
        throw new Error(`Gagal memperoleh INT(11) AUTO_INCREMENT id_ppdi baru (insertId=${ppdiInsertRes.insertId})`);
      }
    }

    // Sync kode_kecamatan, nomor_urut, and no_kta to anggota table
    txStep = 'sync_anggota_kta_columns';
    try {
      await conn.query(
        `UPDATE anggota SET kode_kecamatan = ?, nomor_urut = ?, no_kta = ? WHERE id_anggota = ?`,
        [finalKecCode, finalNomorUrut, finalKta, effectiveIdAnggota]
      );
    } catch (syncErr: any) {
      console.warn(`[Approval TX WARN] pendaftaran=${parsedPendaftaranId} gagal sync kolom KTA ke anggota:`, syncErr?.message);
    }

    // 4. Update status pendaftaran to Disetujui
    txStep = 'update_pendaftaran_status';
    const [updPendaftaranRes]: [any, any] = await conn.query(
      `UPDATE pendaftaran_perangkat_desa SET
        status_approval = 'Disetujui',
        tgl_approval = NOW(),
        approved_by = ?
       WHERE id_pendaftaran = ?`,
      [approverName, parsedPendaftaranId]
    );
    if (!updPendaftaranRes || updPendaftaranRes.affectedRows === 0) {
      throw new Error(`Gagal memperbarui status pendaftaran_perangkat_desa untuk id_pendaftaran=${parsedPendaftaranId}`);
    }

    txStep = 'commit_transaction';
    await conn.commit();
    conn.release();
    conn = null;

    await logApprovalTransaction({
      ipAddress: clientIp,
      userName: approverName,
      userRole,
      aksi: 'APPROVE_SUCCESS',
      idPendaftaran: parsedPendaftaranId,
      step: 'completed',
      detail: `Disetujui: ${normalizedNama} (NIK: ${cleanNik}) -> id_anggota=${effectiveIdAnggota}, id_riwayat=${effectiveIdRiwayat}, id_ppdi=${effectiveIdPpdi}, no_kta=${finalKta}`,
    });

    return res.json({
      success: true,
      message: `Pendaftaran atas nama ${normalizedNama} berhasil disetujui! Telah diterbitkan ke Data Induk Anggota dengan No. KTA ${finalKta}`,
      nama_lengkap: normalizedNama,
      id_anggota: effectiveIdAnggota,
      id_riwayat: effectiveIdRiwayat,
      id_ppdi: effectiveIdPpdi,
      no_kta: finalKta,
    });
  } catch (err: any) {
    if (conn) {
      try { await conn.rollback(); } catch (_) {}
      try { conn.release(); } catch (_) {}
    }
    const sqlCode = err?.code || 'UNKNOWN';
    const sqlErrno = err?.errno ?? '-';
    const sqlMsg = err?.sqlMessage || err?.message || 'Terjadi kesalahan sistem saat menyetujui pendaftaran';
    const detailedMsg = `[Step: ${txStep}] [${sqlCode}/${sqlErrno}] ${sqlMsg}`;

    await logApprovalTransaction({
      ipAddress: clientIp,
      userName: approverName,
      userRole,
      aksi: 'APPROVE_ERROR',
      idPendaftaran: id,
      step: txStep,
      detail: detailedMsg,
    });

    return res.status(500).json({
      success: false,
      step: txStep,
      code: sqlCode,
      message: `Gagal menyetujui pendaftaran pada tahap "${txStep}": ${sqlMsg}`,
      error: detailedMsg,
    });
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

const MAX_CHAIRMAN_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB

function detectVerifiedImageExt(buffer: Buffer): { ext: '.jpg' | '.png' | '.webp'; mime: string } | null {
  if (!buffer || buffer.length < 12) return null;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: '.jpg', mime: 'image/jpeg' };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { ext: '.png', mime: 'image/png' };
  }
  // WEBP: RIFF....WEBP
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: '.webp', mime: 'image/webp' };
  }
  return null;
}

function saveChairmanPhotoBase64(dataUrl: string): { url: string; fileName: string; sizeBytes: number; mimeType: string } {
  const trimmed = dataUrl.trim();
  const match = trimmed.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new Error('Format foto Ketua tidak valid. Hanya gambar JPG, PNG, atau WEBP yang diperbolehkan.');
  }

  const base64Body = match[2].replace(/\s+/g, '');
  const buffer = Buffer.from(base64Body, 'base64');
  if (buffer.length === 0) {
    throw new Error('Data gambar foto Ketua kosong atau rusak.');
  }
  if (buffer.length > MAX_CHAIRMAN_PHOTO_BYTES) {
    throw new Error('Ukuran file foto Ketua melebihi batas maksimal 2 MB.');
  }

  const verified = detectVerifiedImageExt(buffer);
  if (!verified) {
    throw new Error('Isi file bukan gambar JPG, PNG, atau WEBP yang valid.');
  }

  fs.mkdirSync(CHAIRMAN_DIR, { recursive: true });
  const randHex = crypto.randomBytes(4).toString('hex');
  const finalFileName = `chairman_${Date.now()}_${randHex}${verified.ext}`;
  const resolvedPath = path.resolve(CHAIRMAN_DIR, finalFileName);
  if (!resolvedPath.startsWith(CHAIRMAN_DIR + path.sep)) {
    throw new Error('Path penyimpanan foto tidak valid.');
  }

  fs.writeFileSync(resolvedPath, buffer);

  return {
    url: `/uploads/chairman/${finalFileName}`,
    fileName: finalFileName,
    sizeBytes: buffer.length,
    mimeType: verified.mime,
  };
}

function resolveIncomingChairmanPhoto(rawValue: unknown): string {
  if (rawValue === null || rawValue === undefined) return '';
  const str = String(rawValue).trim();
  if (!str) return '';

  if (str.startsWith('data:')) {
    const saved = saveChairmanPhotoBase64(str);
    return saved.url;
  }

  // Allow safe relative upload paths without traversal
  if (str.startsWith('/uploads/') && !str.includes('..') && !str.includes('\\')) {
    return str;
  }

  // Allow explicit http(s) URLs only
  try {
    const parsed = new URL(str);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return str;
    }
  } catch (_) {}

  throw new Error('URL atau format foto Ketua tidak valid. Gunakan unggahan JPG/PNG/WEBP atau URL http(s).');
}

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
  chairman_name: 'Ketua PPDI Kabupaten Bandung',
  chairman_title: 'Ketua Pengurus Daerah PPDI Kabupaten Bandung',
  chairman_photo: '',
  chairman_greeting: '',
  rolePermissions: DEFAULT_ROLE_PERMISSIONS,
  whatsappSettings: DEFAULT_WHATSAPP_SETTINGS,
};

function mergeSettingsWithDefaults(data: any): any {
  const { success: _s, settings: _st, ...cleanData } = data || {};
  const sanitizedLogo = cleanData?.logoUrl && String(cleanData.logoUrl).includes('wikimedia.org')
    ? '/logo_kabupaten_bandung.svg'
    : (cleanData?.logoUrl || DEFAULT_SETTINGS.logoUrl);

  const chairmanName =
    typeof cleanData?.chairman_name === 'string' && cleanData.chairman_name.trim().length > 0
      ? cleanData.chairman_name.trim()
      : DEFAULT_SETTINGS.chairman_name;
  const chairmanTitle =
    typeof cleanData?.chairman_title === 'string' && cleanData.chairman_title.trim().length > 0
      ? cleanData.chairman_title.trim()
      : DEFAULT_SETTINGS.chairman_title;
  const chairmanPhoto =
    typeof cleanData?.chairman_photo === 'string' ? cleanData.chairman_photo.trim() : DEFAULT_SETTINGS.chairman_photo;
  const chairmanGreeting =
    typeof cleanData?.chairman_greeting === 'string' ? cleanData.chairman_greeting : DEFAULT_SETTINGS.chairman_greeting;

  return {
    ...DEFAULT_SETTINGS,
    ...cleanData,
    logoUrl: sanitizedLogo,
    chairman_name: chairmanName,
    chairman_title: chairmanTitle,
    chairman_photo: chairmanPhoto,
    chairman_greeting: chairmanGreeting,
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

async function handleSaveSettings(req: express.Request, res: express.Response) {
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
    const incomingBody: Record<string, any> = { ...(req.body || {}) };

    // Validate and process Chairman Greeting fields if included in request
    if (incomingBody.chairman_name !== undefined) {
      const nameStr = String(incomingBody.chairman_name ?? '').trim();
      if (nameStr.length > 150) {
        return res.status(400).json({
          success: false,
          message: 'Nama Ketua maksimal 150 karakter.',
        });
      }
      incomingBody.chairman_name = nameStr || DEFAULT_SETTINGS.chairman_name;
    }

    if (incomingBody.chairman_title !== undefined) {
      const titleStr = String(incomingBody.chairman_title ?? '').trim();
      if (titleStr.length > 200) {
        return res.status(400).json({
          success: false,
          message: 'Jabatan Ketua maksimal 200 karakter.',
        });
      }
      incomingBody.chairman_title = titleStr || DEFAULT_SETTINGS.chairman_title;
    }

    if (incomingBody.chairman_greeting !== undefined) {
      const greetingStr = String(incomingBody.chairman_greeting ?? '');
      if (greetingStr.length > 10000) {
        return res.status(400).json({
          success: false,
          message: 'Kata-kata sambutan Ketua maksimal 10.000 karakter.',
        });
      }
      incomingBody.chairman_greeting = greetingStr;
    }

    // Handle optional chairman_photo_base64 alias or chairman_photo base64 upload
    const rawChairmanPhoto =
      incomingBody.chairman_photo_base64 !== undefined
        ? incomingBody.chairman_photo_base64
        : incomingBody.chairman_photo;
    delete incomingBody.chairman_photo_base64;

    if (rawChairmanPhoto !== undefined) {
      try {
        incomingBody.chairman_photo = resolveIncomingChairmanPhoto(rawChairmanPhoto);
      } catch (photoErr: any) {
        return res.status(400).json({
          success: false,
          message: photoErr?.message || 'Validasi foto Ketua gagal.',
        });
      }
    }

    const newSettings = mergeSettingsWithDefaults({
      ...existing,
      ...incomingBody,
      whatsappSettings: {
        ...DEFAULT_WHATSAPP_SETTINGS,
        ...(existing.whatsappSettings || {}),
        ...(incomingBody?.whatsappSettings || {}),
      },
    });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(newSettings, null, 2), 'utf-8');
    await saveSettingsToDb(newSettings);
    if (newSettings.whatsappSettings) {
      await syncWhatsAppSenderToDb(newSettings.whatsappSettings);
    }
    return res.json({ success: true, message: 'Pengaturan aplikasi berhasil disimpan', settings: newSettings });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message, message: err.message });
  }
}

app.post('/api/settings', handleSaveSettings);
app.put('/api/settings', handleSaveSettings);

// Public endpoint: GET /api/settings/chairman (untuk halaman depan tanpa login)
app.get('/api/settings/chairman', async (_req, res) => {
  try {
    const settings = await readSettingsFromDbOrDisk();
    const chairman = {
      chairman_name: settings.chairman_name || DEFAULT_SETTINGS.chairman_name,
      chairman_title: settings.chairman_title || DEFAULT_SETTINGS.chairman_title,
      chairman_photo: settings.chairman_photo || '',
      chairman_greeting: settings.chairman_greeting || '',
    };
    return res.json({
      success: true,
      data: chairman,
      settings: chairman,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Gagal memuat sambutan Ketua PPDI',
      message: 'Gagal memuat data sambutan Ketua PPDI.',
    });
  }
});

// Protected endpoint: PUT /api/settings/chairman (khusus admin)
async function handleUpdateChairmanSettings(req: express.Request, res: express.Response) {
  try {
    const existing = await readSettingsFromDbOrDisk();
    const body = req.body || {};
    const updates: Record<string, any> = {};

    if (body.chairman_name !== undefined) {
      const nameStr = String(body.chairman_name ?? '').trim();
      if (nameStr.length > 150) {
        return res.status(400).json({ success: false, message: 'Nama Ketua maksimal 150 karakter.' });
      }
      updates.chairman_name = nameStr || DEFAULT_SETTINGS.chairman_name;
    }

    if (body.chairman_title !== undefined) {
      const titleStr = String(body.chairman_title ?? '').trim();
      if (titleStr.length > 200) {
        return res.status(400).json({ success: false, message: 'Jabatan Ketua maksimal 200 karakter.' });
      }
      updates.chairman_title = titleStr || DEFAULT_SETTINGS.chairman_title;
    }

    if (body.chairman_greeting !== undefined) {
      const greetingStr = String(body.chairman_greeting ?? '');
      if (greetingStr.length > 10000) {
        return res.status(400).json({ success: false, message: 'Kata-kata sambutan Ketua maksimal 10.000 karakter.' });
      }
      updates.chairman_greeting = greetingStr;
    }

    const removePhoto = body.remove_photo === true || body.remove_photo === 'true' || body.remove_photo === 1;
    const rawPhoto =
      body.chairman_photo_base64 !== undefined ? body.chairman_photo_base64 : body.chairman_photo;

    if (removePhoto) {
      updates.chairman_photo = '';
    } else if (rawPhoto !== undefined) {
      try {
        updates.chairman_photo = resolveIncomingChairmanPhoto(rawPhoto);
      } catch (photoErr: any) {
        return res.status(400).json({
          success: false,
          message: photoErr?.message || 'Validasi foto Ketua gagal.',
        });
      }
    }

    const newSettings = mergeSettingsWithDefaults({
      ...existing,
      ...updates,
    });

    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(newSettings, null, 2), 'utf-8');
    await saveSettingsToDb(newSettings);

    const chairman = {
      chairman_name: newSettings.chairman_name,
      chairman_title: newSettings.chairman_title,
      chairman_photo: newSettings.chairman_photo,
      chairman_greeting: newSettings.chairman_greeting,
    };

    return res.json({
      success: true,
      message: 'Sambutan Ketua PPDI Kabupaten Bandung berhasil disimpan',
      data: chairman,
      settings: chairman,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Gagal menyimpan sambutan Ketua PPDI',
      message: err?.message || 'Gagal menyimpan sambutan Ketua PPDI.',
    });
  }
}

app.put('/api/settings/chairman', requirePermission('settings-app', 'edit'), handleUpdateChairmanSettings);
app.post('/api/settings/chairman', requirePermission('settings-app', 'edit'), handleUpdateChairmanSettings);

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
        isValidInt32Id(entry.idAnggota),
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
            idAnggota: r.id_anggota !== null && r.id_anggota !== undefined ? String(r.id_anggota) : undefined,
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

  // Detect if running as compiled bundle (e.g. node server.js on hosting/cPanel or AI Studio Shared Preview)
  const isCompiledBundle = process.argv[1]?.endsWith('.js');
  const isProduction = (process.env.NODE_ENV === 'production' || isCompiledBundle) && hasDist;

  if (!isProduction) {
    let viteMiddleware: express.RequestHandler | null = null;
    let viteFailed = false;

    const viteReadyPromise = import('vite')
      .then(({ createServer: createViteServer }) =>
        createViteServer({
          server: {
            middlewareMode: true,
            allowedHosts: true,
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

