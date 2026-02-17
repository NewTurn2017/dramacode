export function ThinkingIndicator() {
  return (
    <div class="flex">
      <div class="px-4 py-3 rounded-lg text-sm bg-bg-card border border-border">
        <div class="flex items-center gap-2">
          <div class="flex gap-1">
            <span class="thinking-dot" />
            <span class="thinking-dot" style={{ "animation-delay": "0.15s" }} />
            <span class="thinking-dot" style={{ "animation-delay": "0.3s" }} />
          </div>
        </div>
      </div>
    </div>
  )
}
