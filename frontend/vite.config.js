import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  base: '/bit-indcon/',
  plugins: [
    react(),
    basicSsl()
  ],
  server: {
    host: true,
    https: true
  }
})
