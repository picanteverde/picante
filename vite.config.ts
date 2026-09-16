import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src/browser-app',
  build: {
    outDir: resolve(__dirname, 'docs/browser/app'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/browser-app/index.html'),
    },
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
    alias: { '@': resolve(__dirname, 'src') },
  },
});
