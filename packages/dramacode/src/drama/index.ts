import { ulid } from "ulid"
import { Database, eq, desc, and, NotFoundError } from "../storage/db"
import {
  DramaTable,
  EpisodeTable,
  SceneTable,
  CharacterTable,
  WorldTable,
  PlotPointTable,
  SceneCharacterTable,
} from "./drama.sql"
import { Log } from "../util/log"

const log = Log.create({ service: "drama" })

export namespace Drama {
  export type Info = typeof DramaTable.$inferSelect

  export function create(input: {
    title: string
    logline?: string
    genre?: string
    setting?: string
    tone?: string
    total_episodes?: number
  }): Info {
    const id = ulid()
    const now = Date.now()
    const row = Database.use((db) =>
      db
        .insert(DramaTable)
        .values({ id, ...input, time_created: now, time_updated: now })
        .returning()
        .get(),
    )
    log.info("drama.created", { id: row.id, title: row.title })
    return row
  }

  export function get(id: string): Info {
    const row = Database.use((db) => db.select().from(DramaTable).where(eq(DramaTable.id, id)).get())
    if (!row) throw new NotFoundError({ message: `drama not found: ${id}` })
    return row
  }

  export function list(limit = 50): Info[] {
    return Database.use((db) => db.select().from(DramaTable).orderBy(desc(DramaTable.time_updated)).limit(limit).all())
  }

  export function remove(id: string) {
    Database.use((db) => db.delete(DramaTable).where(eq(DramaTable.id, id)).run())
    log.info("drama.removed", { id })
  }

  export function update(id: string, input: Partial<Omit<Info, "id" | "time_created" | "time_updated">>): Info {
    const row = Database.use((db) =>
      db
        .update(DramaTable)
        .set({ ...input, time_updated: Date.now() })
        .where(eq(DramaTable.id, id))
        .returning()
        .get(),
    )
    if (!row) throw new NotFoundError({ message: `drama not found: ${id}` })
    return row
  }
}

export namespace Episode {
  export type Info = typeof EpisodeTable.$inferSelect

  export function create(input: {
    drama_id: string
    number: number
    title: string
    synopsis?: string
    status?: string
  }): Info {
    const id = ulid()
    const now = Date.now()
    const row = Database.use((db) =>
      db
        .insert(EpisodeTable)
        .values({ id, ...input, time_created: now, time_updated: now })
        .returning()
        .get(),
    )
    log.info("episode.created", { id: row.id, drama_id: input.drama_id, number: input.number })
    return row
  }

  export function get(id: string): Info {
    const row = Database.use((db) => db.select().from(EpisodeTable).where(eq(EpisodeTable.id, id)).get())
    if (!row) throw new NotFoundError({ message: `episode not found: ${id}` })
    return row
  }

  export function listByDrama(dramaID: string, limit = 100): Info[] {
    return Database.use((db) =>
      db
        .select()
        .from(EpisodeTable)
        .where(eq(EpisodeTable.drama_id, dramaID))
        .orderBy(EpisodeTable.number)
        .limit(limit)
        .all(),
    )
  }

  export function remove(id: string) {
    Database.use((db) => db.delete(EpisodeTable).where(eq(EpisodeTable.id, id)).run())
    log.info("episode.removed", { id })
  }

  export function update(
    id: string,
    input: Partial<Omit<Info, "id" | "drama_id" | "time_created" | "time_updated">>,
  ): Info {
    const row = Database.use((db) =>
      db
        .update(EpisodeTable)
        .set({ ...input, time_updated: Date.now() })
        .where(eq(EpisodeTable.id, id))
        .returning()
        .get(),
    )
    if (!row) throw new NotFoundError({ message: `episode not found: ${id}` })
    return row
  }
}

export namespace Scene {
  export type Info = typeof SceneTable.$inferSelect

  export function create(input: {
    episode_id: string
    number: number
    location?: string
    time_of_day?: string
    description?: string
    dialogue?: string
    notes?: string
    image_prompt?: { prompt: string; style: string; mood: string; resolution: string }
    characters_present?: string[]
  }): Info {
    const id = ulid()
    const now = Date.now()
    const row = Database.use((db) =>
      db
        .insert(SceneTable)
        .values({ id, ...input, time_created: now, time_updated: now })
        .returning()
        .get(),
    )
    log.info("scene.created", { id: row.id, episode_id: input.episode_id, number: input.number })
    return row
  }

  export function get(id: string): Info {
    const row = Database.use((db) => db.select().from(SceneTable).where(eq(SceneTable.id, id)).get())
    if (!row) throw new NotFoundError({ message: `scene not found: ${id}` })
    return row
  }

  export function listByEpisode(episodeID: string, limit = 200): Info[] {
    return Database.use((db) =>
      db
        .select()
        .from(SceneTable)
        .where(eq(SceneTable.episode_id, episodeID))
        .orderBy(SceneTable.number)
        .limit(limit)
        .all(),
    )
  }

  export function listByDrama(dramaID: string, limit = 500): Info[] {
    return Database.use((db) =>
      db
        .select({ scene: SceneTable })
        .from(SceneTable)
        .innerJoin(EpisodeTable, eq(SceneTable.episode_id, EpisodeTable.id))
        .where(eq(EpisodeTable.drama_id, dramaID))
        .orderBy(EpisodeTable.number, SceneTable.number)
        .limit(limit)
        .all(),
    ).map((row) => row.scene)
  }

  export function remove(id: string) {
    Database.use((db) => db.delete(SceneTable).where(eq(SceneTable.id, id)).run())
    log.info("scene.removed", { id })
  }

  export function update(
    id: string,
    input: Partial<
      Omit<Info, "id" | "episode_id" | "time_created" | "time_updated"> & {
        image_prompt?: { prompt: string; style: string; mood: string; resolution: string }
        characters_present?: string[]
      }
    >,
  ): Info {
    const row = Database.use((db) =>
      db
        .update(SceneTable)
        .set({ ...input, time_updated: Date.now() })
        .where(eq(SceneTable.id, id))
        .returning()
        .get(),
    )
    if (!row) throw new NotFoundError({ message: `scene not found: ${id}` })
    return row
  }

  export function addCharacter(sceneID: string, characterID: string) {
    const now = Date.now()
    Database.use((db) =>
      db
        .insert(SceneCharacterTable)
        .values({ scene_id: sceneID, character_id: characterID, time_created: now, time_updated: now })
        .onConflictDoNothing()
        .run(),
    )
  }

  export function removeCharacter(sceneID: string, characterID: string) {
    Database.use((db) =>
      db
        .delete(SceneCharacterTable)
        .where(and(eq(SceneCharacterTable.scene_id, sceneID), eq(SceneCharacterTable.character_id, characterID)))
        .run(),
    )
  }

  export function characters(sceneID: string): string[] {
    return Database.use((db) =>
      db
        .select({ character_id: SceneCharacterTable.character_id })
        .from(SceneCharacterTable)
        .where(eq(SceneCharacterTable.scene_id, sceneID))
        .all(),
    ).map((r) => r.character_id)
  }
}

export namespace Character {
  export type Info = typeof CharacterTable.$inferSelect

  export function create(input: {
    drama_id: string
    name: string
    role?: string
    age?: string
    occupation?: string
    personality?: string
    backstory?: string
    arc?: string
    relationships?: { character_id: string; type: string; description: string }[]
  }): Info {
    const id = ulid()
    const now = Date.now()
    const row = Database.use((db) =>
      db
        .insert(CharacterTable)
        .values({ id, ...input, time_created: now, time_updated: now })
        .returning()
        .get(),
    )
    log.info("character.created", { id: row.id, drama_id: input.drama_id, name: input.name })
    return row
  }

  export function get(id: string): Info {
    const row = Database.use((db) => db.select().from(CharacterTable).where(eq(CharacterTable.id, id)).get())
    if (!row) throw new NotFoundError({ message: `character not found: ${id}` })
    return row
  }

  export function listByDrama(dramaID: string, limit = 100): Info[] {
    return Database.use((db) =>
      db
        .select()
        .from(CharacterTable)
        .where(eq(CharacterTable.drama_id, dramaID))
        .orderBy(CharacterTable.name)
        .limit(limit)
        .all(),
    )
  }

  export function findByName(dramaID: string, name: string): Info | undefined {
    return Database.use((db) =>
      db
        .select()
        .from(CharacterTable)
        .where(and(eq(CharacterTable.drama_id, dramaID), eq(CharacterTable.name, name)))
        .get(),
    )
  }

  export function remove(id: string) {
    Database.use((db) => db.delete(CharacterTable).where(eq(CharacterTable.id, id)).run())
    log.info("character.removed", { id })
  }

  export function update(
    id: string,
    input: Partial<Omit<Info, "id" | "drama_id" | "time_created" | "time_updated">>,
  ): Info {
    const row = Database.use((db) =>
      db
        .update(CharacterTable)
        .set({ ...input, time_updated: Date.now() })
        .where(eq(CharacterTable.id, id))
        .returning()
        .get(),
    )
    if (!row) throw new NotFoundError({ message: `character not found: ${id}` })
    return row
  }
}

export namespace World {
  export type Info = typeof WorldTable.$inferSelect

  export function create(input: { drama_id: string; category: string; name: string; description?: string }): Info {
    const id = ulid()
    const now = Date.now()
    const row = Database.use((db) =>
      db
        .insert(WorldTable)
        .values({ id, ...input, time_created: now, time_updated: now })
        .returning()
        .get(),
    )
    log.info("world.created", { id: row.id, drama_id: input.drama_id, name: input.name })
    return row
  }

  export function get(id: string): Info {
    const row = Database.use((db) => db.select().from(WorldTable).where(eq(WorldTable.id, id)).get())
    if (!row) throw new NotFoundError({ message: `world entry not found: ${id}` })
    return row
  }

  export function listByDrama(dramaID: string, category?: string, limit = 100): Info[] {
    const condition = category
      ? and(eq(WorldTable.drama_id, dramaID), eq(WorldTable.category, category))
      : eq(WorldTable.drama_id, dramaID)
    return Database.use((db) =>
      db.select().from(WorldTable).where(condition).orderBy(WorldTable.category, WorldTable.name).limit(limit).all(),
    )
  }

  export function remove(id: string) {
    Database.use((db) => db.delete(WorldTable).where(eq(WorldTable.id, id)).run())
    log.info("world.removed", { id })
  }

  export function update(
    id: string,
    input: Partial<Omit<Info, "id" | "drama_id" | "time_created" | "time_updated">>,
  ): Info {
    const row = Database.use((db) =>
      db
        .update(WorldTable)
        .set({ ...input, time_updated: Date.now() })
        .where(eq(WorldTable.id, id))
        .returning()
        .get(),
    )
    if (!row) throw new NotFoundError({ message: `world entry not found: ${id}` })
    return row
  }
}

export namespace PlotPoint {
  export type Info = typeof PlotPointTable.$inferSelect

  export function create(input: {
    drama_id: string
    episode_id?: string
    type: string
    description: string
    resolved?: boolean
    resolved_episode_id?: string
  }): Info {
    const id = ulid()
    const now = Date.now()
    const row = Database.use((db) =>
      db
        .insert(PlotPointTable)
        .values({ id, ...input, time_created: now, time_updated: now })
        .returning()
        .get(),
    )
    log.info("plot_point.created", { id: row.id, drama_id: input.drama_id, type: input.type })
    return row
  }

  export function get(id: string): Info {
    const row = Database.use((db) => db.select().from(PlotPointTable).where(eq(PlotPointTable.id, id)).get())
    if (!row) throw new NotFoundError({ message: `plot point not found: ${id}` })
    return row
  }

  export function listByDrama(dramaID: string, limit = 200): Info[] {
    return Database.use((db) =>
      db
        .select()
        .from(PlotPointTable)
        .where(eq(PlotPointTable.drama_id, dramaID))
        .orderBy(PlotPointTable.time_created)
        .limit(limit)
        .all(),
    )
  }

  export function listUnresolved(dramaID: string): Info[] {
    return Database.use((db) =>
      db
        .select()
        .from(PlotPointTable)
        .where(and(eq(PlotPointTable.drama_id, dramaID), eq(PlotPointTable.resolved, false)))
        .orderBy(PlotPointTable.time_created)
        .all(),
    )
  }

  export function remove(id: string) {
    Database.use((db) => db.delete(PlotPointTable).where(eq(PlotPointTable.id, id)).run())
    log.info("plot_point.removed", { id })
  }

  export function resolve(id: string, resolvedEpisodeID?: string): Info {
    const row = Database.use((db) =>
      db
        .update(PlotPointTable)
        .set({
          resolved: true,
          resolved_episode_id: resolvedEpisodeID ?? null,
          time_updated: Date.now(),
        })
        .where(eq(PlotPointTable.id, id))
        .returning()
        .get(),
    )
    if (!row) throw new NotFoundError({ message: `plot point not found: ${id}` })
    log.info("plot_point.resolved", { id })
    return row
  }

  export function update(
    id: string,
    input: Partial<Omit<Info, "id" | "drama_id" | "time_created" | "time_updated">>,
  ): Info {
    const row = Database.use((db) =>
      db
        .update(PlotPointTable)
        .set({ ...input, time_updated: Date.now() })
        .where(eq(PlotPointTable.id, id))
        .returning()
        .get(),
    )
    if (!row) throw new NotFoundError({ message: `plot point not found: ${id}` })
    return row
  }
}
