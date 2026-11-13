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
    },
    preview: {
      port: 3000,
    },
  };
});
