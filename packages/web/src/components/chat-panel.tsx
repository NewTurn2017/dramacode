import { createSignal, createEffect, For, Show, onMount, onCleanup } from "solid-js"
import { api, type Message } from "@/lib/api"
import { Markdown } from "./markdown"
import { ThinkingIndicator } from "./thinking"

const STREAM_STALL_MS = 180_000

export function ChatPanel(props: { sessionId: string; visible: boolean; onTitleChange?: (title: string) => void }) {
  const [messages, setMessages] = createSignal<Message[]>([])
  const [input, setInput] = createSignal("")
  const [streaming, setStreaming] = createSignal(false)
  const [streamText, setStreamText] = createSignal("")
  const [loaded, setLoaded] = createSignal(false)
  const [queue, setQueue] = createSignal<string[]>([])
  const [organizing, setOrganizing] = createSignal(false)
  let scrollRef: HTMLDivElement | undefined
  let inputRef: HTMLTextAreaElement | undefined
  let abortRef: AbortController | undefined

  onCleanup(() => abortRef?.abort())

  function scrollToBottom(instant = false) {
    if (!scrollRef) return
    if (instant) {
      scrollRef.scrollTop = scrollRef.scrollHeight
      return
    }
    scrollRef.scrollTo({ top: scrollRef.scrollHeight, behavior: "smooth" })
  }

  createEffect(() => {
    messages()
    streamText()
    queue()
    if (props.visible) requestAnimationFrame(() => scrollToBottom())
  })

  async function consumeStream(res: Response): Promise<string> {
    if (!res.ok || !res.body) return ""
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let full = ""
    let staleTimer: ReturnType<typeof setTimeout> | undefined
    try {
      while (true) {
        clearTimeout(staleTimer)
        staleTimer = setTimeout(() => reader.cancel(), STREAM_STALL_MS)
        const { done, value } = await reader.read()
        if (done) break
        full += decoder.decode(value, { stream: true })
        setStreamText(full)
      }
    } catch {
      /* expected: stale-cancel / abort / network drop */
    } finally {
      clearTimeout(staleTimer)
      reader.releaseLock()
    }
    return full
  }

  function focusInput() {
    requestAnimationFrame(() => inputRef?.focus())
  }

  function drainQueue() {
    const q = queue()
    if (q.length === 0) {
      setStreaming(false)
      focusInput()
      return
    }
    const text = q[0]!
    setQueue((prev) => prev.slice(1))
    setMessages((prev) => [
      ...prev,
      {
        id: `temp-user-${Date.now()}`,
        session_id: props.sessionId,
        role: "user",
        content: text,
        time_created: Date.now(),
      },
    ])
    void doStream(text)
  }

  async function doStream(text: string) {
    abortRef?.abort()
    abortRef = new AbortController()
    const { signal } = abortRef

    setStreamText("")
    try {
      const res = await api.chat.stream(props.sessionId, text, signal)
      const full = await consumeStream(res)

      if (full.trim()) {
        setMessages((prev) => [
          ...prev,
          {
            id: `temp-assistant-${Date.now()}`,
            session_id: props.sessionId,
            role: "assistant",
            content: full,
            time_created: Date.now(),
          },
        ])
      }

      if (messages().filter((m) => m.role === "user").length <= 1) {
        const label = text.length > 30 ? text.slice(0, 30) + "…" : text
        await api.session.updateTitle(props.sessionId, label)
        props.onTitleChange?.(label)
      }
    } catch {
      /* abort / network */
    } finally {
      setStreamText("")
    }

    drainQueue()
  }

  async function runGreet() {
    abortRef?.abort()
    abortRef = new AbortController()
    const { signal } = abortRef

    setStreaming(true)
    setStreamText("")
    try {
      const res = await api.chat.greet(props.sessionId, signal)
      const full = await consumeStream(res)
      if (full.trim()) {
        setMessages([
          {
            id: `greet-${Date.now()}`,
            session_id: props.sessionId,
            role: "assistant",
            content: full,
            time_created: Date.now(),
          },
        ])
      }
    } catch {
      /* abort / network */
    } finally {
      setStreamText("")
    }

    drainQueue()
  }

  onMount(async () => {
    const msgs = await api.session.messages(props.sessionId)
    setMessages(msgs)
    setLoaded(true)
    requestAnimationFrame(() => scrollToBottom(true))
    if (msgs.length === 0) void runGreet()
  })

  createEffect(() => {
    if (props.visible) {
      requestAnimationFrame(() => {
        scrollToBottom(true)
        inputRef?.focus()
      })
    }
  })

  function handleSend(e: Event) {
    e.preventDefault()
    const text = input().trim()
    if (!text) return

    setInput("")

    if (!streaming()) {
      setMessages((prev) => [
        ...prev,
        {
          id: `temp-user-${Date.now()}`,
          session_id: props.sessionId,
          role: "user",
          content: text,
          time_created: Date.now(),
        },
      ])
      setStreaming(true)
      void doStream(text)
    } else {
      setQueue((prev) => [...prev, text])
    }
  }

  const [organizeResult, setOrganizeResult] = createSignal<{ ok: boolean; text: string } | null>(null)

  async function handleOrganize() {
    if (organizing() || streaming()) return
    setOrganizing(true)
    setOrganizeResult(null)
    try {
      const res = await api.chat.organize(props.sessionId)
      if (res.status === "empty") {
        setOrganizeResult({ ok: false, text: "정리할 대화가 없습니다." })
      } else {
        const s = res.stats
        const parts: string[] = []
        if (s?.characters) parts.push(`캐릭터 ${s.characters}`)
        if (s?.episodes) parts.push(`에피소드 ${s.episodes}`)
        if (s?.world) parts.push(`세계관 ${s.world}`)
        if (s?.scenes) parts.push(`장면 ${s.scenes}`)
        if (s?.plot_points) parts.push(`플롯 ${s.plot_points}`)
        setOrganizeResult({
          ok: true,
          text: parts.length ? `정리 완료: ${parts.join(", ")}` : "정리 완료 (변경 없음)",
        })
      }
    } catch (e) {
      setOrganizeResult({ ok: false, text: `정리 실패: ${e instanceof Error ? e.message : "알 수 없는 오류"}` })
    } finally {
      setOrganizing(false)
      setTimeout(() => setOrganizeResult(null), 5000)
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend(e)
    }
  }

  return (
    <div class="flex flex-col h-full" style={{ display: props.visible ? "flex" : "none" }}>
      <Show when={!loaded()}>
        <div class="flex-1 flex items-center justify-center">
          <ThinkingIndicator />
        </div>
      </Show>

      <Show when={loaded()}>
        <div ref={scrollRef} class="flex-1 overflow-y-auto">
          <div class="max-w-3xl mx-auto px-5 py-6 space-y-5">
            <Show when={messages().length === 0 && !streaming()}>
              <div class="flex items-center justify-center h-48">
                <p class="text-text-dim text-sm">대화를 시작하세요</p>
              </div>
            </Show>

            <For each={messages()}>
              {(msg) => (
                <Show
                  when={msg.role === "assistant"}
                  fallback={
                    <div class="flex justify-end">
                      <div class="max-w-[75%] px-4 py-2.5 rounded-2xl rounded-br-sm text-sm whitespace-pre-wrap bg-accent/15 text-text border border-accent/20">
                        {msg.content}
                      </div>
                    </div>
                  }
                >
                  <div class="text-sm leading-relaxed">
                    <Markdown content={msg.content} />
                  </div>
                </Show>
              )}
            </For>

            <Show when={streaming() && streamText()}>
              <div class="text-sm leading-relaxed">
                <Markdown content={streamText()} />
                <span class="inline-block w-1.5 h-4 bg-accent/60 animate-pulse ml-0.5 align-middle" />
              </div>
            </Show>

            <Show when={streaming() && !streamText()}>
              <ThinkingIndicator />
            </Show>

            <For each={queue()}>
              {(text) => (
                <div class="flex justify-end">
                  <div class="max-w-[75%] px-4 py-2.5 rounded-2xl rounded-br-sm text-sm whitespace-pre-wrap bg-accent/10 text-text/60 border border-accent/10">
                    {text}
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>

        <div class="shrink-0 border-t border-border bg-bg">
          <Show when={organizing()}>
            <div class="max-w-3xl mx-auto px-5 pt-2.5">
              <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/20 text-xs text-accent">
                <span class="inline-block w-3 h-3 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
                전체 대화를 분석하여 구조 데이터를 정리하고 있습니다…
              </div>
            </div>
          </Show>
          <Show when={organizeResult()}>
            {(result) => (
              <div class="max-w-3xl mx-auto px-5 pt-2.5">
                <div
                  class="px-3 py-2 rounded-lg text-xs border"
                  classList={{
                    "bg-emerald-500/10 border-emerald-500/20 text-emerald-400": result().ok,
                    "bg-danger/10 border-danger/20 text-danger": !result().ok,
                  }}
                >
                  {result().text}
                </div>
              </div>
            )}
          </Show>
          <form onSubmit={handleSend} class="max-w-3xl mx-auto px-5 py-3">
            <div class="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input()}
                onInput={(e) => setInput(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                placeholder="메시지를 입력하세요..."
                rows={1}
                class="flex-1 px-3.5 py-2.5 bg-bg-card border border-border rounded-lg text-sm text-text placeholder:text-text-dim resize-none focus:outline-none focus:border-accent/60 transition-colors"
              />
              <button
                type="button"
                disabled={organizing() || streaming()}
                onClick={handleOrganize}
                class="px-3 py-2.5 bg-bg-card border border-border text-text-dim text-xs font-medium rounded-lg hover:border-accent/60 hover:text-text disabled:opacity-40 transition-colors shrink-0"
                title="전체 대화를 기반으로 구조 데이터를 정리합니다"
              >
                {organizing() ? "정리 중…" : "정리"}
              </button>
              <button
                type="submit"
                disabled={!input().trim()}
                class="px-4 py-2.5 bg-accent text-white text-xs font-medium rounded-lg hover:bg-accent-hover disabled:opacity-40 transition-colors shrink-0"
              >
                전송
              </button>
            </div>
          </form>
        </div>
      </Show>
    </div>
  )
}
