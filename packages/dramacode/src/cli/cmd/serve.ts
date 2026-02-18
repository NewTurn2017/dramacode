import type { CommandModule } from "yargs"
import path from "path"
import { existsSync } from "fs"
import { exec } from "child_process"
import { Server } from "../../server/server"
import { Updater } from "../../update"
import { startTunnel } from "../../tunnel/tunnel"

function openBrowser(url: string) {
  if (process.platform === "darwin") {
    exec(`/usr/bin/open "${url}"`, (err) => {
      if (err) console.error(`Failed to open browser: ${err.message}`)
    })
  } else if (process.platform === "win32") {
    exec(`start "" "${url}"`, (err) => {
      if (err) console.error(`Failed to open browser: ${err.message}`)
    })
  } else {
    exec(`xdg-open "${url}"`, (err) => {
      if (err) console.error(`Failed to open browser: ${err.message}`)
    })
  }
}

function resolveStaticDir(explicit?: string): string | undefined {
  if (explicit) return explicit
  const execDir = path.dirname(process.execPath)
  const candidates = [
    path.join(execDir, "web"),
    path.join(execDir, "../Resources/web"),
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
      .option("tunnel", {
        describe: "expose server via Cloudflare Quick Tunnel (free public HTTPS URL)",
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
    if (argv.tunnel) {
      const status = await startTunnel(server.url.port ? Number(server.url.port) : 4097)
      if (status.state === "connected" && status.url) {
        console.log(`\n  🌐 Public URL: ${status.url}\n`)
        if (argv.open) {
          openBrowser(status.url)
        }
      } else if (status.state === "error") {
        console.error(`Tunnel failed: ${status.error}`)
      }
    } else if (argv.open) {
      openBrowser(server.url.href)
    }

    Updater.cleanupOldBinary()

    await new Promise(() => {})
  },
}
