import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../storage/schema.sql"

export const ScrapTable = sqliteTable(
  "scrap",
  {
    id: text().primaryKey(),
    drama_id: text().notNull(),
    content: text().notNull(),
    memo: text(),
    source_session_id: text(),
    ...Timestamps,
  },
  (table) => [index("scrap_drama_idx").on(table.drama_id)],
)
