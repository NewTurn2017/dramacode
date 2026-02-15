import { Hono } from "hono"
import { Session } from "../../session"

function parseLimit(raw: string | undefined, fallback: number, max: number) {
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(1, Math.trunc(value)))
}

export function SessionRoutes() {
  return new Hono()
    .get("/", (c) => {
      const limit = parseLimit(c.req.query("limit"), 50, 200)
      const dramaId = c.req.query("drama_id")
      if (dramaId) return c.json(Session.listByDrama(dramaId, limit))
      return c.json(Session.list(limit))
    })
    .post("/", async (c) => {
      const body = await c.req.json<{ title?: string; drama_id?: string }>()
      const session = Session.create(body)
      return c.json(session, 201)
    })
    .get("/:id", (c) => {
      const session = Session.get(c.req.param("id"))
      return c.json(session)
    })
    .patch("/:id", async (c) => {
      const body = await c.req.json<{ title?: string }>()
      if (!body.title) return c.json({ error: "title required" }, 400)
      const session = Session.setTitle(c.req.param("id"), body.title)
      return c.json(session)
    })
    .delete("/:id", (c) => {
      Session.remove(c.req.param("id"))
      return c.json(true)
    })
    .get("/:id/messages", (c) => {
      const limit = parseLimit(c.req.query("limit"), 200, 1000)
      return c.json(Session.messages(c.req.param("id"), limit))
    })
}
