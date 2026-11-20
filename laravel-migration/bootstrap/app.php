<?php

use App\Http\Middleware\CheckRolePermission;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__ . '/../routes/web.php',
        api: __DIR__ . '/../routes/api.php',
        commands: __DIR__ . '/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // Percayai header X-Forwarded-* dari reverse proxy Nginx -> Apache/PHP-FPM pada HestiaCP
        $middleware->trustProxies(at: '*');

        $middleware->alias([
            'perm' => CheckRolePermission::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // Ensure all /api/* errors return consistent { success: false, message, error } JSON
        $exceptions->render(function (ValidationException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json([
                    'success' => false,
                    'message' => $e->validator->errors()->first() ?: 'Data permintaan tidak valid.',
                    'errors'  => $e->errors(),
                ], 400);
            }
        });

        $exceptions->render(function (NotFoundHttpException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json([
                    'success' => false,
                    'message' => 'Endpoint API tidak ditemukan.',
                    'error'   => 'NOT_FOUND',
                ], 404);
            }
        });

        $exceptions->render(function (\Throwable $e, Request $request) {
            if ($request->is('api/*')) {
                $status = method_exists($e, 'getStatusCode') ? $e->getStatusCode() : 500;
                return response()->json([
                    'success' => false,
                    'message' => config('app.debug') ? $e->getMessage() : 'Terjadi kesalahan internal pada server.',
                    'error'   => $e->getMessage(),
                ], $status);
            }
        });
    })
    ->create();
