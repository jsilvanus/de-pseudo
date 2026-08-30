import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset paths so the same build works at a domain root (local
  // preview) and under a GitHub Pages project path (/de-pseudo/).
  base: './',
  plugins: [react()],
});
