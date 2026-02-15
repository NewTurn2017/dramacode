import { Show } from "solid-js"

export function ConfirmModal(props: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/60" onClick={props.onCancel} />
        <div class="relative bg-bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-2xl">
          <h3 class="text-base font-semibold mb-2">{props.title}</h3>
          <p class="text-sm text-text-dim mb-5">{props.message}</p>
          <div class="flex justify-end gap-2">
            <button
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
