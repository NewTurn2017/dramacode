import { Show, createEffect, onCleanup } from "solid-js"

export function ConfirmModal(props: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  let dialogRef: HTMLDivElement | undefined
  let cancelRef: HTMLButtonElement | undefined

  createEffect(() => {
    if (!props.open) return

    requestAnimationFrame(() => cancelRef?.focus())

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        props.onCancel()
        return
      }
      if (e.key === "Tab" && dialogRef) {
        const focusable = dialogRef.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener("keydown", onKeyDown)
    onCleanup(() => document.removeEventListener("keydown", onKeyDown))
  })

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/60" onClick={props.onCancel} />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
          aria-describedby="confirm-modal-desc"
          class="relative bg-bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-2xl"
        >
          <h3 id="confirm-modal-title" class="text-base font-semibold mb-2">{props.title}</h3>
          <p id="confirm-modal-desc" class="text-sm text-text-dim mb-5">{props.message}</p>
          <div class="flex justify-end gap-2">
            <button
              ref={cancelRef}
              onClick={props.onCancel}
              class="px-4 py-1.5 text-sm text-text-dim hover:text-text border border-border rounded-md hover:bg-bg-hover transition-colors"
            >
              취소
            </button>
            <button
              onClick={props.onConfirm}
              class="px-4 py-1.5 text-sm text-white bg-danger rounded-md hover:bg-danger/80 transition-colors"
            >
              {props.confirmLabel ?? "삭제"}
            </button>
          </div>
        </div>
      </div>
    </Show>
  )
}
