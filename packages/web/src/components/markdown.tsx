import { createMemo } from "solid-js"
import { marked } from "marked"

marked.setOptions({
  breaks: true,
  gfm: true,
})

export function Markdown(props: { content: string; class?: string }) {
  const html = createMemo(() => marked.parse(props.content, { async: false }) as string)
  return <div class={`prose ${props.class ?? ""}`} innerHTML={html()} />
}
