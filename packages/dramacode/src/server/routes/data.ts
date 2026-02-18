import { Hono } from "hono"
import path from "path"
import fs from "fs/promises"
import { existsSync } from "fs"
import os from "os"
import { Global } from "../../global"
import { Database } from "../../storage/db"
import { Log } from "../../util/log"

const log = Log.create({ service: "data" })

const DB_FILE = Database.Path
const IMAGES_DIR = path.join(Global.Path.data, "images")

async function createZip(outPath: string, baseDir: string, entries: string[]): Promise<void> {
  const { $ } = await import("bun")

  if (process.platform === "win32") {
    const items = entries.map((e) => path.join(baseDir, e)).join(",")
    await $`powershell -NoProfile -Command "Compress-Archive -Path ${items} -DestinationPath ${outPath} -Force"`.quiet()
  } else {
    await $`zip -r ${outPath} ${entries}`.cwd(baseDir).quiet()
  }
}

async function extractZip(zipPath: string, outDir: string): Promise<void> {
  const { $ } = await import("bun")

  try {
    await $`unzip -o ${zipPath} -d ${outDir}`.quiet()
  } catch {
    try {
      if (process.platform === "win32") {
        await $`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${outDir}' -Force"`.quiet()
      } else {
        await $`tar -xf ${zipPath} -C ${outDir}`.quiet()
      }
    } catch (e) {
      throw new Error(`Failed to extract archive: ${e}`)
    }
  }
}

export function DataRoutes() {
  return new Hono()
    .get("/export", async (c) => {
      const tmpDir = path.join(os.tmpdir(), `dramacode-export-${Date.now()}`)
      const zipPath = path.join(os.tmpdir(), `dramacode-backup-${new Date().toISOString().slice(0, 10)}.zip`)

      try {
        await fs.mkdir(tmpDir, { recursive: true })

        try {
          Database.sqlite().run("PRAGMA wal_checkpoint(TRUNCATE)")
        } catch {}

        await fs.copyFile(DB_FILE, path.join(tmpDir, "dramacode.db"))

        if (existsSync(IMAGES_DIR)) {
          await fs.cp(IMAGES_DIR, path.join(tmpDir, "images"), { recursive: true })
        }

        const entries = ["dramacode.db"]
        if (existsSync(path.join(tmpDir, "images"))) entries.push("images")
        await createZip(zipPath, tmpDir, entries)

        const file = Bun.file(zipPath)
        const blob = await file.arrayBuffer()

        return new Response(blob, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="dramacode-backup-${new Date().toISOString().slice(0, 10)}.zip"`,
            "Content-Length": String(blob.byteLength),
          },
        })
      } catch (err) {
        log.error("export failed", { error: String(err) })
        return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
      } finally {
        try {
          await fs.rm(tmpDir, { recursive: true, force: true })
        } catch {}
        try {
          await fs.rm(zipPath, { force: true })
        } catch {}
      }
    })
    .post("/import", async (c) => {
      const tmpDir = path.join(os.tmpdir(), `dramacode-import-${Date.now()}`)

      try {
        const contentType = c.req.header("content-type") ?? ""
        let zipBuffer: ArrayBuffer

        if (contentType.includes("multipart/form-data")) {
          const form = await c.req.formData()
          const file = form.get("file")
          if (!file || !(file instanceof File)) {
            return c.json({ error: "No file uploaded" }, 400)
          }
          zipBuffer = await file.arrayBuffer()
        } else {
          zipBuffer = await c.req.arrayBuffer()
        }

        if (zipBuffer.byteLength < 100) {
          return c.json({ error: "Invalid file" }, 400)
        }

        const zipPath = path.join(os.tmpdir(), `dramacode-import-${Date.now()}.zip`)
        await Bun.write(zipPath, zipBuffer)

        await fs.mkdir(tmpDir, { recursive: true })
        await extractZip(zipPath, tmpDir)

        if (!existsSync(path.join(tmpDir, "dramacode.db"))) {
          await fs.rm(tmpDir, { recursive: true, force: true })
          await fs.rm(zipPath, { force: true })
          return c.json({ error: "백업 파일에 dramacode.db가 없습니다" }, 400)
        }

        try {
          Database.sqlite().run("PRAGMA wal_checkpoint(TRUNCATE)")
          Database.sqlite().close()
        } catch {}

        await fs.copyFile(path.join(tmpDir, "dramacode.db"), DB_FILE)

        if (existsSync(path.join(tmpDir, "images"))) {
          if (existsSync(IMAGES_DIR)) {
            await fs.rm(IMAGES_DIR, { recursive: true, force: true })
          }
          await fs.cp(path.join(tmpDir, "images"), IMAGES_DIR, { recursive: true })
        }

        await fs.rm(tmpDir, { recursive: true, force: true })
        await fs.rm(zipPath, { force: true })

        log.info("data imported, restarting")

        setTimeout(() => {
          const { Updater } = require("../../update") as typeof import("../../update")
          Updater.restart()
        }, 1500)

        return c.json({ ok: true, message: "데이터를 불러왔습니다. 앱이 재시작됩니다." })
      } catch (err) {
        log.error("import failed", { error: String(err) })
        try {
          await fs.rm(tmpDir, { recursive: true, force: true })
        } catch {}
        return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
      }
    })
}
