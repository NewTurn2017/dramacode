import { streamText, generateText, stepCountIs, type ModelMessage } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { Auth, OAUTH_DUMMY_KEY } from "../auth"
import { OpenAIAuth } from "../plugin/openai"
import { DramaPrompt } from "./prompt"
import { dramaTools } from "./tools"
import { Session } from "../session"
import { Log } from "../util/log"
import { compactIfNeeded } from "./compaction"

const log = Log.create({ service: "chat" })

export namespace Chat {
  async function provider() {
    const auth = await Auth.get("openai")
    if (!auth) throw new Error("OpenAI not authenticated. Run: dramacode auth login")
    if (auth.type === "api") return createOpenAI({ apiKey: auth.key })
    return createOpenAI({ apiKey: OAUTH_DUMMY_KEY, fetch: OpenAIAuth.createFetch("openai") })
  }

  function toModel(messages: Session.Message[]): ModelMessage[] {
    return messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }))
  }

  async function compact(input: {
    session_id: string
    drama_id?: string | null
    summary_count: number
    model: string
    openai: Awaited<ReturnType<typeof provider>>
  }) {
    const total = Session.totalChars(input.session_id)
    const messages = Session.messages(input.session_id, 10_000)
    const context = DramaPrompt.buildContext(input.drama_id)
    const result = await compactIfNeeded({
      total_chars: total,
      summary_count: input.summary_count + 1,
      context,
      messages,
      summarize: async (prompt) => {
        const response = await generateText({
          model: input.openai(input.model),
          prompt,
          providerOptions: { openai: { store: false } },
        })
        return response.text
      },
    })
    if (!result) return

    Session.compact({
      session_id: input.session_id,
      summary: result.summary,
      keep_last: result.keep_last,
    })

    log.info("chat.compacted", {
      session_id: input.session_id,
      total_chars: total,
      keep_last: result.keep_last,
      summary_chars: result.summary.length,
    })
  }

  export async function send(input: { session_id: string; content: string; model?: string }) {
    const openai = await provider()
    const model = input.model ?? "gpt-5.2"

    Session.addMessage({
      session_id: input.session_id,
      role: "user",
      content: input.content,
    })

    const session = Session.get(input.session_id)
    await compact({
      session_id: input.session_id,
      drama_id: session.drama_id,
      summary_count: session.summary_count,
      model,
      openai,
    })
    const history = Session.messages(input.session_id)
    const system = DramaPrompt.buildContext(session.drama_id)
    const tools = dramaTools({ session_id: input.session_id, drama_id: session.drama_id })

    log.info("chat.send", {
      session_id: input.session_id,
      model,
      messages: history.length,
    })

    const result = streamText({
      model: openai(model),
      messages: toModel(history),
      tools,
      stopWhen: stepCountIs(5),
      providerOptions: { openai: { instructions: system, store: false } },
    })

    const text = await result.text
    const msg = Session.addMessage({
      session_id: input.session_id,
      role: "assistant",
      content: text,
    })

    log.info("chat.complete", {
      session_id: input.session_id,
      length: text.length,
    })

    return { message: msg, stream: result }
  }

  export async function greet(input: { session_id: string; model?: string }) {
    const openai = await provider()
    const model = input.model ?? "gpt-5.2"
    const session = Session.get(input.session_id)
    const system = DramaPrompt.buildContext(session.drama_id)

    return streamText({
      model: openai(model),
      messages: [{ role: "user", content: DramaPrompt.greetingPrompt }],
      tools: dramaTools({ session_id: input.session_id, drama_id: session.drama_id }),
      stopWhen: stepCountIs(3),
      providerOptions: { openai: { instructions: system, store: false } },
      async onFinish({ text }) {
        if (text.trim()) {
          Session.addMessage({
            session_id: input.session_id,
            role: "assistant",
            content: text,
          })
        }
      },
    })
  }

  export async function stream(input: { session_id: string; content: string; model?: string }) {
    const openai = await provider()
    const model = input.model ?? "gpt-5.2"

    Session.addMessage({
      session_id: input.session_id,
      role: "user",
      content: input.content,
    })

    const session = Session.get(input.session_id)
    await compact({
      session_id: input.session_id,
      drama_id: session.drama_id,
      summary_count: session.summary_count,
      model,
      openai,
    })
    const history = Session.messages(input.session_id)
    const system = DramaPrompt.buildContext(session.drama_id)
    const tools = dramaTools({ session_id: input.session_id, drama_id: session.drama_id })

    return streamText({
      model: openai(model),
      messages: toModel(history),
      tools,
      stopWhen: stepCountIs(5),
      providerOptions: { openai: { instructions: system, store: false } },
      async onFinish({ text }) {
        if (text.trim()) {
          Session.addMessage({
            session_id: input.session_id,
            role: "assistant",
            content: text,
          })
        }
      },
    })
  }
}
