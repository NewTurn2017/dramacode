import { Drama, Episode, Character, World, PlotPoint } from "../drama"
import { WriterStyle } from "../writer"

export namespace DramaPrompt {
  export const system = `당신은 **DRAMACODE** — 한국 드라마 각본 전문 AI 작가입니다.

## 역할
TV 드라마 시리즈의 각본 작업을 돕는 시니어 작가. 사용자(메인 작가)와 대화하며 스토리를 발전시킵니다.

## 핵심 원칙
1. **캐릭터 중심**: 모든 장면은 캐릭터의 욕망과 갈등에서 출발합니다
2. **서브텍스트**: 대사 아래 숨겨진 진짜 의미를 항상 고려합니다
3. **장면 전환**: 씬과 씬 사이의 감정적 리듬을 설계합니다
4. **복선과 회수**: 초반에 심은 장치가 후반에 빛나도록 구성합니다
5. **한국 방송 포맷**: 회당 60~70분, 주 2회 방영 기준 구성

## 대화 스타일
- 작가 동료처럼 자연스럽게 대화합니다
- 구체적인 장면과 대사 예시를 적극 제안합니다
- 이야기의 허점이나 약점을 솔직하게 짚어줍니다
- "~하면 어떨까요?" 형태로 제안하되, 작가의 의도를 존중합니다

## 응답 형식
일반 대화에서는 자유롭게 답하되, 각본 관련 제안 시:
- **장면(Scene)**: 장소, 시간, 등장인물, 핵심 갈등 명시
- **대사(Dialogue)**: 캐릭터명: "대사" 형식
- **지문(Action)**: 괄호 안에 행동/감정 묘사
- **구성 노트**: 연출 의도나 복선 메모

## 구조적 제안 시 참고
- 기(起) 1~4화: 세계관 + 캐릭터 소개 + 핵심 갈등 제시
- 승(承) 5~10화: 갈등 심화 + 서브플롯 전개
- 전(轉) 11~14화: 반전 + 위기 고조
- 결(結) 15~16화: 클라이맥스 + 해소

## 도구 사용 지침
대화 중 구조화된 정보가 나올 때 적극적으로 도구를 사용하세요:
- **새 드라마 아이디어** → \`create_drama\`로 프로젝트 생성
- **캐릭터 설정** → \`save_character\`로 저장 (이름 기준 중복 시 자동 업데이트)
- **에피소드 구성** → \`save_episode\`로 회차 생성
- **장면 논의** → \`save_scene\`으로 기록 (에피소드 생성 후)
- **세계관/배경** → \`save_world\`로 기록
- **복선/갈등/반전** → \`save_plot_point\`로 기록

자연스러운 대화 흐름을 유지하면서, 작가가 결정한 중요 사항을 놓치지 않고 저장하세요.
도구를 사용했을 때 별도로 알리지 말고, 대화 맥락에 자연스럽게 녹이세요.

## 작가 스타일 관찰 지침
대화 중 작가의 창작 스타일이나 선호를 발견하면 \`observe_writer_style\`로 기록하세요:
- **genre**: 선호하는 장르, 장르 혼합 경향
- **dialogue**: 대사 스타일 (문어체/구어체, 길이, 서브텍스트 선호 등)
- **character**: 캐릭터 구축 방식 (심리 묘사 깊이, 회색 캐릭터 선호 등)
- **structure**: 서사 구조 취향 (비선형, 복선 밀도, 페이싱 등)
- **preference**: 일반적 취향 (해피엔딩/새드엔딩, 현실적/판타지 등)
- **habit**: 작업 습관 (에피소드부터/캐릭터부터, 아웃라인 중시 등)

이미 기록된 스타일과 중복되지 않도록 새로운 관찰만 기록하세요.
확실한 패턴이 보일 때만 기록하고, 한 번의 언급으로 성급하게 판단하지 마세요.

대화를 시작할 때 간단히 인사하고, 어떤 작업을 하고 있는지 물어보세요.`

  export function withContext(dramaTitle?: string, episodeNum?: number): string {
    const parts = [system]
    if (dramaTitle) parts.push(`\n현재 작업 중인 드라마: **${dramaTitle}**`)
    if (episodeNum) parts.push(`현재 에피소드: ${episodeNum}화`)
    return parts.join("\n")
  }

  function writerProfile(): string {
    const styles = WriterStyle.list()
    if (!styles.length) return ""

    const grouped = new Map<string, typeof styles>()
    for (const s of styles) {
      const list = grouped.get(s.category) ?? []
      list.push(s)
      grouped.set(s.category, list)
    }

    const labels: Record<string, string> = {
      genre: "장르 선호",
      dialogue: "대사 스타일",
      character: "캐릭터 구축",
      structure: "서사 구조",
      preference: "일반 취향",
      habit: "작업 습관",
    }

    const lines = ["\n## 작가 프로필"]
    for (const [cat, items] of grouped) {
      lines.push(`\n### ${labels[cat] ?? cat}`)
      for (const item of items) {
        const conf = item.confidence > 1 ? ` (확신도: ${item.confidence}/5)` : ""
        lines.push(`- ${item.observation}${conf}`)
      }
    }
    return lines.join("\n")
  }

  export function buildContext(dramaId?: string | null): string {
    const profile = writerProfile()

    if (!dramaId) return system + profile

    const drama = Drama.get(dramaId)
    const characters = Character.listByDrama(dramaId)
    const episodes = Episode.listByDrama(dramaId)
    const unresolved = PlotPoint.listUnresolved(dramaId)
    const world = World.listByDrama(dramaId)
    const parts = [system]

    // Drama header
    parts.push(`\n## 현재 프로젝트: ${drama.title}`)
    if (drama.genre) parts.push(`- 장르: ${drama.genre}`)
    if (drama.tone) parts.push(`- 톤: ${drama.tone}`)
    if (drama.logline) parts.push(`- 로그라인: ${drama.logline}`)
    if (drama.total_episodes) parts.push(`- 총 ${drama.total_episodes}화 예정`)
    if (drama.setting) parts.push(`- 배경: ${drama.setting}`)

    // Characters
    if (characters.length) {
      parts.push(`\n### 등장인물 (${characters.length}명)`)
      for (const c of characters) {
        const role = c.role ? ` (${c.role})` : ""
        const occ = c.occupation ? ` — ${c.occupation}` : ""
        const personality = c.personality ? `, ${c.personality}` : ""
        parts.push(`- **${c.name}**${role}${occ}${personality}`)
        if (c.backstory) parts.push(`  배경: ${c.backstory.slice(0, 200)}`)
        if (c.arc) parts.push(`  아크: ${c.arc.slice(0, 150)}`)
      }
    }

    // Episodes
    if (episodes.length) {
      parts.push(`\n### 에피소드 (${episodes.length}화)`)
      for (const ep of episodes) {
        const syn = ep.synopsis ? ` — ${ep.synopsis.slice(0, 100)}` : ""
        parts.push(`- ${ep.number}화: "${ep.title}"${syn}`)
      }
    }

    // Unresolved plot points
    if (unresolved.length) {
      parts.push(`\n### 미해결 복선/갈등 (${unresolved.length}건)`)
      for (const pp of unresolved) {
        parts.push(`- [${pp.type}] ${pp.description.slice(0, 150)}`)
      }
    }

    // World elements
    if (world.length) {
      parts.push(`\n### 세계관`)
      for (const w of world) {
        const desc = w.description ? ` — ${w.description.slice(0, 100)}` : ""
        parts.push(`- [${w.category}] ${w.name}${desc}`)
      }
    }

    return parts.join("\n") + profile
  }
}
