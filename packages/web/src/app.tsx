import { type ParentProps, createSignal, createResource, Show } from "solid-js"
import { A, useLocation } from "@solidjs/router"
import { routes } from "./routes"
import { api } from "./lib/api"
import { AuthGuideModal } from "./components/auth-guide-modal"

function AuthSection() {
  const [authData, { refetch }] = createResource(() => api.auth.status())
  const [apiKeyInput, setApiKeyInput] = createSignal("")
  const [showKeyInput, setShowKeyInput] = createSignal(false)
  const [loading, setLoading] = createSignal(false)
  const [deviceCode, setDeviceCode] = createSignal<{ url: string; userCode: string } | null>(null)
  const [showGuide, setShowGuide] = createSignal(false)

  const isLoggedIn = () => authData()?.providers.includes("openai") ?? false

  async function handleDeviceLogin() {
    setLoading(true)
    try {
      const { url, userCode } = await api.auth.login()
      setDeviceCode({ url, userCode })
      window.open(url, "_blank")
      const poll = setInterval(async () => {
        const status = await api.auth.status()
        if (status.providers.includes("openai")) {
          clearInterval(poll)
          setDeviceCode(null)
          setLoading(false)
          refetch()
        }
      }, 3000)
      setTimeout(() => {
        clearInterval(poll)
        setDeviceCode(null)
        setLoading(false)
      }, 5 * 60 * 1000)
    } catch {
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
    refetch()
  }

  async function handleLogout() {
    await api.auth.logout()
    refetch()
  }

  return (
    <div class="p-3 border-t border-border space-y-2">
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
      <p class="text-[10px] text-text-dim text-center">v0.1.0</p>
      <AuthGuideModal open={showGuide()} onClose={() => setShowGuide(false)} />
    </div>
  )
}

export default function App(props: ParentProps) {
  const location = useLocation()

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
    </div>
  )
}
