import { type ParentProps, createSignal, createResource, Show, For, onMount, onCleanup, createEffect } from "solid-js"
import { A, useLocation } from "@solidjs/router"
import { routes } from "./routes"
import { api, type UpdateStatus, type UpdateProgress } from "./lib/api"
import { AuthGuideModal } from "./components/auth-guide-modal"
import { ToastProvider, showToast } from "./components/toast-provider"
import { CommandPalette } from "./components/command-palette"
import { changelog } from "./changelog"

function OpenAIAuthSection(props: { providers: string[]; onUpdate: () => void }) {
  const [apiKeyInput, setApiKeyInput] = createSignal("")
  const [showKeyInput, setShowKeyInput] = createSignal(false)
  const [loading, setLoading] = createSignal(false)
  const [deviceCode, setDeviceCode] = createSignal<{ url: string; userCode: string } | null>(null)
  const [showGuide, setShowGuide] = createSignal(false)
  let pollRef: ReturnType<typeof setInterval> | undefined
  let pollTimeoutRef: ReturnType<typeof setTimeout> | undefined

  onCleanup(() => {
    clearInterval(pollRef)
    clearTimeout(pollTimeoutRef)
  })

  const isLoggedIn = () => props.providers.includes("openai")

  async function handleDeviceLogin() {
    setLoading(true)
    try {
      const { url, userCode } = await api.auth.login()
      setDeviceCode({ url, userCode })
      window.open(url, "_blank")
      pollRef = setInterval(async () => {
        const status = await api.auth.status()
        if (status.providers.includes("openai")) {
          clearInterval(pollRef)
          setDeviceCode(null)
          setLoading(false)
          props.onUpdate()
        }
      }, 3000)
      pollTimeoutRef = setTimeout(() => {
        clearInterval(pollRef)
        setDeviceCode(null)
        setLoading(false)
      }, 5 * 60 * 1000)
    } catch {
      showToast.error("로그인 시작에 실패했습니다")
      setDeviceCode(null)
      setLoading(false)
    }
  }

  async function handleSetKey() {
    const key = apiKeyInput().trim()
    if (!key) return
    await api.auth.setKey(key)
    setApiKeyInput("")
    setShowKeyInput(false)
    props.onUpdate()
  }

  async function handleLogout() {
    await api.auth.logout()
    props.onUpdate()
  }

  return (
    <>
      <Show
        when={isLoggedIn()}
        fallback={
          <div class="space-y-1.5">
            <Show when={deviceCode()}>
              {(code) => (
                <div class="p-2 rounded-md bg-bg border border-border space-y-1.5">
                  <p class="text-[10px] text-text-dim">아래 코드를 입력하세요:</p>
                  <p class="text-sm font-mono font-bold text-accent text-center tracking-widest">
                    {code().userCode}
                  </p>
                  <a
                    href={code().url}
                    target="_blank"
                    rel="noopener"
                    class="block text-[10px] text-accent hover:underline text-center"
                  >
                    인증 페이지 열기 ↗
                  </a>
                  <p class="text-[10px] text-text-dim text-center">인증 대기 중…</p>
                </div>
              )}
            </Show>
            <Show when={!deviceCode()}>
              <div class="flex gap-1">
                <button
                  onClick={handleDeviceLogin}
                  disabled={loading()}
                  class="flex-1 px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                  OpenAI 로그인
                </button>
                <button
                  onClick={() => setShowGuide(true)}
                  class="shrink-0 w-7 py-1.5 text-xs font-medium rounded-md border border-border text-text-dim hover:text-accent hover:border-accent transition-colors"
                  title="인증 가이드"
                >
                  ?
                </button>
              </div>
              <Show
                when={showKeyInput()}
                fallback={
                  <button
                    onClick={() => setShowKeyInput(true)}
                    class="w-full px-3 py-1.5 text-xs text-text-dim hover:text-text border border-border rounded-md hover:bg-bg-hover transition-colors"
                  >
                    API 키 직접 입력
                  </button>
                }
              >
                <div class="flex gap-1">
                  <input
                    type="password"
                    placeholder="sk-..."
                    value={apiKeyInput()}
                    onInput={(e) => setApiKeyInput(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSetKey()}
                    class="flex-1 min-w-0 px-2 py-1 text-xs bg-bg border border-border rounded-md text-text placeholder:text-text-dim/50 focus:outline-none focus:border-accent"
                  />
                  <button
                    onClick={handleSetKey}
                    class="px-2 py-1 text-xs bg-accent text-white rounded-md hover:bg-accent-hover transition-colors"
                  >
                    저장
                  </button>
                </div>
              </Show>
            </Show>
          </div>
        }
      >
        <div class="flex items-center justify-between">
          <span class="text-xs text-success">● OpenAI 연결됨</span>
          <button onClick={handleLogout} class="text-xs text-text-dim hover:text-danger transition-colors">
            로그아웃
          </button>
        </div>
      </Show>
      <AuthGuideModal open={showGuide()} onClose={() => setShowGuide(false)} />
    </>
  )
}

function AnthropicAuthSection(props: { providers: string[]; onUpdate: () => void }) {
  const [loading, setLoading] = createSignal(false)
  const [pendingAuth, setPendingAuth] = createSignal<{ url: string; verifier: string } | null>(null)
  const [codeInput, setCodeInput] = createSignal("")
  const [error, setError] = createSignal("")
  const [showKeyInput, setShowKeyInput] = createSignal(false)
  const [apiKeyInput, setApiKeyInput] = createSignal("")

  const isLoggedIn = () => props.providers.includes("anthropic")

  async function handleLogin() {
    setLoading(true)
    setError("")
    try {
      const { url, verifier } = await api.auth.anthropic.login()
      setPendingAuth({ url, verifier })
      window.open(url, "_blank")
    } catch {
      setError("로그인 시작 실패")
    } finally {
      setLoading(false)
    }
  }

  async function handleCodeSubmit() {
    const code = codeInput().trim()
    const auth = pendingAuth()
    if (!code || !auth) return
    setLoading(true)
    setError("")
    try {
      await api.auth.anthropic.callback(code, auth.verifier)
      setPendingAuth(null)
      setCodeInput("")
      props.onUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : "인증 코드 교환 실패")
    } finally {
      setLoading(false)
    }
  }

  async function handleSetKey() {
    const key = apiKeyInput().trim()
    if (!key) return
    await api.auth.anthropic.setKey(key)
    setApiKeyInput("")
    setShowKeyInput(false)
    props.onUpdate()
  }

  async function handleLogout() {
    await api.auth.anthropic.logout()
    props.onUpdate()
  }

  return (
    <Show
      when={isLoggedIn()}
      fallback={
        <div class="space-y-1.5">
          <Show when={pendingAuth()}>
            <div class="p-2 rounded-md bg-bg border border-border space-y-1.5">
              <p class="text-[10px] text-text-dim">인증 완료 후 코드를 붙여넣으세요:</p>
              <div class="flex gap-1">
                <input
                  type="text"
                  placeholder="코드 붙여넣기"
                  value={codeInput()}
                  onInput={(e) => setCodeInput(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCodeSubmit()}
                  class="flex-1 min-w-0 px-2 py-1 text-xs bg-bg border border-border rounded-md text-text placeholder:text-text-dim/50 focus:outline-none focus:border-accent font-mono"
                />
                <button
                  onClick={handleCodeSubmit}
                  disabled={loading() || !codeInput().trim()}
                  class="px-2 py-1 text-xs bg-[#d4956b] text-white rounded-md hover:bg-[#c4854b] transition-colors disabled:opacity-50"
                >
                  확인
                </button>
              </div>
              <a
                href={pendingAuth()!.url}
                target="_blank"
                rel="noopener"
                class="block text-[10px] text-[#d4956b] hover:underline text-center"
              >
                인증 페이지 다시 열기 ↗
              </a>
              <button
                onClick={() => { setPendingAuth(null); setCodeInput(""); setError("") }}
                class="w-full text-[10px] text-text-dim hover:text-text transition-colors"
              >
                취소
              </button>
            </div>
          </Show>
          <Show when={!pendingAuth()}>
            <button
              onClick={handleLogin}
              disabled={loading()}
              class="w-full px-3 py-1.5 text-xs font-medium rounded-md bg-[#d4956b] text-white hover:bg-[#c4854b] transition-colors disabled:opacity-50"
            >
              Claude 로그인
            </button>
            <Show
              when={showKeyInput()}
              fallback={
                <button
                  onClick={() => setShowKeyInput(true)}
                  class="w-full px-3 py-1.5 text-xs text-text-dim hover:text-text border border-border rounded-md hover:bg-bg-hover transition-colors"
                >
                  Anthropic API 키 입력
                </button>
              }
            >
              <div class="flex gap-1">
                <input
                  type="password"
                  placeholder="sk-ant-..."
                  value={apiKeyInput()}
                  onInput={(e) => setApiKeyInput(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSetKey()}
                  class="flex-1 min-w-0 px-2 py-1 text-xs bg-bg border border-border rounded-md text-text placeholder:text-text-dim/50 focus:outline-none focus:border-accent"
                />
                <button
                  onClick={handleSetKey}
                  class="px-2 py-1 text-xs bg-[#d4956b] text-white rounded-md hover:bg-[#c4854b] transition-colors"
                >
                  저장
                </button>
              </div>
            </Show>
          </Show>
          <Show when={error()}>
            <p class="text-[10px] text-danger text-center">{error()}</p>
          </Show>
        </div>
      }
    >
      <div class="flex items-center justify-between">
        <span class="text-xs text-success">● Claude 연결됨</span>
        <button onClick={handleLogout} class="text-xs text-text-dim hover:text-danger transition-colors">
          로그아웃
        </button>
      </div>
    </Show>
  )
}

function ShutdownButton() {
  const [confirming, setConfirming] = createSignal(false)

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

  return (
    <button
      onClick={handleShutdown}
      class="w-full px-2 py-1 text-[10px] rounded-md transition-colors"
      classList={{
        "text-text-dim hover:text-danger hover:bg-danger/10 border border-transparent hover:border-danger/20": !confirming(),
        "text-danger bg-danger/10 border border-danger/30 font-medium": confirming(),
      }}
    >
      {confirming() ? "한번 더 클릭하면 종료됩니다" : "앱 종료"}
    </button>
  )
}

function AuthSection() {
  const [authData, { refetch }] = createResource(() => api.auth.status())

  const providers = () => authData()?.providers ?? []

  return (
    <div class="p-3 border-t border-border space-y-2">
      <OpenAIAuthSection providers={providers()} onUpdate={refetch} />
      <AnthropicAuthSection providers={providers()} onUpdate={refetch} />
      <VersionBadge />
      <ShutdownButton />
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function ChangelogModal(props: { open: boolean; onClose: () => void }) {
  let dialogRef: HTMLDivElement | undefined

  createEffect(() => {
    if (!props.open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
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
          ref={dialogRef}
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

function VersionBadge() {
  const [update, setUpdate] = createSignal<UpdateStatus | null>(null)
  const [progress, setProgress] = createSignal<UpdateProgress | null>(null)
  const [showChangelog, setShowChangelog] = createSignal(false)
  const [countdown, setCountdown] = createSignal(0)
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

  const p = () => progress()
  const isActive = () => p() && p()!.step !== "idle"

  return (
    <div class="text-center space-y-1">
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
        <Show
          when={update()?.hasUpdate}
          fallback={
            <p class="text-[10px] text-text-dim">
              v{update()?.version ?? "0.1.0"}
              <button
                onClick={() => setShowChangelog(true)}
                class="ml-1 text-accent/70 hover:text-accent underline underline-offset-2 transition-colors"
              >
                변경내역
              </button>
            </p>
          }
        >
          <button
            onClick={handleStart}
            class="w-full px-2 py-1 text-[10px] font-medium rounded-md bg-success/15 text-success hover:bg-success/25 transition-colors"
          >
            v{update()!.latest} 업데이트 ({formatBytes(update()!.size)})
          </button>
        </Show>
      </Show>
      <ChangelogModal open={showChangelog()} onClose={() => setShowChangelog(false)} />
    </div>
  )
}

export default function App(props: ParentProps) {
  const location = useLocation()

  onMount(() => {
    let es: EventSource | null = null
    function connect() {
      es = new EventSource(api.aliveUrl)
      es.onerror = () => {
        es?.close()
        setTimeout(connect, 3000)
      }
    }
    connect()
    onCleanup(() => es?.close())
  })

  return (
    <div class="flex h-screen overflow-hidden">
      <nav class="w-56 shrink-0 border-r border-border bg-bg-card flex flex-col">
        <div class="p-4 border-b border-border">
          <h1 class="text-lg font-bold tracking-tight text-accent">DRAMACODE</h1>
          <p class="text-xs text-text-dim mt-0.5">AI 드라마 각본 도구</p>
        </div>
        <div class="flex-1 p-2 space-y-0.5">
          {routes.map((r) => (
            <A
              href={r.path}
              class="flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors"
              classList={{
                "bg-bg-hover text-accent":
                  location.pathname === r.path || (r.path !== "/" && location.pathname.startsWith(r.path)),
                "text-text-dim hover:text-text hover:bg-bg-hover":
                  location.pathname !== r.path && !(r.path !== "/" && location.pathname.startsWith(r.path)),
              }}
            >
              {r.label}
            </A>
          ))}
        </div>
        <AuthSection />
      </nav>
      <main class="flex-1 min-w-0 overflow-auto">{props.children}</main>
      <ToastProvider />
      <CommandPalette />
    </div>
  )
}
