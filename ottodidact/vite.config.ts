import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: '.',
  base: './',
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions:{input:{main:path.resolve(__dirname,'index.html'),encoder:path.resolve(__dirname,'capture-encoder.html')}},
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
