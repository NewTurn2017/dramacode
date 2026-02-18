import { Show, createEffect, createSignal, onCleanup } from "solid-js"
import { useLocation, useNavigate } from "@solidjs/router"
import { Command } from "cmdk-solid"

type Section = "characters" | "episodes" | "scenes" | "world" | "plot"

function isTextInputElement(target: EventTarget | null) {
  const tag = (target as HTMLElement | null)?.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
}

function shortcutHint(label: string) {
  return <span class="text-[10px] text-text-dim bg-bg-hover px-1.5 py-0.5 rounded font-mono">{label}</span>
}

export function CommandPalette() {
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = createSignal(false)

  const dramaPath = () => {
    const match = location.pathname.match(/^\/drama\/[^/]+/)
    return match ? match[0] : null
  }
  const isDramaPage = () => dramaPath() !== null

  createEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const key = e.key.toLowerCase()
      const hasModifier = e.metaKey || e.ctrlKey

      if (isTextInputElement(e.target)) return

      if (hasModifier && key === "k") {
        e.preventDefault()
        setOpen((prev) => !prev)
        return
      }

      if (key === "escape" && open()) {
        e.preventDefault()
        setOpen(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown))
  })

  const run = (fn: () => void) => {
    fn()
    setOpen(false)
  }

  const dispatch = (name: string, detail?: Section) => {
    if (detail) {
      window.dispatchEvent(new CustomEvent(name, { detail }))
      return
    }
    window.dispatchEvent(new CustomEvent(name))
  }

  return (
    <Show when={open()}>
      <div
        class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[12vh]"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setOpen(false)
        }}
      >
        <div class="max-w-lg w-full mx-4 bg-bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          <Command class="w-full">
            <Command.Input
              placeholder="명령 또는 섹션 검색..."
              class="w-full px-4 py-3 bg-transparent border-b border-border text-sm text-text placeholder:text-text-dim focus:outline-none"
            />
            <Command.List class="max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty class="px-4 py-4 text-sm text-text-dim">결과 없음</Command.Empty>

              <Command.Group
                heading="이동"
                class="[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-text-dim [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest"
              >
                <Command.Item
                  value="대시보드"
                  onSelect={() => run(() => navigate("/"))}
                  class="px-4 py-2.5 text-sm text-text cursor-pointer rounded-md flex items-center justify-between [&[data-selected]]:bg-accent/10 [&[data-selected]]:text-accent"
                >
                  <span>대시보드</span>
                </Command.Item>
                <Command.Item
                  value="현재 프로젝트"
                  disabled={!isDramaPage()}
                  onSelect={() => {
                    const path = dramaPath()
                    if (!path) return
                    run(() => navigate(path))
                  }}
                  class="px-4 py-2.5 text-sm text-text cursor-pointer rounded-md flex items-center justify-between [&[data-selected]]:bg-accent/10 [&[data-selected]]:text-accent [&[data-disabled]]:opacity-40 [&[data-disabled]]:cursor-not-allowed"
                >
                  <span>현재 프로젝트</span>
                </Command.Item>
              </Command.Group>

              <Command.Separator class="my-2 h-px bg-border" />

              <Command.Group
                heading="작업"
                class="[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-text-dim [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest"
              >
                <Command.Item
                  value="새 대화 세션"
                  disabled={!isDramaPage()}
                  onSelect={() => run(() => dispatch("dramacode:new-session"))}
                  class="px-4 py-2.5 text-sm text-text cursor-pointer rounded-md flex items-center justify-between [&[data-selected]]:bg-accent/10 [&[data-selected]]:text-accent [&[data-disabled]]:opacity-40 [&[data-disabled]]:cursor-not-allowed"
                >
                  <span>새 대화 세션</span>
                  {shortcutHint("⌘N")}
                </Command.Item>
                <Command.Item
                  value="프로젝트 데이터 패널 토글"
                  disabled={!isDramaPage()}
                  onSelect={() => run(() => dispatch("dramacode:toggle-panel"))}
                  class="px-4 py-2.5 text-sm text-text cursor-pointer rounded-md flex items-center justify-between [&[data-selected]]:bg-accent/10 [&[data-selected]]:text-accent [&[data-disabled]]:opacity-40 [&[data-disabled]]:cursor-not-allowed"
                >
                  <span>프로젝트 데이터 패널 토글</span>
                  {shortcutHint("⌘B")}
                </Command.Item>
                <Command.Item
                  value="세션 목록 패널 토글"
                  disabled={!isDramaPage()}
                  onSelect={() => run(() => dispatch("dramacode:toggle-sessions"))}
                  class="px-4 py-2.5 text-sm text-text cursor-pointer rounded-md flex items-center justify-between [&[data-selected]]:bg-accent/10 [&[data-selected]]:text-accent [&[data-disabled]]:opacity-40 [&[data-disabled]]:cursor-not-allowed"
                >
                  <span>세션 목록 패널 토글</span>
                  {shortcutHint("⌘\\")}
                </Command.Item>
                <Command.Item
                  value="각본 내보내기"
                  disabled={!isDramaPage()}
                  onSelect={() => run(() => dispatch("dramacode:export-fountain"))}
                  class="px-4 py-2.5 text-sm text-text cursor-pointer rounded-md flex items-center justify-between [&[data-selected]]:bg-accent/10 [&[data-selected]]:text-accent [&[data-disabled]]:opacity-40 [&[data-disabled]]:cursor-not-allowed"
                >
                  <span>각본 내보내기 (Fountain)</span>
                </Command.Item>
                <Command.Item
                  value="커맨드 팔레트 토글"
                  onSelect={() => setOpen(false)}
                  class="px-4 py-2.5 text-sm text-text cursor-pointer rounded-md flex items-center justify-between [&[data-selected]]:bg-accent/10 [&[data-selected]]:text-accent"
                >
                  <span>커맨드 팔레트</span>
                  {shortcutHint("⌘K")}
                </Command.Item>
              </Command.Group>

              <Command.Separator class="my-2 h-px bg-border" />

              <Command.Group
                heading="데이터 섹션"
                class="[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-text-dim [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest"
              >
                <Command.Item
                  value="등장인물 보기"
                  disabled={!isDramaPage()}
                  onSelect={() => run(() => dispatch("dramacode:toggle-section", "characters"))}
                  class="px-4 py-2.5 text-sm text-text cursor-pointer rounded-md [&[data-selected]]:bg-accent/10 [&[data-selected]]:text-accent [&[data-disabled]]:opacity-40 [&[data-disabled]]:cursor-not-allowed"
                >
                  등장인물 보기
                </Command.Item>
                <Command.Item
                  value="에피소드 보기"
                  disabled={!isDramaPage()}
                  onSelect={() => run(() => dispatch("dramacode:toggle-section", "episodes"))}
                  class="px-4 py-2.5 text-sm text-text cursor-pointer rounded-md [&[data-selected]]:bg-accent/10 [&[data-selected]]:text-accent [&[data-disabled]]:opacity-40 [&[data-disabled]]:cursor-not-allowed"
                >
                  에피소드 보기
                </Command.Item>
                <Command.Item
                  value="장면 보기"
                  disabled={!isDramaPage()}
                  onSelect={() => run(() => dispatch("dramacode:toggle-section", "scenes"))}
                  class="px-4 py-2.5 text-sm text-text cursor-pointer rounded-md [&[data-selected]]:bg-accent/10 [&[data-selected]]:text-accent [&[data-disabled]]:opacity-40 [&[data-disabled]]:cursor-not-allowed"
                >
                  장면 보기
                </Command.Item>
                <Command.Item
                  value="세계관 보기"
                  disabled={!isDramaPage()}
                  onSelect={() => run(() => dispatch("dramacode:toggle-section", "world"))}
                  class="px-4 py-2.5 text-sm text-text cursor-pointer rounded-md [&[data-selected]]:bg-accent/10 [&[data-selected]]:text-accent [&[data-disabled]]:opacity-40 [&[data-disabled]]:cursor-not-allowed"
                >
                  세계관 보기
                </Command.Item>
                <Command.Item
                  value="플롯 보기"
                  disabled={!isDramaPage()}
                  onSelect={() => run(() => dispatch("dramacode:toggle-section", "plot"))}
                  class="px-4 py-2.5 text-sm text-text cursor-pointer rounded-md [&[data-selected]]:bg-accent/10 [&[data-selected]]:text-accent [&[data-disabled]]:opacity-40 [&[data-disabled]]:cursor-not-allowed"
                >
                  플롯 보기
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </div>
      </div>
    </Show>
  )
}
