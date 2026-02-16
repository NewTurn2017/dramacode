import fs from "fs/promises"
import path from "path"
import os from "os"

const app = "dramacode"

function resolve() {
  const platform = process.platform
  if (platform === "win32") {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local")
    return {
      data: path.join(localAppData, app),
      config: path.join(appData, app),
      state: path.join(localAppData, app),
    }
  }
  if (platform === "darwin") {
    const home = os.homedir()
    return {
      data: path.join(home, "Library", "Application Support", app),
      config: path.join(home, "Library", "Application Support", app),
      state: path.join(home, "Library", "Application Support", app),
    }
  }
  // Linux / others: XDG spec
  const home = os.homedir()
  return {
    data: path.join(process.env.XDG_DATA_HOME || path.join(home, ".local", "share"), app),
    config: path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), app),
    state: path.join(process.env.XDG_STATE_HOME || path.join(home, ".local", "state"), app),
  }
}

const dirs = resolve()

export namespace Global {
  export const Path = {
    get home() {
      return process.env.DRAMACODE_TEST_HOME || os.homedir()
    },
    data: dirs.data,
    log: path.join(dirs.data, "log"),
    config: dirs.config,
    state: dirs.state,
  }
}

await Promise.all([
  fs.mkdir(Global.Path.data, { recursive: true }),
  fs.mkdir(Global.Path.config, { recursive: true }),
  fs.mkdir(Global.Path.state, { recursive: true }),
  fs.mkdir(Global.Path.log, { recursive: true }),
])
