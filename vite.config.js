import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Redirect all routes to index.html for SPA client-side routing
    historyApiFallback: true,
  },
})
