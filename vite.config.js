import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true,
    host: true,
  },
  build: {
    assetsDir: 'static',  // Cambiar de 'assets' a 'static' para evitar intercepción de nginx
  },
})
