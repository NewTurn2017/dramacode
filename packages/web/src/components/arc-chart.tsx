import { createSignal, createMemo, For, Show } from "solid-js"
import type { CharacterArc, Character, Episode } from "@/lib/api"

const palette = ["#7c6af0", "#f06a8e", "#6af0c2", "#f0c26a", "#6a9df0", "#f06af0", "#8ef06a", "#f09b6a"]
const gridLines = [-5, -3, 0, 3, 5]

const pad = { top: 20, right: 20, bottom: 50, left: 40 }
const chartH = 200

export function ArcChart(props: { arcs: CharacterArc[]; characters: Character[]; episodes: Episode[] }) {
  const [tooltip, setTooltip] = createSignal<{
    x: number
    y: number
    name: string
    emotion: string
    intensity: number
    description: string | null
  } | null>(null)

  const sorted = createMemo(() => [...props.episodes].sort((a, b) => a.number - b.number))

  const charColors = createMemo(() => {
    const map = new Map<string, string>()
    const ids = [...new Set(props.arcs.map((a) => a.character_id))]
    ids.forEach((id, i) => map.set(id, palette[i % palette.length]))
    return map
  })

  const charName = createMemo(() => {
    const map = new Map<string, string>()
    props.characters.forEach((c) => map.set(c.id, c.name))
    return map
  })

  const innerW = createMemo(() => {
    const eps = sorted().length
    return Math.max(eps * 60, 200)
  })

  const totalW = createMemo(() => innerW() + pad.left + pad.right)
  const innerH = chartH - pad.top - pad.bottom

  const xScale = createMemo(() => {
    const eps = sorted()
    if (eps.length <= 1) return (idx: number) => pad.left + innerW() / 2
    return (idx: number) => pad.left + (idx / (eps.length - 1)) * innerW()
  })

  const yScale = (intensity: number) => {
    const clamped = Math.max(-5, Math.min(5, intensity))
    return pad.top + ((5 - clamped) / 10) * innerH
  }

  const lines = createMemo(() => {
    const eps = sorted()
    const epIdx = new Map(eps.map((e, i) => [e.id, i]))
    const grouped = new Map<string, { idx: number; arc: CharacterArc }[]>()

    for (const arc of props.arcs) {
      const idx = epIdx.get(arc.episode_id)
      if (idx === undefined) continue
      const list = grouped.get(arc.character_id) ?? []
      list.push({ idx, arc })
      grouped.set(arc.character_id, list)
    }

    const result: {
      charId: string
      color: string
      points: { x: number; y: number; arc: CharacterArc }[]
    }[] = []

    for (const [charId, entries] of grouped) {
      const sorted = entries.sort((a, b) => a.idx - b.idx)
      const points = sorted.map((e) => ({
        x: xScale()(e.idx),
        y: yScale(e.arc.intensity),
        arc: e.arc,
      }))
      result.push({
        charId,
        color: charColors().get(charId) ?? palette[0],
        points,
      })
    }

    return result
  })

  // quadratic bezier smooth path through points
  function smoothPath(pts: { x: number; y: number }[]) {
    if (pts.length === 0) return ""
    if (pts.length === 1) return ""
    if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`

    let d = `M${pts[0].x},${pts[0].y}`
    for (let i = 0; i < pts.length - 1; i++) {
      const curr = pts[i]
      const next = pts[i + 1]
      const cpx = (curr.x + next.x) / 2
      d += ` Q${curr.x},${curr.y} ${cpx},${(curr.y + next.y) / 2}`
    }
    const last = pts[pts.length - 1]
    d += ` T${last.x},${last.y}`
    return d
  }

  const legendChars = createMemo(() =>
    [...charColors().entries()].map(([id, color]) => ({
      id,
      color,
      name: charName().get(id) ?? id,
    })),
  )

  return (
    <Show
      when={props.arcs.length > 0}
      fallback={<p class="text-text-dim text-xs py-3 text-center">감정 아크 데이터가 없습니다</p>}
    >
      <div class="w-full overflow-x-auto relative">
        <svg width={totalW()} height={chartH} viewBox={`0 0 ${totalW()} ${chartH}`} class="block">
          <For each={gridLines}>
            {(val) => {
              const y = yScale(val)
              return (
                <>
                  <line
                    x1={pad.left}
                    y1={y}
                    x2={pad.left + innerW()}
                    y2={y}
                    stroke="#333"
                    stroke-width="1"
                    stroke-dasharray={val === 0 ? "none" : "4 3"}
                    opacity={val === 0 ? 0.6 : 0.3}
                  />
                  <text
                    x={pad.left - 6}
                    y={y + 3}
                    text-anchor="end"
                    fill="#888"
                    font-size="9"
                    font-family="Pretendard, sans-serif"
                  >
                    {val > 0 ? `+${val}` : val}
                  </text>
                </>
              )
            }}
          </For>

          <For each={sorted()}>
            {(ep, i) => {
              const x = () => xScale()(i())
              return (
                <>
                  <line
                    x1={x()}
                    y1={pad.top}
                    x2={x()}
                    y2={pad.top + innerH}
                    stroke="#333"
                    stroke-width="1"
                    opacity="0.15"
                  />
                  <text
                    x={x()}
                    y={pad.top + innerH + 16}
                    text-anchor="middle"
                    fill="#aaa"
                    font-size="10"
                    font-family="Pretendard, sans-serif"
                  >
                    Ep{ep.number}
                  </text>
                </>
              )
            }}
          </For>

          <For each={lines()}>
            {(line) => (
              <>
                <Show when={line.points.length > 1}>
                  <path
                    d={smoothPath(line.points)}
                    fill="none"
                    stroke={line.color}
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    opacity="0.85"
                  />
                </Show>

                <For each={line.points}>
                  {(pt) => (
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={line.points.length === 1 ? 5 : 3.5}
                      fill={line.color}
                      stroke="#0a0a0f"
                      stroke-width="1.5"
                      class="cursor-pointer"
                      style={{ transition: "r 0.15s ease" }}
                      onMouseEnter={(e) => {
                        const target = e.currentTarget as SVGCircleElement
                        target.setAttribute("r", "6")
                        setTooltip({
                          x: pt.x,
                          y: pt.y,
                          name: charName().get(line.charId) ?? line.charId,
                          emotion: pt.arc.emotion,
                          intensity: pt.arc.intensity,
                          description: pt.arc.description,
                        })
                      }}
                      onMouseLeave={(e) => {
                        const target = e.currentTarget as SVGCircleElement
                        target.setAttribute("r", line.points.length === 1 ? "5" : "3.5")
                        setTooltip(null)
                      }}
                    />
                  )}
                </For>
              </>
            )}
          </For>
        </svg>

        <Show when={tooltip()}>
          {(t) => (
            <div
              class="absolute pointer-events-none px-2.5 py-1.5 bg-[#1a1a2e]/95 border border-border/80 rounded-lg text-xs shadow-lg backdrop-blur-sm"
              style={{
                left: `${Math.min(t().x, totalW() - 140)}px`,
                top: `${t().y - 58}px`,
                "z-index": 10,
              }}
            >
              <p
                class="font-medium text-text"
                style={{
                  color: charColors().get(lines().find((l) => charName().get(l.charId) === t().name)?.charId ?? ""),
                }}
              >
                {t().name}
              </p>
              <p class="text-text-dim mt-0.5">
                {t().emotion}{" "}
                <span class="text-accent font-mono">{t().intensity > 0 ? `+${t().intensity}` : t().intensity}</span>
              </p>
              <Show when={t().description}>
                <p class="text-text-dim/70 mt-0.5 max-w-[160px] line-clamp-2 text-[10px]">{t().description}</p>
              </Show>
            </div>
          )}
        </Show>

        <Show when={legendChars().length > 0}>
          <div class="flex flex-wrap gap-x-3 gap-y-1 mt-2 px-1">
            <For each={legendChars()}>
              {(ch) => (
                <div class="flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full shrink-0" style={{ background: ch.color }} />
                  <span class="text-[10px] text-text-dim">{ch.name}</span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  )
}
