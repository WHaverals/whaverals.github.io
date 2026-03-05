import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  // Static deployment under Hugo's /static/flip-explorer/
  // Use relative base so it works at https://.../flip-explorer/
  base: './',
  plugins: [svelte()],
  build: {
    outDir: '../static/flip-explorer',
    emptyOutDir: false, // do NOT delete static/flip-explorer/data
    assetsDir: 'assets',
  },
})
