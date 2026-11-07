import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || process.cwd(), '.'),
      },
    },
    server: {
      port: 3000,
      strictPort: false,
      // HMR is disabled in AI Studio via DISABLE_HMR env var or when running in container.
      // Explicitly disable or constrain HMR to prevent infinite reloading loops.
      hmr: process.env.DISABLE_HMR === 'true' ? false : { overlay: false },
      // Configure watch options to ignore node_modules, dist, uploads, git, and log files.
      watch: process.env.DISABLE_HMR === 'true'
        ? null
        : {
            ignored: [
              '**/node_modules/**',
              '**/.git/**',
              '**/dist/**',
              '**/public/uploads/**',
              '**/*.log',
              '**/app_settings.json',
            ],
            usePolling: false,
          },
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          secure: false,
          ws: false,
          bypass: (req) => {
            // Anti-loop guard: If request is already being handled on port 3000 or from Express internally, bypass proxy
            const host = req.headers.host || '';
            if (host.includes(':3000') || host.endsWith('3000')) {
              // Direct internal hit, avoid self-connecting loop
              return undefined;
            }
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (_proxyReq, req) => {
              if (process.env.DEBUG_PROXY === 'true') {
                console.log(`[Vite Proxy] Forwarding ${req.method} ${req.url} -> http://127.0.0.1:3000`);
              }
            });
            proxy.on('proxyRes', (proxyRes, req) => {
              if (process.env.DEBUG_PROXY === 'true' || (proxyRes.statusCode && proxyRes.statusCode >= 400)) {
                console.log(`[Vite Proxy] Response for ${req.method} ${req.url}: ${proxyRes.statusCode}`);
              }
            });
            proxy.on('error', (err: any, req, res: any) => {
              const code = err.code || 'UNKNOWN';
              const targetUrl = `http://127.0.0.1:3000${req.url || ''}`;
              console.error(`[Vite Proxy Error] Failed to handshake with backend target: ${targetUrl}. Reason: ${err.message} (${code})`);
              
              if (res && typeof res.writeHead === 'function' && !res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(
                  JSON.stringify({
                    success: false,
                    error: 'PROXY_HANDSHAKE_FAILED',
                    code,
                    target: targetUrl,
                    message: `Gagal menghubungkan proxy ke backend: ${err.message}`,
                    timestamp: new Date().toISOString(),
                    diagnosis: code === 'ECONNREFUSED'
                      ? 'Port 3000 backend Express belum siap menerima koneksi socket'
                      : err.message,
                  })
                );
              }
            });
          },
        },
        '/uploads': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          secure: false,
          bypass: (req) => {
            const host = req.headers.host || '';
            if (host.includes(':3000') || host.endsWith('3000')) {
              return undefined;
            }
          },
          configure: (proxy) => {
            proxy.on('error', (err: any, req, res: any) => {
              console.warn(`[Vite Proxy Uploads] Error connecting for ${req.url}:`, err.message);
              if (res && typeof res.writeHead === 'function' && !res.headersSent) {
                res.writeHead(404, { 'Content-Type': 'image/svg+xml' });
                res.end('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#f3f4f6"/></svg>');
              }
            });
          },
        },
      },
    },
    preview: {
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
        '/uploads': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
    },
  };
});
