<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Root DatabaseSeeder untuk menyemai data uji anggota (Kepala Desa, Perangkat Desa, dan Staf)
 * dengan NIPD 28 digit otomatis melalui App\Services\NipdGeneratorService.
 *
 * Jalankan: php artisan db:seed
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            AnggotaNipdSimulationSeeder::class,
        ]);
    }
}
