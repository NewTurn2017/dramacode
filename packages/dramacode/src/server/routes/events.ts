import { Hono } from "hono"

export type DramaEvent = {
  type: string
  payload?: unknown
}

export const EventBus = {
  listeners: new Map<string, Set<(event: DramaEvent) => void>>(),

  subscribe(dramaId: string, callback: (event: DramaEvent) => void) {
    if (!this.listeners.has(dramaId)) this.listeners.set(dramaId, new Set())
    this.listeners.get(dramaId)!.add(callback)
    return () => {
      this.listeners.get(dramaId)?.delete(callback)
      if (this.listeners.get(dramaId)?.size === 0) this.listeners.delete(dramaId)
    }
  },

  emit(dramaId: string, type: string, payload?: unknown) {
    const event = { type, payload }
    for (const cb of this.listeners.get(dramaId) ?? []) {
      cb(event)
    }
  },
}

export function EventRoutes() {
  const encoder = new TextEncoder()

  return new Hono().get("/:dramaId", (c) => {
    const dramaId = c.req.param("dramaId")

    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("data: connected\n\n"))

        let disposed = false
        let ping: ReturnType<typeof setInterval> | undefined
        let unsubscribe: (() => void) | undefined

        const cleanup = () => {
          if (disposed) return
          disposed = true
          unsubscribe?.()
          clearInterval(ping)
          try { controller.close() } catch {}
        }

        unsubscribe = EventBus.subscribe(dramaId, (event) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
          } catch {
            cleanup()
          }
        })

        ping = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": ping\n\n"))
          } catch {
            cleanup()
          }
        }, 15000)

        const signal = c.req.raw.signal as EventTarget
        signal.addEventListener("abort", cleanup)
      },
    })

    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  })
}
