import type { CommandModule } from "yargs"
import { Auth } from "../../auth"

export const AuthCommand: CommandModule = {
  command: "auth",
  describe: "manage authentication",
  builder(yargs) {
    return yargs
      .command({
        command: "login",
        describe: "login to OpenAI",
        handler: async () => {
          const { OpenAIAuth } = await import("../../plugin/openai")
          try {
            const result = await OpenAIAuth.browserLogin()
            await Auth.set("openai", {
              type: "oauth",
              refresh: result.refresh,
              access: result.access,
              expires: result.expires,
              accountId: result.accountId,
            })
            console.log("Logged in successfully.")
          } catch (e) {
            console.error("Login failed:", e instanceof Error ? e.message : String(e))
            process.exit(1)
          }
        },
      })
      .command({
        command: "login-device",
        describe: "login to OpenAI via device code",
        handler: async () => {
          const { OpenAIAuth } = await import("../../plugin/openai")
          try {
            const result = await OpenAIAuth.deviceLogin()
            await Auth.set("openai", {
              type: "oauth",
              refresh: result.refresh,
              access: result.access,
              expires: result.expires,
              accountId: result.accountId,
            })
            console.log("Logged in successfully.")
          } catch (e) {
            console.error("Login failed:", e instanceof Error ? e.message : String(e))
            process.exit(1)
          }
        },
      })
      .command({
        command: "logout",
        describe: "remove saved credentials",
        handler: async () => {
          await Auth.remove("openai")
          console.log("Logged out.")
        },
      })
      .command({
        command: "status",
        describe: "show authentication status",
        handler: async () => {
          const info = await Auth.get("openai")
          if (!info) {
            console.log("Not logged in.")
            return
          }
          if (info.type === "oauth") {
            const expired = info.expires < Date.now()
            console.log(`Type: OAuth`)
            console.log(`Status: ${expired ? "expired (will refresh)" : "active"}`)
            if (info.accountId) console.log(`Account: ${info.accountId}`)
            return
          }
          console.log("Type: API Key")
        },
      })
      .command({
        command: "set-key <key>",
        describe: "set API key directly",
        handler: async (argv) => {
          await Auth.set("openai", { type: "api", key: argv.key as string })
          console.log("API key saved.")
        },
      })
      .demandCommand(1, "specify a subcommand: login, login-device, logout, status, set-key")
  },
  handler() {},
}
