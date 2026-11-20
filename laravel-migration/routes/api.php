<?php

use App\Http\Controllers\Api\AnggotaController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DatabaseBackupController;
use App\Http\Controllers\Api\IuranController;
use App\Http\Controllers\Api\KeanggotaanKtaController;
use App\Http\Controllers\Api\PendaftaranController;
use App\Http\Controllers\Api\RefController;
use App\Http\Controllers\Api\RiwayatJabatanController;
use App\Http\Controllers\Api\SettingsController;
use App\Http\Controllers\Api\UploadController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\ViewsReportController;
use Illuminate\Support\Facades\Route;

// Health & Database Diagnostics / Backup
Route::get('/health', fn () => response()->json(['ok' => true, 'engine' => 'laravel', 'timezone' => config('app.timezone'), 'time' => now()->toIso8601String()]));
Route::get('/diagnostic', [DatabaseBackupController::class, 'diagnostic']);
Route::get('/db/status', [DatabaseBackupController::class, 'dbStatus']);
Route::get('/db/schema-diagnostic', [DatabaseBackupController::class, 'schemaDiagnostic']);
Route::get('/database/backup/status', [DatabaseBackupController::class, 'status']);
Route::post('/database/backup', [DatabaseBackupController::class, 'trigger']);
Route::get('/database/backup/download/{filename?}', [DatabaseBackupController::class, 'download']);

// Master Referensi Wilayah & Jabatan
Route::get('/ref/all', [RefController::class, 'all']);

// Autentikasi & Manajemen Pengguna
Route::post('/auth/login', [AuthController::class, 'login']);
Route::get('/auth/me', [AuthController::class, 'me']);
Route::post('/auth/logout', [AuthController::class, 'logout']);
Route::post('/users/change-password', [AuthController::class, 'changePassword']);
Route::get('/users', [UserController::class, 'index']);
Route::post('/users', [UserController::class, 'store'])->middleware('perm:settings-user,add');
Route::put('/users/{id}', [UserController::class, 'update'])->middleware('perm:settings-user,edit');
Route::delete('/users/{id}', [UserController::class, 'destroy'])->middleware('perm:settings-user,delete');

// Data Induk Anggota & Riwayat Aktivitas
Route::get('/anggota', [AnggotaController::class, 'index']);
Route::get('/anggota/check-nik', [AnggotaController::class, 'checkNik']);
Route::get('/anggota/{id}/activity', [AnggotaController::class, 'activity']);
Route::post('/anggota', [AnggotaController::class, 'store'])->middleware('perm:anggota,add');
Route::post('/anggota/store', [AnggotaController::class, 'store'])->middleware('perm:anggota,add');
Route::post('/anggota/batch-import', [AnggotaController::class, 'batchImport'])->middleware('perm:anggota,add');
Route::put('/anggota/{id}', [AnggotaController::class, 'update'])->middleware('perm:anggota,edit');
Route::delete('/anggota/{id}', [AnggotaController::class, 'destroy'])->middleware('perm:anggota,delete');

// Riwayat Jabatan & SK
Route::post('/riwayat', [RiwayatJabatanController::class, 'store'])->middleware('perm:anggota,add');
Route::put('/riwayat/{id}/status', [RiwayatJabatanController::class, 'updateStatus'])->middleware('perm:anggota,edit');
Route::put('/riwayat/{id}', [RiwayatJabatanController::class, 'update'])->middleware('perm:anggota,edit');
Route::delete('/riwayat/{id}', [RiwayatJabatanController::class, 'destroy'])->middleware('perm:anggota,delete');

// Status Keanggotaan & E-KTA PPDI
Route::put('/kta/{idAnggota}/status', [KeanggotaanKtaController::class, 'updateStatus'])->middleware('perm:ekta,edit');
Route::put('/kta/{idAnggota}/jabatan-pengurus', [KeanggotaanKtaController::class, 'updateJabatanPengurus'])->middleware('perm:anggota,edit');

// Pendaftaran Perangkat Desa & Approval
Route::get('/pendaftaran', [PendaftaranController::class, 'index']);
Route::post('/pendaftaran', [PendaftaranController::class, 'store']);
Route::put('/pendaftaran/{id}/approve', [PendaftaranController::class, 'approve']);
Route::put('/pendaftaran/{id}/reject', [PendaftaranController::class, 'reject'])->middleware('perm:pendaftaran,edit');
Route::delete('/pendaftaran/{id}', [PendaftaranController::class, 'destroy'])->middleware('perm:pendaftaran,delete');

// Iuran Anggota
Route::get('/iuran', [IuranController::class, 'index']);
Route::post('/iuran', [IuranController::class, 'store'])->middleware('perm:iuran,add');
Route::put('/iuran/{id}/verify', [IuranController::class, 'verify'])->middleware('perm:iuran,edit');

// Upload Berkas (/uploads/foto, /uploads/sk, /uploads/ttd, /uploads/regulasi)
Route::post('/upload', [UploadController::class, 'store']);
Route::get('/uploads/list', [UploadController::class, 'list']);
Route::delete('/uploads/{folder}/{fileName}', [UploadController::class, 'destroy']);

// Pengaturan Aplikasi
Route::get('/settings', [SettingsController::class, 'index']);
Route::post('/settings', [SettingsController::class, 'save']);

// Database Views (Pelaporan & Rekapitulasi)
Route::prefix('views')->group(function () {
    Route::get('/rekap-kecamatan', [ViewsReportController::class, 'rekapKecamatan']);
    Route::get('/rekap-desa', [ViewsReportController::class, 'rekapDesa']);
    Route::get('/purna-tugas', [ViewsReportController::class, 'purnaTugas']);
    Route::get('/monitoring-pensiun', [ViewsReportController::class, 'monitoringPensiun']);
    Route::get('/rekap-iuran-kecamatan', [ViewsReportController::class, 'rekapIuranKecamatan']);
    Route::get('/rekap-iuran-desa', [ViewsReportController::class, 'rekapIuranDesa']);
    Route::get('/antrean-verifikasi', [ViewsReportController::class, 'antreanVerifikasi']);
    Route::get('/anggota-aktif', [ViewsReportController::class, 'anggotaAktif']);
});
