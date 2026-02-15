import { Hono } from "hono"
import { cors } from "hono/cors"
import { Log } from "../util/log"
import { Auth } from "../auth"
import { lazy } from "../util/lazy"
import { SessionRoutes } from "./routes/session"
import { ChatRoutes } from "./routes/chat"
import { DramaRoutes, EpisodeRoutes, SceneRoutes } from "./routes/drama"
import { WriterRoutes } from "./routes/writer"
import { NotFoundError } from "../storage/db"

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
        }) as unknown as Hono,
  )

  export function listen(opts: { port: number; hostname: string }) {
    const args = {
      hostname: opts.hostname,
      fetch: App().fetch,
    } as const
    const tryServe = (port: number) => {
      try {
        return Bun.serve({ ...args, port })
      } catch {
        return undefined
      }
    }
    const server = opts.port === 0 ? (tryServe(4097) ?? tryServe(0)) : tryServe(opts.port)
    if (!server) throw new Error(`Failed to start server on port ${opts.port}`)
    _url = server.url
    return server
  }
}
