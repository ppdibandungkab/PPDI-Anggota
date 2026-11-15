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
      // HMR is disabled in AI Studio container to prevent WebSocket errors and startup delays.
      hmr: false,
      watch: null,
    },
    preview: {
      port: 3000,
    },
  };
});
