import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/build/three.core.js')) return 'three-core';
          if (id.includes('/node_modules/three/')) return 'three-renderer';
        },
      },
    },
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true, allowedHosts: ['web'], proxy: { '/api': process.env.API_PROXY_TARGET || 'http://127.0.0.1:3001' } },
});
