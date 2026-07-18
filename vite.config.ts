import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (proxyRequest) => {
            // Keep the development proxy compatible with the API's strict
            // same-origin mutation guard. Browser fetch metadata is preserved,
            // so genuinely cross-site requests still fail closed.
            proxyRequest.setHeader("Origin", "http://127.0.0.1:8787");
          });
        },
      },
    },
  },
  preview: {
    port: 4173,
  },
});
