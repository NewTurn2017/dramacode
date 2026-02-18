import { Hono, type MiddlewareHandler } from "hono"
import { cors } from "hono/cors"
import path from "path"
import { Log } from "../util/log"
import { Auth } from "../auth"
import { OpenAIAuth } from "../plugin/openai"
import { AnthropicAuth } from "../plugin/anthropic"
import { Updater } from "../update"
import { lazy } from "../util/lazy"
import { SessionRoutes } from "./routes/session"
import { ChatRoutes } from "./routes/chat"
import { DramaRoutes, EpisodeRoutes, SceneRoutes, CharacterImageRoutes, WorldRoutes, PlotPointRoutes, UploadsRoutes } from "./routes/drama"
import { WriterRoutes } from "./routes/writer"
import { ScrapRoutes } from "./routes/scrap"
import { EventRoutes } from "./routes/events"
import { NotFoundError } from "../storage/db"
import { cleanupDuplicates } from "../chat/structured"

const log = Log.create({ service: "server" })

let _url: URL | undefined
let _version = "0.1.0"
let _cachedUpdate: Awaited<ReturnType<typeof Updater.check>> = null
let _updateState: { step: "idle" | "downloading" | "downloaded" | "applying" | "restarting" | "error"; percent: number; error?: string; zipPath?: string } = { step: "idle", percent: 0 }
let _aliveConnections = 0
let _shutdownTimer: ReturnType<typeof setTimeout> | undefined
const SHUTDOWN_GRACE_MS = 15_000

export namespace Server {
  export function url(): URL {
    return _url ?? new URL("http://localhost:4097")
  }

  export function setVersion(v: string) {
    _version = v
  }

  const app = new Hono()

  export const App: () => Hono = lazy(
    () =>
      app
        .onError((err, c) => {
          log.error("failed", { error: String(err) })
          if (err instanceof NotFoundError) return c.json({ error: err.message }, 404)
          if (err instanceof SyntaxError && err.message.includes("JSON")) {
            return c.json({ error: "Invalid JSON body" }, 400)
          }
          return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
        })
        .use(async (c, next) => {
          const requestId = crypto.randomUUID().slice(0, 8)
          c.header("X-Request-ID", requestId)
          log.info("request", { method: c.req.method, path: c.req.path, requestId })
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
        .route("/character", CharacterImageRoutes())
        .route("/world", WorldRoutes())
        .route("/plot-point", PlotPointRoutes())
        .route("/uploads", UploadsRoutes())
        .route("/writer", WriterRoutes())
        .route("/scrap", ScrapRoutes())
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
        })
        .post("/auth/anthropic/login", async (c) => {
          try {
            const { url, verifier } = await AnthropicAuth.webLogin()
            return c.json({ url, verifier })
          } catch (err) {
            log.error("anthropic login failed", { error: String(err) })
            return c.json({ error: "Failed to start Anthropic login" }, 500)
          }
        })
        .post("/auth/anthropic/callback", async (c) => {
          try {
            const body = await c.req.json<{ code: string; verifier: string }>()
            if (!body.code || !body.verifier) return c.json({ error: "code and verifier required" }, 400)
            const login = await AnthropicAuth.exchange(body.code, body.verifier)
            await Auth.set("anthropic", {
              type: "oauth",
              refresh: login.refresh,
              access: login.access,
              expires: login.expires,
            })
            return c.json({ ok: true })
          } catch (err) {
            log.error("anthropic callback failed", { error: String(err) })
            return c.json({ error: err instanceof Error ? err.message : "Anthropic auth failed" }, 500)
          }
        })
        .get("/update/check", async (c) => {
          const info = _cachedUpdate ?? (await Updater.check(_version))
          if (info?.hasUpdate) _cachedUpdate = info
          return c.json({
            version: _version,
            hasUpdate: info?.hasUpdate ?? false,
            latest: info?.latest ?? _version,
            releaseUrl: info?.releaseUrl ?? null,
            size: info?.size ?? 0,
          })
        })
        .post("/update/start", async (c) => {
          if (!_cachedUpdate?.hasUpdate) return c.json({ error: "No update available" }, 400)
          if (_updateState.step === "downloading") return c.json({ error: "Already downloading" }, 409)
          _updateState = { step: "downloading", percent: 0 }
          Updater.download(_cachedUpdate, (pct) => {
            _updateState = { step: "downloading", percent: pct }
          })
            .then((zipPath) => {
              _updateState = { step: "downloaded", percent: 100, zipPath }
            })
            .catch((err) => {
              log.error("update download failed", { error: String(err) })
              _updateState = { step: "error", percent: 0, error: String(err) }
            })
          return c.json({ ok: true })
        })
        .get("/update/progress", (c) => {
          return c.json({ step: _updateState.step, percent: _updateState.percent, error: _updateState.error ?? null })
        })
        .post("/update/apply", async (c) => {
          if (_updateState.step !== "downloaded" || !_updateState.zipPath) {
            return c.json({ error: "No downloaded update to apply" }, 400)
          }
          try {
            const zipPath = _updateState.zipPath
            _updateState = { step: "applying", percent: 100 }
            await Updater.apply(zipPath)
            _updateState = { step: "restarting", percent: 100 }
            setTimeout(() => Updater.restart(), 2000)
            return c.json({ ok: true })
          } catch (err) {
            log.error("update apply failed", { error: String(err) })
            _updateState = { step: "error", percent: 0, error: String(err) }
            return c.json({ error: String(err) }, 500)
          }
        })
        .get("/alive", (c) => {
          const encoder = new TextEncoder()
          const body = new ReadableStream({
            start(controller) {
              _aliveConnections++
              if (_shutdownTimer) {
                clearTimeout(_shutdownTimer)
                _shutdownTimer = undefined
                log.info("shutdown cancelled, browser reconnected", { connections: _aliveConnections })
              }
              controller.enqueue(encoder.encode("data: connected\n\n"))
              const ping = setInterval(() => {
                try { controller.enqueue(encoder.encode(": ping\n\n")) } catch {}
              }, 15000)
              const signal = c.req.raw.signal as EventTarget
              signal.addEventListener("abort", () => {
                _aliveConnections = Math.max(0, _aliveConnections - 1)
                clearInterval(ping)
                try { controller.close() } catch {}
                if (_aliveConnections === 0) {
                  log.info("all browsers disconnected, shutting down in 15s")
                  _shutdownTimer = setTimeout(() => {
                    log.info("no reconnection, shutting down")
                    process.exit(0)
                  }, SHUTDOWN_GRACE_MS)
                }
              })
            },
          })
          return new Response(body, {
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
          })
        })
        .post("/shutdown", (c) => {
          log.info("shutdown requested via API")
          setTimeout(() => process.exit(0), 500)
          return c.json({ ok: true })
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
