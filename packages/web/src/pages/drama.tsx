import { createSignal, createResource, createEffect, For, Show, Switch, Match, onCleanup } from "solid-js"
import { useParams, A } from "@solidjs/router"
import { api, type Session } from "@/lib/api"
import { ChatPanel } from "@/components/chat-panel"
import { ConfirmModal } from "@/components/confirm-modal"
import { ThinkingIndicator } from "@/components/thinking"
import { RelationshipGraph } from "@/components/relationship-graph"

type OpenTab = { id: string; label: string }
type Section = "characters" | "episodes" | "world" | "plot"

const sections: { key: Section; label: string; icon: string }[] = [
  { key: "characters", label: "등장인물", icon: "👤" },
  { key: "episodes", label: "에피소드", icon: "📺" },
  { key: "world", label: "세계관", icon: "🌍" },
  { key: "plot", label: "플롯", icon: "📊" },
]

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

function roleColor(role: string | null) {
  if (role === "protagonist") return "bg-accent/20 text-accent"
  if (role === "antagonist") return "bg-danger/20 text-danger"
  return "bg-bg-hover text-text-dim"
}

function plotColor(type: string) {
  switch (type) {
    case "conflict":
      return "bg-danger/15 text-danger"
    case "twist":
      return "bg-amber-500/15 text-amber-400"
    case "climax":
      return "bg-rose-500/15 text-rose-400"
    case "foreshadowing":
      return "bg-cyan-500/15 text-cyan-400"
    case "resolution":
      return "bg-success/15 text-success"
    default:
      return "bg-accent/15 text-accent"
  }
}

export default function DramaDetail() {
  const params = useParams()
  const dramaId = () => params.id

  const [drama] = createResource(dramaId, api.drama.get)
  const [characters, { refetch: refetchChars }] = createResource(dramaId, api.drama.characters)
  const [episodes, { refetch: refetchEps }] = createResource(dramaId, api.drama.episodes)
  const [world, { refetch: refetchWorld }] = createResource(dramaId, api.drama.world)
  const [plotPoints, { refetch: refetchPlot }] = createResource(dramaId, api.drama.plotPoints)

  const poll = setInterval(() => {
    refetchChars()
    refetchEps()
    refetchWorld()
    refetchPlot()
  }, 5000)
  onCleanup(() => clearInterval(poll))

  const [expanded, setExpanded] = createSignal<Record<Section, boolean>>({
    characters: true,
    episodes: false,
    world: false,
    plot: false,
  })
  const [panelOpen, setPanelOpen] = createSignal(true)
  const [flash, setFlash] = createSignal(false)

  let prev = { c: 0, e: 0, w: 0, p: 0 }
  createEffect(() => {
    const cur = {
      c: characters()?.length ?? 0,
      e: episodes()?.length ?? 0,
      w: world()?.length ?? 0,
      p: plotPoints()?.length ?? 0,
    }
    const had = prev.c + prev.e + prev.w + prev.p > 0
    const changed = cur.c !== prev.c || cur.e !== prev.e || cur.w !== prev.w || cur.p !== prev.p
    if (had && changed) {
      setFlash(true)
      setTimeout(() => setFlash(false), 600)
    }
    prev = cur
  })

  const [sessions, { refetch: refetchSessions }] = createResource(dramaId, (id) => api.session.list(id))
  const [tabs, setTabs] = createSignal<OpenTab[]>([])
  const [active, setActive] = createSignal<string | null>(null)
  const [deleteTarget, setDeleteTarget] = createSignal<Session | null>(null)

  function sessionLabel(s: Session) {
    if (s.title && !s.title.startsWith("New session")) return s.title
    return new Date(s.time_created).toLocaleDateString("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  function openSession(s: Session) {
    if (!tabs().find((t) => t.id === s.id)) {
      setTabs((p) => [...p, { id: s.id, label: sessionLabel(s) }])
    }
    setActive(s.id)
  }

  async function create() {
    const session = await api.session.create({ drama_id: dramaId() })
    refetchSessions()
    openSession(session)
  }

  function closeTab(id: string) {
    const remaining = tabs().filter((t) => t.id !== id)
    setTabs(remaining)
    if (active() === id) {
      setActive(remaining.length > 0 ? remaining[remaining.length - 1].id : null)
    }
  }

  async function confirmDelete() {
    const target = deleteTarget()
    if (!target) return
    setDeleteTarget(null)
    closeTab(target.id)
    await api.session.remove(target.id)
    refetchSessions()
  }

  function rename(sid: string, title: string) {
    setTabs((t) => t.map((tab) => (tab.id === sid ? { ...tab, label: title } : tab)))
    refetchSessions()
  }

  function toggle(s: Section) {
    setExpanded((p) => ({ ...p, [s]: !p[s] }))
  }

  function count(key: Section) {
    switch (key) {
      case "characters":
        return characters()?.length ?? 0
      case "episodes":
        return episodes()?.length ?? 0
      case "world":
        return world()?.length ?? 0
      case "plot":
        return plotPoints()?.length ?? 0
    }
  }

  return (
    <div class="flex flex-col h-full">
      <Show
        when={drama()}
        fallback={
          <div class="flex items-center justify-center h-full">
            <ThinkingIndicator />
          </div>
        }
      >
        {(d) => (
          <>
            <header class="shrink-0 px-5 py-3 border-b border-border bg-bg flex items-center gap-4">
              <A href="/" class="text-sm text-text-dim hover:text-accent transition-colors shrink-0">
                ← 대시보드
              </A>
              <div class="h-4 w-px bg-border" />
              <h1 class="text-base font-bold truncate">{d().title}</h1>
              <Show when={d().genre}>
                <span class="px-2 py-0.5 bg-accent/10 text-accent rounded text-xs shrink-0">{d().genre}</span>
              </Show>
              <Show when={d().tone}>
                <span class="px-2 py-0.5 bg-bg-hover text-text-dim rounded text-xs shrink-0">{d().tone}</span>
              </Show>
              <Show when={d().logline}>
                <span class="text-sm text-text-dim truncate ml-auto">{d().logline}</span>
              </Show>
            </header>

            <div class="flex flex-1 min-h-0">
              <Show when={panelOpen()}>
                <aside
                  class="w-80 shrink-0 border-r bg-bg overflow-y-auto"
                  classList={{
                    "border-border": !flash(),
                    "border-accent/40": flash(),
                  }}
                  style={{
                    "box-shadow": flash() ? "inset -2px 0 12px rgba(124,106,240,0.12)" : "none",
                    transition: "box-shadow 0.4s ease-out, border-color 0.4s ease-out",
                  }}
                >
                  <div class="p-3 flex items-center justify-between border-b border-border">
                    <span class="text-[10px] font-semibold text-text-dim uppercase tracking-widest">
                      프로젝트 데이터
                    </span>
                    <button
                      onClick={() => setPanelOpen(false)}
                      class="text-text-dim hover:text-text text-xs transition-colors"
                      title="패널 닫기"
                    >
                      ◁
                    </button>
                  </div>

                  <For each={sections}>
                    {(sec) => (
                      <div class="border-b border-border/50">
                        <button
                          onClick={() => toggle(sec.key)}
                          class="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-bg-hover/50 transition-colors"
                        >
                          <span
                            class="text-[10px] transition-transform duration-150"
                            classList={{ "rotate-90": expanded()[sec.key] }}
                          >
                            ▶
                          </span>
                          <span>{sec.icon}</span>
                          <span class="font-medium">{sec.label}</span>
                          <span class="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-bg-hover text-text-dim min-w-[1.25rem] text-center">
                            {count(sec.key)}
                          </span>
                        </button>

                        <Show when={expanded()[sec.key]}>
                          <div class="px-3 pb-3 space-y-2">
                            <Switch>
                              <Match when={sec.key === "characters"}>
                                <Show when={!characters()?.length}>
                                  <p class="text-text-dim text-xs py-3 text-center">캐릭터가 없습니다</p>
                                </Show>
                                <For each={characters()}>
                                  {(c) => (
                                    <div class="p-3 bg-bg-card border border-border/60 rounded-lg hover:border-border transition-colors">
                                      <div class="flex items-center gap-2">
                                        <span class="font-medium text-sm">{c.name}</span>
                                        <Show when={c.role}>
                                          <span class={`text-[10px] px-1.5 py-0.5 rounded ${roleColor(c.role)}`}>
                                            {roleLabel[c.role!] ?? c.role}
                                          </span>
                                        </Show>
                                      </div>
                                      <div class="mt-1.5 text-xs text-text-dim space-y-0.5">
                                        <Show when={c.occupation}>
                                          <p>{c.occupation}</p>
                                        </Show>
                                        <Show when={c.personality}>
                                          <p class="truncate">성격: {c.personality}</p>
                                        </Show>
                                        <Show when={c.backstory}>
                                          <p class="line-clamp-2 opacity-70">{c.backstory}</p>
                                        </Show>
                                      </div>
                                    </div>
                                  )}
                                </For>
                              </Match>

                              <Match when={sec.key === "episodes"}>
                                <Show when={!episodes()?.length}>
                                  <p class="text-text-dim text-xs py-3 text-center">에피소드가 없습니다</p>
                                </Show>
                                <For each={episodes()}>
                                  {(ep) => (
                                    <div class="p-3 bg-bg-card border border-border/60 rounded-lg hover:border-border transition-colors">
                                      <div class="flex items-center gap-2">
                                        <span class="text-[10px] font-mono bg-accent/15 text-accent px-1.5 py-0.5 rounded">
                                          {ep.number}화
                                        </span>
                                        <span class="text-sm font-medium truncate">{ep.title}</span>
                                        <span class="text-[10px] text-text-dim ml-auto shrink-0">{ep.status}</span>
                                      </div>
                                      <Show when={ep.synopsis}>
                                        <p class="text-xs text-text-dim mt-1.5 line-clamp-2">{ep.synopsis}</p>
                                      </Show>
                                    </div>
                                  )}
                                </For>
                              </Match>

                              <Match when={sec.key === "world"}>
                                <Show when={!world()?.length}>
                                  <p class="text-text-dim text-xs py-3 text-center">세계관이 없습니다</p>
                                </Show>
                                <For each={world()}>
                                  {(w) => (
                                    <div class="p-3 bg-bg-card border border-border/60 rounded-lg hover:border-border transition-colors">
                                      <div class="flex items-center gap-2">
                                        <span class="text-[10px] px-1.5 py-0.5 bg-bg-hover rounded uppercase tracking-wider text-text-dim">
                                          {w.category}
                                        </span>
                                        <span class="text-sm font-medium">{w.name}</span>
                                      </div>
                                      <Show when={w.description}>
                                        <p class="text-xs text-text-dim mt-1.5 line-clamp-2">{w.description}</p>
                                      </Show>
                                    </div>
                                  )}
                                </For>
                              </Match>

                              <Match when={sec.key === "plot"}>
                                <Show when={!plotPoints()?.length}>
                                  <p class="text-text-dim text-xs py-3 text-center">플롯이 없습니다</p>
                                </Show>
                                <For each={plotPoints()}>
                                  {(pp) => (
                                    <div class="p-3 bg-bg-card border border-border/60 rounded-lg hover:border-border transition-colors">
                                      <div class="flex items-center gap-2">
                                        <span class={`text-[10px] px-1.5 py-0.5 rounded ${plotColor(pp.type)}`}>
                                          {plotTypeLabel[pp.type] ?? pp.type}
                                        </span>
                                        <Show when={pp.resolved}>
                                          <span class="text-[10px] text-success">✓ 해결</span>
                                        </Show>
                                      </div>
                                      <p class="text-xs mt-1.5 line-clamp-2">{pp.description}</p>
                                    </div>
                                  )}
                                </For>
                              </Match>
                            </Switch>
                          </div>
                        </Show>
                      </div>
                    )}
                  </For>

                  <Show when={(characters() ?? []).length >= 2}>
                    <div class="border-b border-border/50">
                      <div class="px-4 py-2.5 flex items-center gap-2">
                        <span>🔗</span>
                        <span class="text-sm font-medium">인물 관계도</span>
                      </div>
                      <div class="px-3 pb-3">
                        <RelationshipGraph characters={characters() ?? []} />
                      </div>
                    </div>
                  </Show>
                </aside>
              </Show>

              <Show when={!panelOpen()}>
                <button
                  onClick={() => setPanelOpen(true)}
                  class="shrink-0 w-8 border-r border-border flex items-center justify-center hover:bg-bg-hover transition-colors text-text-dim hover:text-text"
                  title="패널 열기"
                >
                  ▷
                </button>
              </Show>

              <div class="flex-1 flex min-w-0">
                <aside class="w-48 shrink-0 border-r border-border bg-bg flex flex-col">
                  <div class="p-2.5 border-b border-border">
                    <button
                      onClick={create}
                      class="w-full px-3 py-1.5 bg-accent text-white text-xs rounded-md hover:bg-accent-hover transition-colors"
                    >
                      + 새 대화
                    </button>
                  </div>
                  <div class="flex-1 overflow-auto p-1.5 space-y-0.5">
                    <For each={sessions()}>
                      {(s) => (
                        <div
                          class="flex items-center group rounded-md transition-colors"
                          classList={{
                            "bg-bg-hover": active() === s.id,
                            "hover:bg-bg-hover": active() !== s.id,
                          }}
                        >
                          <button
                            onClick={() => openSession(s)}
                            class="flex-1 text-left px-2.5 py-1.5 text-xs truncate"
                            classList={{
                              "text-accent": tabs().some((t) => t.id === s.id),
                              "text-text-dim hover:text-text": !tabs().some((t) => t.id === s.id),
                            }}
                          >
                            {sessionLabel(s)}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeleteTarget(s)
                            }}
                            class="p-0.5 mr-1 text-text-dim hover:text-danger opacity-0 group-hover:opacity-100 transition-all shrink-0 text-[10px]"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </For>
                  </div>
                </aside>

                <div class="flex-1 flex flex-col min-w-0">
                  <Show when={tabs().length > 0}>
                    <div class="flex items-center border-b border-border bg-bg overflow-x-auto shrink-0">
                      <For each={tabs()}>
                        {(tab) => (
                          <div
                            class="flex items-center gap-1 px-3 py-1.5 border-r border-border cursor-pointer text-xs shrink-0 max-w-[160px] transition-colors"
                            classList={{
                              "bg-bg-card text-text": active() === tab.id,
                              "text-text-dim hover:bg-bg-hover hover:text-text": active() !== tab.id,
                            }}
                          >
                            <button onClick={() => setActive(tab.id)} class="truncate flex-1 text-left">
                              {tab.label}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                closeTab(tab.id)
                              }}
                              class="text-text-dim hover:text-danger text-[10px] shrink-0 ml-1"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>

                  <Show
                    when={tabs().length > 0}
                    fallback={
                      <div class="flex-1 flex items-center justify-center">
                        <div class="text-center">
                          <p class="text-3xl mb-3">✍️</p>
                          <p class="text-text-dim text-sm">새 대화를 시작하거나 기존 세션을 선택하세요</p>
                        </div>
                      </div>
                    }
                  >
                    <div class="flex-1 relative min-h-0">
                      <For each={tabs()}>
                        {(tab) => (
                          <div
                            class="absolute inset-0"
                            style={{
                              "z-index": active() === tab.id ? 1 : 0,
                              visibility: active() === tab.id ? "visible" : "hidden",
                            }}
                          >
                            <ChatPanel
                              sessionId={tab.id}
                              visible={active() === tab.id}
                              onTitleChange={(title) => rename(tab.id, title)}
                            />
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </div>
            </div>
          </>
        )}
      </Show>

      <ConfirmModal
        open={!!deleteTarget()}
        title="세션 삭제"
        message={`"${deleteTarget() ? sessionLabel(deleteTarget()!) : ""}" 대화를 삭제하시겠습니까?`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
