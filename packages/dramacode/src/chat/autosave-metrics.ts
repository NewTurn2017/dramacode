type Counts = {
  drama: number
  characters: number
  episodes: number
  world: number
  plot_points: number
  scenes: number
}

type Entry = {
  time: number
  status: "ok" | "error"
  source: "send" | "stream" | "resync"
  retries: number
  extracted?: Counts
  persisted?: Counts
  error?: string
}

const MAX = 40

const data = new Map<string, Entry[]>()

function empty(): Counts {
  return { drama: 0, characters: 0, episodes: 0, world: 0, plot_points: 0, scenes: 0 }
}

function sum(items: Entry[], pick: (item: Entry) => Counts | undefined): Counts {
  return items.reduce((acc, item) => {
    const value = pick(item)
    if (!value) return acc
    return {
      drama: acc.drama + value.drama,
      characters: acc.characters + value.characters,
      episodes: acc.episodes + value.episodes,
      world: acc.world + value.world,
      plot_points: acc.plot_points + value.plot_points,
      scenes: acc.scenes + value.scenes,
    }
  }, empty())
}

export namespace AutosaveMetrics {
  export function record(drama_id: string, entry: Entry) {
    const list = data.get(drama_id) ?? []
    list.unshift(entry)
    if (list.length > MAX) list.length = MAX
    data.set(drama_id, list)
  }

  export function get(drama_id: string) {
    const list = data.get(drama_id) ?? []
    const ok = list.filter((item) => item.status === "ok")
    return {
      total: list.length,
      success: ok.length,
      failed: list.length - ok.length,
      extracted: sum(ok, (item) => item.extracted),
      persisted: sum(ok, (item) => item.persisted),
      recent: list.slice(0, 15),
    }
  }
}
