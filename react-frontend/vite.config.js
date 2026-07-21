import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:1000',
        changeOrigin: true,
        timeout: 0,          // disable proxy → client timeout
        proxyTimeout: 0,     // disable proxy → backend timeout
      }
    }
  },
  build: { outDir: '../frontend-react-dist' }
})
