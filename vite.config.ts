import { defineConfig } from 'vite';

// Allow project-page deployments (e.g. GitHub Pages at /repo/) without
// rewriting every asset URL. Defaults to the domain root.
const base =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.VITE_BASE ?? '/';

export default defineConfig({
  base,
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // The Arena preview proxy serves the app from https://<port>-<sandbox>.e2b.app
    allowedHosts: true,
    fs: { strict: false },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 4096,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // Keep the engine in its own cacheable chunk; gameplay changes should
        // not invalidate the ~2.5 MB PlayCanvas payload.
        manualChunks: { playcanvas: ['playcanvas'] },
      },
    },
  },
  optimizeDeps: {
    include: ['playcanvas'],
  },
});
