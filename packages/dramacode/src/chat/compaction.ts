import type { Session } from "../session"

export const COMPACTION_CHAR_THRESHOLD = 80_000
const TOKEN_CHAR_RATIO = 4
const KEEP_LAST_MESSAGES = 10

export function estimateTokens(chars: number) {
  return Math.ceil(chars / TOKEN_CHAR_RATIO)
}

function summaryPrompt(input: {
  context: string
  summary_count: number
  target: Session.Message[]
  total_chars: number
}) {
  const history = input.target.map((msg, idx) => `- #${idx + 1} [${msg.role}]\n${msg.content}`).join("\n\n")
  return [
    "당신은 한국 드라마 각본 개발 회의를 요약하는 시니어 작가입니다.",
    "아래는 지금까지 누적된 대화 중 오래된 구간입니다. 최신 10개 메시지는 별도로 보존됩니다.",
    `현재까지의 누적 길이: ${input.total_chars} chars (약 ${estimateTokens(input.total_chars)} tokens)`,
    `이번 요약은 ${input.summary_count}번째 컨텍스트 압축 요약입니다.`,
    "핵심 결정을 잃지 않게 구조화하여 요약하세요.",
    "필수 출력 형식:",
    "### 캐릭터",
    "### 에피소드",
    "### 세계관",
    "### 플롯",
    "### 논의된 씬",
    "각 섹션은 결정된 사실만 bullet로 작성하고, 없으면 '- 없음'을 작성하세요.",
    "\n[드라마 컨텍스트]",
    input.context,
    "\n[압축 대상 대화]",
    history,
  ].join("\n")
}

function buildSummary(input: string) {
  return `## 지금까지 결정된 사항\n${input.trim()}`
}

export async function compactIfNeeded(input: {
  total_chars: number
  summary_count: number
  context: string
  messages: Session.Message[]
  summarize: (prompt: string) => Promise<string>
}) {
  if (input.total_chars <= COMPACTION_CHAR_THRESHOLD) return

  const target = input.messages.slice(0, -KEEP_LAST_MESSAGES)
  if (!target.length) return

  const text = await input.summarize(
    summaryPrompt({
      context: input.context,
      summary_count: input.summary_count,
      target,
      total_chars: input.total_chars,
    }),
  )

  return {
    summary: buildSummary(text),
    keep_last: KEEP_LAST_MESSAGES,
  }
}
