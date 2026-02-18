import { Tunnel, install, use } from "cloudflared"
import { homedir } from "os"
import path from "path"
import { Log } from "../util/log"

const log = Log.create({ service: "tunnel" })

/** Resolve cloudflared binary to a user-writable path (survives packaging). */
const CLOUDFLARED_BIN = path.join(
  homedir(),
  ".cloudflared",
  "bin",
  process.platform === "win32" ? "cloudflared.exe" : "cloudflared",
)

export type TunnelStatus = {
  state: "idle" | "installing" | "connecting" | "connected" | "error"
  url: string | null
  error: string | null
}

let activeTunnel: Tunnel | null = null
let currentStatus: TunnelStatus = { state: "idle", url: null, error: null }

function setStatus(patch: Partial<TunnelStatus>) {
  currentStatus = { ...currentStatus, ...patch }
}

async function ensureBinary(): Promise<boolean> {
  try {
    const proc = Bun.spawnSync([CLOUDFLARED_BIN, "--version"])
    if (proc.exitCode === 0) {
      use(CLOUDFLARED_BIN)
      return true
    }
  } catch {}

  log.info("cloudflared binary not found, installing…")
  setStatus({ state: "installing", error: null })
  try {
    await install(CLOUDFLARED_BIN)
    use(CLOUDFLARED_BIN)
    log.info("cloudflared installed", { path: CLOUDFLARED_BIN })
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error("cloudflared install failed", { error: msg })
    setStatus({ state: "error", error: `cloudflared 설치 실패: ${msg}` })
    return false
  }
}

export async function startTunnel(port: number): Promise<TunnelStatus> {
  if (activeTunnel) {
    return currentStatus
  }

  const installed = await ensureBinary()
  if (!installed) return currentStatus

  setStatus({ state: "connecting", url: null, error: null })
  log.info("starting tunnel", { port })

  return new Promise<TunnelStatus>((resolve) => {
    let resolved = false
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        setStatus({ state: "error", error: "터널 연결 시간 초과 (30초)" })
        stopTunnel()
        resolve(currentStatus)
      }
    }, 30_000)

    try {
      const t = Tunnel.quick(`http://localhost:${port}`)
      activeTunnel = t

      t.on("url", (url) => {
        log.info("tunnel connected", { url })
        setStatus({ state: "connected", url, error: null })
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          resolve(currentStatus)
        }
      })

      t.on("error", (err) => {
        const msg = err instanceof Error ? err.message : String(err)
        log.error("tunnel error", { error: msg })
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          setStatus({ state: "error", url: null, error: msg })
          activeTunnel = null
          resolve(currentStatus)
        }
      })

      t.on("exit", (code) => {
        log.info("tunnel exited", { code })
        activeTunnel = null
        if (currentStatus.state === "connected") {
          setStatus({ state: "idle", url: null, error: null })
        } else if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          setStatus({ state: "error", url: null, error: `cloudflared 프로세스 종료 (code: ${code})` })
          resolve(currentStatus)
        }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error("tunnel spawn failed", { error: msg })
      setStatus({ state: "error", url: null, error: msg })
      clearTimeout(timeout)
      resolved = true
      resolve(currentStatus)
    }
  })
}

export function stopTunnel(): TunnelStatus {
  if (activeTunnel) {
    log.info("stopping tunnel")
    activeTunnel.stop()
    activeTunnel = null
  }
  setStatus({ state: "idle", url: null, error: null })
  return currentStatus
}

export function tunnelStatus(): TunnelStatus {
  return { ...currentStatus }
}
