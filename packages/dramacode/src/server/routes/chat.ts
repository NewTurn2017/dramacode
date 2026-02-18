import { Hono } from "hono"
import { stream } from "hono/streaming"
import { Chat, type ProviderKind, type ChatImage } from "../../chat"

export function ChatRoutes() {
  return new Hono()
    .post("/:sessionID/greet", async (c) => {
      const sessionID = c.req.param("sessionID")
      const body = await c.req.json<{ provider?: ProviderKind }>().catch(() => ({}) as { provider?: ProviderKind })

      const result = await Chat.greet({ session_id: sessionID, provider: body.provider })

      c.header("Content-Type", "text/plain; charset=utf-8")
      c.header("Transfer-Encoding", "chunked")

      return stream(c, async (s) => {
        for await (const chunk of result.textStream) {
          await s.write(chunk)
        }
      })
    })
    .post("/:sessionID", async (c) => {
      const sessionID = c.req.param("sessionID")
      const body = await c.req.json<{
        content: string
        images?: ChatImage[]
        model?: string
        provider?: ProviderKind
        drama_title?: string
        episode_num?: number
      }>()

      if (!body.content) return c.json({ error: "content required" }, 400)

      const result = await Chat.stream({
        session_id: sessionID,
        content: body.content,
        images: body.images,
        model: body.model,
        provider: body.provider,
      })

      c.header("Content-Type", "text/plain; charset=utf-8")
      c.header("Transfer-Encoding", "chunked")

      return stream(c, async (s) => {
        for await (const chunk of result.textStream) {
          await s.write(chunk)
        }
      })
    })
    .post("/:sessionID/organize", async (c) => {
      const sessionID = c.req.param("sessionID")
      const body = await c.req.json<{ provider?: ProviderKind }>().catch(() => ({}) as { provider?: ProviderKind })
      const result = await Chat.organize({ session_id: sessionID, provider: body.provider })
      return c.json(result)
    })
    .post("/:sessionID/sync", async (c) => {
      const sessionID = c.req.param("sessionID")
      const body = await c.req.json<{
        content: string
        images?: ChatImage[]
        model?: string
        provider?: ProviderKind
        drama_title?: string
        episode_num?: number
      }>()

      if (!body.content) return c.json({ error: "content required" }, 400)

      const { message } = await Chat.send({
        session_id: sessionID,
        content: body.content,
        images: body.images,
        model: body.model,
        provider: body.provider,
      })

      return c.json(message)
    })
}
