<?php

use App\Services\PpdiHelperService;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| 1. Fallback Streaming File Upload (/uploads/{folder}/{filename})
|--------------------------------------------------------------------------
| Menjamin foto anggota, SK PDF, tanda tangan, dan PDF regulasi tetap bisa
| diakses di shared hosting meskipun symlink `php artisan storage:link`
| diblokir atau file berada di storage/app/public/uploads/.
*/
Route::get('/uploads/{folder}/{filename}', function (string $folder, string $filename) {
    $filePath = PpdiHelperService::resolveUploadFilePath($folder, $filename);
    if ($filePath === null) {
        abort(404);
    }

    return response()->file($filePath, [
        'Cache-Control'           => 'public, max-age=604800',
        'X-Content-Type-Options'  => 'nosniff',
    ]);
})
    ->where('folder', 'foto|sk|ttd|regulasi')
    ->where('filename', '[A-Za-z0-9._\-]+');

/*
|--------------------------------------------------------------------------
| 2. Single-Domain React SPA Fallback (Anti-404 saat Browser di-Refresh)
|--------------------------------------------------------------------------
| Salin hasil build Vite:
|   dist/assets/*   -> public/assets/
|   dist/index.html -> public/spa.html (hindari bentrok dengan public/index.php)
| Semua URL non-API & non-aset akan selalu mengembalikan spa.html (HTTP 200).
*/
Route::get('/{any?}', function () {
    $spaPath = public_path('spa.html');
    if (!file_exists($spaPath)) {
        $spaPath = public_path('index.html');
    }

    if (file_exists($spaPath)) {
        return response()->file($spaPath, [
            'Content-Type'  => 'text/html; charset=UTF-8',
            'Cache-Control' => 'no-cache, no-store, must-revalidate',
            'Pragma'        => 'no-cache',
            'Expires'       => '0',
        ]);
    }

    return response()->json([
        'success'  => true,
        'timezone' => config('app.timezone', 'Asia/Jakarta'),
        'message'  => 'PPDI Kabupaten Bandung Laravel API aktif. Salin dist/index.html ke public/spa.html atau akses melalui domain frontend.',
    ]);
})->where('any', '^(?!api(?:/|$)|uploads(?:/|$)|up(?:/|$)|assets(?:/|$)).*$');
