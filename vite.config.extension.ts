import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { version } from './package.json';

const root = __dirname;

/** Generates dist-extension/manifest.json from extension/manifest.json,
 * substituting the real semver so the extension's version never drifts
 * from package.json (the source of truth used everywhere else). */
function extensionManifest() {
  return {
    name: 'de-pseudo-extension-manifest',
    closeBundle() {
      const template = readFileSync(resolve(root, 'extension/manifest.json'), 'utf-8');
      const manifest = template.replace('__APP_VERSION__', version);
      writeFileSync(resolve(root, 'dist-extension/manifest.json'), manifest);
    },
  };
}

// Builds the side-panel extension bundle into dist-extension/, reusing the
// same src/ React app as the web build (vite.config.ts). Kept as a separate
// config, rather than a mode flag on the main one, because the two builds
// have different roots, entry points, and output post-processing
// (manifest.json generation) with nothing in common beyond the plugin list.
export default defineConfig({
  root: resolve(root, 'extension'),
  base: './',
  publicDir: resolve(root, 'extension/public'),
  plugins: [react(), extensionManifest()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    outDir: resolve(root, 'dist-extension'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(root, 'extension/sidepanel.html'),
    },
  },
});
