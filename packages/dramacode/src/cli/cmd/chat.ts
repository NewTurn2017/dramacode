import type { CommandModule } from "yargs"
import { Session } from "../../session"
import { Chat } from "../../chat"
import { createInterface } from "readline"

const THINKING_FRAMES = [
  "✍️  구상 중",
  "✍️  구상 중.",
  "✍️  구상 중..",
  "✍️  구상 중...",
  "📖 이야기를 짜는 중",
  "📖 이야기를 짜는 중.",
  "📖 이야기를 짜는 중..",
  "📖 이야기를 짜는 중...",
  "🎭 캐릭터를 떠올리는 중",
  "🎭 캐릭터를 떠올리는 중.",
  "🎭 캐릭터를 떠올리는 중..",
  "🎭 캐릭터를 떠올리는 중...",
  "🎬 장면을 그리는 중",
  "🎬 장면을 그리는 중.",
  "🎬 장면을 그리는 중..",
  "🎬 장면을 그리는 중...",
  "💭 대사를 다듬는 중",
  "💭 대사를 다듬는 중.",
  "💭 대사를 다듬는 중..",
  "💭 대사를 다듬는 중...",
  "🌙 복선을 심는 중",
  "🌙 복선을 심는 중.",
  "🌙 복선을 심는 중..",
  "🌙 복선을 심는 중...",
]

function startThinking() {
  let frame = 0
  let maxLen = 0
  const interval = setInterval(() => {
    const text = THINKING_FRAMES[frame % THINKING_FRAMES.length]!
    maxLen = Math.max(maxLen, text.length)
    process.stdout.write(`\r  ${text}${" ".repeat(maxLen - text.length)}`)
    frame++
  }, 280)
  return () => {
    clearInterval(interval)
    process.stdout.write(`\r${" ".repeat(maxLen + 4)}\r`)
  }
}

export const ChatCommand: CommandModule = {
  command: "chat [session]",
  describe: "Start a drama writing conversation",
  builder: (yargs) =>
    yargs
      .positional("session", {
        describe: "Session ID to resume (creates new if omitted)",
        type: "string",
      })
      .option("model", {
        describe: "Model to use",
        type: "string",
        default: "gpt-5.2",
      })
      .option("title", {
        describe: "Title for new session",
        type: "string",
      }),
  handler: async (args) => {
    const session = args.session
      ? Session.get(args.session as string)
      : Session.create({ title: (args.title as string) ?? undefined })

    console.log(`\n  📝 Session: ${session.title}`)
    console.log(`  🔑 ID: ${session.id}`)

    if (session.drama_id) {
      console.log(`  🎬 Drama: ${session.drama_id}`)
    }

    if (args.session) {
      const messages = Session.messages(session.id)
      const total = messages.length
      if (total > 0) {
        console.log(`  📜 이전 대화 ${total}건`)
        const recent = messages.slice(-4)
        for (const msg of recent) {
          const label = msg.role === "user" ? "작가" : "AI"
          const truncated = msg.content.length > 150 ? msg.content.slice(0, 150) + "..." : msg.content
          console.log(`    ${label}: ${truncated}`)
        }
      }
    }

    console.log(`  💡 Type your message. Use Ctrl+C to exit.\n`)

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    const prompt = () => {
      rl.question("작가 > ", async (input) => {
        const trimmed = input.trim()
        if (!trimmed) return prompt()

        const stopThinking = startThinking()
        let started = false

        try {
          const result = await Chat.stream({
            session_id: session.id,
            content: trimmed,
            model: args.model as string,
          })

          for await (const part of result.fullStream) {
            if (part.type === "text-delta") {
              if (!started) {
                stopThinking()
                process.stdout.write("\nDRAMACODE > ")
                started = true
              }
              process.stdout.write(part.text)
            } else if (part.type === "tool-call") {
              if (!started) {
                stopThinking()
                process.stdout.write("\nDRAMACODE > ")
                started = true
              }
              process.stdout.write(`\n  🔧 ${part.toolName}...`)
            } else if (part.type === "tool-result") {
              process.stdout.write(` ✅\n`)
            }
          }

          if (!started) stopThinking()

          console.log("\n")
          prompt()
        } catch (e) {
          stopThinking()
          const msg = e instanceof Error ? e.message : String(e)
          console.error(`\n  ❌ 오류: ${msg}`)
          console.log("")
          prompt()
        }
      })
    }

    prompt()

    await new Promise<void>((resolve) => {
      rl.on("close", () => {
        console.log("\n\n  👋 세션이 저장되었습니다.")
        console.log(`  📌 이어서 작업: dramacode chat ${session.id}\n`)
        resolve()
      })
    })
  },
}
