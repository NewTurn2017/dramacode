import { Hono } from "hono"
import { Drama, Episode, Scene, Character, World, PlotPoint } from "../../drama"

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
    .post("/:id/world", async (c) => {
      const body = await c.req.json<Omit<Parameters<typeof World.create>[0], "drama_id">>()
      return c.json(World.create({ drama_id: c.req.param("id"), ...body }), 201)
    })
    .get("/:id/plot-points", (c) => c.json(PlotPoint.listByDrama(c.req.param("id"))))
    .get("/:id/plot-points/unresolved", (c) => c.json(PlotPoint.listUnresolved(c.req.param("id"))))
    .post("/:id/plot-points", async (c) => {
      const body = await c.req.json<Omit<Parameters<typeof PlotPoint.create>[0], "drama_id">>()
      return c.json(PlotPoint.create({ drama_id: c.req.param("id"), ...body }), 201)
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
