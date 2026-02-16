import { createSignal, createResource, createEffect, For, Show, Switch, Match, onCleanup } from "solid-js"
import { useParams, A } from "@solidjs/router"
import {
  api,
  type Session,
  type Scene,
  type ScenePrompt,
  type CharacterArc,
  type AutosaveStatus,
  type AutosaveEntry,
} from "@/lib/api"
import { ChatPanel } from "@/components/chat-panel"
import { ConfirmModal } from "@/components/confirm-modal"
import { ThinkingIndicator } from "@/components/thinking"
import { RelationshipGraph } from "@/components/relationship-graph"
import { ArcChart } from "@/components/arc-chart"
import { PlotTimeline } from "@/components/plot-timeline"

type OpenTab = { id: string; label: string }
type Section = "characters" | "episodes" | "scenes" | "world" | "plot"

const sections: { key: Section; label: string }[] = [
  { key: "characters", label: "등장인물" },
  { key: "episodes", label: "에피소드" },
  { key: "scenes", label: "장면" },
  { key: "world", label: "세계관" },
  { key: "plot", label: "플롯" },
]

const todLabel: Record<string, string> = {
  DAY: "낮",
  NIGHT: "밤",
  DAWN: "새벽",
  DUSK: "황혼",
}

function todColor(tod: string | null) {
  if (tod === "NIGHT") return "bg-indigo-500/15 text-indigo-400"
  if (tod === "DAWN") return "bg-amber-500/15 text-amber-400"
  if (tod === "DUSK") return "bg-orange-500/15 text-orange-400"
  return "bg-sky-500/15 text-sky-400"
}

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
  const [scenes, { refetch: refetchScenes }] = createResource(dramaId, api.drama.scenes)
  const [world, { refetch: refetchWorld }] = createResource(dramaId, api.drama.world)
  const [arcs, { refetch: refetchArcs }] = createResource(dramaId, api.drama.arcs)
  const [plotPoints, { refetch: refetchPlot }] = createResource(dramaId, api.drama.plotPoints)
  const [autosave, { refetch: refetchAutosave }] = createResource(dramaId, api.drama.autosave)

  let sse: EventSource | undefined
  let pollTimer: ReturnType<typeof setInterval> | undefined
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined

  function refetchAll() {
    refetchChars()
    refetchEps()
    refetchScenes()
    refetchWorld()
    refetchPlot()
    refetchArcs()
    refetchAutosave()
  }

  function handleEvent(type: string) {
    if (type === "character") refetchChars()
    else if (type === "episode") refetchEps()
    else if (type === "scene") refetchScenes()
    else if (type === "world") refetchWorld()
    else if (type === "plot") refetchPlot()
    else if (type === "arc") refetchArcs()
    else if (type === "structured") refetchAutosave()
  }

  function setPollInterval(ms: number) {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = setInterval(refetchAll, ms)
  }

  createEffect(() => {
    const id = dramaId()
    if (!id) return

    setPollInterval(4000)

    const connect = () => {
      sse?.close()
      sse = new EventSource(`/api/events/${id}`)

      sse.onmessage = (event) => {
        if (event.data === "connected") {
          setPollInterval(20000)
          return
        }
        try {
          const parsed = JSON.parse(event.data) as { type?: string; payload?: unknown }
          if (parsed.type === "structured" && parsed.payload && typeof parsed.payload === "object") {
            const payload = parsed.payload as Partial<AutosaveEntry>
            if (payload.status && payload.source && typeof payload.retries === "number") {
              const entry: AutosaveEntry = {
                time: typeof payload.time === "number" ? payload.time : Date.now(),
                status: payload.status,
                source: payload.source,
                retries: payload.retries,
                extracted: payload.extracted,
                persisted: payload.persisted,
                error: payload.error,
              }
              setLiveStructured((prev) => [entry, ...prev].slice(0, 20))
            }
          }
          if (parsed.type) {
            handleEvent(parsed.type)
            return
          }
        } catch {}
        handleEvent(event.data)
      }

      sse.onerror = () => {
        sse?.close()
        sse = undefined
        setPollInterval(4000)
        reconnectTimer = setTimeout(connect, 5000)
      }
    }

    connect()

    onCleanup(() => {
      sse?.close()
      sse = undefined
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = undefined
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = undefined
      }
    })
  })

  const [expanded, setExpanded] = createSignal<Record<Section, boolean>>({
    characters: true,
    episodes: false,
    scenes: false,
    world: false,
    plot: false,
  })
  const [panelOpen, setPanelOpen] = createSignal(true)
  const [flash, setFlash] = createSignal(false)
  const [liveStructured, setLiveStructured] = createSignal<AutosaveEntry[]>([])
  const [resyncing, setResyncing] = createSignal(false)
  const [resyncSessionLimit, setResyncSessionLimit] = createSignal(20)
  const [resyncPairLimit, setResyncPairLimit] = createSignal(20)
  const [autosaveFilter, setAutosaveFilter] = createSignal<"all" | "failed" | "ok">("all")

  let prev = { c: 0, e: 0, s: 0, w: 0, p: 0 }
  createEffect(() => {
    const cur = {
      c: characters()?.length ?? 0,
      e: episodes()?.length ?? 0,
      s: scenes()?.length ?? 0,
      w: world()?.length ?? 0,
      p: plotPoints()?.length ?? 0,
    }
    const had = prev.c + prev.e + prev.s + prev.w + prev.p > 0
    const changed = cur.c !== prev.c || cur.e !== prev.e || cur.s !== prev.s || cur.w !== prev.w || cur.p !== prev.p
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

  createEffect(() => {
    dramaId()
    setTabs([])
    setActive(null)
    setLiveStructured([])
  })

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
      case "scenes":
        return scenes()?.length ?? 0
      case "world":
        return world()?.length ?? 0
      case "plot":
        return plotPoints()?.length ?? 0
    }
  }

  function groupedScenes() {
    const all = scenes() ?? []
    const groups = new Map<string, { number: number; scenes: Scene[] }>()
    const eps = episodes() ?? []
    for (const sc of all) {
      if (!groups.has(sc.episode_id)) {
        const ep = eps.find((e) => e.id === sc.episode_id)
        groups.set(sc.episode_id, { number: ep?.number ?? 0, scenes: [] })
      }
      groups.get(sc.episode_id)!.scenes.push(sc)
    }
    return [...groups.entries()]
      .sort((a, b) => a[1].number - b[1].number)
      .map(([id, g]) => ({ episodeId: id, number: g.number, scenes: g.scenes.sort((a, b) => a.number - b.number) }))
  }

  const [copied, setCopied] = createSignal<string | null>(null)
  function copyPrompt(sceneId: string, prompt: ScenePrompt) {
    navigator.clipboard.writeText(JSON.stringify(prompt, null, 2))
    setCopied(sceneId)
    setTimeout(() => setCopied(null), 1500)
  }

  function autosaveTone(status: AutosaveStatus | undefined) {
    if (!status || status.total === 0) return "text-text-dim"
    if (status.failed > 0) return "text-amber-400"
    return "text-emerald-400"
  }

  function recentAutosave(status: AutosaveStatus | undefined) {
    if (!status) return liveStructured()
    const merged = [...liveStructured(), ...status.recent]
    if (autosaveFilter() === "failed") return merged.filter((item) => item.status === "error").slice(0, 10)
    if (autosaveFilter() === "ok") return merged.filter((item) => item.status === "ok").slice(0, 10)
    return merged.slice(0, 10)
  }

  async function runResync() {
    if (resyncing()) return
    const id = dramaId()
    if (!id) return
    setResyncing(true)
    try {
      await api.drama.autosaveResync(id, {
        session_limit: resyncSessionLimit(),
        pair_limit: resyncPairLimit(),
      })
      refetchAll()
    } finally {
      setResyncing(false)
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
                  class="w-[28rem] shrink-0 border-r bg-bg overflow-y-auto"
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

                              <Match when={sec.key === "scenes"}>
                                <Show when={!scenes()?.length}>
                                  <p class="text-text-dim text-xs py-3 text-center">장면이 없습니다</p>
                                </Show>
                                <For each={groupedScenes()}>
                                  {(group) => (
                                    <div class="space-y-2">
                                      <p class="text-[10px] font-semibold text-text-dim uppercase tracking-wider px-1 pt-1">
                                        에피소드 {group.number}화
                                      </p>
                                      <For each={group.scenes}>
                                        {(sc) => (
                                          <div class="p-3 bg-bg-card border border-border/60 rounded-lg hover:border-border transition-colors">
                                            <div class="flex items-center gap-2">
                                              <span class="text-[10px] font-mono bg-accent/15 text-accent px-1.5 py-0.5 rounded">
                                                S#{sc.number}
                                              </span>
                                              <Show when={sc.time_of_day}>
                                                <span
                                                  class={`text-[10px] px-1.5 py-0.5 rounded ${todColor(sc.time_of_day)}`}
                                                >
                                                  {todLabel[sc.time_of_day!] ?? sc.time_of_day}
                                                </span>
                                              </Show>
                                              <Show when={sc.location}>
                                                <span class="text-sm font-medium truncate">{sc.location}</span>
                                              </Show>
                                            </div>
                                            <Show when={sc.description}>
                                              <p class="text-xs text-text-dim mt-1.5 line-clamp-2">{sc.description}</p>
                                            </Show>
                                            <Show when={sc.image_prompt}>
                                              {(prompt) => (
                                                <div class="mt-2 bg-bg/50 border-l-2 border-accent/30 rounded-r-md px-2.5 py-2">
                                                  <p class="text-[10px] font-semibold text-text-dim mb-1">
                                                    이미지 프롬프트
                                                  </p>
                                                  <p class="text-[11px] text-text-dim line-clamp-2 leading-relaxed">
                                                    {prompt().prompt}
                                                  </p>
                                                  <div class="flex items-center gap-1.5 mt-1.5">
                                                    <span class="text-[9px] px-1 py-0.5 rounded bg-bg-hover text-text-dim">
                                                      {prompt().style}
                                                    </span>
                                                    <span class="text-[9px] px-1 py-0.5 rounded bg-bg-hover text-text-dim">
                                                      {prompt().mood}
                                                    </span>
                                                    <span class="text-[9px] px-1 py-0.5 rounded bg-bg-hover text-text-dim">
                                                      {prompt().resolution}
                                                    </span>
                                                    <button
                                                      onClick={() => copyPrompt(sc.id, prompt())}
                                                      class="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                                                    >
                                                      {copied() === sc.id ? "복사됨" : "프롬프트 복사"}
                                                    </button>
                                                  </div>
                                                </div>
                                              )}
                                            </Show>
                                            <Show when={sc.characters_present?.length}>
                                              <div class="flex flex-wrap gap-1 mt-2">
                                                <For each={sc.characters_present}>
                                                  {(name) => (
                                                    <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-bg-hover text-text-dim">
                                                      {name}
                                                    </span>
                                                  )}
                                                </For>
                                              </div>
                                            </Show>
                                          </div>
                                        )}
                                      </For>
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
                        <span class="text-sm font-medium">인물 관계도</span>
                      </div>
                      <div class="px-3 pb-3">
                        <RelationshipGraph characters={characters() ?? []} />
                      </div>
                    </div>
                  </Show>

                  <Show when={(arcs() ?? []).length > 0}>
                    <div class="border-b border-border/50">
                      <div class="px-4 py-2.5 flex items-center gap-2">
                        <span class="text-sm font-medium">감정 아크</span>
                      </div>
                      <div class="px-3 pb-3">
                        <ArcChart arcs={arcs() ?? []} characters={characters() ?? []} episodes={episodes() ?? []} />
                      </div>
                    </div>
                  </Show>

                  <Show when={(plotPoints() ?? []).length > 0}>
                    <div class="border-b border-border/50">
                      <div class="px-4 py-2.5 flex items-center gap-2">
                        <span class="text-sm font-medium">플롯 타임라인</span>
                      </div>
                      <div class="px-3 pb-3">
                        <PlotTimeline plotPoints={plotPoints() ?? []} episodes={episodes() ?? []} />
                      </div>
                    </div>
                  </Show>

                  <div class="border-b border-border/50">
                    <div class="px-4 py-2.5 flex items-center gap-2">
                      <span class="text-sm font-medium">자동 구조화 상태</span>
                      <div class="ml-auto flex items-center gap-1">
                        <select
                          value={String(resyncSessionLimit())}
                          onInput={(e) => setResyncSessionLimit(Number(e.currentTarget.value))}
                          class="text-[10px] px-1.5 py-1 rounded bg-bg-card border border-border/60 text-text-dim"
                        >
                          <option value="10">세션 10</option>
                          <option value="20">세션 20</option>
                          <option value="40">세션 40</option>
                        </select>
                        <select
                          value={String(resyncPairLimit())}
                          onInput={(e) => setResyncPairLimit(Number(e.currentTarget.value))}
                          class="text-[10px] px-1.5 py-1 rounded bg-bg-card border border-border/60 text-text-dim"
                        >
                          <option value="10">페어 10</option>
                          <option value="20">페어 20</option>
                          <option value="50">페어 50</option>
                        </select>
                      </div>
                      <button
                        onClick={runResync}
                        disabled={resyncing()}
                        class="text-[10px] px-2 py-1 rounded bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-50 transition-colors"
                      >
                        {resyncing() ? "재동기화 중..." : "최근 대화 재동기화"}
                      </button>
                      <Show when={autosave()}>
                        {(status) => (
                          <span class={`text-[11px] ${autosaveTone(status())}`}>
                            성공 {status().success} / 실패 {status().failed}
                          </span>
                        )}
                      </Show>
                    </div>
                    <div class="px-3 pb-3 space-y-2">
                      <Show when={autosave()} fallback={<p class="text-xs text-text-dim">데이터 수집 중...</p>}>
                        {(status) => (
                          <>
                            <div class="flex items-center gap-1.5 text-[10px]">
                              <button
                                onClick={() => setAutosaveFilter("all")}
                                class="px-1.5 py-0.5 rounded border border-border/60"
                                classList={{
                                  "text-accent bg-accent/10": autosaveFilter() === "all",
                                  "text-text-dim": autosaveFilter() !== "all",
                                }}
                              >
                                전체
                              </button>
                              <button
                                onClick={() => setAutosaveFilter("failed")}
                                class="px-1.5 py-0.5 rounded border border-border/60"
                                classList={{
                                  "text-amber-300 bg-amber-500/10": autosaveFilter() === "failed",
                                  "text-text-dim": autosaveFilter() !== "failed",
                                }}
                              >
                                실패만
                              </button>
                              <button
                                onClick={() => setAutosaveFilter("ok")}
                                class="px-1.5 py-0.5 rounded border border-border/60"
                                classList={{
                                  "text-emerald-300 bg-emerald-500/10": autosaveFilter() === "ok",
                                  "text-text-dim": autosaveFilter() !== "ok",
                                }}
                              >
                                성공만
                              </button>
                            </div>
                            <div class="grid grid-cols-2 gap-2 text-[11px]">
                              <div class="rounded border border-border/60 bg-bg-card px-2 py-1.5">
                                추출: 캐릭터 {status().extracted.characters}, 에피소드 {status().extracted.episodes},
                                세계관 {status().extracted.world}
                              </div>
                              <div class="rounded border border-border/60 bg-bg-card px-2 py-1.5">
                                저장: 캐릭터 {status().persisted.characters}, 에피소드 {status().persisted.episodes},
                                세계관 {status().persisted.world}
                              </div>
                            </div>
                            <div class="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                              <For each={recentAutosave(status())}>
                                {(item) => (
                                  <div class="rounded border border-border/60 bg-bg-card px-2 py-1.5 text-[11px]">
                                    <div class="flex items-center gap-2">
                                      <span class={item.status === "ok" ? "text-emerald-400" : "text-amber-400"}>
                                        {item.status === "ok" ? "성공" : "실패"}
                                      </span>
                                      <span class="text-text-dim">{item.source}</span>
                                      <span class="text-text-dim ml-auto">재시도 {item.retries}</span>
                                    </div>
                                    <Show when={item.persisted}>
                                      {(p) => (
                                        <p class="text-text-dim mt-0.5">
                                          저장: 인물 {p().characters}, 회차 {p().episodes}, 세계관 {p().world}, 플롯{" "}
                                          {p().plot_points}, 장면 {p().scenes}
                                        </p>
                                      )}
                                    </Show>
                                    <Show when={item.extracted}>
                                      {(x) => (
                                        <p class="text-text-dim/80 mt-0.5">
                                          추출: 인물 {x().characters}, 회차 {x().episodes}, 세계관 {x().world}, 플롯{" "}
                                          {x().plot_points}, 장면 {x().scenes}
                                        </p>
                                      )}
                                    </Show>
                                    <Show when={item.error}>
                                      <p class="text-amber-300 mt-0.5 line-clamp-2">{item.error}</p>
                                    </Show>
                                  </div>
                                )}
                              </For>
                            </div>
                          </>
                        )}
                      </Show>
                    </div>
                  </div>
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
                <aside class="w-40 shrink-0 border-r border-border bg-bg flex flex-col">
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
