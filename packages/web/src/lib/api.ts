const BASE = "/api"

const TIMEOUT_MS = 30_000

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      signal: init?.signal ?? controller.signal,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(body.error ?? res.statusText)
    }
    return res.json()
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError" && !init?.signal) {
      throw new Error("요청 시간이 초과되었습니다")
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

function get<T>(path: string) {
  return request<T>(path)
}

function post<T>(path: string, body: unknown) {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) })
}

function patch<T>(path: string, body: unknown) {
  return request<T>(path, { method: "PATCH", body: JSON.stringify(body) })
}

function del<T = boolean>(path: string) {
  return request<T>(path, { method: "DELETE" })
}

export type Drama = {
  id: string
  title: string
  logline: string | null
  genre: string | null
  setting: string | null
  tone: string | null
  total_episodes: number | null
  time_created: number
  time_updated: number
}

export type Character = {
  id: string
  drama_id: string
  name: string
  role: string | null
  age: string | null
  occupation: string | null
  personality: string | null
  backstory: string | null
  arc: string | null
  image: string | null
  relationships: { character_id: string; type: string; description: string }[] | null
  time_created: number
  time_updated: number
}

export type Episode = {
  id: string
  drama_id: string
  number: number
  title: string
  synopsis: string | null
  status: string
  time_created: number
  time_updated: number
}

export type World = {
  id: string
  drama_id: string
  category: string
  name: string
  description: string | null
  time_created: number
  time_updated: number
}

export type ScenePrompt = {
  prompt: string
  style: string
  mood: string
  resolution: string
}

export type Scene = {
  id: string
  episode_id: string
  number: number
  location: string | null
  time_of_day: string | null
  description: string | null
  dialogue: string | null
  notes: string | null
  image_prompt: ScenePrompt | null
  characters_present: string[] | null
  image: string | null
  time_created: number
  time_updated: number
}

export type PlotPoint = {
  id: string
  drama_id: string
  episode_id: string | null
  type: string
  description: string
  resolved: boolean | null
  resolved_episode_id: string | null
  linked_plot_id: string | null
  time_created: number
  time_updated: number
}

export type CharacterArc = {
  id: string
  drama_id: string
  character_id: string
  episode_id: string
  emotion: string
  intensity: number
  description: string | null
  time_created: number
  time_updated: number
}

export type Session = {
  id: string
  title: string | null
  drama_id: string | null
  time_created: number
  time_updated: number
}

export type Message = {
  id: string
  session_id: string
  role: string
  content: string
  images?: string | null
  time_created: number
}

export type WriterStyle = {
  id: string
  category: string
  observation: string
  confidence: number
  drama_id: string | null
  session_id: string | null
  time_created: number
  time_updated: number
}

export type AutosaveCounts = {
  drama: number
  characters: number
  episodes: number
  world: number
  plot_points: number
  scenes: number
}

export type AutosaveEntry = {
  time: number
  status: "ok" | "error"
  source: "send" | "stream" | "resync"
  retries: number
  extracted?: AutosaveCounts
  persisted?: AutosaveCounts
  error?: string
}

export type AutosaveStatus = {
  total: number
  success: number
  failed: number
  extracted: AutosaveCounts
  persisted: AutosaveCounts
  recent: AutosaveEntry[]
}

export type AutosaveResyncResult = {
  session_limit: number
  pair_limit: number
  scanned_sessions: number
  processed_pairs: number
  metrics: AutosaveStatus
}

export type ChatImage = {
  data: string
  mediaType: string
}

export type Scrap = {
  id: string
  drama_id: string
  content: string
  memo: string | null
  source_session_id: string | null
  time_created: number
  time_updated: number
}

export type UpdateStatus = {
  version: string
  hasUpdate: boolean
  latest: string
  releaseUrl: string | null
  size: number
}

export type UpdateProgress = {
  step: "idle" | "downloading" | "downloaded" | "applying" | "restarting" | "error"
  percent: number
  error: string | null
}

export function characterImageUrl(filename: string): string {
  return `${BASE}/uploads/characters/${filename}`
}

export function chatImageUrl(filename: string): string {
  return `${BASE}/uploads/chat/${filename}`
}

export function sceneImageUrl(filename: string): string {
  return `${BASE}/uploads/scenes/${filename}`
}

export const api = {
  auth: {
    status: () => get<{ providers: string[] }>("/auth"),
    login: () => post<{ url: string; userCode: string }>("/auth/openai/login", {}),
    setKey: (key: string) =>
      request<boolean>("/auth/openai", { method: "PUT", body: JSON.stringify({ type: "api", key }) }),
    logout: () => del("/auth/openai"),
    anthropic: {
      login: () => post<{ url: string; verifier: string }>("/auth/anthropic/login", {}),
      callback: (code: string, verifier: string) =>
        post<{ ok: boolean }>("/auth/anthropic/callback", { code, verifier }),
      setKey: (key: string) =>
        request<boolean>("/auth/anthropic", { method: "PUT", body: JSON.stringify({ type: "api", key }) }),
      logout: () => del("/auth/anthropic"),
    },
  },
  update: {
    check: () => get<UpdateStatus>("/update/check"),
    start: () => post<{ ok: boolean }>("/update/start", {}),
    progress: () => get<UpdateProgress>("/update/progress"),
    apply: () => post<{ ok: boolean }>("/update/apply", {}),
  },
  shutdown: () => post<{ ok: boolean }>("/shutdown", {}),
  aliveUrl: `${BASE}/alive`,
  drama: {
    list: () => get<Drama[]>("/drama"),
    get: (id: string) => get<Drama>(`/drama/${id}`),
    create: (body: Partial<Drama>) => post<Drama>("/drama", body),
    update: (id: string, body: Partial<Drama>) => patch<Drama>(`/drama/${id}`, body),
    remove: (id: string) => del(`/drama/${id}`),
    characters: (id: string) => get<Character[]>(`/drama/${id}/characters`),
    uploadCharacterImage: async (characterId: string, file: File): Promise<Character> => {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch(`${BASE}/character/${characterId}/image`, {
        method: "POST",
        body: form,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(body.error ?? res.statusText)
      }
      return res.json()
    },
    removeCharacterImage: (characterId: string) => del(`/character/${characterId}/image`),
    episodes: (id: string) => get<Episode[]>(`/drama/${id}/episodes`),
    scenes: (id: string) => get<Scene[]>(`/drama/${id}/scenes`),
    world: (id: string) => get<World[]>(`/drama/${id}/world`),
    autosave: (id: string) => get<AutosaveStatus>(`/drama/${id}/autosave`),
    autosaveResync: (id: string, body?: { session_limit?: number; pair_limit?: number }) =>
      post<AutosaveResyncResult>(`/drama/${id}/autosave/resync`, body ?? {}),
    arcs: (id: string) => get<CharacterArc[]>(`/drama/${id}/arcs`),
    plotPoints: (id: string) => get<PlotPoint[]>(`/drama/${id}/plot-points`),
  },
  episode: {
    get: (id: string) => get<Episode>(`/episode/${id}`),
    update: (id: string, body: Partial<Pick<Episode, "title" | "synopsis" | "status">>) =>
      patch<Episode>(`/episode/${id}`, body),
    remove: (id: string) => del(`/episode/${id}`),
    reorder: (id: string, number: number) =>
      patch<Episode>(`/episode/${id}/reorder`, { number }),
    scenes: (id: string) => get<Scene[]>(`/episode/${id}/scenes`),
    createScene: (id: string, body: Partial<Scene>) =>
      post<Scene>(`/episode/${id}/scenes`, body),
  },
  scene: {
    get: (id: string) => get<Scene>(`/scene/${id}`),
    update: (id: string, body: Partial<Pick<Scene, "location" | "time_of_day" | "description" | "dialogue" | "notes">>) =>
      patch<Scene>(`/scene/${id}`, body),
    remove: (id: string) => del(`/scene/${id}`),
    reorder: (id: string, number: number) =>
      patch<Scene>(`/scene/${id}/reorder`, { number }),
    uploadImage: async (sceneId: string, file: File): Promise<Scene> => {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch(`${BASE}/scene/${sceneId}/image`, {
        method: "POST",
        body: form,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(body.error ?? res.statusText)
      }
      return res.json()
    },
    removeImage: (sceneId: string) => del(`/scene/${sceneId}/image`),
  },
  character: {
    get: (id: string) => get<Character>(`/character/${id}`),
    update: (id: string, body: Partial<Pick<Character, "name" | "role" | "age" | "occupation" | "personality" | "backstory" | "arc">>) =>
      patch<Character>(`/character/${id}`, body),
    remove: (id: string) => del(`/character/${id}`),
  },
  world: {
    get: (id: string) => get<World>(`/world/${id}`),
    update: (id: string, body: Partial<Pick<World, "category" | "name" | "description">>) =>
      patch<World>(`/world/${id}`, body),
    remove: (id: string) => del(`/world/${id}`),
  },
  plotPoint: {
    get: (id: string) => get<PlotPoint>(`/plot-point/${id}`),
    update: (id: string, body: Partial<Pick<PlotPoint, "type" | "description" | "resolved" | "episode_id">>) =>
      patch<PlotPoint>(`/plot-point/${id}`, body),
    remove: (id: string) => del(`/plot-point/${id}`),
    resolve: (id: string, resolvedEpisodeId?: string) =>
      post<PlotPoint>(`/plot-point/${id}/resolve`, { resolved_episode_id: resolvedEpisodeId }),
  },
  session: {
    list: (dramaId?: string) => get<Session[]>(dramaId ? `/session?drama_id=${dramaId}` : "/session"),
    get: (id: string) => get<Session>(`/session/${id}`),
    create: (body?: { title?: string; drama_id?: string }) => post<Session>("/session", body ?? {}),
    remove: (id: string) => del(`/session/${id}`),
    messages: (id: string) => get<Message[]>(`/session/${id}/messages`),
    updateTitle: (id: string, title: string) => patch<Session>(`/session/${id}`, { title }),
  },
  chat: {
    stream: (sessionId: string, content: string, signal?: AbortSignal, provider?: string, images?: ChatImage[]) =>
      fetch(`${BASE}/chat/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, provider, images }),
        signal,
      }),
    greet: (sessionId: string, signal?: AbortSignal, provider?: string) =>
      fetch(`${BASE}/chat/${sessionId}/greet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
        signal,
      }),
    organize: (sessionId: string, provider?: string) =>
      post<{ status: string; stats?: Record<string, number> }>(`/chat/${sessionId}/organize`, { provider }),
  },
  scrap: {
    list: (dramaId: string) => get<Scrap[]>(`/scrap?drama_id=${dramaId}`),
    create: (body: { drama_id: string; content: string; memo?: string; source_session_id?: string }) =>
      post<Scrap>("/scrap", body),
    update: (id: string, body: { memo?: string }) => patch<Scrap>(`/scrap/${id}`, body),
    remove: (id: string) => del(`/scrap/${id}`),
  },
  writer: {
    list: () => get<WriterStyle[]>("/writer"),
  },
}
