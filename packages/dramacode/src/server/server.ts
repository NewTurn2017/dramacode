import { Hono, type MiddlewareHandler } from "hono"
import { cors } from "hono/cors"
import path from "path"
import { Log } from "../util/log"
import { Auth } from "../auth"
import { OpenAIAuth } from "../plugin/openai"
import { lazy } from "../util/lazy"
import { SessionRoutes } from "./routes/session"
import { ChatRoutes } from "./routes/chat"
import { DramaRoutes, EpisodeRoutes, SceneRoutes } from "./routes/drama"
import { WriterRoutes } from "./routes/writer"
import { EventRoutes } from "./routes/events"
import { NotFoundError } from "../storage/db"
import { cleanupDuplicates } from "../chat/structured"

const log = Log.create({ service: "server" })

let _url: URL | undefined

export namespace Server {
  export function url(): URL {
    return _url ?? new URL("http://localhost:4097")
  }

  const app = new Hono()

  export const App: () => Hono = lazy(
    () =>
      app
        .onError((err, c) => {
          log.error("failed", { error: String(err) })
          if (err instanceof NotFoundError) return c.json({ error: err.message }, 404)
          return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
        })
        .use(async (c, next) => {
          log.info("request", { method: c.req.method, path: c.req.path })
          await next()
        })
        .use(
          cors({
            origin(input) {
              if (!input) return
              if (input.startsWith("http://localhost:")) return input
              if (input.startsWith("http://127.0.0.1:")) return input
              return
            },
          }),
        )
        .get("/health", (c) => c.json({ ok: true }))
        .route("/session", SessionRoutes())
        .route("/chat", ChatRoutes())
        .route("/drama", DramaRoutes())
        .route("/episode", EpisodeRoutes())
        .route("/scene", SceneRoutes())
        .route("/writer", WriterRoutes())
        .route("/events", EventRoutes())
        .put("/auth/:providerID", async (c) => {
          const providerID = c.req.param("providerID")
          const body = await c.req.json()
          const parsed = Auth.Info.safeParse(body)
          if (!parsed.success) return c.json({ error: "invalid auth info" }, 400)
          await Auth.set(providerID, parsed.data)
          return c.json(true)
        })
        .delete("/auth/:providerID", async (c) => {
          const providerID = c.req.param("providerID")
          await Auth.remove(providerID)
          return c.json(true)
        })
        .get("/auth", async (c) => {
          const data = await Auth.all()
          const providers = Object.keys(data)
          return c.json({ providers })
        })
        .post("/auth/openai/login", async (c) => {
          try {
            const { url, userCode, done } = await OpenAIAuth.webLogin()
            done
              .then((login) =>
                Auth.set("openai", {
                  type: "oauth",
                  refresh: login.refresh,
                  access: login.access,
                  expires: login.expires,
                  accountId: login.accountId,
                }),
              )
              .catch((err) => log.error("openai device auth failed", { error: String(err) }))
            return c.json({ url, userCode })
          } catch (err) {
            log.error("openai device login failed", { error: String(err) })
            return c.json({ error: "Failed to start device login" }, 500)
          }
        }) as unknown as Hono,
  )

  function withStatic(dir: string) {
    const base = path.resolve(dir)
    const indexFile = path.join(base, "index.html")

    const files: MiddlewareHandler = async (c, next) => {
      const reqPath = new URL(c.req.url).pathname
      const filePath = path.resolve(base, "." + reqPath)
      if (!filePath.startsWith(base) || filePath === base) return next()
      try {
        const file = Bun.file(filePath)
        if (await file.exists()) return new Response(file)
      } catch {}
      return next()
    }

    const fallback: MiddlewareHandler = async (c) => {
      if (path.extname(new URL(c.req.url).pathname)) return c.notFound()
      return new Response(Bun.file(indexFile), {
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    }

    log.info("static", { dir: base })
    return new Hono()
      .get("/health", (c) => c.json({ ok: true }))
      .route("/api", App())
      .use("*", files)
      .get("*", fallback)
  }

  export function listen(opts: { port: number; hostname: string; static?: string }) {
    const handler = opts.static ? withStatic(opts.static) : App()
    const args = {
      hostname: opts.hostname,
      fetch: handler.fetch,
    } as const
    const tryServe = (port: number) => {
      try {
        return Bun.serve({ ...args, port, idleTimeout: 255 })
      } catch {
        return undefined
      }
    }
    const server = opts.port === 0 ? (tryServe(4097) ?? tryServe(0)) : tryServe(opts.port)
    if (!server) throw new Error(`Failed to start server on port ${opts.port}`)
    _url = server.url
    cleanupDuplicates()
    return server
  }
}
