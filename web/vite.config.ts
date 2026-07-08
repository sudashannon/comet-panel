import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8989', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
