import type { CommandModule } from "yargs"
import { Server } from "../../server/server"
import { Log } from "../../util/log"

export const ServeCommand: CommandModule = {
  command: "serve",
  describe: "start the API server",
  builder(yargs) {
    return yargs
      .option("port", {
        describe: "server port",
        type: "number",
        default: 0,
      })
      .option("hostname", {
        describe: "server hostname",
        type: "string",
        default: "127.0.0.1",
      })
  },
  handler: async (argv) => {
    const server = Server.listen({
      port: argv.port as number,
      hostname: argv.hostname as string,
    })
    console.log(`Server listening on ${server.url}`)
  },
}
