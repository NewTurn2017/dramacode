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
  let messagesEnd: HTMLDivElement | undefined
  let inputRef: HTMLTextAreaElement | undefined

  function scrollToBottom() {
    messagesEnd?.scrollIntoView({ behavior: "smooth" })
  }

  createEffect(() => {
    messages()
    streamText()
    if (props.visible) scrollToBottom()
  })

  onMount(async () => {
    const msgs = await api.session.messages(props.sessionId)
    setMessages(msgs)
    setLoaded(true)
    scrollToBottom()
  })

  createEffect(() => {
    if (props.visible) {
      requestAnimationFrame(() => inputRef?.focus())
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
    <div class="flex-1 flex flex-col h-full" style={{ display: props.visible ? "flex" : "none" }}>
      <Show when={!loaded()}>
        <div class="flex-1 flex items-center justify-center">
          <ThinkingIndicator />
        </div>
      </Show>

      <Show when={loaded()}>
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
            <ThinkingIndicator />
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
  )
}
