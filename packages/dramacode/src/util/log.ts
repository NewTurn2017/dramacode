import path from "path"
import fs from "fs/promises"
import { Global } from "../global"

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR"

const LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
}

let logLevel: LogLevel = "INFO"
let logFile: string | undefined
let printToStderr = false

export namespace Log {
  export type Level = LogLevel

  export async function init(opts: { level?: LogLevel; print?: boolean }) {
    logLevel = opts.level ?? "INFO"
    printToStderr = opts.print ?? false
    logFile = path.join(Global.Path.log, `dramacode-${new Date().toISOString().slice(0, 10)}.log`)
    await fs.mkdir(path.dirname(logFile), { recursive: true })
  }

  export function file() {
    return logFile
  }

  export function create(meta: { service: string }) {
    function write(level: LogLevel, msg: string, extra?: Record<string, unknown>) {
      if (LEVELS[level] < LEVELS[logLevel]) return
      const entry = JSON.stringify({
        time: new Date().toISOString(),
        level,
        service: meta.service,
        msg,
        ...extra,
      })
      if (printToStderr) process.stderr.write(entry + "\n")
      if (logFile) fs.appendFile(logFile, entry + "\n").catch(() => {})
    }

    return {
      debug: (msg: string, extra?: Record<string, unknown>) => write("DEBUG", msg, extra),
      info: (msg: string, extra?: Record<string, unknown>) => write("INFO", msg, extra),
      warn: (msg: string, extra?: Record<string, unknown>) => write("WARN", msg, extra),
      error: (msg: string, extra?: Record<string, unknown>) => write("ERROR", msg, extra),
      time(msg: string, extra?: Record<string, unknown>) {
        const start = performance.now()
        return {
          stop() {
            write("DEBUG", msg, { ...extra, duration: Math.round(performance.now() - start) })
          },
        }
      },
    }
  }

  export const Default = create({ service: "dramacode" })
}
