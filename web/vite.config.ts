import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  base: process.env.TOK_BASE ?? '/tok/',
  plugins: [preact()],
  build: { target: 'es2022', sourcemap: true },
  server: { port: 5173 },
});
