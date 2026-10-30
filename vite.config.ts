import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  // Tauri expects a fixed port and wants to see Rust errors in the terminal.
  clearScreen: false,
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        settings: resolve(__dirname, 'settings.html'),
      },
    },
  },
  server: { port: 5173, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
