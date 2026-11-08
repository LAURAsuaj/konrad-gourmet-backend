import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El puerto 5173 coincide con CORS_ORIGINS del .env.example del backend.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: { environment: 'node', include: ['src/**/*.test.js'] },
});
