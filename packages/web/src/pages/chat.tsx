import { createSignal, createResource, For, Show, onMount, createEffect } from "solid-js"
import { api, type Session, type Message } from "@/lib/api"
import { ConfirmModal } from "@/components/confirm-modal"
import { Markdown } from "@/components/markdown"

export default function ChatPage() {
  const [sessions, { refetch: refetchSessions }] = createResource(() => api.session.list())
  const [activeSession, setActiveSession] = createSignal<string | null>(null)
  const [messages, setMessages] = createSignal<Message[]>([])
  const [input, setInput] = createSignal("")
  const [streaming, setStreaming] = createSignal(false)
  const [streamText, setStreamText] = createSignal("")
  const [deleteTarget, setDeleteTarget] = createSignal<Session | null>(null)
  let messagesEnd: HTMLDivElement | undefined
  let inputRef: HTMLTextAreaElement | undefined

  function scrollToBottom() {
    messagesEnd?.scrollIntoView({ behavior: "smooth" })
  }

  createEffect(() => {
    messages()
    streamText()
    scrollToBottom()
  })

  async function selectSession(id: string) {
    setActiveSession(id)
    const msgs = await api.session.messages(id)
    setMessages(msgs)
  }

  async function createSession() {
    const session = await api.session.create()
    refetchSessions()
    await selectSession(session.id)
  }

  async function confirmDeleteSession() {
    const target = deleteTarget()
    if (!target) return
    setDeleteTarget(null)
    if (activeSession() === target.id) {
      setActiveSession(null)
      setMessages([])
    }
    await api.session.remove(target.id)
    refetchSessions()
  }

  async function handleSend(e: Event) {
    e.preventDefault()
    const text = input().trim()
    if (!text || streaming() || !activeSession()) return

    setInput("")
    setMessages((prev) => [
      ...prev,
      { id: "temp-user", session_id: activeSession()!, role: "user", content: text, time_created: Date.now() },
    ])
    setStreaming(true)
    setStreamText("")

    const res = await api.chat.stream(activeSession()!, text)
    if (!res.ok || !res.body) {
      setStreaming(false)
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let full = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      full += decoder.decode(value, { stream: true })
      setStreamText(full)
    }

    setStreamText("")
    setStreaming(false)
    setMessages((prev) => [
      ...prev,
      {
        id: "temp-assistant",
        session_id: activeSession()!,
        role: "assistant",
        content: full,
        time_created: Date.now(),
      },
    ])

    const current = sessions()?.find((s) => s.id === activeSession())
    if (current && (!current.title || current.title.startsWith("New session"))) {
      const label = text.length > 30 ? text.slice(0, 30) + "…" : text
      await api.session.updateTitle(activeSession()!, label)
      refetchSessions()
    }

    inputRef?.focus()
  }

  function sessionLabel(s: Session) {
    if (s.title && !s.title.startsWith("New session")) return s.title
    return new Date(s.time_created).toLocaleDateString("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend(e)
    }
  }

  return (
    <div class="flex h-full">
      <aside class="w-52 shrink-0 border-r border-border bg-bg flex flex-col">
        <div class="p-3 border-b border-border">
          <button
            onClick={createSession}
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
                  "bg-bg-hover": activeSession() === s.id,
                  "hover:bg-bg-hover": activeSession() !== s.id,
                }}
              >
                <button
                  onClick={() => selectSession(s.id)}
                  class="flex-1 text-left px-3 py-2 text-sm truncate"
                  classList={{
                    "text-accent": activeSession() === s.id,
                    "text-text-dim hover:text-text": activeSession() !== s.id,
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

      <div class="flex-1 flex flex-col">
        <Show
          when={activeSession()}
          fallback={
            <div class="flex-1 flex items-center justify-center">
              <div class="text-center">
                <p class="text-2xl mb-2">🎬</p>
                <p class="text-text-dim">새 대화를 시작하거나 기존 세션을 선택하세요</p>
              </div>
            </div>
          }
        >
          <div class="flex-1 overflow-auto p-4 space-y-4">
            <For each={messages()}>
              {(msg) => (
                <div class="flex" classList={{ "justify-end": msg.role === "user" }}>
                  <Show
                    when={msg.role === "assistant"}
                    fallback={
                      <div class="max-w-[70%] px-4 py-2.5 rounded-lg text-sm whitespace-pre-wrap bg-accent text-white">
                        {msg.content}
                      </div>
                    }
                  >
                    <div class="max-w-[70%] px-4 py-2.5 rounded-lg text-sm bg-bg-card border border-border">
                      <Markdown content={msg.content} />
                    </div>
                  </Show>
                </div>
              )}
            </For>

            <Show when={streaming() && streamText()}>
              <div class="flex">
                <div class="max-w-[70%] px-4 py-2.5 rounded-lg text-sm bg-bg-card border border-border">
                  <Markdown content={streamText()} />
                  <span class="inline-block w-1.5 h-4 bg-accent animate-pulse ml-0.5" />
                </div>
              </div>
            </Show>

            <Show when={streaming() && !streamText()}>
              <div class="flex">
                <div class="px-4 py-2.5 rounded-lg text-sm bg-bg-card border border-border text-text-dim">
                  생각하는 중...
                </div>
              </div>
            </Show>

            <div ref={messagesEnd} />
          </div>

          <form onSubmit={handleSend} class="p-4 border-t border-border">
            <div class="flex gap-2">
              <textarea
                ref={inputRef}
                value={input()}
                onInput={(e) => setInput(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                placeholder="메시지를 입력하세요... (Shift+Enter 줄바꿈)"
                rows={2}
                class="flex-1 px-3 py-2 bg-bg-card border border-border rounded-md text-sm text-text placeholder:text-text-dim resize-none focus:outline-none focus:border-accent"
                disabled={streaming()}
              />
              <button
                type="submit"
                disabled={streaming() || !input().trim()}
                class="px-4 py-2 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-hover disabled:opacity-50 transition-colors self-end"
              >
                전송
              </button>
            </div>
          </form>
        </Show>
      </div>

      <ConfirmModal
        open={!!deleteTarget()}
        title="세션 삭제"
        message={`"${sessionLabel(deleteTarget()!)}" 대화를 삭제하시겠습니까?`}
        onConfirm={confirmDeleteSession}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
