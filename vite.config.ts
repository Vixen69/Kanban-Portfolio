import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite serves and builds the React UI only. The repo root stays the source of
// truth for core/, adapters/ and config/, which the UI imports directly.
export default defineConfig({
  root: "ui",
  plugins: [react()],
  server: { host: "127.0.0.1" },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: false,
  },
});
