import { Hono } from "hono"
import path from "path"
import fs from "fs/promises"
import { Drama, Episode, Scene, Character, CharacterArc, World, PlotPoint } from "../../drama"
import { dramaToFountain } from "../../drama/fountain"
import { dramaToScreenplayHtml } from "../../drama/screenplay-pdf"
import { AutosaveMetrics } from "../../chat/autosave-metrics"
import { Chat } from "../../chat"
import { Global } from "../../global"

const IMAGES_DIR = path.join(Global.Path.data, "images", "characters")
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])
const MAX_SIZE = 10 * 1024 * 1024

export function DramaRoutes() {
  return new Hono()
    .get("/", (c) => {
      const limit = Number(c.req.query("limit") ?? "50")
      return c.json(Drama.list(limit))
    })
    .post("/", async (c) => {
      const body = await c.req.json<Parameters<typeof Drama.create>[0]>()
      return c.json(Drama.create(body), 201)
    })
    .get("/:id", (c) => c.json(Drama.get(c.req.param("id"))))
    .patch("/:id", async (c) => {
      const body = await c.req.json()
      return c.json(Drama.update(c.req.param("id"), body))
    })
    .delete("/:id", (c) => {
      Drama.remove(c.req.param("id"))
      return c.json(true)
    })
    .get("/:id/episodes", (c) => c.json(Episode.listByDrama(c.req.param("id"))))
    .get("/:id/scenes", (c) => c.json(Scene.listByDrama(c.req.param("id"))))
    .post("/:id/episodes", async (c) => {
      const body = await c.req.json<Omit<Parameters<typeof Episode.create>[0], "drama_id">>()
      return c.json(Episode.create({ drama_id: c.req.param("id"), ...body }), 201)
    })
    .get("/:id/characters", (c) => c.json(Character.listByDrama(c.req.param("id"))))
    .post("/:id/characters", async (c) => {
      const body = await c.req.json<Omit<Parameters<typeof Character.create>[0], "drama_id">>()
      return c.json(Character.create({ drama_id: c.req.param("id"), ...body }), 201)
    })
    .get("/:id/world", (c) => {
      const category = c.req.query("category")
      return c.json(World.listByDrama(c.req.param("id"), category))
    })
    .get("/:id/autosave", (c) => c.json(AutosaveMetrics.get(c.req.param("id"))))
    .post("/:id/autosave/resync", async (c) => {
      const body = await c.req
        .json<{
          session_limit?: number
          pair_limit?: number
        }>()
        .catch(() => ({ session_limit: undefined, pair_limit: undefined }))
      return c.json(
        await Chat.resync({
          drama_id: c.req.param("id"),
          session_limit: body.session_limit,
          pair_limit: body.pair_limit,
        }),
      )
    })
    .post("/:id/world", async (c) => {
      const body = await c.req.json<Omit<Parameters<typeof World.create>[0], "drama_id">>()
      return c.json(World.create({ drama_id: c.req.param("id"), ...body }), 201)
    })
    .get("/:id/arcs", (c) => c.json(CharacterArc.listByDrama(c.req.param("id"))))
    .get("/:id/plot-points", (c) => c.json(PlotPoint.listByDrama(c.req.param("id"))))
    .get("/:id/plot-points/unresolved", (c) => c.json(PlotPoint.listUnresolved(c.req.param("id"))))
    .post("/:id/plot-points", async (c) => {
      const body = await c.req.json<Omit<Parameters<typeof PlotPoint.create>[0], "drama_id">>()
      return c.json(PlotPoint.create({ drama_id: c.req.param("id"), ...body }), 201)
    })
    .get("/:id/export/fountain", (c) => {
      const episodeParam = c.req.query("episode")
      const episodeNumber = episodeParam ? Number(episodeParam) : undefined
      const text = dramaToFountain(c.req.param("id"), episodeNumber)
      const drama = Drama.get(c.req.param("id"))
      const filename = episodeNumber
        ? `${drama.title}_ep${episodeNumber}.fountain`
        : `${drama.title}.fountain`
      return new Response(text, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      })
    })
    .get("/:id/export/pdf", (c) => {
      const episodeParam = c.req.query("episode")
      const episodeNumber = episodeParam ? Number(episodeParam) : undefined
      const html = dramaToScreenplayHtml(c.req.param("id"), episodeNumber)
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    })
}

export function CharacterImageRoutes() {
  return new Hono()
    .get("/:id", (c) => c.json(Character.get(c.req.param("id"))))
    .patch("/:id", async (c) => {
      const body = await c.req.json()
      return c.json(Character.update(c.req.param("id"), body))
    })
    .delete("/:id", (c) => {
      Character.remove(c.req.param("id"))
      return c.json(true)
    })
    .post("/:id/image", async (c) => {
      const id = c.req.param("id")
      const character = Character.get(id)

      const body = await c.req.parseBody()
      const file = body["file"]
      if (!(file instanceof File)) return c.json({ error: "file required" }, 400)
      if (!ALLOWED_TYPES.has(file.type)) return c.json({ error: "unsupported image type" }, 400)
      if (file.size > MAX_SIZE) return c.json({ error: "file too large (max 10MB)" }, 400)

      const ext = file.name.split(".").pop() ?? "png"
      const filename = `${id}.${ext}`

      await fs.mkdir(IMAGES_DIR, { recursive: true })

      if (character.image) {
        const prev = path.join(IMAGES_DIR, character.image)
        await fs.unlink(prev).catch(() => {})
      }

      const buf = await file.arrayBuffer()
      await Bun.write(path.join(IMAGES_DIR, filename), buf)

      const updated = Character.update(id, { image: filename })
      return c.json(updated)
    })
    .delete("/:id/image", async (c) => {
      const id = c.req.param("id")
      const character = Character.get(id)

      if (character.image) {
        const filePath = path.join(IMAGES_DIR, character.image)
        await fs.unlink(filePath).catch(() => {})
        Character.update(id, { image: null })
      }

      return c.json(true)
    })
}

export function WorldRoutes() {
  return new Hono()
    .get("/:id", (c) => c.json(World.get(c.req.param("id"))))
    .patch("/:id", async (c) => {
      const body = await c.req.json()
      return c.json(World.update(c.req.param("id"), body))
    })
    .delete("/:id", (c) => {
      World.remove(c.req.param("id"))
      return c.json(true)
    })
}

export function PlotPointRoutes() {
  return new Hono()
    .get("/:id", (c) => c.json(PlotPoint.get(c.req.param("id"))))
    .patch("/:id", async (c) => {
      const body = await c.req.json()
      return c.json(PlotPoint.update(c.req.param("id"), body))
    })
    .delete("/:id", (c) => {
      PlotPoint.remove(c.req.param("id"))
      return c.json(true)
    })
    .post("/:id/resolve", async (c) => {
      const body = await c.req.json<{ resolved_episode_id?: string }>().catch(() => ({} as { resolved_episode_id?: string }))
      return c.json(PlotPoint.resolve(c.req.param("id"), body.resolved_episode_id))
    })
}

export function UploadsRoutes() {
  return new Hono().get("/characters/:filename", async (c) => {
    const filename = c.req.param("filename")
    if (filename.includes("..") || filename.includes("/")) return c.notFound()

    const filePath = path.join(IMAGES_DIR, filename)
    const file = Bun.file(filePath)
    if (!(await file.exists())) return c.notFound()

    return new Response(file, {
      headers: {
        "cache-control": "public, max-age=3600",
      },
    })
  })
}

export function EpisodeRoutes() {
  return new Hono()
    .get("/:id", (c) => c.json(Episode.get(c.req.param("id"))))
    .patch("/:id", async (c) => {
      const body = await c.req.json()
      return c.json(Episode.update(c.req.param("id"), body))
    })
    .delete("/:id", (c) => {
      Episode.remove(c.req.param("id"))
      return c.json(true)
    })
    .patch("/:id/reorder", async (c) => {
      const { number } = await c.req.json<{ number: number }>()
      const episode = Episode.get(c.req.param("id"))
      const episodes = Episode.listByDrama(episode.drama_id)
      const oldNumber = episode.number
      if (number === oldNumber) return c.json(episode)
      for (const ep of episodes) {
        if (ep.id === episode.id) continue
        if (oldNumber < number) {
          if (ep.number > oldNumber && ep.number <= number) {
            Episode.update(ep.id, { number: ep.number - 1 })
          }
        } else {
          if (ep.number >= number && ep.number < oldNumber) {
            Episode.update(ep.id, { number: ep.number + 1 })
          }
        }
      }
      return c.json(Episode.update(c.req.param("id"), { number }))
    })
    .get("/:id/scenes", (c) => c.json(Scene.listByEpisode(c.req.param("id"))))
    .post("/:id/scenes", async (c) => {
      const body = await c.req.json<Omit<Parameters<typeof Scene.create>[0], "episode_id">>()
      return c.json(Scene.create({ episode_id: c.req.param("id"), ...body }), 201)
    })
}

export function SceneRoutes() {
  return new Hono()
    .get("/:id", (c) => c.json(Scene.get(c.req.param("id"))))
    .patch("/:id", async (c) => {
      const body = await c.req.json()
      return c.json(Scene.update(c.req.param("id"), body))
    })
    .delete("/:id", (c) => {
      Scene.remove(c.req.param("id"))
      return c.json(true)
    })
    .patch("/:id/reorder", async (c) => {
      const { number } = await c.req.json<{ number: number }>()
      const scene = Scene.get(c.req.param("id"))
      const scenes = Scene.listByEpisode(scene.episode_id)
      const oldNumber = scene.number
      if (number === oldNumber) return c.json(scene)
      for (const sc of scenes) {
        if (sc.id === scene.id) continue
        if (oldNumber < number) {
          if (sc.number > oldNumber && sc.number <= number) {
            Scene.update(sc.id, { number: sc.number - 1 })
          }
        } else {
          if (sc.number >= number && sc.number < oldNumber) {
            Scene.update(sc.id, { number: sc.number + 1 })
          }
        }
      }
      return c.json(Scene.update(c.req.param("id"), { number }))
    })
    .get("/:id/characters", (c) => c.json(Scene.characters(c.req.param("id"))))
    .put("/:id/characters/:characterID", (c) => {
      Scene.addCharacter(c.req.param("id"), c.req.param("characterID"))
      return c.json(true)
    })
    .delete("/:id/characters/:characterID", (c) => {
      Scene.removeCharacter(c.req.param("id"), c.req.param("characterID"))
      return c.json(true)
    })
}
