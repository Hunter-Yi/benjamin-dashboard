import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: '/benjamin/',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://localhost:8766",
      "/ws": { target: "ws://localhost:8766", ws: true },
    },
  },
  build: { outDir: "dist" },
});
