# Panduan Migrasi & Deployment Laravel + React di HestiaCP

Folder `laravel-migration/` berisi paket backend **Laravel 11 (PHP 8.2+)** yang memindahkan seluruh aturan validasi, kalkulasi otomatis (NIPD 27-digit, penomoran KTA unik `FOR UPDATE` per kecamatan, aturan Kepala Desa), pengecekan null/status, upload base64/PDF, audit log aktivitas anggota, dan backup SQL harian secara identik dari `server.ts`.

---

## 1. Instalasi Paket ke Proyek Laravel 11

Di server HestiaCP (via SSH sebagai user HestiaCP, misal `USER`):

```bash
cd /home/USER/web/domain-anda.id/private
composer create-project laravel/laravel:^11.0 laravel
cd laravel
```

Salin seluruh isi folder `laravel-migration/` ke root folder `laravel/` (menimpa `bootstrap/app.php`, `routes/api.php`, `routes/web.php`, `routes/console.php`, `config/cors.php`, serta menambahkan `app/Services/*`, `app/Http/*`, `app/Console/Commands/*`, dan `database/migrations/*`).

Aktifkan file `.env`:
```bash
cp .env.example .env
nano .env   # Isi DB_DATABASE, DB_USERNAME, DB_PASSWORD, APP_URL
php artisan key:generate
```

> **Database Eksisting vs Database Baru:**
> - Jika menghubungkan ke database MySQL produksi yang **sudah berisi data** (`serverpp_db_anggota`), Anda **tidak wajib** menjalankan `php artisan migrate` (atau tetap aman karena seluruh `Schema::create` sudah dijaga `if (!Schema::hasTable(...))`).
> - Jika membuat database kosong baru, jalankan `php artisan migrate`.

---

## 2. Integrasi Frontend React + Vite

Frontend React sudah membaca `VITE_API_URL` melalui `src/utils/ppdiHelpers.ts`.

### Opsi A1 — Single Domain (Direkomendasikan di HestiaCP)
1. Di proyek frontend lokal, buat `.env.production`:
   ```env
   VITE_API_URL=
   ```
2. Build frontend:
   ```bash
   npm run build
   ```
3. Salin hasil build `dist/` ke folder `public/` Laravel:
   - Salin `dist/assets/*` → `laravel/public/assets/` (serta file statis lain seperti favicon/manifest).
   - Salin `dist/index.html` → `laravel/public/spa.html` (**rename ke `spa.html`** agar tidak bentrok dengan `public/index.php` Laravel).

### Opsi A2 — Subdomain Terpisah
1. Di proyek frontend lokal, buat `.env.production`:
   ```env
   VITE_API_URL=https://api.domain-anda.id
   ```
2. Build (`npm run build`) dan unggah isi `dist/` ke `public_html` domain frontend (`https://ppdi.domain-anda.id`).
3. Isi `CORS_ALLOWED_ORIGINS=https://ppdi.domain-anda.id` pada `.env` Laravel di `https://api.domain-anda.id`.

---

## 3. Pengaturan Document Root, Symlink & Permission di HestiaCP

1. **Panel HestiaCP → Web → Edit Domain → Advanced Options:**
   - **PHP Version:** PHP 8.2 atau PHP 8.3
   - **Web Template:** `laravel` (atau arahkan `Custom Document Root` ke `laravel/public`)
2. **Symlink `/uploads` & Permission Folder:**
   ```bash
   cd /home/USER/web/domain-anda.id/private/laravel
   mkdir -p storage/app/public/uploads/{foto,sk,ttd,regulasi,iuran} storage/app/backups
   php artisan storage:link
   ln -sfn $(pwd)/storage/app/public/uploads $(pwd)/public/uploads

   chown -R USER:USER storage bootstrap/cache
   chmod -R 775 storage bootstrap/cache
   chmod -R 775 storage/app/public/uploads storage/app/backups

   php artisan config:cache
   php artisan route:cache
   ```
3. **Jika Memindahkan Berkas Upload Lama dari Node.js:**
   Salin isi folder `uploads/{foto,sk,ttd,regulasi}` dari server lama ke `storage/app/public/uploads/`. URL `/uploads/foto/...` akan otomatis tetap valid tanpa mengubah data di MySQL.

---

## 4. Konfigurasi Nginx (Custom Template HestiaCP untuk Single Domain)

```nginx
location /api {
    try_files $uri $uri/ /index.php?$query_string;
}

location /uploads {
    alias /home/USER/web/domain-anda.id/private/laravel/storage/app/public/uploads;
    expires 30d;
    access_log off;
}

location / {
    try_files $uri $uri/ /index.php?$query_string;
}
```

---

## 5. Tuning PHP & Cron Job Backup Otomatis di HestiaCP

- **HestiaCP → Server → Configure PHP 8.2/8.3:**
  - `upload_max_filesize = 20M`
  - `post_max_size = 25M`
  - `memory_limit = 256M`
  - `max_execution_time = 120`
- **HestiaCP → Cron → Add Cron Job** (interval `* * * * *` setiap menit):
  ```bash
  /usr/bin/php8.2 /home/USER/web/domain-anda.id/private/laravel/artisan schedule:run >> /dev/null 2>&1
  ```
  Command `ppdi:backup-database` berjalan setiap hari pukul **02:00 WIB** menggunakan pure PHP PDO (tidak membutuhkan `exec()` / `mysqldump` yang sering diblokir di shared hosting) dan menyimpan hingga 14 arsip SQL terbaru di `storage/app/backups/`.
