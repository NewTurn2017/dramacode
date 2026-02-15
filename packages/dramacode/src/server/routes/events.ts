import { Hono } from "hono"
import { stream } from "hono/streaming"

export const EventBus = {
  listeners: new Map<string, Set<(event: string) => void>>(),

  subscribe(dramaId: string, callback: (event: string) => void) {
    if (!this.listeners.has(dramaId)) this.listeners.set(dramaId, new Set())
    this.listeners.get(dramaId)!.add(callback)
    return () => {
      this.listeners.get(dramaId)?.delete(callback)
      if (this.listeners.get(dramaId)?.size === 0) this.listeners.delete(dramaId)
    }
  },

  emit(dramaId: string, type: string) {
    for (const cb of this.listeners.get(dramaId) ?? []) {
      cb(type)
    }
  },
}

export function EventRoutes() {
  return new Hono().get("/:dramaId", (c) => {
    const dramaId = c.req.param("dramaId")
    c.header("Content-Type", "text/event-stream")
    c.header("Cache-Control", "no-cache")
    c.header("Connection", "keep-alive")

    return stream(c, async (s) => {
      await s.write("data: connected\n\n")

      const unsub = EventBus.subscribe(dramaId, async (type) => {
        try {
          await s.write(`data: ${type}\n\n`)
        } catch {}
      })

      const ping = setInterval(async () => {
        try {
          await s.write(": ping\n\n")
        } catch {}
      }, 30000)

      s.onAbort(() => {
        unsub()
        clearInterval(ping)
      })

      await new Promise(() => {})
    })
  })
}
