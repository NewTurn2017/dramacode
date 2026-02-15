import { createSignal, createResource, For, Show } from "solid-js"
import { api, type Session } from "@/lib/api"
import { ConfirmModal } from "@/components/confirm-modal"
import { ChatPanel } from "@/components/chat-panel"

type OpenTab = { id: string; label: string }

export default function ChatPage() {
  const [sessions, { refetch: refetchSessions }] = createResource(() => api.session.list())
  const [openTabs, setOpenTabs] = createSignal<OpenTab[]>([])
  const [activeTab, setActiveTab] = createSignal<string | null>(null)
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
    if (!openTabs().find((t) => t.id === s.id)) {
      setOpenTabs((tabs) => [...tabs, { id: s.id, label: sessionLabel(s) }])
    }
    setActiveTab(s.id)
  }

  async function createAndOpen() {
    const session = await api.session.create()
    refetchSessions()
    openSession(session)
  }

  function closeTab(id: string) {
    const remaining = openTabs().filter((t) => t.id !== id)
    setOpenTabs(remaining)
    if (activeTab() === id) {
      setActiveTab(remaining.length > 0 ? remaining[remaining.length - 1].id : null)
    }
  }

  async function confirmDeleteSession() {
    const target = deleteTarget()
    if (!target) return
    setDeleteTarget(null)
    closeTab(target.id)
    await api.session.remove(target.id)
    refetchSessions()
  }

  function handleTitleChange(sessionId: string, title: string) {
    setOpenTabs((tabs) => tabs.map((t) => (t.id === sessionId ? { ...t, label: title } : t)))
    refetchSessions()
  }

  return (
    <div class="flex h-full">
      <aside class="w-52 shrink-0 border-r border-border bg-bg flex flex-col">
        <div class="p-3 border-b border-border">
          <button
            onClick={createAndOpen}
            class="w-full px-3 py-1.5 bg-accent text-white text-sm rounded-md hover:bg-accent-hover transition-colors"
          >
            + 새 대화
          </button>
        </div>
        <div class="flex-1 overflow-auto p-2 space-y-0.5">
          <For each={sessions()}>
            {(s) => (
              <div
                class="flex items-center group rounded-md transition-colors"
                classList={{
                  "bg-bg-hover": activeTab() === s.id,
                  "hover:bg-bg-hover": activeTab() !== s.id,
                }}
              >
                <button
                  onClick={() => openSession(s)}
                  class="flex-1 text-left px-3 py-2 text-sm truncate"
                  classList={{
                    "text-accent": openTabs().some((t) => t.id === s.id),
                    "text-text-dim hover:text-text": !openTabs().some((t) => t.id === s.id),
                  }}
                >
                  {sessionLabel(s)}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteTarget(s)
                  }}
                  class="p-1 mr-1 text-text-dim hover:text-danger opacity-0 group-hover:opacity-100 transition-all shrink-0"
                  title="삭제"
                >
                  ✕
                </button>
              </div>
            )}
          </For>
        </div>
      </aside>

      <div class="flex-1 flex flex-col min-w-0">
        <Show when={openTabs().length > 0}>
          <div class="flex items-center border-b border-border bg-bg overflow-x-auto shrink-0">
            <For each={openTabs()}>
              {(tab) => (
                <div
                  class="flex items-center gap-1 px-3 py-2 border-r border-border cursor-pointer text-sm shrink-0 max-w-[180px] transition-colors"
                  classList={{
                    "bg-bg-card text-text": activeTab() === tab.id,
                    "text-text-dim hover:bg-bg-hover hover:text-text": activeTab() !== tab.id,
                  }}
                >
                  <button onClick={() => setActiveTab(tab.id)} class="truncate flex-1 text-left">
                    {tab.label}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      closeTab(tab.id)
                    }}
                    class="text-text-dim hover:text-danger text-xs shrink-0 ml-1"
                  >
                    ✕
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>

        <Show
          when={openTabs().length > 0}
          fallback={
            <div class="flex-1 flex items-center justify-center">
              <div class="text-center">
                <p class="text-2xl mb-2">🎬</p>
                <p class="text-text-dim">새 대화를 시작하거나 기존 세션을 선택하세요</p>
              </div>
            </div>
          }
        >
          <div class="flex-1 relative min-h-0">
            <For each={openTabs()}>
              {(tab) => (
                <div
                  class="absolute inset-0"
                  style={{
                    "z-index": activeTab() === tab.id ? 1 : 0,
                    visibility: activeTab() === tab.id ? "visible" : "hidden",
                  }}
                >
                  <ChatPanel
                    sessionId={tab.id}
                    visible={activeTab() === tab.id}
                    onTitleChange={(title) => handleTitleChange(tab.id, title)}
                  />
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>

      <ConfirmModal
        open={!!deleteTarget()}
        title="세션 삭제"
        message={`"${deleteTarget() ? sessionLabel(deleteTarget()!) : ""}" 대화를 삭제하시겠습니까?`}
        onConfirm={confirmDeleteSession}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
