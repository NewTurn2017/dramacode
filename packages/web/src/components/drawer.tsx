import { type ParentProps, Show, createEffect, onCleanup } from "solid-js"

interface DrawerProps extends ParentProps {
  open: boolean
  onClose: () => void
  side?: "left" | "right"
  width?: string
  title?: string
}

export function Drawer(props: DrawerProps) {
  const side = () => props.side ?? "right"
  const width = () => props.width ?? "28rem"

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
      <div class="fixed inset-0 z-40 flex" classList={{ "justify-end": side() === "right" }}>
        <div
          class="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity"
          onClick={props.onClose}
        />
        <div
          class="relative h-full bg-bg border-border overflow-y-auto shadow-2xl animate-drawer-in"
          classList={{
            "border-r": side() === "left",
            "border-l": side() === "right",
          }}
          style={{ width: width(), "max-width": "90vw" }}
        >
          <Show when={props.title}>
            <div class="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-border bg-bg/95 backdrop-blur-sm">
              <span class="text-xs font-semibold text-text-dim uppercase tracking-widest">
                {props.title}
              </span>
              <button
                onClick={props.onClose}
                class="text-text-dim hover:text-text text-sm transition-colors"
                title="닫기 (Esc)"
              >
                ✕
              </button>
            </div>
          </Show>
          {props.children}
        </div>
      </div>
    </Show>
  )
}
