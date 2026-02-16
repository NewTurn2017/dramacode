import { describe, expect, it } from "bun:test"
import { heuristicDraft, parseDraftText, sanitizeDraft, sceneIntent, type StructuredDraft } from "./structured"

describe("sanitizeDraft", () => {
  it("drops scenes until macro foundation is built", () => {
    const draft: StructuredDraft = {
      drama: {},
      characters: [{ name: "김서연" }],
      episodes: [{ number: 1, title: "첫 만남" }],
      world: [{ category: "location", name: "서울" }],
      plot_points: [{ type: "conflict", description: "검찰 내부 부패" }],
      scenes: [{ episode_number: 1, number: 1, location: "법정", description: "첫 대면" }],
    }

    const out = sanitizeDraft(draft, { characters: 0, episodes: 0, world: 0 })
    expect(out.scenes).toHaveLength(0)
  })

  it("keeps scenes once macro foundation exists", () => {
    const draft: StructuredDraft = {
      drama: {},
      characters: [{ name: "김서연" }],
      episodes: [{ number: 1, title: "첫 만남" }],
      world: [{ category: "location", name: "서울" }],
      plot_points: [{ type: "conflict", description: "검찰 내부 부패" }],
      scenes: [{ episode_number: 1, number: 1, location: "법정", description: "첫 대면" }],
    }

    const out = sanitizeDraft(draft, { characters: 2, episodes: 1, world: 1 }, { allow_scenes: true })
    expect(out.scenes).toHaveLength(1)
  })

  it("drops scenes without explicit scene intent", () => {
    const draft: StructuredDraft = {
      drama: {},
      characters: [{ name: "김서연" }],
      episodes: [{ number: 1, title: "첫 만남" }],
      world: [{ category: "location", name: "서울" }],
      plot_points: [],
      scenes: [{ episode_number: 1, number: 1, location: "법정", description: "첫 대면" }],
    }

    const out = sanitizeDraft(draft, { characters: 2, episodes: 1, world: 1 }, { allow_scenes: false })
    expect(out.scenes).toHaveLength(0)
  })

  it("deduplicates characters by name and merges non-empty fields", () => {
    const draft: StructuredDraft = {
      drama: {},
      characters: [
        { name: "김서연", role: "protagonist" },
        { name: "김서연", occupation: "검사", personality: "냉정하지만 따뜻함" },
      ],
      episodes: [],
      world: [],
      plot_points: [],
      scenes: [],
    }

    const out = sanitizeDraft(draft, { characters: 0, episodes: 0, world: 0 })
    expect(out.characters).toHaveLength(1)
    expect(out.characters[0]).toEqual({
      name: "김서연",
      role: "protagonist",
      occupation: "검사",
      personality: "냉정하지만 따뜻함",
    })
  })

  it("detects scene intent from user text", () => {
    expect(sceneIntent("1화 장면을 상세하게 짜자")).toBeTrue()
    expect(sceneIntent("세계관 먼저 잡자")).toBeFalse()
  })

  it("parses structured draft from fenced json text", () => {
    const out = parseDraftText(
      [
        "```json",
        "{",
        '  "drama": { "genre": "로맨스" },',
        '  "characters": [{ "name": "김서연" }],',
        '  "episodes": [],',
        '  "world": [],',
        '  "plot_points": [],',
        '  "scenes": []',
        "}",
        "```",
      ].join("\n"),
    )
    expect(out?.drama.genre).toBe("로맨스")
    expect(out?.characters.length).toBe(1)
  })

  it("returns null for non-json text", () => {
    const out = parseDraftText("그냥 일반 대화 텍스트")
    expect(out).toBeNull()
  })

  it("extracts macro entities from user text heuristically", () => {
    const out = heuristicDraft(
      "등장인물: 강민재(주인공 신인 아이돌), 서유진(리더). 세계관: 현대 서울의 아이돌 기획사 내부. 에피소드 1 제목은 리허설 사고, 시놉시스는 무대 사고를 계기로 초능력 조짐이 드러난다. 6화",
    )
    expect(out.characters.length).toBe(2)
    expect(out.episodes[0]?.number).toBe(1)
    expect(out.world[0]?.name).toContain("현대 서울")
    expect(out.drama.total_episodes).toBe(6)
  })
})
