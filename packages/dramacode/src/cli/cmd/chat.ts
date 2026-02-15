import type { CommandModule } from "yargs"
import { Session } from "../../session"
import { Chat } from "../../chat"
import { createInterface } from "readline"

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
    console.log(`  💡 Type your message. Use Ctrl+C to exit.\n`)

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    const prompt = () => {
      rl.question("작가 > ", async (input) => {
        const trimmed = input.trim()
        if (!trimmed) return prompt()

        process.stdout.write("\nDRAMACODE > ")

        const result = await Chat.stream({
          session_id: session.id,
          content: trimmed,
          model: args.model as string,
        })

        for await (const chunk of result.textStream) {
          process.stdout.write(chunk)
        }

        console.log("\n")
        prompt()
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
