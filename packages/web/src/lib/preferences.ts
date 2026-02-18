import { createSignal } from "solid-js"

const STORAGE_KEY = "dramacode-preferences"

export interface UserPreferences {
  sessionPanelOpen: boolean
  sessionPanelWidth: number
  dataPanelSide: "left" | "right"
  layoutDensity: "compact" | "comfortable"
  chatMaxWidth: "narrow" | "wide"
  defaultExpandedSections: string[]
}

const defaults: UserPreferences = {
  sessionPanelOpen: true,
  sessionPanelWidth: 208,
  dataPanelSide: "right",
  layoutDensity: "comfortable",
  chatMaxWidth: "narrow",
  defaultExpandedSections: ["characters"],
}

function load(): UserPreferences {
  if (typeof window === "undefined") return { ...defaults }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...defaults }
    const parsed = JSON.parse(raw) as Partial<UserPreferences>
    return {
      ...defaults,
      ...parsed,
      dataPanelSide: parsed.dataPanelSide === "left" || parsed.dataPanelSide === "right" ? parsed.dataPanelSide : defaults.dataPanelSide,
      layoutDensity: parsed.layoutDensity === "compact" || parsed.layoutDensity === "comfortable" ? parsed.layoutDensity : defaults.layoutDensity,
      chatMaxWidth: parsed.chatMaxWidth === "narrow" || parsed.chatMaxWidth === "wide" ? parsed.chatMaxWidth : defaults.chatMaxWidth,
      defaultExpandedSections: Array.isArray(parsed.defaultExpandedSections) ? parsed.defaultExpandedSections : defaults.defaultExpandedSections,
      sessionPanelOpen: typeof parsed.sessionPanelOpen === "boolean" ? parsed.sessionPanelOpen : defaults.sessionPanelOpen,
      sessionPanelWidth: typeof parsed.sessionPanelWidth === "number" ? parsed.sessionPanelWidth : defaults.sessionPanelWidth,
    }
  } catch {
    return { ...defaults }
  }
}

function save(prefs: UserPreferences) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {}
}

const [prefs, setPrefsRaw] = createSignal<UserPreferences>(load())

export function usePreferences() {
  function update(patch: Partial<UserPreferences>) {
    setPrefsRaw((prev) => {
      const next = { ...prev, ...patch }
      save(next)
      return next
    })
  }

  return [prefs, update] as const
}
