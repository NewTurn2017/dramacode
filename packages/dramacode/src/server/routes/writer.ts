import { Hono } from "hono"
import { WriterStyle } from "../../writer"

export function WriterRoutes() {
  return new Hono()
    .get("/", (c) => {
      const category = c.req.query("category")
      if (category) return c.json(WriterStyle.listByCategory(category as WriterStyle.Category))
      return c.json(WriterStyle.list())
    })
    .delete("/:id", (c) => {
      WriterStyle.remove(c.req.param("id"))
      return c.json(true)
    })
}
