import { Hono } from "hono"
import { Scrap } from "../../scrap"

export function ScrapRoutes() {
  return new Hono()
    .get("/", (c) => {
      const dramaId = c.req.query("drama_id")
      if (!dramaId) return c.json({ error: "drama_id required" }, 400)
      return c.json(Scrap.listByDrama(dramaId))
    })
    .post("/", async (c) => {
      const body = await c.req.json<{
        drama_id: string
        content: string
        memo?: string
        source_session_id?: string
      }>()
      const scrap = Scrap.create(body)
      return c.json(scrap, 201)
    })
    .patch("/:id", async (c) => {
      const body = await c.req.json<{ memo?: string }>()
      const scrap = Scrap.update(c.req.param("id"), body)
      return c.json(scrap)
    })
    .delete("/:id", (c) => {
      Scrap.remove(c.req.param("id"))
      return c.json(true)
    })
}
