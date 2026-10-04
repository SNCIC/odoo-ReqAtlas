import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PRESENTATION_3D_PORT ?? 5183),
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
