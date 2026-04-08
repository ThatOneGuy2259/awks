import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import prefixSelector from 'postcss-prefix-selector'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
  css: {
    postcss: {
      plugins: [
        prefixSelector({
          prefix: '.wmp-app',
          transform(_prefix, selector, prefixedSelector, filePath) {
            // Only prefix WMP-owned stylesheets.
            const isWmpOwn = filePath.includes('/pages/wmp/styles/');
            const isSevenCss = filePath.includes('/7.css/');
            if (!isWmpOwn && !isSevenCss) return selector;
            // Leave :root and @keyframes alone so custom properties still resolve.
            if (selector.startsWith(':root') || selector.startsWith('@')) return selector;
            // Don't double-prefix the root selector or descendants already prefixed.
            // (Use trailing space to avoid catching e.g. .wmp-app-button as a false positive.)
            if (selector === '.wmp-app' || selector.startsWith('.wmp-app ')) return selector;
            return prefixedSelector;
          },
        }),
      ],
    },
  },
})
