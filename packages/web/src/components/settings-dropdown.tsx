import { createSignal, createEffect, onCleanup, onMount, Show, For } from "solid-js"
import { api, type UpdateStatus, type UpdateProgress } from "../lib/api"
import { showToast } from "./toast-provider"
import { changelog } from "../changelog"
import { SettingsIcon } from "./lucide-icons"

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function ChangelogModal(props: { open: boolean; onClose: () => void }) {
  createEffect(() => {
    if (!props.open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        props.onClose()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    onCleanup(() => document.removeEventListener("keydown", onKeyDown))
  })

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/60" onClick={props.onClose} />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="변경 내역"
          class="relative bg-bg-card border border-border rounded-xl w-full max-w-md max-h-[70vh] shadow-2xl flex flex-col"
        >
          <div class="flex items-center justify-between px-5 py-3 border-b border-border">
            <h3 class="text-sm font-semibold">변경 내역</h3>
            <button onClick={props.onClose} class="text-text-dim hover:text-text text-lg leading-none">×</button>
          </div>
          <div class="overflow-y-auto px-5 py-4 space-y-5 text-sm text-left">
            <For each={changelog}>
              {(entry) => (
                <div class="space-y-2">
                  <div class="flex items-baseline gap-2">
                    <span class="font-semibold text-accent">v{entry.version}</span>
                    <span class="text-[11px] text-text-dim">{entry.date}</span>
                  </div>
                  <Show when={entry.features?.length}>
                    <div>
                      <p class="text-[11px] font-medium text-text-dim mb-1">새 기능</p>
                      <ul class="space-y-1">
                        <For each={entry.features}>{(f) => <li class="text-text-dim leading-snug">• {f}</li>}</For>
                      </ul>
                    </div>
                  </Show>
                  <Show when={entry.improvements?.length}>
                    <div>
                      <p class="text-[11px] font-medium text-text-dim mb-1">개선</p>
                      <ul class="space-y-1">
                        <For each={entry.improvements}>{(f) => <li class="text-text-dim leading-snug">• {f}</li>}</For>
                      </ul>
                    </div>
                  </Show>
                  <Show when={entry.fixes?.length}>
                    <div>
                      <p class="text-[11px] font-medium text-text-dim mb-1">수정</p>
                      <ul class="space-y-1">
                        <For each={entry.fixes}>{(f) => <li class="text-text-dim leading-snug">• {f}</li>}</For>
                      </ul>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </Show>
  )
}

export function SettingsDropdown() {
  const [open, setOpen] = createSignal(false)
  const [update, setUpdate] = createSignal<UpdateStatus | null>(null)
  const [progress, setProgress] = createSignal<UpdateProgress | null>(null)
  const [showChangelog, setShowChangelog] = createSignal(false)
  const [countdown, setCountdown] = createSignal(0)
  const [migrating, setMigrating] = createSignal(false)
  const [exporting, setExporting] = createSignal(false)
  const [importing, setImporting] = createSignal(false)
  const [confirming, setConfirming] = createSignal(false)
  let ref: HTMLDivElement | undefined
  let fileInputRef: HTMLInputElement | undefined
  let pollTimer: ReturnType<typeof setInterval> | undefined
  let countdownTimer: ReturnType<typeof setInterval> | undefined

  onCleanup(() => {
    clearInterval(pollTimer)
    clearInterval(countdownTimer)
  })

  onMount(async () => {
    try {
      setUpdate(await api.update.check())
    } catch {}
  })

  createEffect(() => {
    if (!open()) return
    function onClick(e: MouseEvent) {
      if (ref && !ref.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    onCleanup(() => document.removeEventListener("mousedown", onClick))
  })

  async function handleMigrate() {
    if (migrating()) return
    setMigrating(true)
    try {
      await api.migrate()
      showToast.success("DB 업데이트가 적용되었습니다")
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "DB 업데이트 적용 실패")
    } finally {
      setMigrating(false)
    }
  }

  async function handleExport() {
    if (exporting()) return
    setExporting(true)
    try {
      const a = document.createElement("a")
      a.href = api.data.exportUrl
      a.download = `dramacode-backup-${new Date().toISOString().slice(0, 10)}.zip`
      a.click()
      showToast.success("백업 파일 다운로드를 시작합니다")
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "내보내기 실패")
    } finally {
      setExporting(false)
    }
  }

  async function handleImport(file: File) {
    if (importing()) return
    setImporting(true)
    try {
      const result = await api.data.import(file)
      showToast.success(result.message)
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : "불러오기 실패")
    } finally {
      setImporting(false)
    }
  }

  function startPolling() {
    pollTimer = setInterval(async () => {
      try {
        const p = await api.update.progress()
        setProgress(p)
        if (p.step === "downloaded") {
          clearInterval(pollTimer)
          setProgress({ step: "applying", percent: 100, error: null })
          try {
            await api.update.apply()
            setProgress({ step: "restarting", percent: 100, error: null })
            setCountdown(3)
            countdownTimer = setInterval(() => {
              setCountdown((c) => {
                if (c <= 1) {
                  clearInterval(countdownTimer)
                  return 0
                }
                return c - 1
              })
            }, 1000)
          } catch (err) {
            setProgress({ step: "error", percent: 0, error: err instanceof Error ? err.message : "적용 실패" })
          }
        }
        if (p.step === "error") clearInterval(pollTimer)
      } catch {}
    }, 500)
  }

  async function handleStart() {
    setProgress({ step: "downloading", percent: 0, error: null })
    try {
      await api.update.start()
      startPolling()
    } catch (err) {
      setProgress({ step: "error", percent: 0, error: err instanceof Error ? err.message : "시작 실패" })
    }
  }

  function handleRetry() {
    setProgress(null)
    setCountdown(0)
    clearInterval(pollTimer)
    clearInterval(countdownTimer)
  }

  async function handleShutdown() {
    if (!confirming()) {
      setConfirming(true)
      setTimeout(() => setConfirming(false), 3000)
      return
    }
    try {
      await api.shutdown()
    } catch {
      showToast.error("서버 종료 요청 실패")
    }
  }

  const p = () => progress()
  const isActive = () => p() && p()!.step !== "idle"

  return (
    <>
      <div ref={ref} class="relative">
        <button
          onClick={() => setOpen(!open())}
          class="flex items-center justify-center w-9 h-9 md:w-8 md:h-8 rounded-md text-text-dim hover:text-text hover:bg-bg-hover transition-colors"
          title="설정"
        >
          <SettingsIcon class="w-4 h-4 md:w-[18px] md:h-[18px]" />
        </button>
        <Show when={open()}>
          <div class="fixed right-2 top-12 w-[min(16rem,calc(100vw-1rem))] bg-bg-card border border-border rounded-lg shadow-2xl animate-dropdown-in z-[140] md:absolute md:right-0 md:top-full md:mt-1 md:w-64">
            <div class="p-3 space-y-2">
              <Show when={isActive()}>
                <div class="space-y-1.5">
                  <Show when={p()!.step === "downloading"}>
                    <div class="w-full h-1.5 bg-border rounded-full overflow-hidden">
                      <div
                        class="h-full bg-accent rounded-full transition-all duration-300"
                        style={{ width: `${p()!.percent}%` }}
                      />
                    </div>
                    <p class="text-[10px] text-text-dim">다운로드 중… {p()!.percent}%</p>
                  </Show>
                  <Show when={p()!.step === "applying"}>
                    <p class="text-[10px] text-accent animate-pulse">적용 중…</p>
                  </Show>
                  <Show when={p()!.step === "restarting"}>
                    <p class="text-[10px] text-success font-medium">
                      {countdown() > 0 ? `${countdown()}초 후 재시작…` : "재시작 중…"}
                    </p>
                  </Show>
                  <Show when={p()!.step === "error"}>
                    <p class="text-[10px] text-danger">{p()!.error}</p>
                    <button
                      onClick={handleRetry}
                      class="w-full px-2 py-1 text-[10px] font-medium rounded-md border border-danger/30 text-danger hover:bg-danger/10 transition-colors"
                    >
                      다시 시도
                    </button>
                  </Show>
                </div>
              </Show>

              <Show when={!isActive()}>
                <div class="flex items-center justify-between">
                  <span class="text-[10px] text-text-dim">
                    v{update()?.version ?? "0.1.0"}
                  </span>
                  <button
                    onClick={() => setShowChangelog(true)}
                    class="text-[10px] text-accent/70 hover:text-accent underline underline-offset-2 transition-colors"
                  >
                    변경내역
                  </button>
                </div>

                <Show when={update()?.hasUpdate}>
                  <button
                    onClick={handleStart}
                    class="w-full px-2 py-1 text-[10px] font-medium rounded-md bg-success/15 text-success hover:bg-success/25 transition-colors"
                  >
                    v{update()!.latest} 업데이트 ({formatBytes(update()!.size)})
                  </button>
                </Show>
              </Show>

              <button
                onClick={handleMigrate}
                disabled={migrating()}
                class="w-full text-left px-2 py-1.5 text-xs text-text-dim hover:text-text hover:bg-bg-hover rounded-md transition-colors disabled:opacity-50"
              >
                {migrating() ? "DB 업데이트 적용 중…" : "DB 업데이트 적용"}
              </button>

              <div class="h-px bg-border" />

              <button
                onClick={handleExport}
                disabled={exporting()}
                class="w-full text-left px-2 py-1.5 text-xs text-text-dim hover:text-text hover:bg-bg-hover rounded-md transition-colors disabled:opacity-50"
              >
                {exporting() ? "준비 중…" : "데이터 내보내기"}
              </button>
              <button
                onClick={() => fileInputRef?.click()}
                disabled={importing()}
                class="w-full text-left px-2 py-1.5 text-xs text-text-dim hover:text-text hover:bg-bg-hover rounded-md transition-colors disabled:opacity-50"
              >
                {importing() ? "불러오는 중…" : "데이터 불러오기"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                class="hidden"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0]
                  if (file) handleImport(file)
                  e.currentTarget.value = ""
                }}
              />

              <div class="h-px bg-border" />

              <button
                onClick={handleShutdown}
                class="w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors"
                classList={{
                  "text-text-dim hover:text-danger hover:bg-danger/10": !confirming(),
                  "text-danger bg-danger/10 font-medium": confirming(),
                }}
              >
                {confirming() ? "한번 더 클릭하면 종료됩니다" : "앱 종료"}
              </button>
            </div>
          </div>
        </Show>
      </div>
      <ChangelogModal open={showChangelog()} onClose={() => setShowChangelog(false)} />
    </>
  )
}
