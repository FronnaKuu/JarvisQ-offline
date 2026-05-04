import { defineConfig } from 'vitest/config';
import * as path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    // The repo's tsconfig path aliases are mirrored here so tests can import
    // production code via the same `@core/...` etc. specifiers used in src/.
  },
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, 'src/app'),
      '@features': path.resolve(__dirname, 'src/features'),
      '@core': path.resolve(__dirname, 'src/core'),
      '@domain': path.resolve(__dirname, 'src/domain'),
      '@data': path.resolve(__dirname, 'src/data'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@platform': path.resolve(__dirname, 'src/platform'),
    },
  },
});
