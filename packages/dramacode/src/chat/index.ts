import { streamText, stepCountIs, type ModelMessage } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { Auth, OAUTH_DUMMY_KEY } from "../auth"
import { OpenAIAuth } from "../plugin/openai"
import { DramaPrompt } from "./prompt"
import { dramaTools } from "./tools"
import { Session } from "../session"
import { Log } from "../util/log"

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

  export async function send(input: {
    session_id: string
    content: string
    model?: string
    drama_title?: string
    episode_num?: number
  }) {
    const openai = await provider()
    const model = input.model ?? "gpt-5.2"

    Session.addMessage({
      session_id: input.session_id,
      role: "user",
      content: input.content,
    })

    const session = Session.get(input.session_id)
    const history = Session.messages(input.session_id)
    const system = DramaPrompt.withContext(input.drama_title, input.episode_num)
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

  export async function stream(input: {
    session_id: string
    content: string
    model?: string
    drama_title?: string
    episode_num?: number
  }) {
    const openai = await provider()
    const model = input.model ?? "gpt-5.2"

    Session.addMessage({
      session_id: input.session_id,
      role: "user",
      content: input.content,
    })

    const session = Session.get(input.session_id)
    const history = Session.messages(input.session_id)
    const system = DramaPrompt.withContext(input.drama_title, input.episode_num)
    const tools = dramaTools({ session_id: input.session_id, drama_id: session.drama_id })

    return streamText({
      model: openai(model),
      messages: toModel(history),
      tools,
      stopWhen: stepCountIs(5),
      providerOptions: { openai: { instructions: system, store: false } },
      async onFinish({ text }) {
        Session.addMessage({
          session_id: input.session_id,
          role: "assistant",
          content: text,
        })
      },
    })
  }
}
