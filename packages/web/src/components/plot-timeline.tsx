import { createSignal, createMemo, For, Show } from "solid-js"
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

const colW = 80
const headerH = 28
const rowH = 32
const markerR = 6

export function PlotTimeline(props: { plotPoints: PlotPoint[]; episodes: Episode[] }) {
  const [tooltip, setTooltip] = createSignal<{
    x: number
    y: number
    type: string
    description: string
    resolved: boolean | null
  } | null>(null)

  const sorted = createMemo(() => [...props.episodes].sort((a, b) => a.number - b.number))

  const columns = createMemo(() => {
    const eps = sorted()
    const cols: { id: string | null; label: string; idx: number }[] = eps.map((ep, i) => ({
      id: ep.id,
      label: `Ep${ep.number}`,
      idx: i,
    }))
    const hasUnassigned = props.plotPoints.some((p) => !p.episode_id)
    if (hasUnassigned) {
      cols.push({ id: null, label: "미배정", idx: cols.length })
    }
    return cols
  })

  const grouped = createMemo(() => {
    const map = new Map<string | null, PlotPoint[]>()
    for (const col of columns()) {
      map.set(col.id, [])
    }
    for (const pp of props.plotPoints) {
      const key = pp.episode_id ?? null
      const list = map.get(key) ?? []
      list.push(pp)
      map.set(key, list)
    }
    return map
  })

  const maxRows = createMemo(() => {
    let max = 1
    for (const list of grouped().values()) {
      if (list.length > max) max = list.length
    }
    return max
  })

  const totalW = createMemo(() => Math.max(columns().length * colW + 40, 200))
  const totalH = createMemo(() => headerH + maxRows() * rowH + 20)

  const pointPos = createMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    for (const col of columns()) {
      const x = 20 + col.idx * colW + colW / 2
      const list = grouped().get(col.id) ?? []
      list.forEach((pp, row) => {
        map.set(pp.id, { x, y: headerH + row * rowH + rowH / 2 + 4 })
      })
    }
    return map
  })

  const connections = createMemo(() => {
    const pos = pointPos()
    const result: {
      from: { x: number; y: number }
      to: { x: number; y: number }
      color: string
      resolved: boolean
    }[] = []

    for (const pp of props.plotPoints) {
      if (!pp.linked_plot_id) continue
      const from = pos.get(pp.id)
      const to = pos.get(pp.linked_plot_id)
      if (!from || !to) continue
      result.push({
        from,
        to,
        color: typeColor[pp.type] ?? "#888",
        resolved: pp.resolved ?? false,
      })
    }
    return result
  })

  // quadratic bezier arc for connection lines
  function connectionPath(from: { x: number; y: number }, to: { x: number; y: number }) {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const cpY = Math.min(from.y, to.y) - Math.abs(dx) * 0.15 - 12
    return `M${from.x},${from.y} Q${(from.x + to.x) / 2},${cpY} ${to.x},${to.y}`
  }

  return (
    <Show
      when={props.plotPoints.length > 0}
      fallback={<p class="text-text-dim text-xs py-3 text-center">플롯 타임라인 데이터가 없습니다</p>}
    >
      <div class="w-full overflow-x-auto relative">
        <svg width={totalW()} height={totalH()} viewBox={`0 0 ${totalW()} ${totalH()}`} class="block">
          <For each={columns()}>
            {(col) => {
              const x = () => 20 + col.idx * colW + colW / 2
              return (
                <>
                  <line
                    x1={x()}
                    y1={headerH - 2}
                    x2={x()}
                    y2={totalH() - 4}
                    stroke="#333"
                    stroke-width="1"
                    opacity="0.3"
                  />
                  <text
                    x={x()}
                    y={headerH - 8}
                    text-anchor="middle"
                    fill="#aaa"
                    font-size="10"
                    font-family="Pretendard, sans-serif"
                  >
                    {col.label}
                  </text>
                </>
              )
            }}
          </For>

          <For each={connections()}>
            {(conn) => (
              <path
                d={connectionPath(conn.from, conn.to)}
                fill="none"
                stroke={conn.color}
                stroke-width="1.5"
                stroke-dasharray={conn.resolved ? "none" : "4 3"}
                opacity="0.5"
                stroke-linecap="round"
              />
            )}
          </For>

          <For each={columns()}>
            {(col) => (
              <For each={grouped().get(col.id) ?? []}>
                {(pp) => {
                  const pos = () => pointPos().get(pp.id)
                  const color = () => typeColor[pp.type] ?? "#888"
                  const unresolved = () => !pp.resolved && (pp.type === "foreshadowing" || pp.type === "setup")

                  return (
                    <Show when={pos()}>
                      {(p) => (
                        <g
                          class="cursor-pointer"
                          onMouseEnter={() =>
                            setTooltip({
                              x: p().x,
                              y: p().y,
                              type: pp.type,
                              description: pp.description,
                              resolved: pp.resolved,
                            })
                          }
                          onMouseLeave={() => setTooltip(null)}
                        >
                          <Show when={unresolved()}>
                            <circle
                              cx={p().x}
                              cy={p().y}
                              r={markerR + 3}
                              fill="none"
                              stroke="#ef4444"
                              stroke-width="1.5"
                              opacity="0.6"
                            >
                              <animate
                                attributeName="r"
                                values={`${markerR + 2};${markerR + 5};${markerR + 2}`}
                                dur="2s"
                                repeatCount="indefinite"
                              />
                              <animate
                                attributeName="opacity"
                                values="0.6;0.15;0.6"
                                dur="2s"
                                repeatCount="indefinite"
                              />
                            </circle>
                          </Show>

                          <circle
                            cx={p().x}
                            cy={p().y}
                            r={markerR}
                            fill={color()}
                            stroke="#0a0a0f"
                            stroke-width="1.5"
                          />

                          <text
                            x={p().x}
                            y={p().y + markerR + 12}
                            text-anchor="middle"
                            fill="#888"
                            font-size="8"
                            font-family="Pretendard, sans-serif"
                          >
                            {typeLabel[pp.type] ?? pp.type}
                          </text>
                        </g>
                      )}
                    </Show>
                  )
                }}
              </For>
            )}
          </For>
        </svg>

        <Show when={tooltip()}>
          {(t) => (
            <div
              class="absolute pointer-events-none px-2.5 py-1.5 bg-[#1a1a2e]/95 border border-border/80 rounded-lg text-xs shadow-lg backdrop-blur-sm"
              style={{
                left: `${Math.min(t().x, totalW() - 160)}px`,
                top: `${t().y - 52}px`,
                "z-index": 10,
              }}
            >
              <div class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full shrink-0" style={{ background: typeColor[t().type] ?? "#888" }} />
                <span class="font-medium text-text">{typeLabel[t().type] ?? t().type}</span>
                <Show when={t().resolved}>
                  <span class="text-[10px] text-[#22c55e] ml-1">해결</span>
                </Show>
                <Show when={t().resolved === false}>
                  <span class="text-[10px] text-[#ef4444] ml-1">미해결</span>
                </Show>
              </div>
              <p class="text-text-dim mt-0.5 max-w-[180px] truncate">
                {t().description.length > 60 ? t().description.slice(0, 60) + "..." : t().description}
              </p>
            </div>
          )}
        </Show>
      </div>
    </Show>
  )
}
