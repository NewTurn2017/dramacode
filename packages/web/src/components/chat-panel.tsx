import { createSignal, createEffect, For, Show, onMount } from "solid-js"
import { api, type Message } from "@/lib/api"
import { Markdown } from "./markdown"
import { ThinkingIndicator } from "./thinking"

export function ChatPanel(props: { sessionId: string; visible: boolean; onTitleChange?: (title: string) => void }) {
  const [messages, setMessages] = createSignal<Message[]>([])
  const [input, setInput] = createSignal("")
  const [streaming, setStreaming] = createSignal(false)
  const [streamText, setStreamText] = createSignal("")
  const [loaded, setLoaded] = createSignal(false)
  let scrollRef: HTMLDivElement | undefined
  let inputRef: HTMLTextAreaElement | undefined

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
    if (props.visible) requestAnimationFrame(() => scrollToBottom())
  })

  async function runGreet() {
    setStreaming(true)
    setStreamText("")
    const res = await api.chat.greet(props.sessionId)
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
  }

  onMount(async () => {
    const msgs = await api.session.messages(props.sessionId)
    setMessages(msgs)
    setLoaded(true)
    requestAnimationFrame(() => scrollToBottom(true))
    if (msgs.length === 0) runGreet()
  })

  createEffect(() => {
    if (props.visible) {
      requestAnimationFrame(() => {
        scrollToBottom(true)
        inputRef?.focus()
      })
    }
  })

  async function handleSend(e: Event) {
    e.preventDefault()
    const text = input().trim()
    if (!text || streaming()) return

    setInput("")
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
    setStreamText("")

    const res = await api.chat.stream(props.sessionId, text)
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
        id: `temp-assistant-${Date.now()}`,
        session_id: props.sessionId,
        role: "assistant",
        content: full,
        time_created: Date.now(),
      },
    ])

    if (messages().filter((m) => m.role === "user").length <= 1) {
      const label = text.length > 30 ? text.slice(0, 30) + "…" : text
      await api.session.updateTitle(props.sessionId, label)
      props.onTitleChange?.(label)
    }

    inputRef?.focus()
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
          </div>
        </div>

        <div class="shrink-0 border-t border-border bg-bg">
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
                disabled={streaming()}
              />
              <button
                type="submit"
                disabled={streaming() || !input().trim()}
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
