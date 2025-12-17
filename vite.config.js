import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true,
    host: true,
  },
  base: '/api/app/',  // Usar ruta /api/ que nginx pasa a Node.js
  build: {
    assetsDir: 'assets',
  },
})
