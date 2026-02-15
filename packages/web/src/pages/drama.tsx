import { createResource, createSignal, For, Show, Switch, Match } from "solid-js"
import { useParams, A } from "@solidjs/router"
import { api } from "@/lib/api"

type Tab = "characters" | "episodes" | "world" | "plot"

const tabs: { key: Tab; label: string; icon: string }[] = [
  { key: "characters", label: "등장인물", icon: "👤" },
  { key: "episodes", label: "에피소드", icon: "📺" },
  { key: "world", label: "세계관", icon: "🌍" },
  { key: "plot", label: "플롯", icon: "📊" },
]

export default function DramaDetail() {
  const params = useParams()
  const [tab, setTab] = createSignal<Tab>("characters")

  const [drama] = createResource(() => params.id, api.drama.get)
  const [characters] = createResource(() => params.id, api.drama.characters)
  const [episodes] = createResource(() => params.id, api.drama.episodes)
  const [world] = createResource(() => params.id, api.drama.world)
  const [plotPoints] = createResource(() => params.id, api.drama.plotPoints)

  const roleLabel: Record<string, string> = {
    protagonist: "주인공",
    antagonist: "적대자",
    supporting: "조연",
    extra: "단역",
  }

  const plotTypeLabel: Record<string, string> = {
    setup: "설정",
    conflict: "갈등",
    twist: "반전",
    climax: "클라이맥스",
    resolution: "해소",
    foreshadowing: "복선",
  }

  return (
    <div class="p-6 max-w-5xl mx-auto">
      <Show when={drama()} fallback={<p class="text-text-dim">불러오는 중...</p>}>
        {(d) => (
          <>
            <div class="mb-6">
              <A href="/" class="text-sm text-text-dim hover:text-accent transition-colors">
                ← 목록
              </A>
              <h2 class="text-xl font-bold mt-2">{d().title}</h2>
              <div class="flex items-center gap-3 mt-1 text-sm text-text-dim">
                <Show when={d().genre}>
                  <span class="px-2 py-0.5 bg-accent/10 text-accent rounded text-xs">{d().genre}</span>
                </Show>
                <Show when={d().tone}>
                  <span>{d().tone}</span>
                </Show>
                <Show when={d().total_episodes}>
                  <span>{d().total_episodes}화 예정</span>
                </Show>
              </div>
              <Show when={d().logline}>
                <p class="text-sm text-text-dim mt-2">{d().logline}</p>
              </Show>
            </div>

            <div class="flex gap-1 mb-4 border-b border-border">
              <For each={tabs}>
                {(t) => (
                  <button
                    onClick={() => setTab(t.key)}
                    class="px-3 py-2 text-sm transition-colors border-b-2"
                    classList={{
                      "border-accent text-accent": tab() === t.key,
                      "border-transparent text-text-dim hover:text-text": tab() !== t.key,
                    }}
                  >
                    {t.icon} {t.label}
                  </button>
                )}
              </For>
            </div>

            <Switch>
              <Match when={tab() === "characters"}>
                <div class="grid gap-3">
                  <Show when={!characters()?.length}>
                    <p class="text-text-dim text-sm py-8 text-center">
                      아직 등장인물이 없습니다. 채팅에서 캐릭터를 논의하면 자동으로 추가됩니다.
                    </p>
                  </Show>
                  <For each={characters()}>
                    {(c) => (
                      <div class="p-4 bg-bg-card border border-border rounded-lg">
                        <div class="flex items-center gap-2">
                          <h4 class="font-medium">{c.name}</h4>
                          <Show when={c.role}>
                            <span class="text-xs px-1.5 py-0.5 bg-accent/10 text-accent rounded">
                              {roleLabel[c.role!] ?? c.role}
                            </span>
                          </Show>
                        </div>
                        <div class="mt-1 text-sm text-text-dim space-y-0.5">
                          <Show when={c.occupation}>
                            <p>직업: {c.occupation}</p>
                          </Show>
                          <Show when={c.age}>
                            <p>나이: {c.age}</p>
                          </Show>
                          <Show when={c.personality}>
                            <p>성격: {c.personality}</p>
                          </Show>
                          <Show when={c.backstory}>
                            <p class="truncate">배경: {c.backstory}</p>
                          </Show>
                          <Show when={c.arc}>
                            <p class="truncate">아크: {c.arc}</p>
                          </Show>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Match>

              <Match when={tab() === "episodes"}>
                <div class="grid gap-3">
                  <Show when={!episodes()?.length}>
                    <p class="text-text-dim text-sm py-8 text-center">아직 에피소드가 없습니다.</p>
                  </Show>
                  <For each={episodes()}>
                    {(ep) => (
                      <div class="p-4 bg-bg-card border border-border rounded-lg">
                        <div class="flex items-center gap-2">
                          <span class="text-xs font-mono bg-bg-hover px-1.5 py-0.5 rounded">{ep.number}화</span>
                          <h4 class="font-medium">{ep.title}</h4>
                          <span class="text-xs text-text-dim">{ep.status}</span>
                        </div>
                        <Show when={ep.synopsis}>
                          <p class="text-sm text-text-dim mt-1">{ep.synopsis}</p>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </Match>

              <Match when={tab() === "world"}>
                <div class="grid gap-3">
                  <Show when={!world()?.length}>
                    <p class="text-text-dim text-sm py-8 text-center">세계관 설정이 없습니다.</p>
                  </Show>
                  <For each={world()}>
                    {(w) => (
                      <div class="p-4 bg-bg-card border border-border rounded-lg">
                        <div class="flex items-center gap-2">
                          <span class="text-xs px-1.5 py-0.5 bg-bg-hover rounded uppercase">{w.category}</span>
                          <h4 class="font-medium">{w.name}</h4>
                        </div>
                        <Show when={w.description}>
                          <p class="text-sm text-text-dim mt-1">{w.description}</p>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </Match>

              <Match when={tab() === "plot"}>
                <div class="grid gap-3">
                  <Show when={!plotPoints()?.length}>
                    <p class="text-text-dim text-sm py-8 text-center">플롯 포인트가 없습니다.</p>
                  </Show>
                  <For each={plotPoints()}>
                    {(pp) => (
                      <div class="p-4 bg-bg-card border border-border rounded-lg">
                        <div class="flex items-center gap-2">
                          <span class="text-xs px-1.5 py-0.5 bg-accent/10 text-accent rounded">
                            {plotTypeLabel[pp.type] ?? pp.type}
                          </span>
                          <Show when={pp.resolved}>
                            <span class="text-xs text-success">✓ 해결</span>
                          </Show>
                        </div>
                        <p class="text-sm mt-1">{pp.description}</p>
                      </div>
                    )}
                  </For>
                </div>
              </Match>
            </Switch>
          </>
        )}
      </Show>
    </div>
  )
}
