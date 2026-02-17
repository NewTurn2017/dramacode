import { Episode, Scene, Drama } from "./index"

/**
 * Convert drama data to Fountain screenplay format.
 * Fountain spec: https://fountain.io/syntax
 *
 * Key rules:
 * - Scene headings: INT. or EXT. + LOCATION - TIME_OF_DAY
 * - Character names: UPPERCASE or @Name for non-Latin (Korean)
 * - Action: plain paragraphs
 * - Dialogue: character name line, then dialogue on next line
 * - Notes: [[note text]]
 * - Section headings: # for Act, ## for sequence
 */

const TIME_MAP: Record<string, string> = {
  DAY: "DAY",
  NIGHT: "NIGHT",
  DAWN: "DAWN",
  DUSK: "DUSK",
}

function formatSceneHeading(location: string | null, timeOfDay: string | null): string {
  const loc = location ?? "UNKNOWN LOCATION"
  const tod = TIME_MAP[timeOfDay ?? ""] ?? "DAY"
  // Default to INT. — user can specify INT./EXT. in location text
  if (loc.startsWith("INT.") || loc.startsWith("EXT.") || loc.startsWith("INT/EXT.")) {
    return `${loc} - ${tod}`
  }
  return `INT. ${loc} - ${tod}`
}

function formatCharacterName(name: string): string {
  // Korean names need @ prefix in Fountain spec for non-Latin characters
  // Check if name contains any non-ASCII characters
  if (/[^\x00-\x7F]/.test(name)) {
    return `@${name}`
  }
  return name.toUpperCase()
}

function parseDialogue(dialogue: string): { character: string; line: string }[] {
  // Parse "캐릭터명: 대사" format, one per line
  const results: { character: string; line: string }[] = []
  for (const raw of dialogue.split("\n")) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    const colonIdx = trimmed.indexOf(":")
    if (colonIdx > 0 && colonIdx < 20) {
      // Looks like "Character: Dialogue"
      const character = trimmed.slice(0, colonIdx).trim()
      const line = trimmed.slice(colonIdx + 1).trim()
      if (character && line) {
        results.push({ character, line })
        continue
      }
    }
    // No colon pattern — treat as action/narration
    results.push({ character: "", line: trimmed })
  }
  return results
}

type SceneData = {
  location: string | null
  time_of_day: string | null
  description: string | null
  dialogue: string | null
  notes: string | null
  number: number
}

function formatScene(scene: SceneData): string {
  const parts: string[] = []

  // Scene heading
  parts.push(formatSceneHeading(scene.location, scene.time_of_day))
  parts.push("")

  // Description (action lines)
  if (scene.description) {
    parts.push(scene.description)
    parts.push("")
  }

  // Dialogue
  if (scene.dialogue) {
    const parsed = parseDialogue(scene.dialogue)
    for (const entry of parsed) {
      if (entry.character) {
        parts.push(formatCharacterName(entry.character))
        parts.push(entry.line)
        parts.push("")
      } else {
        // Action line between dialogues
        parts.push(entry.line)
        parts.push("")
      }
    }
  }

  // Notes
  if (scene.notes) {
    parts.push(`[[${scene.notes}]]`)
    parts.push("")
  }

  return parts.join("\n")
}

export function dramaToFountain(dramaId: string, episodeNumber?: number): string {
  const drama = Drama.get(dramaId)
  const episodes = Episode.listByDrama(dramaId)

  const filteredEpisodes = episodeNumber ? episodes.filter((ep) => ep.number === episodeNumber) : episodes

  const parts: string[] = []

  // Title page
  parts.push(`Title: ${drama.title}`)
  if (drama.genre) parts.push(`Genre: ${drama.genre}`)
  if (drama.logline) parts.push(`Notes: ${drama.logline}`)
  parts.push("")
  parts.push("===") // Title page separator in Fountain
  parts.push("")

  for (const ep of filteredEpisodes) {
    // Episode as section heading
    parts.push(`# Episode ${ep.number}: ${ep.title}`)
    parts.push("")

    if (ep.synopsis) {
      parts.push(`/* ${ep.synopsis} */`)
      parts.push("")
    }

    const scenes = Scene.listByEpisode(ep.id)
    for (const sc of scenes) {
      parts.push(formatScene(sc as SceneData))
    }
  }

  // Handle dramas with scenes but no episodes (edge case)
  if (filteredEpisodes.length === 0 && !episodeNumber) {
    // No episodes found, check if there are any orphan scenes
    parts.push("/* No episodes found */")
  }

  return parts.join("\n")
}
