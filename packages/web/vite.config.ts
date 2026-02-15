import { defineConfig } from "vite"
import solid from "vite-plugin-solid"
import tailwindcss from "@tailwindcss/vite"
import path from "path"

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 4098,
    proxy: {
      "/api/events": {
        target: "http://localhost:4097",
        rewrite: (p) => p.replace(/^\/api/, ""),
        headers: { "X-Accel-Buffering": "no" },
      },
      "/api": {
        target: "http://localhost:4097",
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
  build: {
    outDir: "dist",
  },
})
