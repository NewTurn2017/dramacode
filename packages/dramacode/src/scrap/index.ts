import { ulid } from "ulid"
import { Database, eq, desc, NotFoundError } from "../storage/db"
import { ScrapTable } from "./scrap.sql"
import { Log } from "../util/log"

const log = Log.create({ service: "scrap" })

export namespace Scrap {
  export type Info = typeof ScrapTable.$inferSelect

  export function create(input: {
    drama_id: string
    content: string
    memo?: string
    source_session_id?: string
  }): Info {
    const id = ulid()
    const now = Date.now()
    const row = Database.use((db) =>
      db
        .insert(ScrapTable)
        .values({
          id,
          drama_id: input.drama_id,
          content: input.content,
          memo: input.memo ?? null,
          source_session_id: input.source_session_id ?? null,
          time_created: now,
          time_updated: now,
        })
        .returning()
        .get(),
    )
    log.info("scrap.created", { id: row.id, drama_id: row.drama_id })
    return row
  }

  export function listByDrama(dramaId: string, limit = 100): Info[] {
    return Database.use((db) =>
      db
        .select()
        .from(ScrapTable)
        .where(eq(ScrapTable.drama_id, dramaId))
        .orderBy(desc(ScrapTable.time_created))
        .limit(limit)
        .all(),
    )
  }

  export function update(id: string, input: { memo?: string }): Info {
    const row = Database.use((db) =>
      db
        .update(ScrapTable)
        .set({ memo: input.memo, time_updated: Date.now() })
        .where(eq(ScrapTable.id, id))
        .returning()
        .get(),
    )
    if (!row) throw new NotFoundError({ message: `scrap not found: ${id}` })
    return row
  }

  export function remove(id: string) {
    Database.use((db) => {
      db.delete(ScrapTable).where(eq(ScrapTable.id, id)).run()
    })
    log.info("scrap.removed", { id })
  }
}
