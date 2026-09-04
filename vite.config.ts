import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const sourceMapPolicy = "local-inspection";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    entries: ["index.html"]
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true
  },
  build: {
    sourcemap: sourceMapPolicy === "local-inspection",
    target: "es2022"
  }
});
