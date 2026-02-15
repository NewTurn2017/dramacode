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

export type PlotPoint = {
  id: string
  drama_id: string
  episode_id: string | null
  type: string
  description: string
  resolved: boolean | null
  resolved_episode_id: string | null
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

export const api = {
  drama: {
    list: () => get<Drama[]>("/drama"),
    get: (id: string) => get<Drama>(`/drama/${id}`),
    create: (body: Partial<Drama>) => post<Drama>("/drama", body),
    update: (id: string, body: Partial<Drama>) => patch<Drama>(`/drama/${id}`, body),
    remove: (id: string) => del(`/drama/${id}`),
    characters: (id: string) => get<Character[]>(`/drama/${id}/characters`),
    episodes: (id: string) => get<Episode[]>(`/drama/${id}/episodes`),
    world: (id: string) => get<World[]>(`/drama/${id}/world`),
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
    stream: (sessionId: string, content: string) =>
      fetch(`${BASE}/chat/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }),
  },
  writer: {
    list: () => get<WriterStyle[]>("/writer"),
  },
}
