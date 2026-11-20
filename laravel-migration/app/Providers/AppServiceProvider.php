<?php

namespace App\Providers;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    /**
     * Shared Hosting / HestiaCP Runtime Hardening:
     * 1. Menyeragamkan timezone PHP (WIB / Asia/Jakarta) & sesi MySQL (+07:00)
     *    agar CURDATE(), NOW(), kalkulasi Purna Tugas 60 tahun, dan activity_logs konsisten.
     * 2. Memaksa skema HTTPS pada URL yang dihasilkan Laravel ketika berjalan di balik proxy Nginx HestiaCP.
     */
    public function boot(): void
    {
        $timezone = (string) config('app.timezone', env('APP_TIMEZONE', 'Asia/Jakarta'));
        if ($timezone !== '') {
            @date_default_timezone_set($timezone);
        }

        if (filter_var(env('FORCE_HTTPS', false), FILTER_VALIDATE_BOOLEAN) && app()->environment('production')) {
            URL::forceScheme('https');
        }

        // Sinkronisasi timezone sesi MySQL hanya saat menjalankan request HTTP/CLI non-migrasi mentah
        $dbTimezone = trim((string) env('DB_TIMEZONE', '+07:00'));
        if ($dbTimezone !== '' && preg_match('/^[+-]\d{2}:\d{2}$/', $dbTimezone)) {
            try {
                DB::statement("SET time_zone = '{$dbTimezone}'");
            } catch (\Throwable) {
                // Abaikan jika DB belum terkoneksi (misal saat composer dump-autoload / config:cache)
            }
        }
    }
}
