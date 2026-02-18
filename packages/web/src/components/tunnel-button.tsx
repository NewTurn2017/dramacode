import { createSignal, createEffect, onCleanup, Show } from "solid-js"
import { api, type TunnelStatus } from "../lib/api"
import { showToast } from "./toast-provider"
import { GlobeIcon, CopyIcon, CheckIcon } from "./lucide-icons"

export function TunnelButton() {
  const [status, setStatus] = createSignal<TunnelStatus>({ state: "idle", url: null, error: null })
  const [open, setOpen] = createSignal(false)
  const [copied, setCopied] = createSignal(false)
  let ref: HTMLDivElement | undefined

  createEffect(() => {
    api.tunnel.status().then(setStatus).catch(() => {})
  })

  createEffect(() => {
    if (!open()) return
    function onClick(e: MouseEvent) {
      if (ref && !ref.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    onCleanup(() => document.removeEventListener("mousedown", onClick))
  })

  const isLoading = () => {
    const s = status().state
    return s === "installing" || s === "connecting"
  }

  const isConnected = () => status().state === "connected"

  async function handleToggle() {
    if (isLoading()) return

    if (isConnected()) {
      try {
        setStatus(await api.tunnel.stop())
        showToast.success("터널이 종료되었습니다")
      } catch (err) {
        showToast.error(err instanceof Error ? err.message : "터널 종료 실패")
      }
    } else {
      setStatus({ state: "connecting", url: null, error: null })
      try {
        const result = await api.tunnel.start()
        setStatus(result)
        if (result.state === "connected" && result.url) {
          showToast.success("퍼블릭 URL이 생성되었습니다")
        } else if (result.state === "error") {
          showToast.error(result.error ?? "터널 연결 실패")
        }
      } catch (err) {
        setStatus({ state: "error", url: null, error: err instanceof Error ? err.message : "터널 연결 실패" })
        showToast.error(err instanceof Error ? err.message : "터널 연결 실패")
      }
    }
  }

  async function handleCopy() {
    const url = status().url
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast.error("클립보드 복사 실패")
    }
  }

  return (
    <div ref={ref} class="relative">
      <button
        onClick={() => {
          if (isConnected()) {
            setOpen(!open())
          } else {
            handleToggle()
          }
        }}
        disabled={isLoading()}
        class="flex items-center justify-center w-9 h-9 md:w-8 md:h-8 rounded-md transition-colors disabled:opacity-50"
        classList={{
          "text-success hover:bg-success/10": isConnected(),
          "text-text-dim hover:text-text hover:bg-bg-hover": !isConnected() && !isLoading(),
          "text-accent animate-pulse": isLoading(),
        }}
        title={isConnected() ? `공유 중: ${status().url}` : isLoading() ? "연결 중…" : "퍼블릭 URL 생성"}
      >
        <GlobeIcon class="w-4 h-4 md:w-[18px] md:h-[18px]" />
      </button>

      <Show when={open() && isConnected()}>
        <div class="fixed right-2 top-12 w-[min(20rem,calc(100vw-1rem))] bg-bg-card border border-border rounded-lg shadow-2xl animate-dropdown-in z-[140] md:absolute md:right-0 md:top-full md:mt-1 md:w-80">
          <div class="p-3 space-y-2.5">
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full bg-success shrink-0 animate-pulse" />
              <span class="text-[11px] font-medium text-success">공유 중</span>
            </div>

            <div class="flex items-center gap-1.5">
              <input
                type="text"
                readonly
                value={status().url ?? ""}
                class="flex-1 min-w-0 px-2.5 py-1.5 text-xs font-mono bg-bg rounded-md border border-border text-text truncate select-all"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={handleCopy}
                class="shrink-0 flex items-center justify-center w-8 h-8 rounded-md border border-border text-text-dim hover:text-text hover:bg-bg-hover transition-colors"
                title="복사"
              >
                <Show when={copied()} fallback={<CopyIcon class="w-3.5 h-3.5" />}>
                  <CheckIcon class="w-3.5 h-3.5 text-success" />
                </Show>
              </button>
            </div>

            <p class="text-[10px] text-text-dim leading-relaxed">
              이 URL로 외부에서 접속할 수 있습니다. Cloudflare 네트워크를 통해 HTTPS로 보호됩니다.
            </p>

            <button
              onClick={() => {
                handleToggle()
                setOpen(false)
              }}
              class="w-full px-2 py-1.5 text-xs font-medium rounded-md border border-danger/30 text-danger hover:bg-danger/10 transition-colors"
            >
              공유 중지
            </button>
          </div>
        </div>
      </Show>
    </div>
  )
}
