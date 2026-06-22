import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite serves and builds the React UI only. The repo root stays the source of
// truth for core/, adapters/ and config/, which the UI imports directly.
export default defineConfig({
  root: "ui",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    // Dev: Vite serves the front and proxies /api to the Express middle
    // (npm run serve). In production the front (nginx) proxies /api to the
    // middle — same-origin either way; the middle never serves the front.
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
  preview: {
    host: "127.0.0.1",
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: false,
    // No inline module-preload polyfill: keeps the built index.html free of
    // inline <script>, so the server's strict CSP (script-src 'self') holds.
    modulePreload: { polyfill: false },
  },
});
