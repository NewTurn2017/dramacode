import { createResource, For, Show } from "solid-js"
import { api, type WriterStyle } from "@/lib/api"

const categoryLabel: Record<string, string> = {
  genre: "장르 선호",
  dialogue: "대사 스타일",
  character: "캐릭터 구축",
  structure: "서사 구조",
  preference: "일반 취향",
  habit: "작업 습관",
}

const categoryIcon: Record<string, string> = {
  genre: "🎭",
  dialogue: "💬",
  character: "👤",
  structure: "🏗️",
  preference: "⭐",
  habit: "🔄",
}

export default function WriterPage() {
  const [styles] = createResource(() => api.writer.list())

  function grouped() {
    const map = new Map<string, WriterStyle[]>()
    for (const s of styles() ?? []) {
      const list = map.get(s.category) ?? []
      list.push(s)
      map.set(s.category, list)
    }
    return map
  }

  return (
    <div class="px-4 py-5 sm:p-6 max-w-4xl mx-auto">
      <div class="mb-6">
        <h2 class="text-xl font-bold">작가 프로필</h2>
        <p class="text-sm text-text-dim mt-1">AI가 대화 중 관찰한 창작 스타일과 선호도입니다</p>
      </div>

      <Show when={styles.loading}>
        <p class="text-text-dim text-sm">불러오는 중...</p>
      </Show>

      <Show when={styles() && styles()!.length === 0}>
        <div class="text-center py-12">
          <p class="text-3xl mb-3">✍️</p>
          <p class="text-text-dim">아직 기록된 스타일이 없습니다</p>
          <p class="text-text-dim text-sm mt-1">채팅에서 드라마를 논의하면 AI가 자동으로 작가 스타일을 관찰합니다</p>
        </div>
      </Show>

      <Show when={styles() && styles()!.length > 0}>
        <div class="space-y-6">
          <For each={[...grouped().entries()]}>
            {([category, items]) => (
              <div>
                <h3 class="text-sm font-medium text-text-dim mb-2">
                  {categoryIcon[category] ?? "📝"} {categoryLabel[category] ?? category}
                  <span class="ml-1 text-xs">({items.length})</span>
                </h3>
                <div class="grid gap-2">
                  <For each={items}>
                    {(item) => (
                      <div class="p-3 bg-bg-card border border-border rounded-lg">
                        <p class="text-sm">{item.observation}</p>
                        <div class="flex items-center gap-2 mt-1.5 text-xs text-text-dim">
                          <Show when={item.confidence > 1}>
                            <span>
                              확신도: {"●".repeat(item.confidence)}
                              {"○".repeat(5 - item.confidence)}
                            </span>
                          </Show>
                          <span>{new Date(item.time_created).toLocaleDateString("ko-KR")}</span>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
