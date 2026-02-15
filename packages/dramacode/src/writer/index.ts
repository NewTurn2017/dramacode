import { ulid } from "ulid"
import { Database, eq, desc } from "../storage/db"
import { WriterStyleTable } from "./writer.sql"
import { Log } from "../util/log"

const log = Log.create({ service: "writer" })

export namespace WriterStyle {
  export type Info = typeof WriterStyleTable.$inferSelect
  export type Category = "genre" | "dialogue" | "character" | "structure" | "preference" | "habit"

  export function create(input: {
    category: Category
    observation: string
    confidence?: number
    drama_id?: string
    session_id?: string
  }): Info {
    const id = ulid()
    const now = Date.now()
    const row = Database.use((db) =>
      db
        .insert(WriterStyleTable)
        .values({ id, ...input, time_created: now, time_updated: now })
        .returning()
        .get(),
    )
    log.info("style.created", { id: row.id, category: row.category })
    return row
  }

  export function list(limit = 100): Info[] {
    return Database.use((db) =>
      db
        .select()
        .from(WriterStyleTable)
        .orderBy(desc(WriterStyleTable.confidence), desc(WriterStyleTable.time_updated))
        .limit(limit)
        .all(),
    )
  }

  export function listByCategory(category: Category): Info[] {
    return Database.use((db) =>
      db
        .select()
        .from(WriterStyleTable)
        .where(eq(WriterStyleTable.category, category))
        .orderBy(desc(WriterStyleTable.confidence), desc(WriterStyleTable.time_updated))
        .all(),
    )
  }

  export function remove(id: string) {
    Database.use((db) => db.delete(WriterStyleTable).where(eq(WriterStyleTable.id, id)).run())
    log.info("style.removed", { id })
  }

  export function update(id: string, input: Partial<Pick<Info, "observation" | "confidence" | "category">>): Info {
    const row = Database.use((db) =>
      db
        .update(WriterStyleTable)
        .set({ ...input, time_updated: Date.now() })
        .where(eq(WriterStyleTable.id, id))
        .returning()
        .get(),
    )
    log.info("style.updated", { id })
    return row!
  }
}
