import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: { include: ['shared/**', 'server/app.ts', 'server/store.ts', 'src/core/**'] },
  },
});
