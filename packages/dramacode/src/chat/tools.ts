import { tool } from "ai"
import { z } from "zod"
import { Drama, Episode, Character, CharacterArc, World, PlotPoint, Scene } from "../drama"
import { Rag } from "../rag"
import { WriterStyle } from "../writer"
import { Session } from "../session"
import { Log } from "../util/log"
import { EventBus } from "../server/routes/events"
import { persistDraft, sanitizeDraft, snapshot, type StructuredDraft } from "./structured"

const log = Log.create({ service: "chat.tools" })
const VALIDATION_ERROR = "입력값이 올바르지 않습니다. 필드를 확인해주세요."

z.setErrorMap(() => ({ message: VALIDATION_ERROR }))

function inferMood(input: { description?: string | null; notes?: string | null; tone?: string | null }) {
  const text = [input.description, input.notes, input.tone].filter(Boolean).join(" ").toLowerCase()
  if (!text) return "dramatic"
  if (
    text.includes("romance") ||
    text.includes("romantic") ||
    text.includes("사랑") ||
    text.includes("로맨") ||
    text.includes("설렘")
  )
    return "romantic"
  if (
    text.includes("tension") ||
    text.includes("tense") ||
    text.includes("위기") ||
    text.includes("긴장") ||
    text.includes("추격") ||
    text.includes("갈등")
  )
    return "tense"
  if (
    text.includes("mystery") ||
    text.includes("mysterious") ||
    text.includes("비밀") ||
    text.includes("의문") ||
    text.includes("수상")
  )
    return "mysterious"
  if (
    text.includes("sad") ||
    text.includes("melanch") ||
    text.includes("슬픔") ||
    text.includes("쓸쓸") ||
    text.includes("외로")
  )
    return "melancholic"
  if (
    text.includes("bright") ||
    text.includes("warm") ||
    text.includes("행복") ||
    text.includes("기쁨") ||
    text.includes("코믹")
  )
    return "cheerful"
  return "dramatic"
}

function buildScenePrompt(input: { scene: Scene.Info; drama: Drama.Info }): {
  prompt: string
  style: string
  mood: string
  resolution: "1K"
} {
  const mood = inferMood({
    description: input.scene.description,
    notes: input.scene.notes,
    tone: input.drama.tone,
  })
  const place = input.scene.location ?? "an unspecified location"
  const time = input.scene.time_of_day ? input.scene.time_of_day.toLowerCase() : "an unspecified time"
  const cast = input.scene.characters_present?.length ? input.scene.characters_present.join(", ") : "the key characters"
  const action = input.scene.description ?? "the central dramatic action unfolds"
  const tone = input.drama.tone ?? mood

  return {
    prompt: `Cinematic Korean drama scene set at ${place} during ${time}, featuring ${cast}. ${action}. Emotional tone: ${tone}.`,
    style: "cinematic",
    mood,
    resolution: "1K",
  }
}

function ragError(action: string, err: unknown, extra?: Record<string, unknown>) {
  log.error(action, {
    ...extra,
    error: err instanceof Error ? err.message : String(err),
  })
}

const syncOperation = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("update_drama"),
    genre: z.string().optional(),
    tone: z.string().optional(),
    logline: z.string().optional(),
    setting: z.string().optional(),
    total_episodes: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal("upsert_character"),
    name: z.string(),
    role: z.enum(["protagonist", "antagonist", "supporting", "extra"]).optional(),
    age: z.string().optional(),
    occupation: z.string().optional(),
    personality: z.string().optional(),
    backstory: z.string().optional(),
    arc: z.string().optional(),
  }),
  z.object({
    type: z.literal("upsert_episode"),
    number: z.number().int().positive(),
    title: z.string(),
    synopsis: z.string().optional(),
  }),
  z.object({
    type: z.literal("upsert_world"),
    category: z.enum(["location", "culture", "rule", "history", "technology"]),
    name: z.string(),
    description: z.string().optional(),
  }),
  z.object({
    type: z.literal("upsert_plot"),
    plot_type: z.enum(["setup", "conflict", "twist", "climax", "resolution", "foreshadowing"]),
    description: z.string(),
    episode_number: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal("upsert_scene"),
    episode_number: z.number().int().positive(),
    number: z.number().int().positive(),
    location: z.string().optional(),
    time_of_day: z.enum(["DAY", "NIGHT", "DAWN", "DUSK"]).optional(),
    description: z.string().optional(),
    dialogue: z.string().optional(),
    notes: z.string().optional(),
    characters_present: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal("upsert_relationship"),
    character1: z.string(),
    character2: z.string(),
    relation_type: z.string(),
    description: z.string().optional(),
  }),
])

export function syncProjectTool(input: { drama_id: string }) {
  let count = 0
  let stats: ReturnType<typeof persistDraft> | null = null

  const sync_project_data = tool({
    description:
      "작가 대화에서 확정된 프로젝트 데이터 변경사항을 한 번에 동기화합니다. 반드시 operations 배열을 채워 호출하세요.",
    inputSchema: z.object({
      operations: z.array(syncOperation).min(1),
    }),
    execute: async (params) => {
      count += 1
      const draft: StructuredDraft = {
        drama: {},
        characters: [],
        episodes: [],
        world: [],
        plot_points: [],
        scenes: [],
        relationships: [],
      }

      for (const op of params.operations) {
        if (op.type === "update_drama") {
          draft.drama = {
            ...draft.drama,
            genre: op.genre ?? draft.drama.genre,
            tone: op.tone ?? draft.drama.tone,
            logline: op.logline ?? draft.drama.logline,
            setting: op.setting ?? draft.drama.setting,
            total_episodes: op.total_episodes ?? draft.drama.total_episodes,
          }
          continue
        }
        if (op.type === "upsert_character") {
          draft.characters.push({
            name: op.name,
            role: op.role,
            age: op.age,
            occupation: op.occupation,
            personality: op.personality,
            backstory: op.backstory,
            arc: op.arc,
          })
          continue
        }
        if (op.type === "upsert_episode") {
          draft.episodes.push({ number: op.number, title: op.title, synopsis: op.synopsis })
          continue
        }
        if (op.type === "upsert_world") {
          draft.world.push({ category: op.category, name: op.name, description: op.description })
          continue
        }
        if (op.type === "upsert_plot") {
          draft.plot_points.push({
            type: op.plot_type,
            description: op.description,
            episode_number: op.episode_number,
          })
          continue
        }
        if (op.type === "upsert_scene") {
          draft.scenes.push({
            episode_number: op.episode_number,
            number: op.number,
            location: op.location,
            time_of_day: op.time_of_day,
            description: op.description,
            dialogue: op.dialogue,
            notes: op.notes,
            characters_present: op.characters_present,
          })
        }
      }

      const sanitized = sanitizeDraft(draft, snapshot(input.drama_id), {
        allow_scenes: params.operations.some((item) => item.type === "upsert_scene"),
      })
      stats = persistDraft(input.drama_id, sanitized)

      let rels = 0
      for (const op of params.operations) {
        if (op.type !== "upsert_relationship") continue
        const c1 = Character.findByName(input.drama_id, op.character1)
        const c2 = Character.findByName(input.drama_id, op.character2)
        if (!c1 || !c2) continue
        const r1 = (c1.relationships ?? []).filter((r) => r.character_id !== c2.id)
        r1.push({ character_id: c2.id, type: op.relation_type, description: op.description ?? "" })
        Character.update(c1.id, { relationships: r1 })
        const r2 = (c2.relationships ?? []).filter((r) => r.character_id !== c1.id)
        r2.push({ character_id: c1.id, type: op.relation_type, description: op.description ?? "" })
        Character.update(c2.id, { relationships: r2 })
        rels++
      }
      if (rels) EventBus.emit(input.drama_id, "character")

      log.info("tool.sync_project_data", { drama_id: input.drama_id, ...stats, relationships: rels })
      return `동기화 완료: drama=${stats.drama}, chars=${stats.characters}, episodes=${stats.episodes}, world=${stats.world}, plot=${stats.plot_points}, scenes=${stats.scenes}, rels=${rels}`
    },
  })

  return {
    sync_project_data,
    calls: () => count,
    stats: () => stats,
  }
}

export function dramaTools(input: { session_id: string; drama_id?: string | null }) {
  let dramaID = input.drama_id ?? null

  function requireDrama(): string {
    if (!dramaID) throw new Error("현재 세션에 연결된 드라마가 없습니다.")
    return dramaID!
  }

  return {
    create_drama: tool({
      description:
        "새 드라마 프로젝트를 생성합니다. 작가가 새로운 드라마 아이디어를 이야기할 때 사용하세요. 제목은 필수이며, 로그라인/장르/배경/톤/총화수는 선택입니다.",
      inputSchema: z.object({
        title: z.string().describe("드라마 제목"),
        logline: z.string().optional().describe("한 줄 로그라인"),
        genre: z.string().optional().describe("장르 (로맨스, 스릴러, 사극 등)"),
        setting: z.string().optional().describe("배경 (시대, 장소)"),
        tone: z.string().optional().describe("톤 (밝은, 어두운, 코믹 등)"),
        total_episodes: z.number().optional().describe("총 에피소드 수"),
      }),
      execute: async (params) => {
        if (dramaID) {
          const updated = Drama.update(dramaID, {
            title: params.title,
            logline: params.logline,
            genre: params.genre,
            setting: params.setting,
            tone: params.tone,
            total_episodes: params.total_episodes,
          })
          Rag.index({
            entity_id: updated.id,
            entity_type: "drama",
            drama_id: updated.id,
            content: Rag.serialize.drama(updated),
          }).catch((err) => ragError("tool.rag.index.create_drama_existing", err, { drama_id: updated.id }))
          EventBus.emit(updated.id, "drama")
          log.info("tool.create_drama_existing", { drama_id: updated.id, title: updated.title })
          return `이미 연결된 프로젝트를 업데이트했습니다. (ID: ${updated.id})`
        }

        const drama = Drama.create(params)
        dramaID = drama.id
        Session.linkDrama(input.session_id, drama.id)
        Rag.index({
          entity_id: drama.id,
          entity_type: "drama",
          drama_id: drama.id,
          content: Rag.serialize.drama(drama),
        }).catch((err) => ragError("tool.rag.index.create_drama", err, { drama_id: drama.id }))
        EventBus.emit(drama.id, "drama")
        log.info("tool.create_drama", { drama_id: drama.id, title: drama.title })
        return `드라마 "${drama.title}" 프로젝트가 생성되었습니다. (ID: ${drama.id})`
      },
    }),

    save_character: tool({
      description:
        "캐릭터를 생성하거나 업데이트합니다. 새로운 캐릭터가 언급되거나 캐릭터 설정이 구체화될 때 사용하세요.",
      inputSchema: z.object({
        name: z.string().describe("캐릭터 이름"),
        role: z.enum(["protagonist", "antagonist", "supporting", "extra"]).optional().describe("역할"),
        age: z.string().optional().describe("나이"),
        occupation: z.string().optional().describe("직업"),
        personality: z.string().optional().describe("성격 특성"),
        backstory: z.string().optional().describe("배경 이야기"),
        arc: z.string().optional().describe("캐릭터 아크 (성장/변화 방향)"),
      }),
      execute: async (params) => {
        const did = requireDrama()
        const existing = Character.findByName(did, params.name)
        const probe = [
          `캐릭터: ${params.name}${params.role ? ` (${params.role})` : ""}`,
          params.occupation ? `직업: ${params.occupation}` : "",
          params.personality ? `성격: ${params.personality}` : "",
          params.backstory ? `배경: ${params.backstory}` : "",
          params.arc ? `아크: ${params.arc}` : "",
        ]
          .filter(Boolean)
          .join(" - ")
        const warning = await Rag.detectContradiction({
          entity_type: "character",
          content: probe,
          drama_id: did,
        }).catch((err) => {
          ragError("tool.rag.detect.character", err, { drama_id: did, name: params.name })
          return {
            conflicts: [] as Awaited<ReturnType<typeof Rag.detectContradiction>>["conflicts"],
            warning: undefined,
          }
        })
        if (existing) {
          const updated = Character.update(existing.id, params)
          Rag.index({
            entity_id: updated.id,
            entity_type: "character",
            drama_id: did,
            content: Rag.serialize.character(updated),
          }).catch((err) => ragError("tool.rag.index.update_character", err, { entity_id: updated.id, drama_id: did }))
          const conflict = warning.conflicts.find((item) => item.entity_id !== existing.id)
          const message = warning.warning && conflict ? `\n${warning.warning}` : ""
          EventBus.emit(did, "character")
          log.info("tool.update_character", { id: updated.id, name: updated.name })
          return `캐릭터 "${updated.name}" 정보가 업데이트되었습니다.${message}`
        }
        const created = Character.create({ drama_id: did, ...params })
        Rag.index({
          entity_id: created.id,
          entity_type: "character",
          drama_id: did,
          content: Rag.serialize.character(created),
        }).catch((err) => ragError("tool.rag.index.create_character", err, { entity_id: created.id, drama_id: did }))
        EventBus.emit(did, "character")
        const message = warning.warning ? `\n${warning.warning}` : ""
        log.info("tool.create_character", { id: created.id, name: created.name })
        return `캐릭터 "${created.name}"이(가) 등록되었습니다.${message}`
      },
    }),

    save_relationship: tool({
      description:
        "두 캐릭터 간의 관계를 설정합니다. 양방향으로 저장되며 인물 관계도에 반영됩니다. 두 캐릭터가 이미 등록된 상태에서만 사용하세요.",
      inputSchema: z.object({
        character1: z.string().describe("첫 번째 캐릭터 이름"),
        character2: z.string().describe("두 번째 캐릭터 이름"),
        type: z.string().describe("관계 유형 (예: 연인, 가족, 친구, 적대, 동료, 라이벌, 매니저, 팬)"),
        description: z.string().optional().describe("관계에 대한 부연 설명"),
      }),
      execute: async (params) => {
        const did = requireDrama()
        const c1 = Character.findByName(did, params.character1)
        const c2 = Character.findByName(did, params.character2)
        if (!c1) return `캐릭터 "${params.character1}"을(를) 찾을 수 없습니다. 먼저 save_character로 등록해주세요.`
        if (!c2) return `캐릭터 "${params.character2}"을(를) 찾을 수 없습니다. 먼저 save_character로 등록해주세요.`

        const rels1 = (c1.relationships ?? []).filter((r) => r.character_id !== c2.id)
        rels1.push({ character_id: c2.id, type: params.type, description: params.description ?? "" })
        Character.update(c1.id, { relationships: rels1 })

        const rels2 = (c2.relationships ?? []).filter((r) => r.character_id !== c1.id)
        rels2.push({ character_id: c1.id, type: params.type, description: params.description ?? "" })
        Character.update(c2.id, { relationships: rels2 })

        EventBus.emit(did, "character")
        log.info("tool.save_relationship", {
          character1: params.character1,
          character2: params.character2,
          type: params.type,
        })
        return `"${params.character1}" ↔ "${params.character2}" 관계(${params.type})가 설정되었습니다.`
      },
    }),

    save_episode: tool({
      description: "에피소드(회차)를 생성합니다. 에피소드 구성을 논의할 때 사용하세요.",
      inputSchema: z.object({
        number: z.number().describe("회차 번호"),
        title: z.string().describe("에피소드 제목"),
        synopsis: z.string().optional().describe("에피소드 시놉시스"),
      }),
      execute: async (params) => {
        const did = requireDrama()
        const ep = Episode.create({ drama_id: did, ...params })
        Rag.index({
          entity_id: ep.id,
          entity_type: "episode",
          drama_id: did,
          content: Rag.serialize.episode(ep),
        }).catch((err) => ragError("tool.rag.index.create_episode", err, { entity_id: ep.id, drama_id: did }))
        EventBus.emit(did, "episode")
        log.info("tool.create_episode", { id: ep.id, number: ep.number })
        return `${ep.number}화 "${ep.title}" 에피소드가 생성되었습니다. (ID: ${ep.id})`
      },
    }),

    breakdown_episode: tool({
      description:
        "에피소드를 개별 장면으로 분해합니다. 에피소드 시놉시스와 캐릭터/플롯 컨텍스트를 분석하여 구체적인 씬 목록을 제안합니다.",
      inputSchema: z.object({
        episode_id: z.string().describe("에피소드 ID"),
      }),
      execute: async (params) => {
        const did = requireDrama()
        const episode = Episode.get(params.episode_id)
        if (episode.drama_id !== did) throw new Error("현재 드라마에 속한 에피소드만 분해할 수 있습니다.")

        const scenes = Scene.listByEpisode(params.episode_id)
        const characters = Character.listByDrama(did, 20)
        const points = PlotPoint.listByDrama(did, 50).filter(
          (point) => !point.episode_id || point.episode_id === params.episode_id,
        )

        const cast =
          characters.length === 0
            ? "- 없음"
            : characters
                .map((character) => `- ${character.name}${character.role ? ` (${character.role})` : ""}`)
                .join("\n")
        const plot =
          points.length === 0 ? "- 없음" : points.map((point) => `- [${point.type}] ${point.description}`).join("\n")

        return [
          `다음 지침에 따라 ${episode.number}화 \"${episode.title}\"의 씬 브레이크다운을 작성하세요.`,
          "반드시 여러 번 save_scene를 호출해 장면을 실제로 저장하세요.",
          "각 save_scene 호출에는 episode_id를 그대로 사용하고 number를 1부터 순서대로 증가시키세요.",
          "한 장면마다 location, time_of_day, description, dialogue, notes, characters_present를 가능한 범위에서 채우세요.",
          "장면 수는 6~12개를 목표로 하고, 기존 씬이 있으면 이어서 번호를 배정하세요.",
          `현재 저장된 씬 수: ${scenes.length}개`,
          "\n[에피소드 시놉시스]",
          episode.synopsis ?? "- 없음",
          "\n[캐릭터 컨텍스트]",
          cast,
          "\n[플롯 컨텍스트]",
          plot,
          "\n분해를 제안만 하지 말고, 바로 save_scene를 연속 호출해 저장을 완료한 뒤 짧게 요약 보고하세요.",
        ].join("\n")
      },
    }),

    save_scene: tool({
      description: "장면(씬)을 생성합니다. 구체적인 장면이 논의될 때 사용하세요. 반드시 episode_id가 필요합니다.",
      inputSchema: z.object({
        episode_id: z.string().describe("에피소드 ID"),
        number: z.number().describe("장면 번호"),
        location: z.string().optional().describe("장소 (예: 강남역 카페, 병원 옥상)"),
        time_of_day: z.enum(["DAY", "NIGHT", "DAWN", "DUSK"]).optional().describe("시간대"),
        description: z.string().optional().describe("장면 설명"),
        dialogue: z.string().optional().describe("주요 대사"),
        notes: z.string().optional().describe("연출 노트"),
        characters_present: z.array(z.string()).optional().describe("등장인물 이름 목록"),
      }),
      execute: async (params) => {
        const did = requireDrama()
        const episode = Episode.get(params.episode_id)
        if (episode.drama_id !== did) throw new Error("현재 드라마에 속한 에피소드만 저장할 수 있습니다.")
        const scene = Scene.create(params)
        const prompt = buildScenePrompt({ scene, drama: Drama.get(did) })
        const updated = Scene.update(scene.id, { image_prompt: prompt })
        Rag.index({
          entity_id: updated.id,
          entity_type: "scene",
          drama_id: did,
          content: Rag.serialize.scene(updated),
        }).catch((err) => ragError("tool.rag.index.create_scene", err, { entity_id: updated.id, drama_id: did }))
        EventBus.emit(did, "scene")
        log.info("tool.create_scene", { id: scene.id, episode_id: params.episode_id })
        return `S#${updated.number} 장면이 생성되었습니다. (장소: ${updated.location ?? "미정"})`
      },
    }),

    update_drama: tool({
      description:
        "현재 드라마 메타데이터를 업데이트합니다. 장르, 톤, 로그라인, 배경, 총화수가 대화에서 확정되었을 때 사용하세요.",
      inputSchema: z
        .object({
          genre: z.string().optional().describe("장르 (예: 로맨스, 스릴러, 사극)"),
          tone: z.string().optional().describe("톤 (예: 따뜻한, 냉소적인, 긴장감 있는)"),
          logline: z.string().optional().describe("한 줄 로그라인"),
          setting: z.string().optional().describe("배경 (시대, 장소, 사회 환경)"),
          total_episodes: z.number().optional().describe("총 에피소드 수"),
        })
        .refine((value) => Object.values(value).some((item) => item !== undefined), { message: VALIDATION_ERROR }),
      execute: async (params) => {
        const did = requireDrama()
        const drama = Drama.update(did, params)
        Rag.index({
          entity_id: drama.id,
          entity_type: "drama",
          drama_id: did,
          content: Rag.serialize.drama(drama),
        }).catch((err) => ragError("tool.rag.index.update_drama", err, { drama_id: did }))
        EventBus.emit(did, "drama")
        log.info("tool.update_drama", { drama_id: drama.id })
        return `드라마 메타데이터가 업데이트되었습니다. (장르: ${drama.genre ?? "미정"}, 톤: ${drama.tone ?? "미정"})`
      },
    }),

    generate_scene_prompt: tool({
      description:
        "씬 데이터를 기반으로 Nano Banana Pro 호환 이미지 프롬프트 JSON을 생성합니다. 이미지를 생성하지 않고 프롬프트만 저장합니다.",
      inputSchema: z.object({
        scene_id: z.string().min(1, VALIDATION_ERROR).describe("장면 ID"),
      }),
      execute: async (params) => {
        const did = requireDrama()
        const scene = Scene.get(params.scene_id)
        const episode = Episode.get(scene.episode_id)
        if (episode.drama_id !== did) throw new Error("현재 드라마에 속한 장면만 처리할 수 있습니다.")
        const prompt = buildScenePrompt({ scene, drama: Drama.get(did) })
        Scene.update(scene.id, { image_prompt: prompt })
        log.info("tool.generate_scene_prompt", { scene_id: scene.id, drama_id: did })
        return prompt
      },
    }),

    save_world: tool({
      description: "세계관 요소를 기록합니다. 드라마의 배경, 문화, 규칙, 역사, 기술 등이 언급될 때 사용하세요.",
      inputSchema: z.object({
        category: z.enum(["location", "culture", "rule", "history", "technology"]).describe("카테고리"),
        name: z.string().describe("요소 이름"),
        description: z.string().optional().describe("상세 설명"),
      }),
      execute: async (params) => {
        const did = requireDrama()
        const probe = [
          `세계관 [${params.category}]: ${params.name}`,
          params.description ? `설명: ${params.description}` : "",
        ]
          .filter(Boolean)
          .join(" - ")
        const warning = await Rag.detectContradiction({
          entity_type: "world",
          content: probe,
          drama_id: did,
        }).catch((err) => {
          ragError("tool.rag.detect.world", err, { drama_id: did, name: params.name })
          return {
            conflicts: [] as Awaited<ReturnType<typeof Rag.detectContradiction>>["conflicts"],
            warning: undefined,
          }
        })
        const entry = World.create({ drama_id: did, ...params })
        Rag.index({
          entity_id: entry.id,
          entity_type: "world",
          drama_id: did,
          content: Rag.serialize.world(entry),
        }).catch((err) => ragError("tool.rag.index.create_world", err, { entity_id: entry.id, drama_id: did }))
        EventBus.emit(did, "world")
        const message = warning.warning ? `\n${warning.warning}` : ""
        log.info("tool.create_world", { id: entry.id, category: entry.category })
        return `세계관 요소 [${entry.category}] "${entry.name}" 이(가) 기록되었습니다.${message}`
      },
    }),

    save_plot_point: tool({
      description:
        "플롯 포인트(이야기 장치)를 기록합니다. 복선, 갈등, 반전, 클라이맥스, 해소 등 구조적 요소가 논의될 때 사용하세요.",
      inputSchema: z.object({
        type: z.enum(["setup", "conflict", "twist", "climax", "resolution", "foreshadowing"]).describe("유형"),
        description: z.string().describe("설명"),
        episode_id: z.string().optional().describe("관련 에피소드 ID"),
        linked_plot_id: z.string().optional().describe("연결된 플롯 포인트 ID (복선→회수 등)"),
      }),
      execute: async (params) => {
        const did = requireDrama()
        const point = PlotPoint.create({ drama_id: did, ...params })
        Rag.index({
          entity_id: point.id,
          entity_type: "plot_point",
          drama_id: did,
          content: Rag.serialize.plotPoint(point),
        }).catch((err) => ragError("tool.rag.index.create_plot_point", err, { entity_id: point.id, drama_id: did }))
        EventBus.emit(did, "plot")
        log.info("tool.create_plot_point", { id: point.id, type: point.type })
        return `플롯 포인트 [${point.type}] "${point.description.slice(0, 40)}..." 이(가) 기록되었습니다.`
      },
    }),

    save_character_arc: tool({
      description:
        "캐릭터의 에피소드별 감정 상태를 기록합니다. 스토리 전개에 따라 캐릭터의 감정 변화를 추적할 때 사용하세요. intensity는 -5(최저)~+5(최고) 사이 값입니다.",
      inputSchema: z.object({
        character_name: z.string().describe("캐릭터 이름"),
        episode_id: z.string().describe("에피소드 ID"),
        emotion: z.string().describe("감정 라벨 (예: 희망, 절망, 분노, 기쁨, 공포, 슬픔, 각성)"),
        intensity: z.number().min(-5).max(5).describe("감정 강도 (-5 최저 ~ +5 최고)"),
        description: z.string().optional().describe("이 감정 상태의 이유/맥락"),
      }),
      execute: async (params) => {
        const did = requireDrama()
        const character = Character.findByName(did, params.character_name)
        if (!character)
          return `캐릭터 "${params.character_name}"을(를) 찾을 수 없습니다. 먼저 save_character로 등록해주세요.`
        const arc = CharacterArc.create({
          drama_id: did,
          character_id: character.id,
          episode_id: params.episode_id,
          emotion: params.emotion,
          intensity: params.intensity,
          description: params.description,
        })
        EventBus.emit(did, "arc")
        log.info("tool.save_character_arc", { id: arc.id, character: params.character_name, emotion: arc.emotion })
        return `${params.character_name}의 감정 아크 기록: ${arc.emotion} (강도: ${arc.intensity > 0 ? "+" : ""}${arc.intensity})`
      },
    }),

    resolve_plot_point: tool({
      description:
        "복선이나 플롯 포인트를 해결됨으로 표시합니다. 복선이 회수되거나 갈등이 해소될 때 사용하세요. 해결하는 에피소드와 연결된 플롯 포인트를 지정할 수 있습니다.",
      inputSchema: z.object({
        plot_point_id: z.string().describe("해결할 플롯 포인트 ID"),
        resolved_episode_id: z.string().optional().describe("해결되는 에피소드 ID"),
        linked_plot_id: z.string().optional().describe("연결된 플롯 포인트 ID (복선→회수 연결)"),
      }),
      execute: async (params) => {
        const did = requireDrama()
        const point = PlotPoint.get(params.plot_point_id)
        if (point.drama_id !== did) throw new Error("현재 드라마에 속한 플롯 포인트만 해결할 수 있습니다.")
        const updated = PlotPoint.update(params.plot_point_id, {
          resolved: true,
          resolved_episode_id: params.resolved_episode_id,
          linked_plot_id: params.linked_plot_id,
        })
        EventBus.emit(did, "plot")
        log.info("tool.resolve_plot_point", { id: updated.id })
        return `플롯 포인트 [${updated.type}] "${updated.description.slice(0, 40)}..." 이(가) 해결됨으로 표시되었습니다.`
      },
    }),

    observe_writer_style: tool({
      description:
        "작가의 창작 스타일, 선호도, 습관을 기록합니다. 대화 중 작가의 반복적인 패턴이나 확실한 선호를 발견했을 때 사용하세요. 예: 특정 장르 선호, 대사 스타일, 캐릭터 구축 방식, 서사 구조 취향 등.",
      inputSchema: z.object({
        category: z
          .enum(["genre", "dialogue", "character", "structure", "preference", "habit"])
          .describe(
            "카테고리: genre=장르 선호, dialogue=대사 스타일, character=캐릭터 구축, structure=서사 구조, preference=일반 취향, habit=작업 습관",
          ),
        observation: z.string().describe("관찰한 스타일/선호에 대한 구체적 설명 (한국어)"),
      }),
      execute: async (params) => {
        const style = WriterStyle.create({
          ...params,
          drama_id: dramaID ?? undefined,
          session_id: input.session_id,
        })
        log.info("tool.observe_writer_style", { id: style.id, category: style.category })
        return `작가 스타일 기록됨: [${style.category}] ${style.observation.slice(0, 60)}`
      },
    }),
  }
}
