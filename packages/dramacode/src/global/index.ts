import fs from "fs/promises"
import { xdgData, xdgConfig, xdgState } from "xdg-basedir"
import path from "path"
import os from "os"

const app = "dramacode"

const data = path.join(xdgData!, app)
const config = path.join(xdgConfig!, app)
const state = path.join(xdgState!, app)

export namespace Global {
  export const Path = {
    get home() {
      return process.env.DRAMACODE_TEST_HOME || os.homedir()
    },
    data,
    log: path.join(data, "log"),
    config,
    state,
  }
}

await Promise.all([
  fs.mkdir(Global.Path.data, { recursive: true }),
  fs.mkdir(Global.Path.config, { recursive: true }),
  fs.mkdir(Global.Path.state, { recursive: true }),
  fs.mkdir(Global.Path.log, { recursive: true }),
])
