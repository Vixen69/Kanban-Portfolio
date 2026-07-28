import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The front workspace (React 18 + Vite). Root is this directory (front/).
// core/ is imported by relative path; it sits in the npm workspace root, which
// Vite serves from. The middle (Express) serves the API on 8787 — same origin
// in production (front nginx proxies /api); in dev Vite proxies it.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    // Fail loudly when 5173 is taken instead of hopping to 5174: a silent
    // hop desynchronizes every printed/opened URL (seen on the client VM —
    // an orphan Vite squatted 5173 and the launcher opened the wrong app).
    strictPort: true,
    // "^/api/" (regex, trailing slash) — a bare "/api" prefix would also
    // capture the front's own /api.ts module request and 404 it.
    proxy: { "^/api/": "http://127.0.0.1:8787" },
  },
  preview: {
    host: "127.0.0.1",
    strictPort: true,
    proxy: { "^/api/": "http://127.0.0.1:8787" },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    // No inline module-preload polyfill: keeps dist/index.html free of inline
    // <script>, so the middle's strict CSP (script-src 'self') holds.
    modulePreload: { polyfill: false },
  },
});
