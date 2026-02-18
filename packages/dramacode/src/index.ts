import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { Log } from "./util/log"
import { AuthCommand } from "./cli/cmd/auth"
import { ServeCommand } from "./cli/cmd/serve"
import { ChatCommand } from "./cli/cmd/chat"
import { DramaCommand } from "./cli/cmd/drama"
import { Server } from "./server/server"

export const VERSION = "0.4.7"
Server.setVersion(VERSION)

process.on("unhandledRejection", (e) => {
  Log.Default.error("rejection", { e: e instanceof Error ? e.message : String(e) })
})

process.on("uncaughtException", (e) => {
  Log.Default.error("exception", { e: e instanceof Error ? e.message : String(e) })
})

const logo = () =>
  [
    "",
    "  ╔══════════════════════════════════╗",
    "  ║         D R A M A C O D E        ║",
    "  ║    AI-powered screenwriting       ║",
    "  ╚══════════════════════════════════╝",
    "",
  ].join("\n")

const cli = yargs(hideBin(process.argv))
  .scriptName("dramacode")
  .wrap(100)
  .help("help")
  .alias("help", "h")
  .version("version", "show version number", VERSION)
  .alias("version", "v")
  .option("print-logs", {
    describe: "print logs to stderr",
    type: "boolean",
  })
  .middleware(async (opts) => {
    await Log.init({
      print: process.argv.includes("--print-logs"),
      level: "INFO",
    })
    Log.Default.info("dramacode", { version: VERSION, args: process.argv.slice(2) })
  })
  .usage(logo())
  .command(AuthCommand)
  .command(ServeCommand)
  .command(ChatCommand)
  .command(DramaCommand)
  .fail((msg, err) => {
    if (msg?.startsWith("Unknown argument") || msg?.startsWith("Not enough non-option arguments")) {
      cli.showHelp("log")
    }
    if (err) throw err
    process.exit(1)
  })
  .strict()

try {
  await cli.parse()
} catch (e) {
  Log.Default.error("fatal", {
    name: e instanceof Error ? e.name : "Unknown",
    message: e instanceof Error ? e.message : String(e),
  })
  console.error(e instanceof Error ? e.message : String(e))
  process.exitCode = 1
} finally {
  process.exit()
}
