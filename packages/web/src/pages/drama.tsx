import { createSignal, createResource, createEffect, createMemo, For, Show, Switch, Match, onCleanup } from "solid-js"
import { useParams, A } from "@solidjs/router"
import { DragDropProvider, DragDropSensors, DragOverlay, SortableProvider, createSortable, closestCenter, transformStyle } from "@thisbeyond/solid-dnd"
import { api, characterImageUrl, type Session, type Scene, type ScenePrompt, type CharacterArc, type Character } from "@/lib/api"
import { ChatPanel } from "@/components/chat-panel"
import { ConfirmModal } from "@/components/confirm-modal"
import { ThinkingIndicator } from "@/components/thinking"
import { RelationshipGraph } from "@/components/relationship-graph"
import { ArcChart } from "@/components/arc-chart"
import { PlotTimeline } from "@/components/plot-timeline"
import { showToast } from "@/components/toast-provider"
import { SearchInput } from "@/components/search-input"

type OpenTab = { id: string; label: string }
type Section = "characters" | "episodes" | "scenes" | "world" | "plot"
type CharacterField = "name" | "role" | "occupation" | "personality" | "backstory"
type EpisodeField = "title" | "status" | "synopsis"
type SceneField = "location" | "time_of_day" | "description"
type WorldField = "name" | "category" | "description"
type PlotField = "type" | "description"
type DramaField = "title" | "genre" | "tone" | "logline"

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

function plotColorHex(type: string) {
  switch (type) {
    case "conflict":
      return "#ef4444"
    case "twist":
      return "#f59e0b"
    case "climax":
      return "#ec4899"
    case "foreshadowing":
      return "#06b6d4"
    case "resolution":
      return "#22c55e"
    default:
      return "#7c6af0"
  }
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
  }

  function handleEvent(type: string) {
    if (type === "character") refetchChars()
    else if (type === "episode") refetchEps()
    else if (type === "scene") refetchScenes()
    else if (type === "world") refetchWorld()
    else if (type === "plot") refetchPlot()
    else if (type === "arc") refetchArcs()

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
          const parsed = JSON.parse(event.data) as { type?: string }
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

  createEffect(() => {
    if (!exportOpen()) return
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest("[data-export-menu]")) {
        setExportOpen(false)
      }
    }
    setTimeout(() => {
      document.addEventListener("click", handleClick)
    }, 0)
    onCleanup(() => document.removeEventListener("click", handleClick))
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
  const [editing, setEditing] = createSignal<{ id: string; field: string } | null>(null)
  const [editValue, setEditValue] = createSignal("")
  const [searchQuery, setSearchQuery] = createSignal("")
  const [activeEpId, setActiveEpId] = createSignal<string | null>(null)
  const [activeSceneId, setActiveSceneId] = createSignal<string | null>(null)
  const [exportOpen, setExportOpen] = createSignal(false)

  createEffect(() => {
    const id = dramaId()
    if (!id) return

    const handleNewSession = () => create()
    const handleTogglePanel = () => setPanelOpen((p) => !p)
    const handleExportFountain = () => {
      window.open(`/api/drama/${id}/export/pdf`, "_blank")
    }
    const handleToggleSection = (e: Event) => {
      const section = (e as CustomEvent<Section>).detail
      toggle(section)
    }

    window.addEventListener("dramacode:new-session", handleNewSession)
    window.addEventListener("dramacode:toggle-panel", handleTogglePanel)
    window.addEventListener("dramacode:export-fountain", handleExportFountain)
    window.addEventListener("dramacode:toggle-section", handleToggleSection)

    onCleanup(() => {
      window.removeEventListener("dramacode:new-session", handleNewSession)
      window.removeEventListener("dramacode:toggle-panel", handleTogglePanel)
      window.removeEventListener("dramacode:export-fountain", handleExportFountain)
      window.removeEventListener("dramacode:toggle-section", handleToggleSection)
    })
  })

  createEffect(() => {
    const id = dramaId()
    if (!id) return

    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return

      const key = e.key.toLowerCase()
      if ((e.metaKey || e.ctrlKey) && key === "n") {
        e.preventDefault()
        create()
      }
      if ((e.metaKey || e.ctrlKey) && key === "b") {
        e.preventDefault()
        setPanelOpen((p) => !p)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown))
  })

  function exportPdf(episodeNumber?: number) {
    setExportOpen(false)
    const id = dramaId()
    if (!id) return
    const url = episodeNumber
      ? `/api/drama/${id}/export/pdf?episode=${episodeNumber}`
      : `/api/drama/${id}/export/pdf`
    window.open(url, "_blank")
  }

  function downloadFountain(episodeNumber?: number) {
    setExportOpen(false)
    const id = dramaId()
    if (!id) return
    const url = episodeNumber
      ? `/api/drama/${id}/export/fountain?episode=${episodeNumber}`
      : `/api/drama/${id}/export/fountain`
    window.open(url, "_blank")
  }

  function startEdit(id: string, field: string, currentValue: string | null | undefined) {
    setEditing({ id, field })
    setEditValue(currentValue ?? "")
  }

  function cancelEdit() {
    setEditing(null)
    setEditValue("")
  }

  function isEditing(id: string, field: string) {
    const e = editing()
    return e?.id === id && e?.field === field
  }

  async function saveCharacterField(id: string, field: CharacterField) {
    const value = editValue()
    cancelEdit()
    try {
      await api.character.update(id, { [field]: value })
      refetchChars()
      showToast.success("저장됨")
    } catch {
      showToast.error("저장 실패")
    }
  }

  async function saveEpisodeField(id: string, field: EpisodeField) {
    const value = editValue()
    cancelEdit()
    try {
      await api.episode.update(id, { [field]: value })
      refetchEps()
      showToast.success("저장됨")
    } catch {
      showToast.error("저장 실패")
    }
  }

  async function saveSceneField(id: string, field: SceneField) {
    const value = editValue()
    cancelEdit()
    try {
      await api.scene.update(id, { [field]: value })
      refetchScenes()
      showToast.success("저장됨")
    } catch {
      showToast.error("저장 실패")
    }
  }

  async function saveWorldField(id: string, field: WorldField) {
    const value = editValue()
    cancelEdit()
    try {
      await api.world.update(id, { [field]: value })
      refetchWorld()
      showToast.success("저장됨")
    } catch {
      showToast.error("저장 실패")
    }
  }

  async function savePlotField(id: string, field: PlotField) {
    const value = editValue()
    cancelEdit()
    try {
      await api.plotPoint.update(id, { [field]: value })
      refetchPlot()
      showToast.success("저장됨")
    } catch {
      showToast.error("저장 실패")
    }
  }

  async function togglePlotResolved(id: string) {
    try {
      await api.plotPoint.resolve(id)
      refetchPlot()
      showToast.success("상태 변경됨")
    } catch {
      showToast.error("변경 실패")
    }
  }

  async function saveDramaField(field: DramaField) {
    const id = dramaId()
    if (!id) return
    const value = editValue()
    cancelEdit()
    try {
      await api.drama.update(id, { [field]: value })
      showToast.success("저장됨")
    } catch {
      showToast.error("저장 실패")
    }
  }


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

      const toExpand: Partial<Record<Section, boolean>> = {}
      if (cur.c > prev.c) toExpand.characters = true
      if (cur.e > prev.e) toExpand.episodes = true
      if (cur.s > prev.s) toExpand.scenes = true
      if (cur.w > prev.w) toExpand.world = true
      if (cur.p > prev.p) toExpand.plot = true
      if (Object.keys(toExpand).length) {
        setExpanded((p) => ({ ...p, ...toExpand }))
      }
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
  })

  createEffect(() => {
    function handleMetaUp(e: KeyboardEvent) {
      if (e.key === "Meta") {
        setActiveEpId(null)
        setActiveSceneId(null)
      }
    }

    window.addEventListener("keyup", handleMetaUp)
    onCleanup(() => window.removeEventListener("keyup", handleMetaUp))
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
        return filteredCharacters().length
      case "episodes":
        return filteredEpisodes().length
      case "scenes":
        return filteredScenes().length
      case "world":
        return filteredWorld().length
      case "plot":
        return filteredPlotPoints().length
    }
  }

  const filteredCharacters = createMemo(() => {
    const q = searchQuery().toLowerCase().trim()
    const list = characters() ?? []
    if (!q) return list
    return list.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.personality ?? "").toLowerCase().includes(q) ||
      (c.occupation ?? "").toLowerCase().includes(q),
    )
  })

  const filteredEpisodes = createMemo(() => {
    const q = searchQuery().toLowerCase().trim()
    const list = episodes() ?? []
    if (!q) return list
    return list.filter((e) => e.title.toLowerCase().includes(q) || (e.synopsis ?? "").toLowerCase().includes(q))
  })

  const filteredScenes = createMemo(() => {
    const q = searchQuery().toLowerCase().trim()
    const list = scenes() ?? []
    if (!q) return list
    return list.filter(
      (s) =>
        (s.location ?? "").toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q) ||
        (s.characters_present ?? []).some((name) => name.toLowerCase().includes(q)),
    )
  })

  const filteredWorld = createMemo(() => {
    const q = searchQuery().toLowerCase().trim()
    const list = world() ?? []
    if (!q) return list
    return list.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.category.toLowerCase().includes(q) ||
        (w.description ?? "").toLowerCase().includes(q),
    )
  })

  const filteredPlotPoints = createMemo(() => {
    const q = searchQuery().toLowerCase().trim()
    const list = plotPoints() ?? []
    if (!q) return list
    return list.filter((pp) => pp.description.toLowerCase().includes(q))
  })

  const namedCharacters = createMemo(() => filteredCharacters().filter((c) => !c.name.startsWith("(미정)")))
  const pendingCharacters = createMemo(() => filteredCharacters().filter((c) => c.name.startsWith("(미정)")))

  const [dragOver, setDragOver] = createSignal<string | null>(null)
  const [uploading, setUploading] = createSignal<string | null>(null)

  async function handleImageDrop(characterId: string, e: DragEvent) {
    e.preventDefault()
    setDragOver(null)

    const file = e.dataTransfer?.files?.[0]
    if (!file || !file.type.startsWith("image/")) return

    setUploading(characterId)
    try {
      await api.drama.uploadCharacterImage(characterId, file)
      refetchChars()
    } catch {
    } finally {
      setUploading(null)
    }
  }

  async function handleImageSelect(characterId: string) {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      setUploading(characterId)
      try {
        await api.drama.uploadCharacterImage(characterId, file)
        refetchChars()
      } catch {
      } finally {
        setUploading(null)
      }
    }
    input.click()
  }

  async function handleImageRemove(characterId: string) {
    await api.drama.removeCharacterImage(characterId)
    refetchChars()
  }

  function groupedScenes() {
    const all = filteredScenes()
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
              <Show
                when={isEditing("drama", "title")}
                fallback={
                  <h1
                    onClick={() => startEdit("drama", "title", d().title)}
                    class="text-base font-bold truncate cursor-pointer hover:bg-bg-hover/50 rounded px-1 -mx-1 transition-colors"
                  >
                    {d().title}
                  </h1>
                }
              >
                <input
                  ref={(el) => setTimeout(() => el.focus())}
                  value={editValue()}
                  onInput={(e) => setEditValue(e.currentTarget.value)}
                  onBlur={() => saveDramaField("title")}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") cancelEdit()
                    if (e.key === "Enter") e.currentTarget.blur()
                  }}
                  class="text-base font-bold w-full max-w-[24rem] px-1 -mx-1 bg-bg border border-accent/30 rounded focus:outline-none focus:border-accent"
                />
              </Show>
              <Show
                when={isEditing("drama", "genre")}
                fallback={
                  <span
                    onClick={() => startEdit("drama", "genre", d().genre)}
                    class="px-2 py-0.5 bg-accent/10 text-accent rounded text-xs shrink-0 cursor-pointer hover:bg-accent/20 transition-colors"
                  >
                    {d().genre || "장르"}
                  </span>
                }
              >
                <input
                  ref={(el) => setTimeout(() => el.focus())}
                  value={editValue()}
                  onInput={(e) => setEditValue(e.currentTarget.value)}
                  onBlur={() => saveDramaField("genre")}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") cancelEdit()
                    if (e.key === "Enter") e.currentTarget.blur()
                  }}
                  class="w-24 px-1 -mx-1 bg-bg border border-accent/30 rounded text-xs focus:outline-none focus:border-accent"
                />
              </Show>
              <Show
                when={isEditing("drama", "tone")}
                fallback={
                  <span
                    onClick={() => startEdit("drama", "tone", d().tone)}
                    class="px-2 py-0.5 bg-bg-hover text-text-dim rounded text-xs shrink-0 cursor-pointer hover:bg-bg-hover/80 transition-colors"
                  >
                    {d().tone || "톤"}
                  </span>
                }
              >
                <input
                  ref={(el) => setTimeout(() => el.focus())}
                  value={editValue()}
                  onInput={(e) => setEditValue(e.currentTarget.value)}
                  onBlur={() => saveDramaField("tone")}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") cancelEdit()
                    if (e.key === "Enter") e.currentTarget.blur()
                  }}
                  class="w-24 px-1 -mx-1 bg-bg border border-accent/30 rounded text-xs focus:outline-none focus:border-accent"
                />
              </Show>
              <Show
                when={isEditing("drama", "logline")}
                fallback={
                  <span
                    onClick={() => startEdit("drama", "logline", d().logline)}
                    class="text-sm text-text-dim truncate ml-auto cursor-pointer hover:bg-bg-hover/50 rounded px-1 -mx-1 transition-colors"
                  >
                    {d().logline || "로그라인"}
                  </span>
                }
              >
                <input
                  ref={(el) => setTimeout(() => el.focus())}
                  value={editValue()}
                  onInput={(e) => setEditValue(e.currentTarget.value)}
                  onBlur={() => saveDramaField("logline")}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") cancelEdit()
                    if (e.key === "Enter") e.currentTarget.blur()
                  }}
                  class="text-sm text-text-dim w-full max-w-[24rem] ml-auto px-1 -mx-1 bg-bg border border-accent/30 rounded focus:outline-none focus:border-accent"
                />
              </Show>
              <div class="ml-auto shrink-0 relative" data-export-menu>
                <button
                  onClick={() => setExportOpen((p) => !p)}
                  class="px-3 py-1.5 text-xs font-medium rounded-md border border-border text-text-dim hover:text-accent hover:border-accent transition-colors"
                >
                  내보내기 ↓
                </button>
                <Show when={exportOpen()}>
                  <div class="absolute right-0 top-full mt-1 w-52 bg-bg-card border border-border rounded-lg shadow-xl z-20 py-1">
                    <p class="px-3 py-1 text-[10px] text-text-dim uppercase tracking-wider">PDF</p>
                    <button
                      onClick={() => exportPdf()}
                      class="w-full text-left px-3 py-2 text-xs text-text hover:bg-bg-hover transition-colors"
                    >
                      전체 각본 PDF
                    </button>
                    <Show when={(episodes() ?? []).length > 0}>
                      <For each={episodes() ?? []}>
                        {(ep) => (
                          <button
                            onClick={() => exportPdf(ep.number)}
                            class="w-full text-left px-3 py-2 text-xs text-text hover:bg-bg-hover transition-colors"
                          >
                            {ep.number}화 PDF
                          </button>
                        )}
                      </For>
                    </Show>
                    <div class="border-t border-border my-1" />
                    <p class="px-3 py-1 text-[10px] text-text-dim uppercase tracking-wider">Fountain</p>
                    <button
                      onClick={() => downloadFountain()}
                      class="w-full text-left px-3 py-2 text-xs text-text-dim hover:text-text hover:bg-bg-hover transition-colors"
                    >
                      전체 각본 (.fountain)
                    </button>
                  </div>
                </Show>
              </div>
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

                  <div class="px-3 pt-2 pb-1">
                    <SearchInput
                      value={searchQuery()}
                      onSearch={setSearchQuery}
                      placeholder="프로젝트 데이터 검색..."
                    />
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
                                <Show when={!filteredCharacters().length}>
                                  <p class="text-text-dim text-xs py-3 text-center">
                                    {searchQuery() && (characters()?.length ?? 0) > 0 ? "검색 결과 없음" : "캐릭터가 없습니다"}
                                  </p>
                                </Show>
                                <For each={namedCharacters()}>
                                  {(c) => (
                                    <div class="p-3 bg-bg-card border border-border/60 rounded-lg hover:border-border transition-colors group relative">
                                      <span class="absolute top-2 right-2 text-text-dim/0 group-hover:text-text-dim/50 text-[10px] transition-colors">
                                        ✎
                                      </span>
                                      <div class="flex gap-3">
                                        <div
                                          class="w-14 h-14 shrink-0 rounded-lg overflow-hidden border transition-all cursor-pointer"
                                          classList={{
                                            "border-accent border-dashed bg-accent/10": dragOver() === c.id,
                                            "border-border/60": dragOver() !== c.id,
                                          }}
                                          onDragOver={(e) => {
                                            e.preventDefault()
                                            setDragOver(c.id)
                                          }}
                                          onDragLeave={() => setDragOver(null)}
                                          onDrop={(e) => handleImageDrop(c.id, e)}
                                          onClick={() => handleImageSelect(c.id)}
                                          title="클릭하거나 이미지를 드래그하세요"
                                        >
                                          <Show
                                            when={c.image}
                                            fallback={
                                              <div class="w-full h-full flex items-center justify-center bg-bg-hover/50 text-text-dim">
                                                <Show
                                                  when={uploading() !== c.id}
                                                  fallback={
                                                    <span class="text-[10px] text-accent animate-pulse">···</span>
                                                  }
                                                >
                                                  <svg
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    stroke-width="1.5"
                                                    class="w-5 h-5 opacity-40"
                                                  >
                                                    <path d="M12 5v14M5 12h14" stroke-linecap="round" />
                                                  </svg>
                                                </Show>
                                              </div>
                                            }
                                          >
                                            <div class="relative w-full h-full group">
                                              <img
                                                src={characterImageUrl(c.image!)}
                                                alt={c.name}
                                                class="w-full h-full object-cover"
                                              />
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  handleImageRemove(c.id)
                                                }}
                                                class="absolute top-0 right-0 w-4 h-4 bg-danger/80 text-white text-[8px] rounded-bl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                                title="사진 삭제"
                                              >
                                                ✕
                                              </button>
                                            </div>
                                          </Show>
                                        </div>
                                        <div class="min-w-0 flex-1">
                                          <div class="flex items-center gap-2">
                                            <Show
                                              when={isEditing(c.id, "name")}
                                              fallback={
                                                <span
                                                  onClick={() => startEdit(c.id, "name", c.name)}
                                                  class="font-medium text-sm cursor-pointer hover:bg-bg-hover/50 rounded px-1 -mx-1 transition-colors"
                                                >
                                                  {c.name}
                                                </span>
                                              }
                                            >
                                              <input
                                                ref={(el) => setTimeout(() => el.focus())}
                                                value={editValue()}
                                                onInput={(e) => setEditValue(e.currentTarget.value)}
                                                onBlur={() => saveCharacterField(c.id, "name")}
                                                onKeyDown={(e) => {
                                                  if (e.key === "Escape") cancelEdit()
                                                  if (e.key === "Enter") e.currentTarget.blur()
                                                }}
                                                class="w-full px-1 -mx-1 bg-bg border border-accent/30 rounded text-sm focus:outline-none focus:border-accent"
                                              />
                                            </Show>
                                            <Show
                                              when={isEditing(c.id, "role")}
                                              fallback={
                                                <span
                                                  onClick={() => startEdit(c.id, "role", c.role ?? "supporting")}
                                                  class={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer ${roleColor(c.role)}`}
                                                >
                                                  {roleLabel[c.role ?? "supporting"] ?? c.role ?? "역할"}
                                                </span>
                                              }
                                            >
                                              <select
                                                ref={(el) => setTimeout(() => el.focus())}
                                                value={editValue()}
                                                onChange={(e) => {
                                                  setEditValue(e.currentTarget.value)
                                                  e.currentTarget.blur()
                                                }}
                                                onBlur={() => saveCharacterField(c.id, "role")}
                                                onKeyDown={(e) => {
                                                  if (e.key === "Escape") cancelEdit()
                                                }}
                                                class="px-1 bg-bg border border-accent/30 rounded text-[10px] focus:outline-none focus:border-accent"
                                              >
                                                <option value="protagonist">주인공</option>
                                                <option value="antagonist">적대자</option>
                                                <option value="supporting">조연</option>
                                                <option value="extra">단역</option>
                                              </select>
                                            </Show>
                                          </div>
                                          <div class="mt-1.5 text-xs text-text-dim space-y-0.5">
                                            <Show
                                              when={isEditing(c.id, "occupation")}
                                              fallback={
                                                <p
                                                  onClick={() => startEdit(c.id, "occupation", c.occupation)}
                                                  class="cursor-pointer hover:bg-bg-hover/50 rounded px-1 -mx-1 transition-colors"
                                                >
                                                  {c.occupation || "직업"}
                                                </p>
                                              }
                                            >
                                              <input
                                                ref={(el) => setTimeout(() => el.focus())}
                                                value={editValue()}
                                                onInput={(e) => setEditValue(e.currentTarget.value)}
                                                onBlur={() => saveCharacterField(c.id, "occupation")}
                                                onKeyDown={(e) => {
                                                  if (e.key === "Escape") cancelEdit()
                                                  if (e.key === "Enter") e.currentTarget.blur()
                                                }}
                                                class="w-full px-1 -mx-1 bg-bg border border-accent/30 rounded text-sm focus:outline-none focus:border-accent"
                                              />
                                            </Show>
                                            <Show
                                              when={isEditing(c.id, "personality")}
                                              fallback={
                                                <p
                                                  onClick={() => startEdit(c.id, "personality", c.personality)}
                                                  class="truncate cursor-pointer hover:bg-bg-hover/50 rounded px-1 -mx-1 transition-colors"
                                                >
                                                  성격: {c.personality || "미입력"}
                                                </p>
                                              }
                                            >
                                              <input
                                                ref={(el) => setTimeout(() => el.focus())}
                                                value={editValue()}
                                                onInput={(e) => setEditValue(e.currentTarget.value)}
                                                onBlur={() => saveCharacterField(c.id, "personality")}
                                                onKeyDown={(e) => {
                                                  if (e.key === "Escape") cancelEdit()
                                                  if (e.key === "Enter") e.currentTarget.blur()
                                                }}
                                                class="w-full px-1 -mx-1 bg-bg border border-accent/30 rounded text-sm focus:outline-none focus:border-accent"
                                              />
                                            </Show>
                                            <Show
                                              when={isEditing(c.id, "backstory")}
                                              fallback={
                                                <p
                                                  onClick={() => startEdit(c.id, "backstory", c.backstory)}
                                                  class="line-clamp-2 opacity-70 cursor-pointer hover:bg-bg-hover/50 rounded px-1 -mx-1 transition-colors"
                                                >
                                                  {c.backstory || "배경 설정"}
                                                </p>
                                              }
                                            >
                                              <textarea
                                                ref={(el) => setTimeout(() => el.focus())}
                                                value={editValue()}
                                                onInput={(e) => setEditValue(e.currentTarget.value)}
                                                onBlur={() => saveCharacterField(c.id, "backstory")}
                                                onKeyDown={(e) => {
                                                  if (e.key === "Escape") cancelEdit()
                                                }}
                                                class="w-full px-1 -mx-1 bg-bg border border-accent/30 rounded text-xs resize-y min-h-[3rem] focus:outline-none focus:border-accent"
                                                rows={3}
                                              />
                                            </Show>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </For>
                                <Show when={pendingCharacters().length > 0}>
                                  <p class="text-[10px] font-semibold text-text-dim uppercase tracking-wider px-1 pt-2 pb-1">
                                    미정
                                  </p>
                                  <For each={pendingCharacters()}>
                                    {(c) => (
                                      <div class="p-2.5 bg-bg-card/50 border border-dashed border-border/40 rounded-lg group relative">
                                        <span class="absolute top-2 right-2 text-text-dim/0 group-hover:text-text-dim/50 text-[10px] transition-colors">
                                          ✎
                                        </span>
                                        <div class="flex items-center gap-2">
                                          <Show
                                            when={isEditing(c.id, "name")}
                                            fallback={
                                              <span
                                                onClick={() => startEdit(c.id, "name", c.name.replace(/^\(미정\)\s*/, ""))}
                                                class="font-medium text-sm text-text-dim cursor-pointer hover:bg-bg-hover/50 rounded px-1 -mx-1 transition-colors"
                                              >
                                                {c.name.replace(/^\(미정\)\s*/, "")}
                                              </span>
                                            }
                                          >
                                            <input
                                              ref={(el) => setTimeout(() => el.focus())}
                                              value={editValue()}
                                              onInput={(e) => setEditValue(e.currentTarget.value)}
                                              onBlur={() => saveCharacterField(c.id, "name")}
                                              onKeyDown={(e) => {
                                                if (e.key === "Escape") cancelEdit()
                                                if (e.key === "Enter") e.currentTarget.blur()
                                              }}
                                              class="w-full px-1 -mx-1 bg-bg border border-accent/30 rounded text-sm focus:outline-none focus:border-accent"
                                            />
                                          </Show>
                                          <Show
                                            when={isEditing(c.id, "role")}
                                            fallback={
                                              <span
                                                onClick={() => startEdit(c.id, "role", c.role ?? "supporting")}
                                                class={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer ${roleColor(c.role)}`}
                                              >
                                                {roleLabel[c.role ?? "supporting"] ?? c.role ?? "역할"}
                                              </span>
                                            }
                                          >
                                            <select
                                              ref={(el) => setTimeout(() => el.focus())}
                                              value={editValue()}
                                              onChange={(e) => {
                                                setEditValue(e.currentTarget.value)
                                                e.currentTarget.blur()
                                              }}
                                              onBlur={() => saveCharacterField(c.id, "role")}
                                              onKeyDown={(e) => {
                                                if (e.key === "Escape") cancelEdit()
                                              }}
                                              class="px-1 bg-bg border border-accent/30 rounded text-[10px] focus:outline-none focus:border-accent"
                                            >
                                              <option value="protagonist">주인공</option>
                                              <option value="antagonist">적대자</option>
                                              <option value="supporting">조연</option>
                                              <option value="extra">단역</option>
                                            </select>
                                          </Show>
                                        </div>
                                        <div class="mt-1 text-xs text-text-dim/70 space-y-0.5">
                                          <Show
                                            when={isEditing(c.id, "occupation")}
                                            fallback={
                                              <p
                                                onClick={() => startEdit(c.id, "occupation", c.occupation)}
                                                class="cursor-pointer hover:bg-bg-hover/50 rounded px-1 -mx-1 transition-colors"
                                              >
                                                {c.occupation || "직업"}
                                              </p>
                                            }
                                          >
                                            <input
                                              ref={(el) => setTimeout(() => el.focus())}
                                              value={editValue()}
                                              onInput={(e) => setEditValue(e.currentTarget.value)}
                                              onBlur={() => saveCharacterField(c.id, "occupation")}
                                              onKeyDown={(e) => {
                                                if (e.key === "Escape") cancelEdit()
                                                if (e.key === "Enter") e.currentTarget.blur()
                                              }}
                                              class="w-full px-1 -mx-1 bg-bg border border-accent/30 rounded text-sm focus:outline-none focus:border-accent"
                                            />
                                          </Show>
                                          <Show
                                            when={isEditing(c.id, "personality")}
                                            fallback={
                                              <p
                                                onClick={() => startEdit(c.id, "personality", c.personality)}
                                                class="truncate cursor-pointer hover:bg-bg-hover/50 rounded px-1 -mx-1 transition-colors"
                                              >
                                                성격: {c.personality || "미입력"}
                                              </p>
                                            }
                                          >
                                            <input
                                              ref={(el) => setTimeout(() => el.focus())}
                                              value={editValue()}
                                              onInput={(e) => setEditValue(e.currentTarget.value)}
                                              onBlur={() => saveCharacterField(c.id, "personality")}
                                              onKeyDown={(e) => {
                                                if (e.key === "Escape") cancelEdit()
                                                if (e.key === "Enter") e.currentTarget.blur()
                                              }}
                                              class="w-full px-1 -mx-1 bg-bg border border-accent/30 rounded text-sm focus:outline-none focus:border-accent"
                                            />
                                          </Show>
                                        </div>
                                      </div>
                                    )}
                                  </For>
                                </Show>
                              </Match>

                              <Match when={sec.key === "episodes"}>
                                <Show when={!filteredEpisodes().length}>
                                  <p class="text-text-dim text-xs py-3 text-center">
                                    {searchQuery() && (episodes()?.length ?? 0) > 0 ? "검색 결과 없음" : "에피소드가 없습니다"}
                                  </p>
                                </Show>
                                <DragDropProvider
                                  onDragStart={({ draggable }) => setActiveEpId(draggable.id as string)}
                                  onDragEnd={({ draggable, droppable }) => {
                                    setActiveEpId(null)
                                    if (!droppable) return
                                    const eps = filteredEpisodes()
                                    const fromIdx = eps.findIndex((e) => e.id === draggable.id)
                                    const toIdx = eps.findIndex((e) => e.id === droppable.id)
                                    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return
                                    const targetEp = eps[toIdx]
                                    api.episode.reorder(draggable.id as string, targetEp.number).then(() => {
                                      refetchEps()
                                      showToast.success("순서 변경됨")
                                    }).catch(() => showToast.error("순서 변경 실패"))
                                  }}
                                  collisionDetector={closestCenter}
                                >
                                  <DragDropSensors />
                                  <SortableProvider ids={filteredEpisodes().map((e) => e.id)}>
                                    <For each={filteredEpisodes()}>
                                      {(ep) => {
                                        const sortable = createSortable(ep.id)
                                        return (
                                          <div
                                            ref={sortable.ref}
                                            {...sortable.dragActivators}
                                            class="p-3 bg-bg-card border border-border/60 rounded-lg hover:border-border transition-colors group relative touch-none"
                                            classList={{ "opacity-30": activeEpId() === ep.id }}
                                            style={transformStyle(sortable.transform)}
                                          >
                                            <span class="absolute top-2 left-2 text-text-dim/0 group-hover:text-text-dim/30 text-[10px] cursor-grab active:cursor-grabbing transition-colors">
                                              ⠿
                                            </span>
                                            <span class="absolute top-2 right-2 text-text-dim/0 group-hover:text-text-dim/50 text-[10px] transition-colors">
                                              ✎
                                            </span>
                                            <div class="flex items-center gap-2">
                                              <span class="text-[10px] font-mono bg-accent/15 text-accent px-1.5 py-0.5 rounded">
                                                {ep.number}화
                                              </span>
                                              <Show
                                                when={isEditing(ep.id, "title")}
                                                fallback={
                                                  <span
                                                    onClick={() => startEdit(ep.id, "title", ep.title)}
                                                    class="text-sm font-medium truncate cursor-pointer hover:bg-bg-hover/50 rounded px-1 -mx-1 transition-colors"
                                                  >
                                                    {ep.title}
                                                  </span>
                                                }
                                              >
                                                <input
                                                  ref={(el) => setTimeout(() => el.focus())}
                                                  value={editValue()}
                                                  onInput={(e) => setEditValue(e.currentTarget.value)}
                                                  onBlur={() => saveEpisodeField(ep.id, "title")}
                                                  onKeyDown={(e) => {
                                                    if (e.key === "Escape") cancelEdit()
                                                    if (e.key === "Enter") e.currentTarget.blur()
                                                  }}
                                                  class="w-full px-1 -mx-1 bg-bg border border-accent/30 rounded text-sm focus:outline-none focus:border-accent"
                                                />
                                              </Show>
                                              <Show
                                                when={isEditing(ep.id, "status")}
                                                fallback={
                                                  <span
                                                    onClick={() => startEdit(ep.id, "status", ep.status)}
                                                    class="text-[10px] text-text-dim ml-auto shrink-0 cursor-pointer hover:bg-bg-hover/50 rounded px-1 -mx-1 transition-colors"
                                                  >
                                                    {ep.status}
                                                  </span>
                                                }
                                              >
                                                <select
                                                  ref={(el) => setTimeout(() => el.focus())}
                                                  value={editValue()}
                                                  onChange={(e) => {
                                                    setEditValue(e.currentTarget.value)
                                                    e.currentTarget.blur()
                                                  }}
                                                  onBlur={() => saveEpisodeField(ep.id, "status")}
                                                  onKeyDown={(e) => {
                                                    if (e.key === "Escape") cancelEdit()
                                                  }}
                                                  class="px-1 bg-bg border border-accent/30 rounded text-[10px] focus:outline-none focus:border-accent ml-auto"
                                                >
                                                  <option value="draft">draft</option>
                                                  <option value="outlined">outlined</option>
                                                  <option value="scripted">scripted</option>
                                                  <option value="final">final</option>
                                                </select>
                                              </Show>
                                            </div>
                                            <Show
                                              when={isEditing(ep.id, "synopsis")}
                                              fallback={
                                                <p
                                                  onClick={() => startEdit(ep.id, "synopsis", ep.synopsis)}
                                                  class="text-xs text-text-dim mt-1.5 line-clamp-2 cursor-pointer hover:bg-bg-hover/50 rounded px-1 -mx-1 transition-colors"
                                                >
                                                  {ep.synopsis || "시놉시스"}
                                                </p>
                                              }
                                            >
                                              <textarea
                                                ref={(el) => setTimeout(() => el.focus())}
                                                value={editValue()}
                                                onInput={(e) => setEditValue(e.currentTarget.value)}
                                                onBlur={() => saveEpisodeField(ep.id, "synopsis")}
                                                onKeyDown={(e) => {
                                                  if (e.key === "Escape") cancelEdit()
                                                }}
                                                class="w-full px-1 -mx-1 bg-bg border border-accent/30 rounded text-xs resize-y min-h-[3rem] focus:outline-none focus:border-accent mt-1.5"
                                                rows={3}
                                              />
                                            </Show>
                                          </div>
                                        )
                                      }}
                                    </For>
                                  </SortableProvider>
                                  <DragOverlay>
                                    <Show when={activeEpId()}>
                                      <div class="p-3 bg-bg-card border border-border/60 rounded-lg opacity-80 shadow-lg">
                                        <span class="text-[10px] text-text-dim">에피소드 이동</span>
                                      </div>
                                    </Show>
                                  </DragOverlay>
                                </DragDropProvider>
                              </Match>

                              <Match when={sec.key === "scenes"}>
                                <Show when={!filteredScenes().length}>
                                  <p class="text-text-dim text-xs py-3 text-center">
                                    {searchQuery() && (scenes()?.length ?? 0) > 0 ? "검색 결과 없음" : "장면이 없습니다"}
                                  </p>
                                </Show>
                                <For each={groupedScenes()}>
                                  {(group) => (
                                    <div class="space-y-2">
                                      <p class="text-[10px] font-semibold text-text-dim uppercase tracking-wider px-1 pt-1">
                                        에피소드 {group.number}화
                                      </p>
                                      <DragDropProvider
                                        onDragStart={({ draggable }) => setActiveSceneId(draggable.id as string)}
                                        onDragEnd={({ draggable, droppable }) => {
                                          setActiveSceneId(null)
                                          if (!droppable) return
                                          const scs = group.scenes
                                          const fromIdx = scs.findIndex((s) => s.id === draggable.id)
                                          const toIdx = scs.findIndex((s) => s.id === droppable.id)
                                          if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return
                                          const targetScene = scs[toIdx]
                                          api.scene.reorder(draggable.id as string, targetScene.number).then(() => {
                                            refetchScenes()
                                            showToast.success("순서 변경됨")
                                          }).catch(() => showToast.error("순서 변경 실패"))
                                        }}
                                        collisionDetector={closestCenter}
                                      >
                                        <DragDropSensors />
                                        <SortableProvider ids={group.scenes.map((s) => s.id)}>
                                          <For each={group.scenes}>
                                            {(sc) => {
                                              const sortable = createSortable(sc.id)
                                              return (
                                                <div
                                                  ref={sortable.ref}
                                                  {...sortable.dragActivators}
                                                  class="p-3 bg-bg-card border border-border/60 rounded-lg hover:border-border transition-colors group relative touch-none"
                                                  classList={{ "opacity-30": activeSceneId() === sc.id }}
                                                  style={transformStyle(sortable.transform)}
                                                >
                                                  <span class="absolute top-2 left-2 text-text-dim/0 group-hover:text-text-dim/30 text-[10px] cursor-grab active:cursor-grabbing transition-colors">
                                                    ⠿
                                                  </span>
                                                  <span class="absolute top-2 right-2 text-text-dim/0 group-hover:text-text-dim/50 text-[10px] transition-colors">
                                                    ✎
                                                  </span>
                                                  <div class="flex items-center gap-2">
                                                    <span class="text-[10px] font-mono bg-accent/15 text-accent px-1.5 py-0.5 rounded">
                                                      S#{sc.number}
                                                    </span>
                                                    <Show
                                                      when={isEditing(sc.id, "time_of_day")}
                                                      fallback={
                                                        <span
                                                          onClick={() => startEdit(sc.id, "time_of_day", sc.time_of_day ?? "DAY")}
                                                          class={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer ${todColor(sc.time_of_day)}`}
                                                        >
                                                          {todLabel[sc.time_of_day ?? "DAY"] ?? sc.time_of_day ?? "시간대"}
                                                        </span>
                                                      }
                                                    >
                                                      <select
                                                        ref={(el) => setTimeout(() => el.focus())}
                                                        value={editValue()}
                                                        onChange={(e) => {
                                                          setEditValue(e.currentTarget.value)
                                                          e.currentTarget.blur()
                                                        }}
                                                        onBlur={() => saveSceneField(sc.id, "time_of_day")}
                                                        onKeyDown={(e) => {
                                                          if (e.key === "Escape") cancelEdit()
                                                        }}
                                                        class="px-1 bg-bg border border-accent/30 rounded text-[10px] focus:outline-none focus:border-accent"
                                                      >
                                                        <option value="DAY">DAY</option>
                                                        <option value="NIGHT">NIGHT</option>
                                                        <option value="DAWN">DAWN</option>
                                                        <option value="DUSK">DUSK</option>
                                                      </select>
                                                    </Show>
                                                    <Show
                                                      when={isEditing(sc.id, "location")}
                                                      fallback={
                                                        <span
                                                          onClick={() => startEdit(sc.id, "location", sc.location)}
                                                          class="text-sm font-medium truncate cursor-pointer hover:bg-bg-hover/50 rounded px-1 -mx-1 transition-colors"
                                                        >
                                                          {sc.location || "장소"}
                                                        </span>
                                                      }
                                                    >
                                                      <input
                                                        ref={(el) => setTimeout(() => el.focus())}
                                                        value={editValue()}
                                                        onInput={(e) => setEditValue(e.currentTarget.value)}
                                                        onBlur={() => saveSceneField(sc.id, "location")}
                                                        onKeyDown={(e) => {
                                                          if (e.key === "Escape") cancelEdit()
                                                          if (e.key === "Enter") e.currentTarget.blur()
                                                        }}
                                                        class="w-full px-1 -mx-1 bg-bg border border-accent/30 rounded text-sm focus:outline-none focus:border-accent"
                                                      />
                                                    </Show>
                                                  </div>
                                                  <Show
                                                    when={isEditing(sc.id, "description")}
                                                    fallback={
                                                      <p
                                                        onClick={() => startEdit(sc.id, "description", sc.description)}
                                                        class="text-xs text-text-dim mt-1.5 line-clamp-2 cursor-pointer hover:bg-bg-hover/50 rounded px-1 -mx-1 transition-colors"
                                                      >
                                                        {sc.description || "장면 설명"}
                                                      </p>
                                                    }
                                                  >
                                                    <textarea
                                                      ref={(el) => setTimeout(() => el.focus())}
                                                      value={editValue()}
                                                      onInput={(e) => setEditValue(e.currentTarget.value)}
                                                      onBlur={() => saveSceneField(sc.id, "description")}
                                                      onKeyDown={(e) => {
                                                        if (e.key === "Escape") cancelEdit()
                                                      }}
                                                      class="w-full px-1 -mx-1 bg-bg border border-accent/30 rounded text-xs resize-y min-h-[3rem] focus:outline-none focus:border-accent mt-1.5"
                                                      rows={3}
                                                    />
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
                                              )
                                            }}
                                          </For>
                                        </SortableProvider>
                                        <DragOverlay>
                                          <Show when={activeSceneId()}>
                                            <div class="p-3 bg-bg-card border border-border/60 rounded-lg opacity-80 shadow-lg">
                                              <span class="text-[10px] text-text-dim">장면 이동</span>
                                            </div>
                                          </Show>
                                        </DragOverlay>
                                      </DragDropProvider>
                                    </div>
                                  )}
                                </For>
                              </Match>

                              <Match when={sec.key === "world"}>
                                <Show when={!filteredWorld().length}>
                                  <p class="text-text-dim text-xs py-3 text-center">
                                    {searchQuery() && (world()?.length ?? 0) > 0 ? "검색 결과 없음" : "세계관이 없습니다"}
                                  </p>
                                </Show>
                                <For each={filteredWorld()}>
                                  {(w) => (
                                    <div class="p-3 bg-bg-card border border-border/60 rounded-lg hover:border-border transition-colors group relative">
                                      <button
                                        onClick={async () => {
                                          await api.world.remove(w.id)
                                          refetchWorld()
                                          showToast.success("삭제됨")
                                        }}
                                        class="absolute top-2 right-2 text-text-dim/0 group-hover:text-text-dim/50 hover:!text-danger text-xs transition-colors"
                                      >
                                        ✕
                                      </button>
                                      <div class="flex items-center gap-2">
                                        <Show
                                          when={isEditing(w.id, "category")}
                                          fallback={
                                            <span
                                              onClick={() => startEdit(w.id, "category", w.category)}
                                              class="text-[10px] px-1.5 py-0.5 bg-bg-hover rounded uppercase tracking-wider text-text-dim cursor-pointer hover:bg-bg-hover/80 transition-colors"
                                            >
                                              {w.category}
                                            </span>
                                          }
                                        >
                                          <input
                                            ref={(el) => setTimeout(() => el.focus())}
                                            value={editValue()}
                                            onInput={(e) => setEditValue(e.currentTarget.value)}
                                            onBlur={() => saveWorldField(w.id, "category")}
                                            onKeyDown={(e) => {
                                              if (e.key === "Escape") cancelEdit()
                                              if (e.key === "Enter") e.currentTarget.blur()
                                            }}
                                            class="w-24 px-1 -mx-1 bg-bg border border-accent/30 rounded text-[10px] focus:outline-none focus:border-accent"
                                          />
                                        </Show>
                                        <Show
                                          when={isEditing(w.id, "name")}
                                          fallback={
                                            <span
                                              onClick={() => startEdit(w.id, "name", w.name)}
                                              class="text-sm font-medium cursor-pointer hover:bg-bg-hover/50 rounded px-1 -mx-1 transition-colors"
                                            >
                                              {w.name}
                                            </span>
                                          }
                                        >
                                          <input
                                            ref={(el) => setTimeout(() => el.focus())}
                                            value={editValue()}
                                            onInput={(e) => setEditValue(e.currentTarget.value)}
                                            onBlur={() => saveWorldField(w.id, "name")}
                                            onKeyDown={(e) => {
                                              if (e.key === "Escape") cancelEdit()
                                              if (e.key === "Enter") e.currentTarget.blur()
                                            }}
                                            class="w-full px-1 -mx-1 bg-bg border border-accent/30 rounded text-sm focus:outline-none focus:border-accent"
                                          />
                                        </Show>
                                      </div>
                                      <Show
                                        when={isEditing(w.id, "description")}
                                        fallback={
                                          <p
                                            onClick={() => startEdit(w.id, "description", w.description)}
                                            class="text-xs text-text-dim mt-1.5 line-clamp-2 cursor-pointer hover:bg-bg-hover/50 rounded px-1 -mx-1 transition-colors"
                                          >
                                            {w.description || "설명"}
                                          </p>
                                        }
                                      >
                                        <textarea
                                          ref={(el) => setTimeout(() => el.focus())}
                                          value={editValue()}
                                          onInput={(e) => setEditValue(e.currentTarget.value)}
                                          onBlur={() => saveWorldField(w.id, "description")}
                                          onKeyDown={(e) => {
                                            if (e.key === "Escape") cancelEdit()
                                          }}
                                          class="w-full px-1 -mx-1 bg-bg border border-accent/30 rounded text-xs resize-y min-h-[3rem] focus:outline-none focus:border-accent mt-1.5"
                                          rows={3}
                                        />
                                      </Show>
                                    </div>
                                  )}
                                </For>
                              </Match>

                              <Match when={sec.key === "plot"}>
                                <Show when={!filteredPlotPoints().length}>
                                  <p class="text-text-dim text-xs py-3 text-center">
                                    {searchQuery() && (plotPoints()?.length ?? 0) > 0 ? "검색 결과 없음" : "플롯이 없습니다"}
                                  </p>
                                </Show>
                                <div class="space-y-1">
                                  <For each={filteredPlotPoints()}>
                                    {(pp) => (
                                      <div
                                        class="flex items-start gap-2.5 px-2.5 py-2 rounded-md hover:bg-bg-hover/50 transition-colors group"
                                      >
                                        <div
                                          class="w-1 shrink-0 rounded-full self-stretch mt-0.5"
                                          style={{ background: plotColorHex(pp.type) }}
                                        />
                                        <div class="min-w-0 flex-1">
                                          <div class="flex items-center gap-1.5">
                                            <Show
                                              when={isEditing(pp.id, "type")}
                                              fallback={
                                                <span
                                                  onClick={() => startEdit(pp.id, "type", pp.type)}
                                                  class="text-[10px] font-medium shrink-0 cursor-pointer hover:bg-bg-hover/50 rounded px-1 -mx-1 transition-colors"
                                                  style={{ color: plotColorHex(pp.type) }}
                                                >
                                                  {plotTypeLabel[pp.type] ?? pp.type}
                                                </span>
                                              }
                                            >
                                              <select
                                                ref={(el) => setTimeout(() => el.focus())}
                                                value={editValue()}
                                                onChange={(e) => {
                                                  setEditValue(e.currentTarget.value)
                                                  e.currentTarget.blur()
                                                }}
                                                onBlur={() => savePlotField(pp.id, "type")}
                                                onKeyDown={(e) => {
                                                  if (e.key === "Escape") cancelEdit()
                                                }}
                                                class="px-1 bg-bg border border-accent/30 rounded text-[10px] focus:outline-none focus:border-accent"
                                              >
                                                <option value="setup">설정</option>
                                                <option value="conflict">갈등</option>
                                                <option value="twist">반전</option>
                                                <option value="climax">클라이맥스</option>
                                                <option value="resolution">해소</option>
                                                <option value="foreshadowing">복선</option>
                                              </select>
                                            </Show>
                                            <button
                                              onClick={() => togglePlotResolved(pp.id)}
                                              class="text-[10px] shrink-0 text-text-dim hover:text-success transition-colors"
                                            >
                                              {pp.resolved ? "✓" : "○"}
                                            </button>
                                            <button
                                              onClick={async () => {
                                                await api.plotPoint.remove(pp.id)
                                                refetchPlot()
                                                showToast.success("삭제됨")
                                              }}
                                              class="ml-auto text-text-dim/0 group-hover:text-text-dim/50 hover:!text-danger text-xs transition-colors"
                                            >
                                              ✕
                                            </button>
                                          </div>
                                          <Show
                                            when={isEditing(pp.id, "description")}
                                            fallback={
                                              <p
                                                onClick={() => startEdit(pp.id, "description", pp.description)}
                                                class="text-xs text-text-dim line-clamp-2 mt-0.5 leading-relaxed cursor-pointer hover:bg-bg-hover/50 rounded px-1 -mx-1 transition-colors"
                                              >
                                                {pp.description}
                                              </p>
                                            }
                                          >
                                            <textarea
                                              ref={(el) => setTimeout(() => el.focus())}
                                              value={editValue()}
                                              onInput={(e) => setEditValue(e.currentTarget.value)}
                                              onBlur={() => savePlotField(pp.id, "description")}
                                              onKeyDown={(e) => {
                                                if (e.key === "Escape") cancelEdit()
                                              }}
                                              class="w-full px-1 -mx-1 bg-bg border border-accent/30 rounded text-xs resize-y min-h-[3rem] focus:outline-none focus:border-accent mt-0.5"
                                              rows={3}
                                            />
                                          </Show>
                                        </div>
                                      </div>
                                    )}
                                  </For>
                                </div>
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
