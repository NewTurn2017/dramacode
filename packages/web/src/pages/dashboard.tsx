import { createSignal, createResource, createEffect, createMemo, For, Show } from "solid-js"
import { A } from "@solidjs/router"
import { api, type Drama } from "@/lib/api"
import { runWithPending } from "@/lib/async-guard"
import { ConfirmModal } from "@/components/confirm-modal"

export default function Dashboard() {
  const [dramas, { refetch }] = createResource(() => api.drama.list())
  const [title, setTitle] = createSignal("")
  const [creating, setCreating] = createSignal(false)
  const [deleteTarget, setDeleteTarget] = createSignal<Drama | null>(null)
  const [search, setSearch] = createSignal("")
  const [dramaCounts, setDramaCounts] = createSignal<Record<string, { characters: number; episodes: number; scenes: number }>>({})

  const filteredDramas = createMemo(() => {
    const q = search().toLowerCase()
    if (!q) return dramas() ?? []
    return (dramas() ?? []).filter(d => d.title.toLowerCase().includes(q))
  })

  createEffect(() => {
    const list = dramas()
    if (!list) return
    for (const d of list) {
      Promise.all([
        api.drama.characters(d.id),
        api.drama.episodes(d.id),
        api.drama.scenes(d.id),
      ]).then(([chars, eps, scenes]) => {
        setDramaCounts(prev => ({
          ...prev,
          [d.id]: { characters: chars.length, episodes: eps.length, scenes: scenes.length },
        }))
      })
    }
  })

  async function handleCreate(e: Event) {
    e.preventDefault()
    if (!title().trim()) return
    await runWithPending(setCreating, async () => {
      await api.drama.create({ title: title() })
      setTitle("")
      refetch()
    })
  }

  async function confirmDelete() {
    const target = deleteTarget()
    if (!target) return
    setDeleteTarget(null)
    await api.drama.remove(target.id)
    refetch()
  }

  function relativeTime(ts: number): string {
    const diff = Date.now() - ts
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (seconds < 60) return "방금 전"
    if (minutes < 60) return `${minutes}분 전`
    if (hours < 24) return `${hours}시간 전`
    if (days < 7) return `${days}일 전`
    return new Date(ts).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })
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

      <Show when={(dramas() ?? []).length > 0}>
        <div class="mb-4">
          <input
            type="text"
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
            placeholder="프로젝트 검색..."
            class="w-full px-3 py-2 bg-bg-card border border-border rounded-md text-sm text-text placeholder:text-text-dim/50 focus:outline-none focus:border-accent transition-colors"
          />
        </div>
      </Show>

      <Show when={dramas()?.length === 0}>
        <div class="text-center py-12">
          <p class="text-text-dim">아직 프로젝트가 없습니다</p>
          <p class="text-text-dim text-sm mt-1">위에서 새 드라마를 만들어보세요</p>
        </div>
      </Show>

      <Show when={filteredDramas().length === 0 && search()}>
        <div class="text-center py-8">
          <p class="text-text-dim text-sm">검색 결과가 없습니다</p>
        </div>
      </Show>

      <div class="grid gap-3">
        <For each={filteredDramas()}>
          {(drama) => (
            <div class="flex items-center gap-4 p-4 bg-bg-card border border-border rounded-lg hover:border-accent/40 transition-colors group overflow-hidden">
              <A href={`/drama/${drama.id}`} class="flex-1 min-w-0">
                <h3 class="font-medium truncate group-hover:text-accent transition-colors">{drama.title}</h3>
                <div class="flex items-center gap-3 mt-1 text-xs text-text-dim truncate">
                  <Show when={drama.genre}>
                    <span class="shrink-0">{drama.genre}</span>
                  </Show>
                  <Show when={drama.tone}>
                    <span class="shrink-0">{drama.tone}</span>
                  </Show>
                  <Show when={drama.total_episodes}>
                    <span class="shrink-0">{drama.total_episodes}화</span>
                  </Show>
                  <span class="shrink-0">{relativeTime(drama.time_updated)}</span>
                </div>
                <Show when={dramaCounts()[drama.id]}>
                  {(counts) => (
                    <div class="flex items-center gap-2 mt-1.5">
                      <span class="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent">
                        인물 {counts().characters}
                      </span>
                      <span class="text-[10px] px-1.5 py-0.5 rounded bg-bg-hover text-text-dim">
                        에피소드 {counts().episodes}
                      </span>
                      <span class="text-[10px] px-1.5 py-0.5 rounded bg-bg-hover text-text-dim">
                        장면 {counts().scenes}
                      </span>
                    </div>
                  )}
                </Show>
                <Show when={drama.logline}>
                  <p class="text-sm text-text-dim mt-1 line-clamp-2">{drama.logline}</p>
                </Show>
              </A>
              <button
                onClick={() => setDeleteTarget(drama)}
                class="p-1.5 text-text-dim hover:text-danger opacity-0 group-hover:opacity-100 transition-all"
                title="삭제"
              >
                ✕
              </button>
            </div>
          )}
        </For>
      </div>

      <ConfirmModal
        open={!!deleteTarget()}
        title="드라마 삭제"
        message={`"${deleteTarget()?.title}" 프로젝트를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
