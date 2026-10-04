import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.SPIKE_CANVAS_PORT ?? 5199),
    strictPort: true,
    // 允许读取 monorepo 根下的 packages/testkit（只读复用 fixture 与 Schema）。
    fs: { allow: ['../..'] },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
