const BASE = "/api"

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error ?? res.statusText)
  }
  return res.json()
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

export const api = {
  auth: {
    status: () => get<{ providers: string[] }>("/auth"),
    login: () => post<{ url: string; userCode: string }>("/auth/openai/login", {}),
    setKey: (key: string) =>
      request<boolean>("/auth/openai", { method: "PUT", body: JSON.stringify({ type: "api", key }) }),
    logout: () => del("/auth/openai"),
  },
  drama: {
    list: () => get<Drama[]>("/drama"),
    get: (id: string) => get<Drama>(`/drama/${id}`),
    create: (body: Partial<Drama>) => post<Drama>("/drama", body),
    update: (id: string, body: Partial<Drama>) => patch<Drama>(`/drama/${id}`, body),
    remove: (id: string) => del(`/drama/${id}`),
    characters: (id: string) => get<Character[]>(`/drama/${id}/characters`),
    episodes: (id: string) => get<Episode[]>(`/drama/${id}/episodes`),
    scenes: (id: string) => get<Scene[]>(`/drama/${id}/scenes`),
    world: (id: string) => get<World[]>(`/drama/${id}/world`),
    autosave: (id: string) => get<AutosaveStatus>(`/drama/${id}/autosave`),
    autosaveResync: (id: string, body?: { session_limit?: number; pair_limit?: number }) =>
      post<AutosaveResyncResult>(`/drama/${id}/autosave/resync`, body ?? {}),
    arcs: (id: string) => get<CharacterArc[]>(`/drama/${id}/arcs`),
    plotPoints: (id: string) => get<PlotPoint[]>(`/drama/${id}/plot-points`),
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
    stream: (sessionId: string, content: string, signal?: AbortSignal) =>
      fetch(`${BASE}/chat/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        signal,
      }),
    greet: (sessionId: string, signal?: AbortSignal) =>
      fetch(`${BASE}/chat/${sessionId}/greet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal,
      }),
    organize: (sessionId: string) =>
      post<{ status: string; stats?: Record<string, number> }>(`/chat/${sessionId}/organize`, {}),
  },
  writer: {
    list: () => get<WriterStyle[]>("/writer"),
  },
}
