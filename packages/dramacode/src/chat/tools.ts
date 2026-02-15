import { tool } from "ai"
import { z } from "zod"
import { Drama, Episode, Character, World, PlotPoint, Scene } from "../drama"
import { Rag } from "../rag"
import { WriterStyle } from "../writer"
import { Session } from "../session"
import { Log } from "../util/log"
import { EventBus } from "../server/routes/events"

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
