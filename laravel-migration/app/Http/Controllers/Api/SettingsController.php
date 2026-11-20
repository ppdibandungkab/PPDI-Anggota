<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SettingsController extends Controller
{
    /**
     * GET /api/settings
     */
    public function index()
    {
        try {
            $rows = DB::table('app_settings')->get();
            $settings = [];
            foreach ($rows as $row) {
                $decoded = json_decode((string) $row->setting_value, true);
                $settings[$row->setting_key] = json_last_error() === JSON_ERROR_NONE ? $decoded : $row->setting_value;
            }
            return response()->json(['success' => true, 'settings' => $settings]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * POST /api/settings
     */
    public function save(Request $request)
    {
        try {
            $payload = $request->input('settings', $request->all());
            foreach ($payload as $key => $value) {
                DB::table('app_settings')->updateOrInsert(
                    ['setting_key' => (string) $key],
                    ['setting_value' => is_scalar($value) ? (string) $value : json_encode($value), 'updated_at' => now()]
                );
            }
            return response()->json(['success' => true, 'message' => 'Pengaturan aplikasi berhasil disimpan']);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }
}
