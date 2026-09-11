import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['__tests__/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/tax/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
