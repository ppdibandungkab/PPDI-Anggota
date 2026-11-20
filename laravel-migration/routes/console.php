<?php

use Illuminate\Support\Facades\Schedule;

// Backup Database Otomatis Harian pukul 02:00 WIB (dipicu oleh Cron HestiaCP setiap menit)
Schedule::command('ppdi:backup-database')->dailyAt('02:00');
