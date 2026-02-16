import type { CommandModule } from "yargs"
import path from "path"
import { existsSync } from "fs"
import open from "open"
import { Server } from "../../server/server"

function resolveStaticDir(explicit?: string): string | undefined {
  if (explicit) return explicit
  const execDir = path.dirname(process.execPath)
  const candidates = [
    path.join(execDir, "web"),
    path.join(import.meta.dirname, "../../web"),
    path.join(import.meta.dirname, "../web"),
  ]
  for (const dir of candidates) {
    if (existsSync(path.join(dir, "index.html"))) return dir
  }
  return undefined
}

export const ServeCommand: CommandModule = {
  command: "serve",
  describe: "start the API server",
  builder(yargs) {
    return yargs
      .option("port", {
        describe: "server port",
        type: "number",
        default: 0,
      })
      .option("hostname", {
        describe: "server hostname",
        type: "string",
        default: "127.0.0.1",
      })
      .option("static", {
        describe: "serve static files from this directory (single-port mode: API at /api, SPA at /)",
        type: "string",
      })
      .option("open", {
        describe: "open browser after server starts",
        type: "boolean",
        default: false,
      })
  },
  handler: async (argv) => {
    const staticDir = resolveStaticDir(argv.static as string | undefined)
    const server = Server.listen({
      port: argv.port as number,
      hostname: argv.hostname as string,
      static: staticDir,
    })
    console.log(`Server listening on ${server.url}`)
    if (staticDir) console.log(`Serving web UI from ${path.resolve(staticDir)}`)
    if (argv.open) {
      await open(server.url.href).catch(() => {})
    }
    await new Promise(() => {})
  },
}
