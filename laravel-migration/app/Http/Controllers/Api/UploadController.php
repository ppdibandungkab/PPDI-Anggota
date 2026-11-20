<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\PpdiHelperService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;

class UploadController extends Controller
{
    /**
     * POST /api/upload
     */
    public function store(Request $request)
    {
        try {
            $type = (string) $request->input('type', 'foto');
            $fileName = $request->input('fileName');
            $fileData = (string) $request->input('fileData', '');
            $nik = $request->input('nik');

            if ($fileData === '') {
                return response()->json([
                    'success' => false,
                    'message' => 'Data file base64 tidak ditemukan',
                ], 400);
            }

            $folderType = match ($type) {
                'sk'       => 'sk',
                'ttd'      => 'ttd',
                'regulasi' => 'regulasi',
                default    => 'foto',
            };

            if ($folderType === 'sk' && !PpdiHelperService::isValidPdfBase64Upload($fileData, $fileName)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Hanya file berformat PDF (.pdf) yang diperbolehkan untuk berkas SK.',
                ], 400);
            }

            $saved = PpdiHelperService::saveBase64UploadToDisk($folderType, $fileData, $fileName, $nik);

            return response()->json([
                'success'   => true,
                'message'   => 'File ' . strtoupper($folderType) . ' berhasil diunggah ke folder server',
                'url'       => $saved['url'],
                'fileName'  => $saved['fileName'],
                'folder'    => $folderType,
                'sizeBytes' => $saved['sizeBytes'],
                'mimeType'  => $saved['mimeType'],
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * GET /api/uploads/list
     */
    public function list()
    {
        $scan = function (string $folder) {
            $dir = PpdiHelperService::resolveUploadDir($folder);
            if (!File::isDirectory($dir)) {
                return [];
            }

            return collect(File::files($dir))
                ->filter(fn ($f) => !str_starts_with($f->getFilename(), '.'))
                ->map(fn ($f) => [
                    'name'      => $f->getFilename(),
                    'type'      => $folder,
                    'url'       => "/uploads/{$folder}/" . $f->getFilename(),
                    'sizeBytes' => $f->getSize(),
                    'mtime'     => date('c', $f->getMTime()),
                ])
                ->sortByDesc('mtime')
                ->values()
                ->all();
        };

        $foto = $scan('foto');
        $sk = $scan('sk');
        $ttd = $scan('ttd');
        $regulasi = $scan('regulasi');

        return response()->json([
            'success'  => true,
            'folders'  => [
                'fotoDir'     => PpdiHelperService::resolveUploadDir('foto'),
                'skDir'       => PpdiHelperService::resolveUploadDir('sk'),
                'ttdDir'      => PpdiHelperService::resolveUploadDir('ttd'),
                'regulasiDir' => PpdiHelperService::resolveUploadDir('regulasi'),
            ],
            'foto'     => ['count' => count($foto), 'files' => $foto],
            'sk'       => ['count' => count($sk), 'files' => $sk],
            'ttd'      => ['count' => count($ttd), 'files' => $ttd],
            'regulasi' => ['count' => count($regulasi), 'files' => $regulasi],
        ]);
    }

    /**
     * DELETE /api/uploads/{folder}/{fileName}
     */
    public function destroy(string $folder, string $fileName)
    {
        if (!in_array($folder, ['foto', 'sk', 'ttd', 'regulasi'], true)) {
            return response()->json(['success' => false, 'message' => 'Folder tidak valid'], 400);
        }

        $safeFileName = basename($fileName);
        $filePath = PpdiHelperService::resolveUploadFilePath($folder, $safeFileName);

        if ($filePath === null || !File::exists($filePath)) {
            return response()->json(['success' => false, 'message' => 'Berkas tidak ditemukan'], 404);
        }

        File::delete($filePath);
        return response()->json([
            'success' => true,
            'message' => "Berkas {$safeFileName} berhasil dihapus dari folder /uploads/{$folder}",
        ]);
    }
}
