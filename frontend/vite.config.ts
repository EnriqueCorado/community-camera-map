import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Minimal declaration so we can read VITE_BASE without pulling in @types/node.
declare const process: { env: Record<string, string | undefined> };

export default defineConfig(() => ({
  // GitHub Pages serves under /<repo>/; set VITE_BASE at build time. Default "/"
  // for local dev and root hosts.
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
}));
