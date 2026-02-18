import { embed, embedMany } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { Auth, OAUTH_DUMMY_KEY } from "../auth"
import { OpenAIAuth } from "../plugin/openai"
import { Database } from "../storage/db"
import { Character, Drama, Episode, PlotPoint, Scene, World } from "../drama"
import { Log } from "../util/log"

const log = Log.create({ service: "rag" })
const DIM = 512

type Row = {
  entity_id: string
  entity_type: string
  content: string
  distance: number
}

function toBytes(input: Float32Array) {
  return new Uint8Array(input.buffer)
}

function typeLabel(input: string) {
  if (input === "character") return "캐릭터"
  if (input === "episode") return "에피소드"
  if (input === "scene") return "장면"
  if (input === "world") return "세계관"
  if (input === "plot_point") return "플롯"
  if (input === "drama") return "드라마"
  return input
}

async function provider() {
  const auth = await Auth.get("openai")
  if (!auth) return
  if (auth.type === "api") return createOpenAI({ apiKey: auth.key })
  return createOpenAI({ apiKey: OAUTH_DUMMY_KEY, fetch: OpenAIAuth.createFetch("openai") })
}

async function vector(input: string) {
  const openai = await provider()
  if (!openai) {
    log.warn("embed.skipped.auth")
    return
  }
  const result = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: input,
    providerOptions: { openai: { dimensions: DIM } },
  })
  return new Float32Array(result.embedding)
}

function placeholders(input: number) {
  return Array.from({ length: input })
    .map(() => "?")
    .join(",")
}

export namespace Rag {
  export const serialize = {
    character(input: Character.Info) {
      const role = input.role ? ` (${input.role})` : ""
      const occ = input.occupation ? `${input.occupation}` : "직업 미정"
      const personality = input.personality ? `${input.personality}` : "성격 미정"
      const backstory = input.backstory ? ` 배경: ${input.backstory}` : ""
      const arc = input.arc ? ` 아크: ${input.arc}` : ""
      return `캐릭터: ${input.name}${role} - ${occ}, ${personality}.${backstory}${arc}`
    },

    episode(input: Episode.Info) {
      const synopsis = input.synopsis ? ` - ${input.synopsis}` : ""
      return `에피소드 ${input.number}화: ${input.title}${synopsis}`
    },

    scene(input: Scene.Info) {
      const time = input.time_of_day ?? "미정"
      const place = input.location ?? "미정"
      const desc = input.description ? ` - ${input.description}` : ""
      return `장면 S#${input.number} (${time}, ${place})${desc}`
    },

    world(input: World.Info) {
      const desc = input.description ? ` - ${input.description}` : ""
      return `세계관 [${input.category}]: ${input.name}${desc}`
    },

    plotPoint(input: PlotPoint.Info) {
      return `플롯 [${input.type}]: ${input.description}`
    },

    drama(input: Drama.Info) {
      const genre = input.genre ? ` 장르: ${input.genre}.` : ""
      const tone = input.tone ? ` 톤: ${input.tone}.` : ""
      const setting = input.setting ? ` 배경: ${input.setting}.` : ""
      const logline = input.logline ? ` 로그라인: ${input.logline}.` : ""
      return `드라마: ${input.title}.${genre}${tone}${setting}${logline}`
    },
  }

  export function init() {
    const sqlite = Database.sqlite()
    if (Database.vecEnabled()) {
      sqlite.run(`
        CREATE VIRTUAL TABLE IF NOT EXISTS embedding USING vec0(
          entity_id TEXT PRIMARY KEY,
          embedding float[512]
        )
      `)
    } else {
      log.warn("rag.init: vec0 not available, vector search disabled")
    }
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS embedding_meta (
        entity_id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        drama_id TEXT NOT NULL,
        content TEXT NOT NULL,
        time_created INTEGER NOT NULL
      )
    `)
    sqlite.run(`CREATE INDEX IF NOT EXISTS embedding_meta_drama_idx ON embedding_meta(drama_id)`)
    sqlite.run(`CREATE INDEX IF NOT EXISTS embedding_meta_type_idx ON embedding_meta(entity_type)`)
    log.info("rag.init", { vec: Database.vecEnabled() })
  }

  export async function embed(input: string): Promise<Float32Array> {
    const out = await vector(input)
    if (!out) return new Float32Array(DIM)
    return out
  }

  export async function index(input: { entity_id: string; entity_type: string; drama_id: string; content: string }) {
    if (!Database.vecEnabled()) return
    const out = await vector(input.content)
    if (!out) return
    const sqlite = Database.sqlite()

    sqlite.run(`DELETE FROM embedding WHERE entity_id = ?`, [input.entity_id])
    sqlite.run(`DELETE FROM embedding_meta WHERE entity_id = ?`, [input.entity_id])
    sqlite.run(`INSERT INTO embedding(entity_id, embedding) VALUES(?, ?)`, [input.entity_id, toBytes(out)])
    sqlite.run(
      `INSERT INTO embedding_meta(entity_id, entity_type, drama_id, content, time_created) VALUES(?, ?, ?, ?, ?)`,
      [input.entity_id, input.entity_type, input.drama_id, input.content, Date.now()],
    )

    log.info("rag.index", { entity_id: input.entity_id, entity_type: input.entity_type, drama_id: input.drama_id })
  }

  export function remove(entity_id: string) {
    const sqlite = Database.sqlite()
    if (Database.vecEnabled()) {
      sqlite.run(`DELETE FROM embedding WHERE entity_id = ?`, [entity_id])
    }
    sqlite.run(`DELETE FROM embedding_meta WHERE entity_id = ?`, [entity_id])
    log.info("rag.remove", { entity_id })
  }

  export async function indexDrama(drama_id: string) {
    if (!Database.vecEnabled()) return
    const openai = await provider()
    if (!openai) {
      log.warn("rag.index_drama.skipped.auth", { drama_id })
      return
    }

    const drama = Drama.get(drama_id)
    const items = [
      {
        entity_id: drama.id,
        entity_type: "drama",
        drama_id,
        content: serialize.drama(drama),
      },
      ...Character.listByDrama(drama_id).map((item) => ({
        entity_id: item.id,
        entity_type: "character",
        drama_id,
        content: serialize.character(item),
      })),
      ...Episode.listByDrama(drama_id).map((item) => ({
        entity_id: item.id,
        entity_type: "episode",
        drama_id,
        content: serialize.episode(item),
      })),
      ...Scene.listByDrama(drama_id).map((item) => ({
        entity_id: item.id,
        entity_type: "scene",
        drama_id,
        content: serialize.scene(item),
      })),
      ...World.listByDrama(drama_id).map((item) => ({
        entity_id: item.id,
        entity_type: "world",
        drama_id,
        content: serialize.world(item),
      })),
      ...PlotPoint.listByDrama(drama_id).map((item) => ({
        entity_id: item.id,
        entity_type: "plot_point",
        drama_id,
        content: serialize.plotPoint(item),
      })),
    ]
    if (items.length === 0) return

    const vectors = await embedMany({
      model: openai.embedding("text-embedding-3-small"),
      values: items.map((item) => item.content),
      providerOptions: { openai: { dimensions: DIM } },
    })

    const sqlite = Database.sqlite()
    const deleteEmbedding = sqlite.prepare(`DELETE FROM embedding WHERE entity_id = ?`)
    const deleteMeta = sqlite.prepare(`DELETE FROM embedding_meta WHERE entity_id = ?`)
    const insertEmbedding = sqlite.prepare(`INSERT INTO embedding(entity_id, embedding) VALUES(?, ?)`)
    const insertMeta = sqlite.prepare(
      `INSERT INTO embedding_meta(entity_id, entity_type, drama_id, content, time_created) VALUES(?, ?, ?, ?, ?)`,
    )
    const now = Date.now()

    sqlite.transaction(() => {
      items.forEach((item, i) => {
        deleteEmbedding.run(item.entity_id)
        deleteMeta.run(item.entity_id)
        insertEmbedding.run(item.entity_id, toBytes(new Float32Array(vectors.embeddings[i]!)))
        insertMeta.run(item.entity_id, item.entity_type, item.drama_id, item.content, now)
      })
    })()

    log.info("rag.index_drama", { drama_id, count: items.length })
  }

  export async function search(input: {
    query: string
    drama_id: string
    limit?: number
    types?: string[]
  }): Promise<Row[]> {
    if (!Database.vecEnabled()) return []
    const limit = input.limit ?? 5
    const k = Math.max(limit * 2, limit)
    const out = await vector(input.query)
    if (!out) return []

    const sqlite = Database.sqlite()
    const rows = sqlite
      .query(`SELECT entity_id, distance FROM embedding WHERE embedding MATCH ? AND k = ?`)
      .all(toBytes(out), k) as Array<{ entity_id: string; distance: number }>
    if (rows.length === 0) return []

    const ids = rows.map((row) => row.entity_id)
    const meta = sqlite
      .query(
        `SELECT entity_id, entity_type, drama_id, content FROM embedding_meta WHERE entity_id IN (${placeholders(ids.length)})`,
      )
      .all(...ids) as Array<{ entity_id: string; entity_type: string; drama_id: string; content: string }>

    const byID = new Map(meta.map((item) => [item.entity_id, item]))
    const filtered = rows
      .flatMap((row) => {
        const info = byID.get(row.entity_id)
        if (!info) return []
        if (info.drama_id !== input.drama_id) return []
        if (input.types?.length && !input.types.includes(info.entity_type)) return []
        return [
          { entity_id: row.entity_id, entity_type: info.entity_type, content: info.content, distance: row.distance },
        ]
      })
      .slice(0, limit)

    log.info("rag.search", {
      drama_id: input.drama_id,
      limit,
      k,
      query_len: input.query.length,
      found: filtered.length,
    })

    return filtered
  }

  export async function buildContext(input: { query: string; drama_id: string }) {
    const rows = await search({ query: input.query, drama_id: input.drama_id, limit: 5 })
    if (rows.length === 0) return ""

    const lines = [
      "## 관련 컨텍스트 (RAG)",
      "다음은 현재 대화와 관련된 기존 설정입니다:",
      ...rows.map((item) => `- [${typeLabel(item.entity_type)}] ${item.content}`),
    ]

    return lines.join("\n")
  }

  export async function detectContradiction(input: {
    entity_type: string
    content: string
    drama_id: string
  }): Promise<{
    conflicts: Row[]
    warning?: string
  }> {
    const rows = await search({ query: input.content, drama_id: input.drama_id, limit: 8, types: [input.entity_type] })
    const conflicts = rows.filter((item) => item.distance < 0.8)
    if (conflicts.length === 0) return { conflicts }

    const warning = `⚠️ 유사한 기존 설정이 있습니다: ${conflicts[0]!.content}. 충돌 여부를 확인하세요.`
    return { conflicts, warning }
  }
}
