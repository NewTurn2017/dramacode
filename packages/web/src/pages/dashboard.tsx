import { createSignal, createResource, For, Show } from "solid-js"
import { A } from "@solidjs/router"
import { api, type Drama } from "@/lib/api"

export default function Dashboard() {
  const [dramas, { refetch }] = createResource(() => api.drama.list())
  const [title, setTitle] = createSignal("")
  const [creating, setCreating] = createSignal(false)

  async function handleCreate(e: Event) {
    e.preventDefault()
    if (!title().trim()) return
    setCreating(true)
    await api.drama.create({ title: title() })
    setTitle("")
    setCreating(false)
    refetch()
  }

  async function handleRemove(id: string) {
    if (!confirm("정말 삭제하시겠습니까?")) return
    await api.drama.remove(id)
    refetch()
  }

  function formatDate(ts: number) {
    return new Date(ts).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" })
  }

  return (
    <div class="p-6 max-w-4xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-bold">드라마 프로젝트</h2>
      </div>

      <form onSubmit={handleCreate} class="flex gap-2 mb-6">
        <input
          type="text"
          value={title()}
          onInput={(e) => setTitle(e.currentTarget.value)}
          placeholder="새 드라마 제목..."
          class="flex-1 px-3 py-2 bg-bg-card border border-border rounded-md text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={creating() || !title().trim()}
          class="px-4 py-2 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          생성
        </button>
      </form>

      <Show when={dramas.loading}>
        <p class="text-text-dim text-sm">불러오는 중...</p>
      </Show>

      <Show when={dramas()?.length === 0}>
        <div class="text-center py-12">
          <p class="text-text-dim">아직 프로젝트가 없습니다</p>
          <p class="text-text-dim text-sm mt-1">위에서 새 드라마를 만들어보세요</p>
        </div>
      </Show>

      <div class="grid gap-3">
        <For each={dramas()}>
          {(drama) => (
            <div class="flex items-center gap-4 p-4 bg-bg-card border border-border rounded-lg hover:border-accent/40 transition-colors group">
              <A href={`/drama/${drama.id}`} class="flex-1 min-w-0">
                <h3 class="font-medium truncate group-hover:text-accent transition-colors">{drama.title}</h3>
                <div class="flex items-center gap-3 mt-1 text-xs text-text-dim">
                  <Show when={drama.genre}>
                    <span>{drama.genre}</span>
                  </Show>
                  <Show when={drama.tone}>
                    <span>{drama.tone}</span>
                  </Show>
                  <Show when={drama.total_episodes}>
                    <span>{drama.total_episodes}화</span>
                  </Show>
                  <span>{formatDate(drama.time_updated)}</span>
                </div>
                <Show when={drama.logline}>
                  <p class="text-sm text-text-dim mt-1 truncate">{drama.logline}</p>
                </Show>
              </A>
              <button
                onClick={() => handleRemove(drama.id)}
                class="p-1.5 text-text-dim hover:text-danger opacity-0 group-hover:opacity-100 transition-all"
                title="삭제"
              >
                ✕
              </button>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
