import { type ParentProps } from "solid-js"
import { A, useLocation } from "@solidjs/router"
import { routes } from "./routes"

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
              <span class="text-base">{r.icon}</span>
              <span>{r.label}</span>
            </A>
          ))}
        </div>
        <div class="p-3 border-t border-border">
          <p class="text-[10px] text-text-dim text-center">v0.1.0</p>
        </div>
      </nav>
      <main class="flex-1 overflow-auto">{props.children}</main>
    </div>
  )
}
