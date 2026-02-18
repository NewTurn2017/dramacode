import { createSignal, createEffect, createMemo, For, Show, onMount, onCleanup } from "solid-js"
import { api, chatImageUrl, type Message, type ChatImage } from "@/lib/api"
import { showToast } from "@/components/toast-provider"
import { Markdown } from "./markdown"
import { ThinkingIndicator } from "./thinking"

const STREAM_STALL_MS = 180_000
const SCROLL_NEAR_BOTTOM_PX = 80
const TEXTAREA_LINE_HEIGHT = 24
const TEXTAREA_MAX_ROWS = 3
const TEXTAREA_PADDING = 20
const IMAGE_MAX_SIZE = 10 * 1024 * 1024
const IMAGE_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"]

type PendingImage = { file: File; preview: string; data: string; mediaType: string }

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(",")[1]!)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function parseMessageImages(msg: Message): string[] {
  if (!msg.images) return []
  try {
    const parsed = JSON.parse(msg.images)
    if (!Array.isArray(parsed)) return []
    return parsed.map((f: string) =>
      f.startsWith("blob:") || f.startsWith("http") ? f : chatImageUrl(f),
    )
  } catch {
    return []
  }
}

export function ChatPanel(props: {
  sessionId: string
  visible: boolean
  onTitleChange?: (title: string) => void
  onScrap?: (content: string) => void
}) {
  const [messages, setMessages] = createSignal<Message[]>([])
  const [input, setInput] = createSignal("")
  const [streaming, setStreaming] = createSignal(false)
  const [streamText, setStreamText] = createSignal("")
  const [loaded, setLoaded] = createSignal(false)
  const [queue, setQueue] = createSignal<string[]>([])
  const [organizing, setOrganizing] = createSignal(false)
  const [stickToBottom, setStickToBottom] = createSignal(true)
  const [searchOpen, setSearchOpen] = createSignal(false)
  const [searchQuery, setSearchQuery] = createSignal("")
  const [searchIdx, setSearchIdx] = createSignal(0)
  const [scrapPopup, setScrapPopup] = createSignal<{ x: number; y: number; text: string } | null>(null)
  const [pendingImages, setPendingImages] = createSignal<PendingImage[]>([])
  let scrollRef: HTMLDivElement | undefined
  let inputRef: HTMLTextAreaElement | undefined
  let fileRef: HTMLInputElement | undefined
  let abortRef: AbortController | undefined

  onCleanup(() => abortRef?.abort())

  function handleTextSelect() {
    if (!props.onScrap) return
    const sel = window.getSelection()
    const text = sel?.toString().trim()
    if (!text || text.length < 2) { setScrapPopup(null); return }
    const range = sel?.getRangeAt(0)
    if (!range) return
    const rect = range.getBoundingClientRect()
    const containerRect = scrollRef?.getBoundingClientRect()
    if (!containerRect) return
    setScrapPopup({ x: rect.left - containerRect.left + rect.width / 2, y: rect.top - containerRect.top - 8, text })
  }

  function saveScrap() {
    const popup = scrapPopup()
    if (!popup || !props.onScrap) return
    props.onScrap(popup.text)
    window.getSelection()?.removeAllRanges()
    setScrapPopup(null)
  }

  function isNearBottom() {
    if (!scrollRef) return true
    return scrollRef.scrollHeight - scrollRef.scrollTop - scrollRef.clientHeight < SCROLL_NEAR_BOTTOM_PX
  }

  function handleScroll() {
    setStickToBottom(isNearBottom())
  }

  function scrollToBottom(instant = false) {
    if (!scrollRef) return
    if (instant) {
      scrollRef.scrollTop = scrollRef.scrollHeight
      return
    }
    scrollRef.scrollTo({ top: scrollRef.scrollHeight, behavior: "smooth" })
  }

  function jumpToBottom() {
    setStickToBottom(true)
    scrollToBottom()
  }

  createEffect(() => {
    messages()
    streamText()
    queue()
    if (props.visible && stickToBottom()) requestAnimationFrame(() => scrollToBottom())
  })

  const searchMatches = createMemo(() => {
    const q = searchQuery().toLowerCase().trim()
    if (!q) return [] as number[]
    return messages()
      .map((m, i) => (m.content.toLowerCase().includes(q) ? i : -1))
      .filter((i) => i >= 0)
  })

  function scrollToMatch(idx: number) {
    const indices = searchMatches()
    if (!indices.length) return
    const msgIdx = indices[idx]
    const el = scrollRef?.querySelector(`[data-msg-idx="${msgIdx}"]`)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  function nextMatch() {
    const len = searchMatches().length
    if (!len) return
    const next = (searchIdx() + 1) % len
    setSearchIdx(next)
    scrollToMatch(next)
  }

  function prevMatch() {
    const len = searchMatches().length
    if (!len) return
    const prev = (searchIdx() - 1 + len) % len
    setSearchIdx(prev)
    scrollToMatch(prev)
  }

  function handleSearchInput(value: string) {
    setSearchQuery(value)
    setSearchIdx(0)
    if (value.trim()) requestAnimationFrame(() => scrollToMatch(0))
  }

  function closeSearch() {
    setSearchOpen(false)
    setSearchQuery("")
    setSearchIdx(0)
  }

  function handleSearchKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") { closeSearch(); return }
    if (e.key === "Enter") { e.preventDefault(); e.shiftKey ? prevMatch() : nextMatch() }
  }

  function resizeTextarea() {
    if (!inputRef) return
    inputRef.style.height = "auto"
    const max = TEXTAREA_LINE_HEIGHT * TEXTAREA_MAX_ROWS + TEXTAREA_PADDING
    inputRef.style.height = `${Math.min(inputRef.scrollHeight, max)}px`
  }

  async function handleImageSelect(files: FileList | null) {
    if (!files) return
    const items: PendingImage[] = []
    for (const file of Array.from(files)) {
      if (!IMAGE_ALLOWED_TYPES.includes(file.type)) {
        showToast.error(`지원하지 않는 이미지 형식: ${file.type}`)
        continue
      }
      if (file.size > IMAGE_MAX_SIZE) {
        showToast.error(`이미지가 너무 큽니다 (최대 10MB)`)
        continue
      }
      const data = await fileToBase64(file)
      items.push({ file, preview: URL.createObjectURL(file), data, mediaType: file.type })
    }
    setPendingImages((prev) => [...prev, ...items])
    if (fileRef) fileRef.value = ""
  }

  function removeImage(idx: number) {
    setPendingImages((prev) => {
      URL.revokeObjectURL(prev[idx]!.preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  function clearImages() {
    pendingImages().forEach((img) => URL.revokeObjectURL(img.preview))
    setPendingImages([])
  }

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

  async function doStream(text: string, images?: ChatImage[]) {
    abortRef?.abort()
    abortRef = new AbortController()
    const { signal } = abortRef

    setStreamText("")
    try {
      const res = await api.chat.stream(props.sessionId, text, signal, undefined, images)
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
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") { /* user cancel */ }
      else showToast.error(err instanceof Error ? err.message : "메시지 전송 실패")
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
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") { /* user cancel */ }
      else showToast.error(err instanceof Error ? err.message : "인사말 로드 실패")
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
    const images = pendingImages()
    if (!text && !images.length) return

    const content = text || (images.length ? "이 이미지를 분석해주세요." : "")
    const imagePayload: ChatImage[] | undefined = images.length
      ? images.map((img) => ({ data: img.data, mediaType: img.mediaType }))
      : undefined
    const tempImages = images.length
      ? JSON.stringify(images.map((img) => img.preview))
      : undefined

    setInput("")
    setPendingImages([])
    if (inputRef) inputRef.style.height = "auto"

    if (!streaming()) {
      setMessages((prev) => [
        ...prev,
        {
          id: `temp-user-${Date.now()}`,
          session_id: props.sessionId,
          role: "user",
          content,
          images: tempImages,
          time_created: Date.now(),
        },
      ])
      setStreaming(true)
      void doStream(content, imagePayload)
    } else {
      setQueue((prev) => [...prev, content])
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
    if (e.isComposing) return
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend(e)
    }
  }

  const isSearchMatch = (idx: number) => searchMatches().includes(idx)
  const isCurrentMatch = (idx: number) => searchMatches()[searchIdx()] === idx

  return (
    <div class="flex flex-col h-full" style={{ display: props.visible ? "flex" : "none" }}>
      <Show when={!loaded()}>
        <div class="flex-1 flex items-center justify-center">
          <ThinkingIndicator />
        </div>
      </Show>

      <Show when={loaded()}>
        <Show when={searchOpen()}>
          <div class="shrink-0 border-b border-accent/30 bg-accent/5 px-5 py-2">
            <div class="max-w-3xl mx-auto flex items-center gap-2 bg-accent/10 border border-accent/30 rounded-lg px-3 py-1.5">
              <span class="text-accent text-xs shrink-0">🔍</span>
              <input
                type="text"
                value={searchQuery()}
                onInput={(e) => handleSearchInput(e.currentTarget.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="대화 내용 검색..."
                autofocus
                class="flex-1 bg-transparent border-none text-sm text-text placeholder:text-accent/50 focus:outline-none"
              />
              <Show when={searchQuery().trim()}>
                <span class="text-text-dim text-xs shrink-0">
                  {searchMatches().length > 0 ? `${searchIdx() + 1}/${searchMatches().length}` : "0건"}
                </span>
                <button onClick={prevMatch} class="text-text-dim hover:text-text text-xs px-1" title="이전 (Shift+Enter)">▲</button>
                <button onClick={nextMatch} class="text-text-dim hover:text-text text-xs px-1" title="다음 (Enter)">▼</button>
              </Show>
              <button onClick={closeSearch} class="text-text-dim hover:text-text text-xs px-1">✕</button>
            </div>
          </div>
        </Show>

        <div class="relative flex-1 min-h-0">
          <div ref={scrollRef} onScroll={handleScroll} onMouseUp={handleTextSelect} class="h-full overflow-y-auto">
            <div class="max-w-3xl mx-auto px-5 py-6 space-y-5">
              <Show when={messages().length === 0 && !streaming()}>
                <div class="flex items-center justify-center h-48">
                  <p class="text-text-dim text-sm">대화를 시작하세요</p>
                </div>
              </Show>

              <For each={messages()}>
                {(msg, i) => (
                  <div
                    data-msg-idx={i()}
                    classList={{
                      "ring-1 ring-accent/40 rounded-lg": isSearchMatch(i()) && !isCurrentMatch(i()),
                      "ring-2 ring-accent rounded-lg bg-accent/5": isCurrentMatch(i()),
                    }}
                  >
                    <Show
                      when={msg.role === "assistant"}
                      fallback={
                        <div class="flex justify-end">
                          <div class="max-w-[75%] px-4 py-2.5 rounded-2xl rounded-br-sm text-sm whitespace-pre-wrap bg-accent/15 text-text border border-accent/20">
                            {(() => {
                              const imgs = parseMessageImages(msg)
                              return (
                                <Show when={imgs.length > 0}>
                                  <div class="flex gap-2 flex-wrap mb-2">
                                    <For each={imgs}>
                                      {(src) => (
                                        <img
                                          src={src}
                                          alt=""
                                          class="max-w-[200px] max-h-[200px] rounded-lg object-cover border border-border/40"
                                          loading="lazy"
                                        />
                                      )}
                                    </For>
                                  </div>
                                </Show>
                              )
                            })()}
                            {msg.content.replace(/\n\n\[이미지 \d+장 첨부\]$/, "")}
                          </div>
                        </div>
                      }
                    >
                      <div class="text-sm leading-relaxed">
                        <Markdown content={msg.content} />
                      </div>
                    </Show>
                  </div>
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

          <Show when={!stickToBottom()}>
            <button
              onClick={jumpToBottom}
              class="absolute bottom-3 right-6 w-8 h-8 rounded-full bg-bg-card border border-border text-text-dim hover:text-text hover:border-accent/60 flex items-center justify-center shadow-lg transition-colors text-xs"
              title="최신으로 이동"
            >
              ↓
            </button>
          </Show>

          <Show when={scrapPopup()}>
            {(popup) => (
              <button
                onClick={saveScrap}
                class="absolute z-10 px-2.5 py-1 rounded-md bg-accent text-white text-xs font-medium shadow-lg hover:bg-accent-hover transition-colors -translate-x-1/2 -translate-y-full"
                style={{ left: `${popup().x}px`, top: `${popup().y}px` }}
              >
                스크랩
              </button>
            )}
          </Show>
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
          <input
            ref={fileRef}
            type="file"
            accept={IMAGE_ALLOWED_TYPES.join(",")}
            multiple
            class="hidden"
            onChange={(e) => handleImageSelect(e.currentTarget.files)}
          />
          <Show when={pendingImages().length > 0}>
            <div class="max-w-3xl mx-auto px-5 pt-2">
              <div class="flex gap-2 flex-wrap">
                <For each={pendingImages()}>
                  {(img, i) => (
                    <div class="relative group w-16 h-16 rounded-lg overflow-hidden border border-border">
                      <img src={img.preview} alt="" class="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(i())}
                        class="absolute top-0 right-0 w-5 h-5 bg-black/70 text-white text-xs flex items-center justify-center rounded-bl-md opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
          <form onSubmit={handleSend} class="max-w-3xl mx-auto px-5 py-3">
            <div class="flex gap-2 items-end">
              <button
                type="button"
                onClick={() => fileRef?.click()}
                class="px-2.5 py-2.5 bg-bg-card border border-border text-text-dim text-sm rounded-lg hover:border-accent/60 hover:text-text transition-colors shrink-0"
                title="이미지 첨부"
              >
                📎
              </button>
              <textarea
                ref={inputRef}
                value={input()}
                onInput={(e) => {
                  setInput(e.currentTarget.value)
                  resizeTextarea()
                }}
                onKeyDown={handleKeyDown}
                placeholder="메시지를 입력하세요..."
                rows={1}
                class="flex-1 px-3.5 py-2.5 bg-bg-card border border-border rounded-lg text-sm text-text placeholder:text-text-dim resize-none focus:outline-none focus:border-accent/60 transition-colors"
              />
              <button
                type="button"
                onClick={() => setSearchOpen((p) => !p)}
                class="px-3 py-2.5 bg-bg-card border border-border text-text-dim text-xs font-medium rounded-lg hover:border-accent/60 hover:text-text transition-colors shrink-0"
                classList={{ "border-accent/60 text-text": searchOpen() }}
                title="대화 검색 (Ctrl+F)"
              >
                검색
              </button>
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
                disabled={!input().trim() && !pendingImages().length}
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
