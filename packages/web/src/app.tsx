import { type ParentProps, Show, onMount, onCleanup } from "solid-js"
import { A, useLocation } from "@solidjs/router"
import { routes } from "./routes"
import { api } from "./lib/api"
import { AuthStatusDots } from "./components/auth-status"
import { SettingsDropdown } from "./components/settings-dropdown"
import { TunnelButton } from "./components/tunnel-button"
import { ToastProvider } from "./components/toast-provider"
import { CommandPalette } from "./components/command-palette"

export default function App(props: ParentProps) {
  const location = useLocation()
  const isDrama = () => location.pathname.startsWith("/drama/")
  const currentRouteLabel = () => routes.find((r) => r.path === location.pathname)?.label ?? "DRAMACODE"

  onMount(() => {
    let es: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    function connect() {
      es = new EventSource(api.aliveUrl)
      es.onerror = () => {
        es?.close()
        reconnectTimer = setTimeout(connect, 3000)
      }
    }
    connect()
    onCleanup(() => {
      es?.close()
      if (reconnectTimer) clearTimeout(reconnectTimer)
    })
  })

  return (
    <div class="flex flex-col h-screen overflow-hidden">
      <Show when={!isDrama()}>
        <header class="relative z-30 h-11 shrink-0 border-b border-border bg-bg-card flex items-center px-3 sm:px-4 gap-2 sm:gap-3 min-w-0 overflow-visible">
          <A href="/" class="text-sm font-bold tracking-tight text-accent shrink-0">DRAMACODE</A>
          <span class="text-[10px] text-text-dim hidden sm:inline">AI 드라마 각본 도구</span>
          <span class="sm:hidden text-[11px] text-text-dim truncate">{currentRouteLabel()}</span>
          <nav class="hidden sm:flex items-center gap-1 ml-4 min-w-0">
            {routes.map((r) => (
              <A
                href={r.path}
                class="px-2.5 py-1 rounded-md text-xs transition-colors whitespace-nowrap"
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
          </nav>
          <div class="ml-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div class="hidden sm:block">
              <AuthStatusDots />
            </div>
            <TunnelButton />
            <SettingsDropdown />
          </div>
        </header>
      </Show>
      <main class="flex-1 min-h-0 overflow-auto">{props.children}</main>
      <ToastProvider />
      <CommandPalette />
    </div>
  )
}
