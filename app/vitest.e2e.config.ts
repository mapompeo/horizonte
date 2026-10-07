import { defineConfig } from 'vitest/config'

/** Testes de verdade, no sistema em que rodam (CI do GitHub: Windows, Linux e macOS). Usam a rede e instalam coisas. */
export default defineConfig({
  test: {
    include: ['src/**/*.e2e.ts'],
    environment: 'node',
    testTimeout: 600_000,
    hookTimeout: 120_000,
    reporters: ['verbose']
  }
})
