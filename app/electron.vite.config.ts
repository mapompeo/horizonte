import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          // Janelas do motor de transmissão (envio oculto, exibição e relógio de medição).
          motor: resolve(__dirname, 'src/preload/motor.ts')
        }
      }
    }
  },
  renderer: {
    plugins: [svelte()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          motor: resolve(__dirname, 'src/renderer/motor.html')
        }
      }
    }
  }
})
