import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    outDir: 'dist',
    // Target modern iOS Safari (14+) for compatibility
    target: ['es2020', 'safari14'],
    // Let React.lazy handle code splitting — do NOT use manualChunks.
    // manualChunks causes rolldown to hoist Three.js/Recharts into static
    // imports of the main bundle even when those libraries are only used by
    // React.lazy'd pages, defeating the purpose of lazy loading.
    rollupOptions: {},
  },
})
