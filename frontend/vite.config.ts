import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Configuration Vite pour le developpement local.
 * En production, le proxy est gere par nginx - cette config n'est utilisee qu'en dev.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
