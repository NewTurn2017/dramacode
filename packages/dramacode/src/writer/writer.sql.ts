import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../storage/schema.sql"

export const WriterStyleTable = sqliteTable(
  "writer_style",
  {
    id: text().primaryKey(),
    category: text().notNull(), // genre | dialogue | character | structure | preference | habit
    observation: text().notNull(),
    confidence: integer().notNull().default(1),
    drama_id: text(),
    session_id: text(),
    ...Timestamps,
  },
  (table) => [index("writer_style_category_idx").on(table.category)],
)
