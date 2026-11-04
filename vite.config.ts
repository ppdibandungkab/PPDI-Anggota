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
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          bypass: (req) => {
            if (req.headers.host && req.headers.host.includes('3000')) {
              return req.url;
            }
          },
          configure: (proxy) => {
            proxy.on('error', (err, _req, res: any) => {
              if (res && typeof res.writeHead === 'function' && !res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Proxy Connection Error', message: err.message }));
              }
            });
          },
        },
        '/uploads': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          bypass: (req) => {
            if (req.headers.host && req.headers.host.includes('3000')) {
              return req.url;
            }
          },
          configure: (proxy) => {
            proxy.on('error', (err, _req, res: any) => {
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
          target: 'http://localhost:3000',
          changeOrigin: true,
          bypass: (req) => {
            if (req.headers.host && req.headers.host.includes('3000')) {
              return req.url;
            }
          },
        },
        '/uploads': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          bypass: (req) => {
            if (req.headers.host && req.headers.host.includes('3000')) {
              return req.url;
            }
          },
        },
      },
    },
  };
});
