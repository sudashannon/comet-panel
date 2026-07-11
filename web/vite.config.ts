import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import { configDefaults } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss(), wasm(), topLevelAwait()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8989', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: [...configDefaults.exclude, 'tests/**'],
  },
})
