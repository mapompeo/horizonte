import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'demo/**/*.test.ts', 'build-scripts/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['vitest.setup.ts']
  }
})
