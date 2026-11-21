<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateChairmanSettingsRequest;
use App\Services\AppSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;

class SettingsController extends Controller
{
    public function __construct(
        private readonly AppSettingsService $settingsService
    ) {
    }

    /**
     * GET /api/settings (Publik - tanpa login)
     */
    public function index(): JsonResponse
    {
        try {
            $settings = $this->settingsService->getAllSettings();

            return response()->json([
                'success'  => true,
                'settings' => $settings,
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'error'   => $e->getMessage(),
                'message' => 'Gagal memuat pengaturan aplikasi.',
            ], 500);
        }
    }

    /**
     * POST / PUT /api/settings (Protected - Admin)
     */
    public function save(Request $request): JsonResponse
    {
        try {
            if ($request->hasFile('chairman_photo')) {
                $request->validate([
                    'chairman_photo' => ['file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
                ]);
            }

            $payload = $request->input('settings', $request->except(['chairman_photo']));
            if (!is_array($payload)) {
                $payload = [];
            }

            if (!$request->hasFile('chairman_photo') && $request->exists('chairman_photo')) {
                $payload['chairman_photo'] = $request->input('chairman_photo');
            }

            $merged = $this->settingsService->updateAllSettings(
                $payload,
                $request->file('chairman_photo')
            );

            return response()->json([
                'success'  => true,
                'message'  => 'Pengaturan aplikasi berhasil disimpan',
                'settings' => $merged,
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->validator->errors()->first() ?: 'Validasi input gagal.',
                'errors'  => $e->errors(),
            ], 422);
        } catch (InvalidArgumentException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 400);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'error'   => $e->getMessage(),
                'message' => 'Gagal menyimpan pengaturan aplikasi.',
            ], 500);
        }
    }

    /**
     * GET /api/settings/chairman (Publik - untuk halaman depan tanpa login)
     */
    public function getChairman(): JsonResponse
    {
        try {
            $chairman = $this->settingsService->getChairmanSettings();

            return response()->json([
                'success'  => true,
                'data'     => $chairman,
                'settings' => $chairman,
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'error'   => $e->getMessage(),
                'message' => 'Gagal memuat data sambutan Ketua PPDI.',
            ], 500);
        }
    }

    /**
     * PUT /api/settings/chairman (Protected - khusus Admin melalui middleware perm:settings-app,edit)
     */
    public function updateChairman(UpdateChairmanSettingsRequest $request): JsonResponse
    {
        try {
            $data = $request->only([
                'chairman_name',
                'chairman_title',
                'chairman_greeting',
                'chairman_photo_base64',
                'remove_photo',
            ]);

            if (!$request->hasFile('chairman_photo') && $request->exists('chairman_photo')) {
                $data['chairman_photo'] = $request->input('chairman_photo');
            }

            $updated = $this->settingsService->updateChairmanSettings(
                $data,
                $request->file('chairman_photo')
            );

            return response()->json([
                'success'  => true,
                'message'  => 'Sambutan Ketua PPDI Kabupaten Bandung berhasil disimpan',
                'data'     => $updated,
                'settings' => $updated,
            ]);
        } catch (InvalidArgumentException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 400);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'error'   => $e->getMessage(),
                'message' => 'Gagal menyimpan sambutan Ketua PPDI.',
            ], 500);
        }
    }
}
