import { createMemo } from "solid-js"
import { marked } from "marked"

marked.setOptions({
  breaks: true,
  gfm: true,
})

/**
 * marked v17 bug workaround:
 * `**text(parens)**한글` fails to parse as bold when closing `**`
 * follows `)` and is immediately trailed by a word character.
 * Pre-convert these to `<strong>` before marked sees them.
 */
function fixBoldParenBug(text: string): string {
  return text.replace(
    /\*\*([^*]+?\([^)]*\))\*\*(?=[\w\uAC00-\uD7AF])/g,
    "<strong>$1</strong>",
  )
}

export function Markdown(props: { content: string; class?: string }) {
  const html = createMemo(() =>
    marked.parse(fixBoldParenBug(props.content), { async: false }) as string,
  )
  return <div class={`prose ${props.class ?? ""}`} innerHTML={html()} />
}
