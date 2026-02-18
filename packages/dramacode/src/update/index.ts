import { existsSync, unlinkSync, renameSync, chmodSync } from "fs"
import path from "path"
import os from "os"
import { Log } from "../util/log"

const log = Log.create({ service: "update" })

const REPO = "NewTurn2017/dramacode"
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`

interface Release {
  tag_name: string
  assets: { name: string; browser_download_url: string; size: number }[]
  html_url: string
  published_at: string
}

interface UpdateInfo {
  current: string
  latest: string
  downloadUrl: string
  assetName: string
  size: number
  releaseUrl: string
  hasUpdate: boolean
}

function getAssetName(): string {
  const platform = process.platform === "win32" ? "windows" : process.platform
  const arch = process.arch
  return `dramacode-${platform}-${arch}.zip`
}

function compareVersions(current: string, latest: string): boolean {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number)
  const [ca, cb, cc] = parse(current)
  const [la, lb, lc] = parse(latest)
  if (la > ca) return true
  if (la === ca && lb > cb) return true
  if (la === ca && lb === cb && lc > cc) return true
  return false
}

export namespace Updater {
  export async function check(currentVersion: string): Promise<UpdateInfo | null> {
    try {
      const res = await fetch(API_URL, {
        headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "dramacode-updater" },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) return null

      const release = (await res.json()) as Release
      const latest = release.tag_name.replace(/^v/, "")
      const hasUpdate = compareVersions(currentVersion, latest)

      const assetName = getAssetName()
      const asset = release.assets.find((a) => a.name === assetName)

      if (!asset) {
        log.info("no matching asset", { assetName, available: release.assets.map((a) => a.name) })
        return null
      }

      return {
        current: currentVersion,
        latest,
        downloadUrl: asset.browser_download_url,
        assetName: asset.name,
        size: asset.size,
        releaseUrl: release.html_url,
        hasUpdate,
      }
    } catch (e) {
      log.error("update check failed", { error: String(e) })
      return null
    }
  }

  export async function download(info: UpdateInfo, onProgress?: (pct: number) => void): Promise<string> {
    const tmpDir = path.join(os.tmpdir(), "dramacode-update")
    const { mkdirSync } = await import("fs")
    mkdirSync(tmpDir, { recursive: true })

    const zipPath = path.join(tmpDir, info.assetName)

    const res = await fetch(info.downloadUrl, {
      headers: { "User-Agent": "dramacode-updater" },
    })
    if (!res.ok) throw new Error(`Download failed: ${res.status}`)

    const reader = res.body!.getReader()
    const chunks: Uint8Array[] = []
    let received = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length
      onProgress?.(Math.round((received / info.size) * 100))
    }

    const blob = new Blob(chunks)
    await Bun.write(zipPath, blob)
    log.info("downloaded", { path: zipPath, size: received })
    return zipPath
  }

  export async function apply(zipPath: string): Promise<void> {
    const execPath = process.execPath
    const execDir = path.dirname(execPath)
    const tmpExtract = path.join(os.tmpdir(), "dramacode-update-extract")

    const { rmSync, mkdirSync, readdirSync, cpSync, statSync } = await import("fs")
    rmSync(tmpExtract, { recursive: true, force: true })
    mkdirSync(tmpExtract, { recursive: true })

    const { $ } = await import("bun")

    try {
      await $`unzip -o ${zipPath} -d ${tmpExtract}`.quiet()
    } catch {
      try {
        await $`tar -xf ${zipPath} -C ${tmpExtract}`.quiet()
      } catch (e) {
        throw new Error(`Failed to extract update archive: ${e}`)
      }
    }

    const files = readdirSync(tmpExtract)
    const isWindows = process.platform === "win32"
    const binaryName = isWindows ? "dramacode.exe" : "dramacode"

    if (!files.includes(binaryName)) {
      throw new Error(`Binary ${binaryName} not found in archive`)
    }

    if (isWindows) {
      const oldPath = execPath + ".old"
      if (existsSync(oldPath)) unlinkSync(oldPath)
      renameSync(execPath, oldPath)
    }

    for (const file of files) {
      if (file === "build-meta.json") continue
      const src = path.join(tmpExtract, file)
      const dest = path.join(execDir, file)

      if (file === binaryName && !isWindows) {
        if (existsSync(dest)) unlinkSync(dest)
      }

      if (existsSync(dest)) {
        try {
          if (statSync(dest).isDirectory()) {
            rmSync(dest, { recursive: true, force: true })
          }
        } catch {}
      }

      cpSync(src, dest, { recursive: true, force: true })
    }

    if (!isWindows && existsSync(path.join(execDir, binaryName))) {
      chmodSync(path.join(execDir, binaryName), 0o755)
    }

    rmSync(tmpExtract, { recursive: true, force: true })
    unlinkSync(zipPath)
    log.info("update applied", { execDir })
  }

  export function restart(): never {
    const execPath = process.execPath
    const args = process.argv.slice(1)

    log.info("restarting", { execPath, args })

    const { spawnSync } = require("child_process") as typeof import("child_process")

    if (process.platform === "win32") {
      const { spawn } = require("child_process") as typeof import("child_process")
      spawn(execPath, args, { detached: true, stdio: "ignore" }).unref()
      process.exit(0)
    } else {
      spawnSync(execPath, args, { stdio: "inherit" })
      process.exit(0)
    }
  }

  export function cleanupOldBinary() {
    if (process.platform !== "win32") return
    const oldPath = process.execPath + ".old"
    if (existsSync(oldPath)) {
      try {
        unlinkSync(oldPath)
        log.info("cleaned up old binary")
      } catch {}
    }
  }
}
