import { Show, createSignal, onCleanup } from "solid-js"

export function SearchInput(props: { value: string; onSearch: (query: string) => void; placeholder?: string }) {
  const [composing, setComposing] = createSignal(false)
  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  function handleInput(value: string) {
    if (composing()) return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => props.onSearch(value), 300)
  }

  onCleanup(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
  })

  return (
    <div class="relative">
      <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-dim text-xs">🔍</span>
      <input
        type="text"
        value={props.value}
        placeholder={props.placeholder ?? "검색..."}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={(e) => {
          setComposing(false)
          handleInput(e.currentTarget.value)
        }}
        onInput={(e) => handleInput(e.currentTarget.value)}
        class="w-full pl-8 pr-8 py-1.5 bg-bg border border-border rounded-md text-xs text-text placeholder:text-text-dim/50 focus:outline-none focus:border-accent/50 transition-colors"
      />
      <Show when={props.value}>
        <button
          onClick={() => props.onSearch("")}
          class="absolute right-2 top-1/2 -translate-y-1/2 text-text-dim hover:text-text text-xs"
        >
          ✕
        </button>
      </Show>
    </div>
  )
}
