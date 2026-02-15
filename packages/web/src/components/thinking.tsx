import { createSignal, onCleanup } from "solid-js"

const phrases = [
  "장면을 구상하는 중",
  "캐릭터를 분석하는 중",
  "서사를 짜는 중",
  "대사를 다듬는 중",
  "갈등 구조를 설계하는 중",
  "복선을 깔고 있는 중",
  "감정선을 잡는 중",
  "세계관을 탐색하는 중",
]

export function ThinkingIndicator() {
  const [idx, setIdx] = createSignal(0)
  const [dots, setDots] = createSignal(0)

  const phraseTimer = setInterval(() => setIdx((i) => (i + 1) % phrases.length), 2800)
  const dotTimer = setInterval(() => setDots((d) => (d + 1) % 4), 400)

  onCleanup(() => {
    clearInterval(phraseTimer)
    clearInterval(dotTimer)
  })

  return (
    <div class="flex">
      <div class="px-4 py-3 rounded-lg text-sm bg-bg-card border border-border">
        <div class="flex items-center gap-2.5">
          <div class="flex gap-1">
            <span class="thinking-dot" />
            <span class="thinking-dot" style={{ "animation-delay": "0.15s" }} />
            <span class="thinking-dot" style={{ "animation-delay": "0.3s" }} />
          </div>
          <span class="text-text-dim">
            {phrases[idx()]}
            {".".repeat(dots())}
          </span>
        </div>
      </div>
    </div>
  )
}
