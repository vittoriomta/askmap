import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import type { Plugin } from "vite"

// In development the UI talks to the same local API as the CLI, reading ./.askmap (or ASKMAP_OUT).
const api = (): Plugin => ({
  name: "askmap-api",
  async configureServer(server) {
    const { createHandler } = await import("./src/core/server.ts")
    const handle = createHandler(resolve(process.env.ASKMAP_OUT ?? ".askmap"))
    server.middlewares.use((req, res, next) => void handle(req, res).then((done) => done || next(), next))
  },
})

export default defineConfig({
  root: "src/ui",
  base: "./",
  plugins: [react(), tailwindcss(), api()],
  build: { outDir: resolve(import.meta.dirname, "dist/ui"), emptyOutDir: true },
  server: { port: 5181 },
})
