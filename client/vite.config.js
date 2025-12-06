import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3600',
        changeOrigin: true
      },
      '/uploadPdf': {
        target: 'http://localhost:3600',
        changeOrigin: true
      },
      '/generate-response': {
        target: 'http://localhost:3600',
        changeOrigin: true
      },
      '/pdfs': {
        target: 'http://localhost:3600',
        changeOrigin: true
      }
    }
  },
  optimizeDeps: {
    include: ['pdfjs-dist']
  }
})
