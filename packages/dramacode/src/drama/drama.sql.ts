import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../storage/schema.sql"

export const DramaTable = sqliteTable("drama", {
  id: text().primaryKey(),
  title: text().notNull(),
  logline: text(),
  genre: text(),
  setting: text(),
  tone: text(),
  total_episodes: integer(),
  ...Timestamps,
})

export const EpisodeTable = sqliteTable(
  "episode",
  {
    id: text().primaryKey(),
    drama_id: text()
      .notNull()
      .references(() => DramaTable.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    title: text().notNull(),
    synopsis: text(),
    status: text().notNull().default("draft"), // draft | outlined | scripted | final
    ...Timestamps,
  },
  (table) => [index("episode_drama_idx").on(table.drama_id)],
)

export const SceneTable = sqliteTable(
  "scene",
  {
    id: text().primaryKey(),
    episode_id: text()
      .notNull()
      .references(() => EpisodeTable.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    location: text(),
    time_of_day: text(), // DAY | NIGHT | DAWN | DUSK
    description: text(),
    dialogue: text(),
    notes: text(),
    image_prompt: text({ mode: "json" }).$type<{ prompt: string; style: string; mood: string; resolution: string }>(),
    characters_present: text({ mode: "json" }).$type<string[]>(),
    image: text(),
    ...Timestamps,
  },
  (table) => [index("scene_episode_idx").on(table.episode_id)],
)

export const CharacterTable = sqliteTable(
  "character",
  {
    id: text().primaryKey(),
    drama_id: text()
      .notNull()
      .references(() => DramaTable.id, { onDelete: "cascade" }),
    name: text().notNull(),
    role: text(), // protagonist | antagonist | supporting | extra
    age: text(),
    occupation: text(),
    personality: text(),
    backstory: text(),
    arc: text(),
    image: text(), // relative filename e.g. "{id}.png" stored in data/images/characters/
    relationships: text({ mode: "json" }).$type<{ character_id: string; type: string; description: string }[]>(),
    ...Timestamps,
  },
  (table) => [index("character_drama_idx").on(table.drama_id)],
)

export const WorldTable = sqliteTable(
  "world",
  {
    id: text().primaryKey(),
    drama_id: text()
      .notNull()
      .references(() => DramaTable.id, { onDelete: "cascade" }),
    category: text().notNull(), // location | culture | rule | history | technology
    name: text().notNull(),
    description: text(),
    ...Timestamps,
  },
  (table) => [index("world_drama_idx").on(table.drama_id)],
)

export const PlotPointTable = sqliteTable(
  "plot_point",
  {
    id: text().primaryKey(),
    drama_id: text()
      .notNull()
      .references(() => DramaTable.id, { onDelete: "cascade" }),
    episode_id: text().references(() => EpisodeTable.id, { onDelete: "set null" }),
    type: text().notNull(), // setup | conflict | twist | climax | resolution | foreshadowing
    description: text().notNull(),
    resolved: integer({ mode: "boolean" }).default(false),
    resolved_episode_id: text().references(() => EpisodeTable.id, { onDelete: "set null" }),
    linked_plot_id: text(),
    ...Timestamps,
  },
  (table) => [index("plot_point_drama_idx").on(table.drama_id), index("plot_point_episode_idx").on(table.episode_id)],
)

export const CharacterArcTable = sqliteTable(
  "character_arc",
  {
    id: text().primaryKey(),
    drama_id: text()
      .notNull()
      .references(() => DramaTable.id, { onDelete: "cascade" }),
    character_id: text()
      .notNull()
      .references(() => CharacterTable.id, { onDelete: "cascade" }),
    episode_id: text()
      .notNull()
      .references(() => EpisodeTable.id, { onDelete: "cascade" }),
    emotion: text().notNull(), // 희망, 절망, 분노, 기쁨, 공포, 슬픔 etc
    intensity: integer().notNull(), // -5 to +5
    description: text(),
    ...Timestamps,
  },
  (table) => [
    index("character_arc_drama_idx").on(table.drama_id),
    index("character_arc_character_idx").on(table.character_id),
    index("character_arc_episode_idx").on(table.episode_id),
  ],
)

export const SceneCharacterTable = sqliteTable(
  "scene_character",
  {
    scene_id: text()
      .notNull()
      .references(() => SceneTable.id, { onDelete: "cascade" }),
    character_id: text()
      .notNull()
      .references(() => CharacterTable.id, { onDelete: "cascade" }),
    ...Timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.scene_id, table.character_id] }),
    index("scene_character_scene_idx").on(table.scene_id),
    index("scene_character_character_idx").on(table.character_id),
  ],
)
