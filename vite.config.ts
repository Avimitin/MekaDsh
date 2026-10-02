import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const { version }: { version: string } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
);

export default defineConfig({
  base: process.env.MEKADSH_BASE_PATH ?? '/',
  define: { __MEKADSH_VERSION__: JSON.stringify(version) },
  plugins: [react()],
  server: {
    watch: { awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 20 } },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    clearMocks: true,
    restoreMocks: true,
  },
});
