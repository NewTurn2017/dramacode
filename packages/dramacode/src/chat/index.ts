import { streamText, generateText, stepCountIs, type LanguageModel, type ModelMessage, type ImagePart, type TextPart } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic, type AnthropicProviderOptions } from "@ai-sdk/anthropic"
import type { JSONObject } from "@ai-sdk/provider"
import { ulid } from "ulid"
import path from "path"
import fs from "fs/promises"
import { Auth, OAUTH_DUMMY_KEY } from "../auth"
import { OpenAIAuth } from "../plugin/openai"
import { AnthropicAuth } from "../plugin/anthropic"
import { DramaPrompt } from "./prompt"
import { dramaTools, syncProjectTool } from "./tools"
import { Session } from "../session"
import { Drama } from "../drama"
import { Global } from "../global"
import { Log } from "../util/log"
import { compactIfNeeded } from "./compaction"
import { Rag } from "../rag"
import { heuristicDraft, parseDraftText, persistDraft, sanitizeDraft, sceneIntent, snapshot } from "./structured"
import { AutosaveMetrics } from "./autosave-metrics"
import { EventBus } from "../server/routes/events"

const log = Log.create({ service: "chat" })
const CHAT_IMAGES_DIR = path.join(Global.Path.data, "images", "chat")

export type ProviderKind = "openai" | "anthropic"

export type ChatImage = {
  data: string
  mediaType: string
}

async function saveChatImages(images: ChatImage[]): Promise<string[]> {
  await fs.mkdir(CHAT_IMAGES_DIR, { recursive: true })
  const filenames: string[] = []
  for (const img of images) {
    const ext = img.mediaType.split("/")[1] ?? "png"
    const filename = `${ulid()}.${ext}`
    const buf = Buffer.from(img.data, "base64")
    await Bun.write(path.join(CHAT_IMAGES_DIR, filename), buf)
    filenames.push(filename)
  }
  return filenames
}

type ResolvedProvider = {
  kind: ProviderKind
  call: (id: string) => LanguageModel
  defaultModel: string
}

export namespace Chat {
  export async function resolveProvider(preferred?: ProviderKind): Promise<ResolvedProvider> {
    if (preferred === "anthropic" || !preferred) {
      const auth = await Auth.get("anthropic")
      if (auth) {
        if (auth.type === "api") {
          const instance = createAnthropic({ apiKey: auth.key })
          return { kind: "anthropic", call: (id) => instance(id), defaultModel: "claude-sonnet-4-6" }
        }
        const instance = createAnthropic({ apiKey: OAUTH_DUMMY_KEY, fetch: AnthropicAuth.createFetch("anthropic") })
        return { kind: "anthropic", call: (id) => instance(id), defaultModel: "claude-sonnet-4-6" }
      }
    }
    if (preferred === "openai" || !preferred) {
      const auth = await Auth.get("openai")
      if (auth) {
        if (auth.type === "api") {
          const instance = createOpenAI({ apiKey: auth.key })
          return { kind: "openai", call: (id) => instance(id), defaultModel: "gpt-5.2" }
        }
        const instance = createOpenAI({ apiKey: OAUTH_DUMMY_KEY, fetch: OpenAIAuth.createFetch("openai") })
        return { kind: "openai", call: (id) => instance(id), defaultModel: "gpt-5.2" }
      }
    }
    if (preferred) {
      return resolveProvider()
    }
    throw new Error("인증되지 않았습니다. OpenAI 또는 Anthropic에 로그인해 주세요.")
  }

  type SystemOptsResult = {
    system?: string
    providerOptions?: Record<string, JSONObject>
  }

  function systemOpts(kind: ProviderKind, system: string): SystemOptsResult {
    if (kind === "openai") {
      return { providerOptions: { openai: { instructions: system, store: false } } }
    }
    return {
      system,
      providerOptions: {
        anthropic: {
          thinking: { type: "adaptive" },
        } satisfies AnthropicProviderOptions,
      },
    }
  }

  function toModel(messages: Session.Message[], images?: ChatImage[]): ModelMessage[] {
    return messages.map((m, i) => {
      const isLastUser = i === messages.length - 1 && m.role === "user" && images?.length
      if (isLastUser) {
        const parts: (TextPart | ImagePart)[] = images.map((img) => ({
          type: "image" as const,
          image: img.data,
          mediaType: img.mediaType,
        }))
        parts.push({ type: "text" as const, text: m.content })
        return { role: "user" as const, content: parts }
      }
      return {
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      }
    })
  }

  async function compact(input: {
    session_id: string
    drama_id?: string | null
    summary_count: number
    model: string
    provider: ResolvedProvider
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
          model: input.provider.call(input.model),
          prompt,
          ...(input.provider.kind === "openai" ? { providerOptions: { openai: { store: false } } } : {}),
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

  async function autosave(input: {
    provider: ResolvedProvider
    model: string
    drama_id?: string | null
    user: string
    assistant: string
    source: "send" | "stream" | "resync"
  }) {
    if (!input.drama_id) return
    const snap = snapshot(input.drama_id)

    const syncPrompt = [
      "You are the project-sync agent.",
      "You must call sync_project_data exactly once.",
      "Do not answer with plain text. Use tool call only.",
      "Only include confirmed facts from USER message and accepted facts from ASSISTANT message.",
      "Prioritize macro entities: drama meta, characters, episodes, world, plot. Scene only when clearly requested.",
      `Foundation snapshot: characters=${snap.characters}, episodes=${snap.episodes}, world=${snap.world}`,
      "",
      "[USER MESSAGE]",
      input.user,
      "",
      "[ASSISTANT MESSAGE]",
      input.assistant,
    ].join("\n")

    let retry = "tool sync did not execute"
    const sync = syncProjectTool({ drama_id: input.drama_id })
    try {
      const out = streamText({
        model: input.provider.call(input.model),
        messages: [{ role: "user", content: syncPrompt }],
        tools: { sync_project_data: sync.sync_project_data },
        stopWhen: stepCountIs(2),
        ...systemOpts(input.provider.kind, "Tool-calling sync agent. Always call sync_project_data once."),
      })
      await out.text
    } catch (error) {
      retry = error instanceof Error ? error.message : String(error)
      log.warn("chat.autosave.sync_agent_failed", {
        drama_id: input.drama_id,
        error: retry,
      })
    }

    if (sync.calls() === 0) {
      log.warn("chat.autosave.sync_agent_no_tool_call", {
        drama_id: input.drama_id,
        source: input.source,
      })
    }

    if (sync.calls() > 0) {
      const stats = sync.stats()
      if (stats) {
        const synced = {
          drama: stats.drama,
          characters: stats.characters,
          episodes: stats.episodes,
          world: stats.world,
          plot_points: stats.plot_points,
          scenes: stats.scenes,
        }
        AutosaveMetrics.record(input.drama_id, {
          time: Date.now(),
          status: "ok",
          source: input.source,
          retries: 0,
          extracted: synced,
          persisted: synced,
        })
        EventBus.emit(input.drama_id, "structured", {
          time: Date.now(),
          status: "ok",
          source: input.source,
          retries: 0,
          extracted: synced,
          persisted: synced,
          mode: "tool",
        })
        log.info("chat.autosave.tool_synced", { drama_id: input.drama_id, ...stats })
        return
      }
    }

    const basePrompt = [
      "작가 대화를 프로젝트 구조 데이터로 변환하세요.",
      "목표: 드라마 메타, 등장인물, 에피소드, 세계관, 플롯, 장면을 구조 JSON으로 추출.",
      "규칙:",
      "- USER 메시지를 1차 진실 소스로 사용.",
      "- ASSISTANT 내용은 USER가 수락/확정한 경우에만 반영.",
      "- 대화에 명시된 사실만 추출. 추측/창작 금지.",
      "- Macro-first: 포맷/세계관/캐릭터/에피소드/플롯 우선.",
      "- scene은 foundation(캐릭터>=2, 에피소드>=1, 세계관>=1) 전에는 비워야 함.",
      "- 이름, 회차, 핵심 갈등을 최대한 보존.",
      "- 불확실하면 해당 필드는 생략.",
      `현재 foundation 상태: characters=${snap.characters}, episodes=${snap.episodes}, world=${snap.world}`,
      "",
      "[USER MESSAGE]",
      input.user,
      "",
      "[ASSISTANT MESSAGE]",
      input.assistant,
    ].join("\n")

    for (const turn of [1, 2, 3]) {
      const response = await (async () => {
        const out = streamText({
          model: input.provider.call(input.model),
          messages: [
            {
              role: "user",
              content: retry ? `${basePrompt}\n\n이전 추출 오류를 수정하세요: ${retry}` : basePrompt,
            },
          ],
          ...systemOpts(
            input.provider.kind,
            "You are a strict structured data extractor. Return only JSON matching keys: drama, characters, episodes, world, plot_points, scenes.",
          ),
        })
        return { text: await out.text }
      })().catch((error) => {
        retry = error instanceof Error ? error.message : String(error)
        log.warn("chat.autosave.extract_failed", {
          drama_id: input.drama_id,
          turn,
          error: retry,
        })
        return null
      })

      if (!response) continue
      const parsed = parseDraftText(response.text)
      if (!parsed) {
        retry = "구조 JSON 파싱 실패"
        log.warn("chat.autosave.parse_failed", {
          drama_id: input.drama_id,
          turn,
          response_len: response.text.length,
        })
        continue
      }
      const draft = sanitizeDraft(parsed, snap, { allow_scenes: sceneIntent(input.user) })
      const extracted = {
        drama: Object.values(draft.drama).some((item) => item !== undefined) ? 1 : 0,
        characters: draft.characters.length,
        episodes: draft.episodes.length,
        world: draft.world.length,
        plot_points: draft.plot_points.length,
        scenes: draft.scenes.length,
      }
      const hasDraft =
        extracted.drama +
          extracted.characters +
          extracted.episodes +
          extracted.world +
          extracted.plot_points +
          extracted.scenes >
        0
      if (!hasDraft) return
      const stats = persistDraft(input.drama_id, draft)
      AutosaveMetrics.record(input.drama_id, {
        time: Date.now(),
        status: "ok",
        source: input.source,
        retries: turn - 1,
        extracted,
        persisted: stats,
      })
      EventBus.emit(input.drama_id, "structured", {
        time: Date.now(),
        status: "ok",
        source: input.source,
        retries: turn - 1,
        extracted,
        persisted: stats,
      })
      log.info("chat.autosave.persisted", { drama_id: input.drama_id, ...stats })
      return
    }

    const fallback = sanitizeDraft(heuristicDraft(input.user), snap, { allow_scenes: false })
    const fallbackExtracted = {
      drama: Object.values(fallback.drama).some((item) => item !== undefined) ? 1 : 0,
      characters: fallback.characters.length,
      episodes: fallback.episodes.length,
      world: fallback.world.length,
      plot_points: fallback.plot_points.length,
      scenes: 0,
    }
    const hasFallback =
      fallbackExtracted.drama +
        fallbackExtracted.characters +
        fallbackExtracted.episodes +
        fallbackExtracted.world +
        fallbackExtracted.plot_points >
      0
    if (hasFallback) {
      const stats = persistDraft(input.drama_id, fallback)
      AutosaveMetrics.record(input.drama_id, {
        time: Date.now(),
        status: "ok",
        source: input.source,
        retries: 3,
        extracted: fallbackExtracted,
        persisted: stats,
      })
      EventBus.emit(input.drama_id, "structured", {
        time: Date.now(),
        status: "ok",
        source: input.source,
        retries: 3,
        extracted: fallbackExtracted,
        persisted: stats,
        mode: "heuristic",
      })
      log.warn("chat.autosave.heuristic_fallback", { drama_id: input.drama_id, ...stats })
      return
    }

    AutosaveMetrics.record(input.drama_id, {
      time: Date.now(),
      status: "error",
      source: input.source,
      retries: 3,
      error: retry,
    })
    EventBus.emit(input.drama_id, "structured", {
      time: Date.now(),
      status: "error",
      source: input.source,
      retries: 3,
      error: retry,
    })
  }

  export async function organize(input: { session_id: string; model?: string; provider?: ProviderKind }) {
    const p = await resolveProvider(input.provider)
    const model = input.model ?? p.defaultModel
    const session = Session.get(input.session_id)
    if (!session.drama_id) throw new Error("session has no drama_id")

    const messages = Session.messages(input.session_id, 10_000)
    if (messages.length === 0) return { status: "empty" as const }

    const conversation = messages
      .map((m) => `[${m.role.toUpperCase()}]\n${m.content}`)
      .join("\n\n---\n\n")

    const snap = snapshot(session.drama_id)
    const prompt = [
      "You are the project-sync agent.",
      "Below is the FULL conversation between a writer and AI assistant about a drama project.",
      "Extract ALL confirmed structured data and call sync_project_data ONCE with every entity.",
      "Include everything: drama meta, characters, episodes, world-building, plot points, scenes.",
      "Rules:",
      "- Include only confirmed facts (explicitly stated or mutually agreed upon).",
      "- Do not invent or guess data that is not in the conversation.",
      "- This is a FULL OVERWRITE sync — include ALL entities, not just changes.",
      "- Prefer the most recent version if something was revised during the conversation.",
      `Current foundation: characters=${snap.characters}, episodes=${snap.episodes}, world=${snap.world}`,
      "",
      "[FULL CONVERSATION]",
      conversation,
    ].join("\n")

    const sync = syncProjectTool({ drama_id: session.drama_id })
    try {
      const out = streamText({
        model: p.call(model),
        messages: [{ role: "user", content: prompt }],
        tools: { sync_project_data: sync.sync_project_data },
        stopWhen: stepCountIs(3),
        ...systemOpts(p.kind, "Tool-calling sync agent. Always call sync_project_data exactly once with all entities."),
      })
      await out.text
    } catch (error) {
      log.error("chat.organize.failed", {
        session_id: input.session_id,
        drama_id: session.drama_id,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }

    const stats = sync.stats()
    log.info("chat.organize.done", { session_id: input.session_id, drama_id: session.drama_id, calls: sync.calls(), ...stats })

    EventBus.emit(session.drama_id, "structured")

    return { status: "ok" as const, stats }
  }

  export async function resync(input: {
    drama_id: string
    model?: string
    provider?: ProviderKind
    session_limit?: number
    pair_limit?: number
  }) {
    const p = await resolveProvider(input.provider)
    const model = input.model ?? p.defaultModel
    const sessionLimit = Math.max(1, Math.min(100, input.session_limit ?? 20))
    const pairLimit = Math.max(1, Math.min(200, input.pair_limit ?? 20))
    const sessions = Session.listByDrama(input.drama_id, sessionLimit)
    const pairs: Array<{ user: string; assistant: string }> = []

    for (const session of sessions) {
      const messages = Session.messages(session.id, 80)
      for (let i = 0; i < messages.length - 1; i++) {
        const cur = messages[i]
        const next = messages[i + 1]
        if (!cur || !next) continue
        if (cur.role !== "user" || next.role !== "assistant") continue
        if (!cur.content.trim() || !next.content.trim()) continue
        pairs.push({ user: cur.content, assistant: next.content })
      }
    }

    const recent = pairs.slice(-pairLimit)
    for (const pair of recent) {
      await autosave({
        provider: p,
        model,
        drama_id: input.drama_id,
        user: pair.user,
        assistant: pair.assistant,
        source: "resync",
      })
    }

    const status = AutosaveMetrics.get(input.drama_id)
    EventBus.emit(input.drama_id, "structured", {
      time: Date.now(),
      status: "ok",
      source: "resync",
      retries: 0,
      persisted: status.persisted,
      extracted: status.extracted,
    })

    return {
      session_limit: sessionLimit,
      pair_limit: pairLimit,
      scanned_sessions: sessions.length,
      processed_pairs: recent.length,
      metrics: status,
    }
  }

  export async function send(input: { session_id: string; content: string; images?: ChatImage[]; model?: string; provider?: ProviderKind }) {
    const p = await resolveProvider(input.provider)
    const model = input.model ?? p.defaultModel

    const savedFilenames = input.images?.length ? await saveChatImages(input.images) : undefined

    Session.addMessage({
      session_id: input.session_id,
      role: "user",
      content: input.content,
      images: savedFilenames ? JSON.stringify(savedFilenames) : undefined,
    })

    const session = Session.get(input.session_id)
    await compact({
      session_id: input.session_id,
      drama_id: session.drama_id,
      summary_count: session.summary_count,
      model,
      provider: p,
    })
    const history = Session.messages(input.session_id)
    const base = DramaPrompt.buildContext(session.drama_id)
    const rag = session.drama_id
      ? await Rag.buildContext({ query: input.content, drama_id: session.drama_id }).catch((err) => {
          log.error("chat.rag_context_failed", {
            session_id: input.session_id,
            drama_id: session.drama_id,
            error: err instanceof Error ? err.message : String(err),
          })
          return ""
        })
      : ""
    const system = rag ? `${base}\n\n${rag}` : base
    const tools = dramaTools({ session_id: input.session_id, drama_id: session.drama_id })

    log.info("chat.send", {
      session_id: input.session_id,
      model,
      messages: history.length,
      images: input.images?.length ?? 0,
    })

    const result = streamText({
      model: p.call(model),
      messages: toModel(history, input.images),
      tools,
      stopWhen: stepCountIs(12),
      ...systemOpts(p.kind, system),
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

  export async function greet(input: { session_id: string; model?: string; provider?: ProviderKind }) {
    const p = await resolveProvider(input.provider)
    const model = input.model ?? p.defaultModel
    const session = Session.get(input.session_id)
    const system = DramaPrompt.buildContext(session.drama_id)
    const dramaTitle = session.drama_id ? Drama.get(session.drama_id).title : undefined

    return streamText({
      model: p.call(model),
      messages: [{ role: "user", content: DramaPrompt.greetingPrompt(dramaTitle) }],
      tools: dramaTools({ session_id: input.session_id, drama_id: session.drama_id }),
      stopWhen: stepCountIs(3),
      ...systemOpts(p.kind, system),
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

  export async function stream(input: { session_id: string; content: string; images?: ChatImage[]; model?: string; provider?: ProviderKind }) {
    const p = await resolveProvider(input.provider)
    const model = input.model ?? p.defaultModel

    const savedFilenames = input.images?.length ? await saveChatImages(input.images) : undefined

    Session.addMessage({
      session_id: input.session_id,
      role: "user",
      content: input.content,
      images: savedFilenames ? JSON.stringify(savedFilenames) : undefined,
    })

    const session = Session.get(input.session_id)
    await compact({
      session_id: input.session_id,
      drama_id: session.drama_id,
      summary_count: session.summary_count,
      model,
      provider: p,
    })
    const history = Session.messages(input.session_id)
    const base = DramaPrompt.buildContext(session.drama_id)
    const rag = session.drama_id
      ? await Rag.buildContext({ query: input.content, drama_id: session.drama_id }).catch((err) => {
          log.error("chat.rag_context_failed", {
            session_id: input.session_id,
            drama_id: session.drama_id,
            error: err instanceof Error ? err.message : String(err),
          })
          return ""
        })
      : ""
    const system = rag ? `${base}\n\n${rag}` : base
    const tools = dramaTools({ session_id: input.session_id, drama_id: session.drama_id })

    return streamText({
      model: p.call(model),
      messages: toModel(history, input.images),
      tools,
      stopWhen: stepCountIs(12),
      ...systemOpts(p.kind, system),
      async onFinish({ text, steps }) {
        if (text.trim()) {
          Session.addMessage({
            session_id: input.session_id,
            role: "assistant",
            content: text,
          })
        } else if (steps.some((s) => s.toolCalls.length > 0)) {
          log.warn("chat.stream.no_text_after_tools", {
            session_id: input.session_id,
            steps: steps.length,
            tool_calls: steps.reduce((n, s) => n + s.toolCalls.length, 0),
          })
        }
      },
    })
  }
}
