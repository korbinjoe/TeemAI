import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'web'),
      '@shared': resolve(__dirname, 'shared'),
    },
  },
  test: {
    environment: 'node',
    include: [
      'server/__tests__/**/*.test.ts',
      'shared/__tests__/**/*.test.ts',
      'web/__tests__/**/*.test.ts',
      'web/__tests__/**/*.test.tsx',
    ],
  },
})
