import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../storage/schema.sql"

export const SessionTable = sqliteTable(
  "session",
  {
    id: text().primaryKey(),
    title: text().notNull(),
    drama_id: text(),
    summary_count: integer().notNull().default(0),
    ...Timestamps,
  },
  (table) => [index("session_drama_idx").on(table.drama_id)],
)

export const MessageTable = sqliteTable(
  "message",
  {
    id: text().primaryKey(),
    session_id: text()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    role: text().notNull(),
    content: text().notNull(),
    ...Timestamps,
  },
  (table) => [index("message_session_idx").on(table.session_id)],
)
