import { Hono } from "hono"
import { stream } from "hono/streaming"
import { Chat } from "../../chat"

export function ChatRoutes() {
  return new Hono()
    .post("/:sessionID", async (c) => {
      const sessionID = c.req.param("sessionID")
      const body = await c.req.json<{
        content: string
        model?: string
        drama_title?: string
        episode_num?: number
      }>()

      if (!body.content) return c.json({ error: "content required" }, 400)

      const result = await Chat.stream({
        session_id: sessionID,
        content: body.content,
        model: body.model,
        drama_title: body.drama_title,
        episode_num: body.episode_num,
      })

      c.header("Content-Type", "text/plain; charset=utf-8")
      c.header("Transfer-Encoding", "chunked")

      return stream(c, async (s) => {
        for await (const chunk of result.textStream) {
          await s.write(chunk)
        }
      })
    })
    .post("/:sessionID/sync", async (c) => {
      const sessionID = c.req.param("sessionID")
      const body = await c.req.json<{
        content: string
        model?: string
        drama_title?: string
        episode_num?: number
      }>()

      if (!body.content) return c.json({ error: "content required" }, 400)

      const { message } = await Chat.send({
        session_id: sessionID,
        content: body.content,
        model: body.model,
        drama_title: body.drama_title,
        episode_num: body.episode_num,
      })

      return c.json(message)
    })
}
