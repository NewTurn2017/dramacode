import { ulid } from "ulid"
import { Database, eq, desc, NotFoundError } from "../storage/db"
import { SessionTable, MessageTable } from "./session.sql"
import { Log } from "../util/log"

const log = Log.create({ service: "session" })

export namespace Session {
  export type Info = typeof SessionTable.$inferSelect
  export type Message = typeof MessageTable.$inferSelect

  export function create(input: { title?: string; drama_id?: string }): Info {
    const id = ulid()
    const now = Date.now()
    const title = input.title ?? `New session — ${new Date().toISOString()}`
    const row = Database.use((db) =>
      db
        .insert(SessionTable)
        .values({
          id,
          title,
          drama_id: input.drama_id ?? null,
          time_created: now,
          time_updated: now,
        })
        .returning()
        .get(),
    )
    log.info("session.created", { id: row.id, title: row.title })
    return row
  }

  export function get(id: string): Info {
    const row = Database.use((db) => db.select().from(SessionTable).where(eq(SessionTable.id, id)).get())
    if (!row) throw new NotFoundError({ message: `session not found: ${id}` })
    return row
  }

  export function list(limit = 50): Info[] {
    return Database.use((db) =>
      db.select().from(SessionTable).orderBy(desc(SessionTable.time_updated)).limit(limit).all(),
    )
  }

  export function remove(id: string) {
    Database.use((db) => {
      db.delete(SessionTable).where(eq(SessionTable.id, id)).run()
    })
    log.info("session.removed", { id })
  }

  export function setTitle(id: string, title: string): Info {
    const row = Database.use((db) =>
      db.update(SessionTable).set({ title, time_updated: Date.now() }).where(eq(SessionTable.id, id)).returning().get(),
    )
    if (!row) throw new NotFoundError({ message: `session not found: ${id}` })
    return row
  }

  export function messages(sessionID: string, limit = 200): Message[] {
    return Database.use((db) =>
      db
        .select()
        .from(MessageTable)
        .where(eq(MessageTable.session_id, sessionID))
        .orderBy(MessageTable.time_created)
        .limit(limit)
        .all(),
    )
  }

  export function addMessage(input: {
    session_id: string
    role: "user" | "assistant" | "system"
    content: string
  }): Message {
    const id = ulid()
    const now = Date.now()
    const row = Database.use((db) => {
      const msg = db
        .insert(MessageTable)
        .values({
          id,
          session_id: input.session_id,
          role: input.role,
          content: input.content,
          time_created: now,
          time_updated: now,
        })
        .returning()
        .get()
      db.update(SessionTable).set({ time_updated: now }).where(eq(SessionTable.id, input.session_id)).run()
      return msg
    })
    return row
  }
}
