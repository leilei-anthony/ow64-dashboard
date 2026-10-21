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
    rollupOptions: {
      // The new tab page, plus the background service worker that runs the pomodoro timer.
      input: { newtab: 'newtab.html', background: 'src/background.ts' },
      output: {
        // The manifest points at background.js, so that one entry keeps a fixed name.
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    env: { TZ: 'America/New_York' },
  },
});
