import { onMount, onCleanup, createEffect } from "solid-js"
import type { Character } from "@/lib/api"
import cytoscape from "cytoscape"

const relColor: Record<string, string> = {
  연인: "#f472b6",
  사랑: "#f472b6",
  love: "#f472b6",
  가족: "#60a5fa",
  family: "#60a5fa",
  친구: "#34d399",
  friend: "#34d399",
  적대: "#ef4444",
  enemy: "#ef4444",
  동료: "#a78bfa",
  colleague: "#a78bfa",
  라이벌: "#f59e0b",
  rival: "#f59e0b",
}

function edgeColor(type: string) {
  const lower = type.toLowerCase()
  for (const [key, color] of Object.entries(relColor)) {
    if (lower.includes(key)) return color
  }
  return "#8888a0"
}

export function RelationshipGraph(props: { characters: Character[] }) {
  let container: HTMLDivElement | undefined
  let cy: cytoscape.Core | undefined

  function build() {
    if (!container) return
    const chars = props.characters
    const nameMap = new Map(chars.map((c) => [c.id, c.name]))

    const nodes = chars.map((c) => ({
      data: {
        id: c.id,
        label: c.name,
        role: c.role ?? "supporting",
      },
    }))

    const edges: cytoscape.ElementDefinition[] = []
    const seen = new Set<string>()
    for (const c of chars) {
      if (!c.relationships) continue
      for (const rel of c.relationships) {
        if (!nameMap.has(rel.character_id)) continue
        const key = [c.id, rel.character_id].sort().join("-")
        if (seen.has(key)) continue
        seen.add(key)
        edges.push({
          data: {
            source: c.id,
            target: rel.character_id,
            label: rel.type,
            color: edgeColor(rel.type),
          },
        })
      }
    }

    if (cy) cy.destroy()

    cy = cytoscape({
      container,
      elements: [...nodes, ...edges],
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "text-valign": "bottom",
            "text-margin-y": 6,
            "font-size": "11px",
            color: "#e4e4ef",
            "text-outline-color": "#0a0a0f",
            "text-outline-width": 2,
            width: 36,
            height: 36,
            "background-color": "#2a2a3a",
            "border-width": 2,
            "border-color": "#7c6af0",
          },
        },
        {
          selector: "node[role='protagonist']",
          style: {
            "background-color": "#7c6af0",
            "border-color": "#9180f4",
            width: 44,
            height: 44,
            "font-weight": "bold" as cytoscape.Css.FontWeight,
          },
        },
        {
          selector: "node[role='antagonist']",
          style: {
            "background-color": "#ef4444",
            "border-color": "#f87171",
            width: 40,
            height: 40,
          },
        },
        {
          selector: "edge",
          style: {
            width: 2,
            "line-color": "data(color)",
            "curve-style": "bezier",
            label: "data(label)",
            "font-size": "9px",
            color: "#8888a0",
            "text-outline-color": "#0a0a0f",
            "text-outline-width": 1.5,
            "text-rotation": "autorotate",
            "text-margin-y": -8,
            "target-arrow-shape": "none",
          },
        },
      ],
      layout: {
        name: "cose",
        animate: true,
        animationDuration: 500,
        nodeRepulsion: () => 6000,
        idealEdgeLength: () => 120,
        gravity: 0.3,
        padding: 30,
      },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
    })
  }

  onMount(build)
  createEffect(() => {
    props.characters
    build()
  })
  onCleanup(() => cy?.destroy())

  return (
    <div class="w-full h-full min-h-[200px] rounded-lg bg-bg border border-border/60 overflow-hidden">
      <div ref={container} class="w-full h-full" />
    </div>
  )
}
