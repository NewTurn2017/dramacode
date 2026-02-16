import { createMemo, For, Show } from "solid-js"
import type { PlotPoint, Episode } from "@/lib/api"

const typeColor: Record<string, string> = {
  setup: "#7c6af0",
  conflict: "#ef4444",
  twist: "#f59e0b",
  climax: "#ec4899",
  resolution: "#22c55e",
  foreshadowing: "#06b6d4",
}

const typeLabel: Record<string, string> = {
  setup: "설정",
  conflict: "갈등",
  twist: "반전",
  climax: "클라이맥스",
  resolution: "해소",
  foreshadowing: "복선",
}

type GroupedColumn = {
  id: string | null
  label: string
  number: number
  points: PlotPoint[]
}

export function PlotTimeline(props: { plotPoints: PlotPoint[]; episodes: Episode[] }) {
  const sorted = createMemo(() => [...props.episodes].sort((a, b) => a.number - b.number))

  const columns = createMemo<GroupedColumn[]>(() => {
    const eps = sorted()
    const map = new Map<string | null, PlotPoint[]>()

    for (const ep of eps) map.set(ep.id, [])
    const hasUnassigned = props.plotPoints.some((p) => !p.episode_id)
    if (hasUnassigned) map.set(null, [])

    for (const pp of props.plotPoints) {
      const key = pp.episode_id ?? null
      const list = map.get(key)
      if (list) list.push(pp)
      else {
        const unassigned = map.get(null) ?? []
        unassigned.push(pp)
        map.set(null, unassigned)
      }
    }

    const cols: GroupedColumn[] = eps
      .filter((ep) => (map.get(ep.id)?.length ?? 0) > 0)
      .map((ep) => ({
        id: ep.id,
        label: `${ep.number}화`,
        number: ep.number,
        points: map.get(ep.id) ?? [],
      }))

    const unassigned = map.get(null)
    if (unassigned?.length) {
      cols.push({ id: null, label: "미배정", number: 999, points: unassigned })
    }

    return cols
  })

  return (
    <Show
      when={props.plotPoints.length > 0}
      fallback={<p class="text-text-dim text-xs py-3 text-center">플롯 타임라인 데이터가 없습니다</p>}
    >
      <div class="space-y-3">
        <For each={columns()}>
          {(col) => (
            <div>
              <div class="flex items-center gap-2 mb-1.5">
                <span class="text-[10px] font-semibold text-text-dim uppercase tracking-wider">{col.label}</span>
                <div class="flex-1 h-px bg-border/40" />
              </div>
              <div class="flex flex-wrap gap-1.5">
                <For each={col.points}>
                  {(pp) => {
                    const color = () => typeColor[pp.type] ?? "#888"
                    const unresolved = () => !pp.resolved && (pp.type === "foreshadowing" || pp.type === "setup")

                    return (
                      <div
                        class="group relative inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors cursor-default"
                        style={{
                          background: `${color()}15`,
                          border: `1px solid ${color()}25`,
                        }}
                      >
                        <span
                          class="w-1.5 h-1.5 rounded-full shrink-0"
                          classList={{ "animate-pulse": unresolved() }}
                          style={{ background: color() }}
                        />
                        <span style={{ color: color() }} class="font-medium text-[10px] shrink-0">
                          {typeLabel[pp.type] ?? pp.type}
                        </span>
                        <Show when={pp.resolved}>
                          <span class="text-[10px] text-success">✓</span>
                        </Show>

                        <div
                          class="absolute bottom-full left-0 mb-1 px-2.5 py-1.5 rounded-md text-xs shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10 max-w-[200px]"
                          style={{
                            background: "#1a1a2e",
                            border: "1px solid #2a2a3a",
                          }}
                        >
                          <p class="text-text line-clamp-3 leading-relaxed">{pp.description}</p>
                        </div>
                      </div>
                    )
                  }}
                </For>
              </div>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}
