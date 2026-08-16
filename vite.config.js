import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Ensures assets load correctly on GitHub Pages and custom subpaths
  build: {
    outDir: 'dist',
  }
});
