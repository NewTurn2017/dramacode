import { createSignal, createResource, createEffect, onCleanup, Show } from "solid-js"
import { api } from "../lib/api"
import { AuthGuideModal } from "./auth-guide-modal"
import { showToast } from "./toast-provider"

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
    clearInterval(pollRef)
    clearTimeout(pollTimeoutRef)
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

export function AuthStatusDots() {
  const [authData, { refetch }] = createResource(() => api.auth.status())
  const [open, setOpen] = createSignal(false)
  let ref: HTMLDivElement | undefined

  const providers = () => authData()?.providers ?? []
  const hasOpenAI = () => providers().includes("openai")
  const hasClaude = () => providers().includes("anthropic")

  createEffect(() => {
    if (!open()) return
    function onClick(e: MouseEvent) {
      if (ref && !ref.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    onCleanup(() => document.removeEventListener("mousedown", onClick))
  })

  return (
    <div ref={ref} class="relative">
      <button
        onClick={() => setOpen(!open())}
        class="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-bg-hover transition-colors"
        title="AI 연결 상태"
      >
        <span
          class="inline-block w-2 h-2 rounded-full transition-colors"
          classList={{
            "bg-success shadow-[0_0_4px_var(--color-success)]": hasOpenAI(),
            "bg-text-dim/30": !hasOpenAI(),
          }}
          title={hasOpenAI() ? "OpenAI 연결됨" : "OpenAI 미연결"}
        />
        <span
          class="inline-block w-2 h-2 rounded-full transition-colors"
          classList={{
            "bg-success shadow-[0_0_4px_var(--color-success)]": hasClaude(),
            "bg-text-dim/30": !hasClaude(),
          }}
          title={hasClaude() ? "Claude 연결됨" : "Claude 미연결"}
        />
      </button>
      <Show when={open()}>
        <div class="absolute right-0 top-full mt-1 w-72 bg-bg-card border border-border rounded-lg shadow-2xl animate-dropdown-in z-50">
          <div class="p-3 space-y-3">
            <div class="space-y-1.5">
              <p class="text-[10px] font-medium text-text-dim uppercase tracking-wider">OpenAI</p>
              <OpenAIAuthSection providers={providers()} onUpdate={refetch} />
            </div>
            <div class="h-px bg-border" />
            <div class="space-y-1.5">
              <p class="text-[10px] font-medium text-text-dim uppercase tracking-wider">Anthropic</p>
              <AnthropicAuthSection providers={providers()} onUpdate={refetch} />
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
