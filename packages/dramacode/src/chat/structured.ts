import { z } from "zod"
import { Character, Drama, Episode, PlotPoint, Scene, World } from "../drama"
import { Rag } from "../rag"
import { EventBus } from "../server/routes/events"
import { Log } from "../util/log"

const log = Log.create({ service: "chat.structured" })

const worldCategory = z.enum(["location", "culture", "rule", "history", "technology"])
const plotType = z.enum(["setup", "conflict", "twist", "climax", "resolution", "foreshadowing"])
const role = z.enum(["protagonist", "antagonist", "supporting", "extra"])
const tod = z.enum(["DAY", "NIGHT", "DAWN", "DUSK"])

export const StructuredSchema = z.object({
  drama: z
    .object({
      genre: z.string().optional(),
      tone: z.string().optional(),
      logline: z.string().optional(),
      setting: z.string().optional(),
      total_episodes: z.number().int().positive().optional(),
    })
    .default({}),
  characters: z
    .array(
      z.object({
        name: z.string().min(1),
        role: role.optional(),
        age: z.string().optional(),
        occupation: z.string().optional(),
        personality: z.string().optional(),
        backstory: z.string().optional(),
        arc: z.string().optional(),
      }),
    )
    .default([]),
  episodes: z
    .array(
      z.object({
        number: z.number().int().positive(),
        title: z.string().min(1),
        synopsis: z.string().optional(),
      }),
    )
    .default([]),
  world: z
    .array(
      z.object({
        category: worldCategory,
        name: z.string().min(1),
        description: z.string().optional(),
      }),
    )
    .default([]),
  plot_points: z
    .array(
      z.object({
        type: plotType,
        description: z.string().min(1),
        episode_number: z.number().int().positive().optional(),
      }),
    )
    .default([]),
  scenes: z
    .array(
      z.object({
        episode_number: z.number().int().positive(),
        number: z.number().int().positive(),
        location: z.string().optional(),
        time_of_day: tod.optional(),
        description: z.string().optional(),
        dialogue: z.string().optional(),
        notes: z.string().optional(),
        characters_present: z.array(z.string().min(1)).optional(),
      }),
    )
    .default([]),
})

export type StructuredDraft = z.infer<typeof StructuredSchema>

type Snapshot = { characters: number; episodes: number; world: number }
type SanitizeOptions = { allow_scenes?: boolean }

function text(input?: string) {
  const out = input?.trim()
  if (!out) return undefined
  return out
}

function key(input: string) {
  return input.trim().toLowerCase()
}

function mergeCharacter(base: StructuredDraft["characters"][number], next: StructuredDraft["characters"][number]) {
  return {
    name: base.name,
    role: next.role ?? base.role,
    age: text(next.age) ?? text(base.age),
    occupation: text(next.occupation) ?? text(base.occupation),
    personality: text(next.personality) ?? text(base.personality),
    backstory: text(next.backstory) ?? text(base.backstory),
    arc: text(next.arc) ?? text(base.arc),
  }
}

function hasFoundation(snapshot: Snapshot) {
  return snapshot.characters >= 2 && snapshot.episodes >= 1 && snapshot.world >= 1
}

export function sanitizeDraft(draft: StructuredDraft, snapshot: Snapshot, options?: SanitizeOptions): StructuredDraft {
  const merged = new Map<string, StructuredDraft["characters"][number]>()
  for (const item of draft.characters) {
    const name = text(item.name)
    if (!name) continue
    const k = key(name)
    const prev = merged.get(k)
    const current = { ...item, name }
    if (!prev) {
      merged.set(k, current)
      continue
    }
    merged.set(k, mergeCharacter(prev, current))
  }

  const episodes = draft.episodes
    .filter((item) => item.number > 0 && !!text(item.title))
    .map((item) => ({ number: item.number, title: text(item.title)!, synopsis: text(item.synopsis) }))

  const world = draft.world
    .filter((item) => !!text(item.name))
    .map((item) => ({ category: item.category, name: text(item.name)!, description: text(item.description) }))

  const plot_points = draft.plot_points
    .filter((item) => !!text(item.description))
    .map((item) => ({ type: item.type, description: text(item.description)!, episode_number: item.episode_number }))

  const scenes =
    hasFoundation(snapshot) && !!options?.allow_scenes
      ? draft.scenes
          .filter((item) => item.number > 0 && item.episode_number > 0)
          .map((item) => ({
            ...item,
            location: text(item.location),
            description: text(item.description),
            dialogue: text(item.dialogue),
            notes: text(item.notes),
            characters_present: item.characters_present?.map((name) => name.trim()).filter(Boolean),
          }))
      : []

  return {
    drama: {
      genre: text(draft.drama.genre),
      tone: text(draft.drama.tone),
      logline: text(draft.drama.logline),
      setting: text(draft.drama.setting),
      total_episodes: draft.drama.total_episodes,
    },
    characters: [...merged.values()],
    episodes,
    world,
    plot_points,
    scenes,
  }
}

export function sceneIntent(input: string) {
  return /(장면|씬|scene|시퀀스|콘티|대사)/i.test(input)
}

export function parseDraftText(input: string): StructuredDraft | null {
  const trimmed = input.trim()
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i)
  const raw = fenced?.[1] ?? trimmed
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) return null
  const json = raw.slice(start, end + 1)
  const data = JSON.parse(json)
  const parsed = StructuredSchema.safeParse(data)
  if (!parsed.success) return null
  return parsed.data
}

function names(input: string) {
  const section = input.match(/등장인물\s*[:：]\s*([\s\S]*?)(?:세계관\s*[:：]|에피소드\s*\d+|플롯\s*[:：]|$)/)
  if (!section?.[1]) return []
  return section[1]
    .split(/[,/]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap((item) => {
      const match = item.match(/^([^()\s]+)\(([^)]*)\)$/)
      if (!match) return [{ name: item }]
      const desc = match[2]?.trim() ?? ""
      const role = /주인공/.test(desc)
        ? "protagonist"
        : /적대|빌런/.test(desc)
          ? "antagonist"
          : /조연|파트너|리더/.test(desc)
            ? "supporting"
            : undefined
      return [
        {
          name: match[1]!.trim(),
          role,
          occupation: desc || undefined,
        },
      ]
    })
}

function episode(input: string) {
  const found =
    input.match(/에피소드\s*(\d+)\s*제목(?:은|:)?\s*([^,\.\n]+)(?:,\s*시놉시스(?:는|:)?\s*([^\.\n]+))?/i) ??
    input.match(/(\d+)화\s*제목(?:은|:)?\s*([^,\.\n]+)(?:,\s*시놉시스(?:는|:)?\s*([^\.\n]+))?/i)
  if (!found?.[1] || !found?.[2]) return []
  return [{ number: Number(found[1]), title: found[2].trim(), synopsis: found[3]?.trim() }]
}

function world(input: string) {
  const found = input.match(/세계관\s*[:：]\s*([^\.\n]+)/)
  if (!found?.[1]) return []
  return [{ category: "location" as const, name: found[1].trim() }]
}

export function heuristicDraft(input: string): StructuredDraft {
  const total = input.match(/(\d+)\s*화/)
  const setting = input.match(/세계관\s*[:：]\s*([^\.\n]+)/)?.[1]?.trim()
  const episodes = episode(input)
  const synopsis = episodes[0]?.synopsis
  return {
    drama: {
      total_episodes: total ? Number(total[1]) : undefined,
      setting,
    },
    characters: names(input),
    episodes,
    world: world(input),
    plot_points: synopsis ? [{ type: "setup", description: synopsis }] : [],
    scenes: [],
  }
}

export function snapshot(drama_id: string): Snapshot {
  return {
    characters: Character.listByDrama(drama_id).length,
    episodes: Episode.listByDrama(drama_id).length,
    world: World.listByDrama(drama_id).length,
  }
}

function indexCharacter(drama_id: string, input: Character.Info) {
  Rag.index({
    entity_id: input.id,
    entity_type: "character",
    drama_id,
    content: Rag.serialize.character(input),
  }).catch((error) =>
    log.error("structured.index.character", {
      drama_id,
      id: input.id,
      error: error instanceof Error ? error.message : String(error),
    }),
  )
}

function indexEpisode(drama_id: string, input: Episode.Info) {
  Rag.index({
    entity_id: input.id,
    entity_type: "episode",
    drama_id,
    content: Rag.serialize.episode(input),
  }).catch((error) =>
    log.error("structured.index.episode", {
      drama_id,
      id: input.id,
      error: error instanceof Error ? error.message : String(error),
    }),
  )
}

function indexWorld(drama_id: string, input: World.Info) {
  Rag.index({
    entity_id: input.id,
    entity_type: "world",
    drama_id,
    content: Rag.serialize.world(input),
  }).catch((error) =>
    log.error("structured.index.world", {
      drama_id,
      id: input.id,
      error: error instanceof Error ? error.message : String(error),
    }),
  )
}

function indexPlot(drama_id: string, input: PlotPoint.Info) {
  Rag.index({
    entity_id: input.id,
    entity_type: "plot_point",
    drama_id,
    content: Rag.serialize.plotPoint(input),
  }).catch((error) =>
    log.error("structured.index.plot", {
      drama_id,
      id: input.id,
      error: error instanceof Error ? error.message : String(error),
    }),
  )
}

function indexScene(drama_id: string, input: Scene.Info) {
  Rag.index({
    entity_id: input.id,
    entity_type: "scene",
    drama_id,
    content: Rag.serialize.scene(input),
  }).catch((error) =>
    log.error("structured.index.scene", {
      drama_id,
      id: input.id,
      error: error instanceof Error ? error.message : String(error),
    }),
  )
}

export function persistDraft(drama_id: string, draft: StructuredDraft) {
  const changed = new Set<string>()
  const base = Drama.get(drama_id)
  const nextDrama = {
    genre: draft.drama.genre,
    tone: draft.drama.tone,
    logline: draft.drama.logline,
    setting: draft.drama.setting,
    total_episodes: draft.drama.total_episodes,
  }
  const shouldUpdateDrama = Object.entries(nextDrama).some(([k, v]) => {
    if (v === undefined) return false
    const prev = base[k as keyof typeof base]
    return prev !== v
  })
  if (shouldUpdateDrama) {
    const updated = Drama.update(drama_id, nextDrama)
    changed.add("drama")
    Rag.index({
      entity_id: updated.id,
      entity_type: "drama",
      drama_id,
      content: Rag.serialize.drama(updated),
    }).catch((error) =>
      log.error("structured.index.drama", {
        drama_id,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
  }

  const chars = Character.listByDrama(drama_id)
  const byName = new Map(chars.map((item) => [key(item.name), item]))
  for (const item of draft.characters) {
    const found = byName.get(key(item.name))
    if (!found) {
      const created = Character.create({ drama_id, ...item })
      byName.set(key(created.name), created)
      changed.add("character")
      indexCharacter(drama_id, created)
      continue
    }
    const updated = Character.update(found.id, {
      role: item.role ?? found.role,
      age: item.age ?? found.age,
      occupation: item.occupation ?? found.occupation,
      personality: item.personality ?? found.personality,
      backstory: item.backstory ?? found.backstory,
      arc: item.arc ?? found.arc,
    })
    byName.set(key(updated.name), updated)
    changed.add("character")
    indexCharacter(drama_id, updated)
  }

  const eps = Episode.listByDrama(drama_id)
  const byNumber = new Map(eps.map((item) => [item.number, item]))
  for (const item of draft.episodes) {
    const found = byNumber.get(item.number)
    if (!found) {
      const created = Episode.create({ drama_id, number: item.number, title: item.title, synopsis: item.synopsis })
      byNumber.set(created.number, created)
      changed.add("episode")
      indexEpisode(drama_id, created)
      continue
    }
    const updated = Episode.update(found.id, {
      title: item.title || found.title,
      synopsis: item.synopsis ?? found.synopsis,
    })
    byNumber.set(updated.number, updated)
    changed.add("episode")
    indexEpisode(drama_id, updated)
  }

  const worlds = World.listByDrama(drama_id)
  const byWorld = new Map(worlds.map((item) => [key(`${item.category}:${item.name}`), item]))
  for (const item of draft.world) {
    const k = key(`${item.category}:${item.name}`)
    const found = byWorld.get(k)
    if (!found) {
      const created = World.create({ drama_id, ...item })
      byWorld.set(k, created)
      changed.add("world")
      indexWorld(drama_id, created)
      continue
    }
    if (!item.description || item.description === found.description) continue
    const updated = World.update(found.id, { description: item.description })
    byWorld.set(k, updated)
    changed.add("world")
    indexWorld(drama_id, updated)
  }

  const plots = PlotPoint.listByDrama(drama_id)
  const byPlot = new Set(plots.map((item) => key(`${item.type}:${item.description}`)))
  for (const item of draft.plot_points) {
    const k = key(`${item.type}:${item.description}`)
    if (byPlot.has(k)) continue
    const linked = item.episode_number ? byNumber.get(item.episode_number)?.id : undefined
    const created = PlotPoint.create({ drama_id, type: item.type, description: item.description, episode_id: linked })
    byPlot.add(k)
    changed.add("plot")
    indexPlot(drama_id, created)
  }

  if (draft.scenes.length) {
    const scenes = Scene.listByDrama(drama_id)
    const byScene = new Map(scenes.map((item) => [key(`${item.episode_id}:${item.number}`), item]))
    for (const item of draft.scenes) {
      const episode = byNumber.get(item.episode_number)
      if (!episode) continue
      const k = key(`${episode.id}:${item.number}`)
      const found = byScene.get(k)
      if (!found) {
        const created = Scene.create({
          episode_id: episode.id,
          number: item.number,
          location: item.location,
          time_of_day: item.time_of_day,
          description: item.description,
          dialogue: item.dialogue,
          notes: item.notes,
          characters_present: item.characters_present,
        })
        byScene.set(k, created)
        changed.add("scene")
        indexScene(drama_id, created)
        continue
      }
      const updated = Scene.update(found.id, {
        location: item.location ?? found.location,
        time_of_day: item.time_of_day ?? found.time_of_day,
        description: item.description ?? found.description,
        dialogue: item.dialogue ?? found.dialogue,
        notes: item.notes ?? found.notes,
        characters_present: item.characters_present ?? found.characters_present ?? undefined,
      })
      byScene.set(k, updated)
      changed.add("scene")
      indexScene(drama_id, updated)
    }
  }

  for (const type of changed) EventBus.emit(drama_id, type)

  const stats = {
    drama: changed.has("drama") ? 1 : 0,
    characters: changed.has("character") ? draft.characters.length : 0,
    episodes: changed.has("episode") ? draft.episodes.length : 0,
    world: changed.has("world") ? draft.world.length : 0,
    plot_points: changed.has("plot") ? draft.plot_points.length : 0,
    scenes: changed.has("scene") ? draft.scenes.length : 0,
  }
  log.info("structured.persist", { drama_id, ...stats })
  return stats
}
