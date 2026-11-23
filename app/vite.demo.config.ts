import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { fileURLToPath } from 'node:url'

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

/** Compila o app de verdade para rodar no navegador (pasta site/app), só com o motor de mentira. */
export default defineConfig({
  root: here('./demo'),
  base: './',
  plugins: [svelte({ configFile: here('./svelte.config.mjs') })],
  resolve: {
    alias: {
      'node:fs/promises': here('./demo/node-stub.ts'),
      'node:path': here('./demo/node-stub.ts')
    }
  },
  build: { outDir: here('../site/app'), emptyOutDir: true },
  server: { fs: { allow: [here('.')] } }
})
