import { Episode, Scene, Drama, Character } from "./index"

const TOD_KO: Record<string, string> = {
  DAY: "낮",
  NIGHT: "밤",
  DAWN: "새벽",
  DUSK: "황혼",
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function parseDialogue(dialogue: string): { character: string; line: string }[] {
  const results: { character: string; line: string }[] = []
  for (const raw of dialogue.split("\n")) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    const colonIdx = trimmed.indexOf(":")
    if (colonIdx > 0 && colonIdx < 20) {
      const character = trimmed.slice(0, colonIdx).trim()
      const line = trimmed.slice(colonIdx + 1).trim()
      if (character && line) {
        results.push({ character, line })
        continue
      }
    }
    results.push({ character: "", line: trimmed })
  }
  return results
}

function sceneHeading(location: string | null, timeOfDay: string | null): string {
  const loc = location ?? "장소 미정"
  const tod = TOD_KO[timeOfDay ?? ""] ?? "낮"
  return `${esc(loc)} — ${tod}`
}

type SceneRow = {
  location: string | null
  time_of_day: string | null
  description: string | null
  dialogue: string | null
  notes: string | null
  number: number
}

function renderScene(sc: SceneRow): string {
  const parts: string[] = []

  parts.push(`<div class="scene-heading">S#${sc.number}. ${sceneHeading(sc.location, sc.time_of_day)}</div>`)

  if (sc.description) {
    parts.push(`<div class="action">${esc(sc.description).replace(/\n/g, "<br>")}</div>`)
  }

  if (sc.dialogue) {
    const parsed = parseDialogue(sc.dialogue)
    for (const entry of parsed) {
      if (entry.character) {
        parts.push(`<div class="character">${esc(entry.character)}</div>`)
        parts.push(`<div class="dialogue">${esc(entry.line)}</div>`)
      } else {
        parts.push(`<div class="action">${esc(entry.line)}</div>`)
      }
    }
  }

  if (sc.notes) {
    parts.push(`<div class="note">${esc(sc.notes).replace(/\n/g, "<br>")}</div>`)
  }

  return parts.join("\n")
}

export function dramaToScreenplayHtml(dramaId: string, episodeNumber?: number): string {
  const drama = Drama.get(dramaId)
  const episodes = Episode.listByDrama(dramaId)
  const characters = Character.listByDrama(dramaId).filter((c) => !c.name.startsWith("(미정)"))

  const filtered = episodeNumber ? episodes.filter((ep) => ep.number === episodeNumber) : episodes

  const charSection =
    characters.length > 0
      ? `<div class="characters-section">
      <h3>등장인물</h3>
      <div class="characters-grid">
        ${characters
          .map(
            (c) =>
              `<div class="char-item"><span class="char-name">${esc(c.name)}</span>${c.role ? `<span class="char-role">${esc(c.role)}</span>` : ""}${c.occupation ? ` — ${esc(c.occupation)}` : ""}</div>`,
          )
          .join("\n        ")}
      </div>
    </div>`
      : ""

  const bodyParts: string[] = []

  for (const ep of filtered) {
    bodyParts.push(`<div class="episode-heading">제${ep.number}화 ${esc(ep.title)}</div>`)
    if (ep.synopsis) {
      bodyParts.push(`<div class="synopsis">${esc(ep.synopsis)}</div>`)
    }
    const scenes = Scene.listByEpisode(ep.id)
    for (const sc of scenes) {
      bodyParts.push(renderScene(sc as SceneRow))
    }
  }

  if (filtered.length === 0) {
    bodyParts.push('<div class="action" style="text-align:center;color:#999;margin:3rem 0">에피소드가 없습니다</div>')
  }

  const subtitle = episodeNumber ? `제${episodeNumber}화` : `전${episodes.length}화`

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${esc(drama.title)}</title>
<style>
@page {
  size: A4;
  margin: 2.5cm 2cm 2.5cm 3cm;
  @bottom-center { content: counter(page); font-size: 9pt; color: #999; }
}
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", "Nanum Gothic", sans-serif;
  font-size: 11pt;
  line-height: 1.7;
  color: #1a1a1a;
  counter-reset: page;
}

/* ── Title page ── */
.title-page {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  min-height: 85vh; text-align: center;
  page-break-after: always;
}
.title-page h1 { font-size: 26pt; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 0.6rem; }
.title-page .subtitle { font-size: 13pt; color: #666; margin-bottom: 2rem; }
.title-page .logline { font-size: 10.5pt; color: #888; max-width: 28rem; line-height: 1.6; margin-bottom: 1.5rem; }
.title-page .meta-row { font-size: 10pt; color: #999; }
.title-page .meta-row span + span::before { content: "  ·  "; }

/* ── Characters ── */
.characters-section { margin-top: 1.5rem; text-align: left; width: 100%; max-width: 28rem; }
.characters-section h3 {
  font-size: 9pt; text-transform: uppercase; letter-spacing: 0.15em;
  color: #999; border-bottom: 1px solid #ddd; padding-bottom: 0.3rem; margin-bottom: 0.6rem;
}
.characters-grid { display: flex; flex-direction: column; gap: 0.25rem; }
.char-item { font-size: 10pt; color: #555; }
.char-name { font-weight: 600; color: #1a1a1a; }
.char-role { font-size: 9pt; color: #999; margin-left: 0.3rem; }

/* ── Episode ── */
.episode-heading {
  font-size: 15pt; font-weight: 700;
  margin: 2.5rem 0 0.4rem; padding-bottom: 0.35rem;
  border-bottom: 2px solid #1a1a1a;
  page-break-before: always;
}
.episode-heading:first-of-type { page-break-before: auto; }
.synopsis {
  font-size: 10pt; color: #777; font-style: italic;
  margin-bottom: 1.8rem; line-height: 1.5;
}

/* ── Scene ── */
.scene-heading {
  font-size: 11pt; font-weight: 700;
  margin: 2rem 0 0.5rem; padding: 0.3rem 0.5rem;
  background: #f4f4f4; border-left: 3px solid #1a1a1a;
  page-break-after: avoid;
}
.action { margin: 0.6rem 0; text-align: justify; }
.character {
  font-weight: 700; font-size: 10.5pt;
  margin: 1rem 0 0 2rem;
  letter-spacing: 0.03em;
  page-break-after: avoid;
}
.dialogue {
  margin: 0.15rem 0 0.6rem 2rem; padding-left: 1.5rem;
  text-align: justify; font-size: 10.5pt;
}
.note {
  font-size: 9pt; color: #999; font-style: italic;
  margin: 0.5rem 0; padding-left: 0.8rem;
  border-left: 2px solid #ddd;
}

/* ── Screen preview ── */
@media screen {
  body { max-width: 780px; margin: 2.5rem auto; padding: 0 2rem 4rem; }
  .title-page { min-height: 60vh; }
}
@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
</style>
</head>
<body>

<div class="title-page">
  <h1>${esc(drama.title)}</h1>
  <div class="subtitle">${subtitle}</div>
  ${drama.logline ? `<div class="logline">${esc(drama.logline)}</div>` : ""}
  <div class="meta-row">
    ${drama.genre ? `<span>${esc(drama.genre)}</span>` : ""}
    ${drama.tone ? `<span>${esc(drama.tone)}</span>` : ""}
    ${drama.setting ? `<span>${esc(drama.setting)}</span>` : ""}
  </div>
  ${charSection}
</div>

${bodyParts.join("\n")}

<script>window.onload=function(){setTimeout(function(){window.print()},400)}</script>
</body>
</html>`
}
