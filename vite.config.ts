import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  // Relative asset paths so the built page works from chrome-extension://<id>/
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: { polyfill: false },
    rollupOptions: { input: 'newtab.html' },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    env: { TZ: 'America/New_York' },
  },
});
