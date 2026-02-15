import { tool } from "ai"
import { z } from "zod"
import { Drama, Episode, Character, World, PlotPoint, Scene } from "../drama"
import { Session } from "../session"
import { Log } from "../util/log"

const log = Log.create({ service: "chat.tools" })

export function dramaTools(input: { session_id: string; drama_id?: string | null }) {
  let dramaID = input.drama_id ?? null

  function requireDrama(): string {
    if (!dramaID) throw new Error("드라마를 먼저 생성해주세요 (create_drama 도구 사용)")
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
        if (existing) {
          const updated = Character.update(existing.id, params)
          log.info("tool.update_character", { id: updated.id, name: updated.name })
          return `캐릭터 "${updated.name}" 정보가 업데이트되었습니다.`
        }
        const created = Character.create({ drama_id: did, ...params })
        log.info("tool.create_character", { id: created.id, name: created.name })
        return `캐릭터 "${created.name}"이(가) 등록되었습니다.`
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
        log.info("tool.create_episode", { id: ep.id, number: ep.number })
        return `${ep.number}화 "${ep.title}" 에피소드가 생성되었습니다. (ID: ${ep.id})`
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
      }),
      execute: async (params) => {
        requireDrama()
        const scene = Scene.create(params)
        log.info("tool.create_scene", { id: scene.id, episode_id: params.episode_id })
        return `S#${scene.number} 장면이 생성되었습니다. (장소: ${scene.location ?? "미정"})`
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
        const entry = World.create({ drama_id: did, ...params })
        log.info("tool.create_world", { id: entry.id, category: entry.category })
        return `세계관 요소 [${entry.category}] "${entry.name}" 이(가) 기록되었습니다.`
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
        log.info("tool.create_plot_point", { id: point.id, type: point.type })
        return `플롯 포인트 [${point.type}] "${point.description.slice(0, 40)}..." 이(가) 기록되었습니다.`
      },
    }),
  }
}
