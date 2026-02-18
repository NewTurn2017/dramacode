import { Database as BunDatabase } from "bun:sqlite"
import { drizzle, type SQLiteBunDatabase } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { type SQLiteTransaction } from "drizzle-orm/sqlite-core"
export * from "drizzle-orm"
import { Context } from "../util/context"
import { lazy } from "../util/lazy"
import { Global } from "../global"
import { Log } from "../util/log"
import { NamedError } from "../util/error"
import z from "zod"
import path from "path"
import { existsSync, readFileSync, readdirSync } from "fs"
import * as schema from "./schema"
import { Rag } from "../rag"

export const NotFoundError = NamedError.create(
  "NotFoundError",
  z.object({
    message: z.string(),
  }),
)

const log = Log.create({ service: "db" })

export namespace Database {
  export const Path = path.join(Global.Path.data, "dramacode.db")
  type Schema = typeof schema
  export type Transaction = SQLiteTransaction<"sync", void, Schema>

  type Client = SQLiteBunDatabase<Schema>

  type Journal = { sql: string; timestamp: number }[]
  let raw: BunDatabase | undefined
  let _vecLoaded = false

  export function vecEnabled() {
    return _vecLoaded
  }

  function vecExtName() {
    if (process.platform === "win32") return "vec0.dll"
    if (process.platform === "darwin") return "vec0.dylib"
    return "vec0.so"
  }

  function loadSqliteVec(db: BunDatabase) {
    try {
      const mod = require("sqlite-vec")
      mod.load(db)
      _vecLoaded = true
      log.info("sqlite-vec loaded via npm")
      return
    } catch {}

    const name = vecExtName()
    const execDir = path.dirname(process.execPath)
    const candidates = [
      path.join(execDir, name),
      path.join(execDir, "lib", name),
      path.join(import.meta.dirname, name),
    ]
    for (const file of candidates) {
      if (!existsSync(file)) continue
      try {
        db.loadExtension(file.replace(/\.[^.]+$/, ""))
        _vecLoaded = true
        log.info("sqlite-vec loaded", { file })
        return
      } catch {
        continue
      }
    }
    log.warn("sqlite-vec not found, vector search disabled")
  }

  function customSQLite() {
    const candidates =
      process.platform === "darwin"
        ? ["/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib", "/usr/local/opt/sqlite/lib/libsqlite3.dylib"]
        : process.platform === "linux"
          ? ["/usr/lib/x86_64-linux-gnu/libsqlite3.so.0", "/usr/lib/libsqlite3.so"]
          : []
    for (const file of candidates) {
      if (!existsSync(file)) continue
      try {
        BunDatabase.setCustomSQLite(file)
        log.info("custom sqlite loaded", { file })
        return
      } catch {
        continue
      }
    }
  }

  function time(tag: string) {
    const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(tag)
    if (!match) return 0
    return Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6]),
    )
  }

  function migrations(dir: string): Journal {
    const dirs = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)

    const sql = dirs
      .map((name) => {
        const file = path.join(dir, name, "migration.sql")
        if (!Bun.file(file).size) return
        return {
          sql: readFileSync(file, "utf-8"),
          timestamp: time(name),
        }
      })
      .filter(Boolean) as Journal

    return sql.sort((a, b) => a.timestamp - b.timestamp)
  }

  function findMigrationDir(): string | undefined {
    const execDir = path.dirname(process.execPath)
    return [
      path.join(import.meta.dirname, "../../migration"),
      path.join(execDir, "migration"),
      path.join(execDir, "../Resources/migration"),
      path.join(execDir, "../migration"),
    ].find((dir) => {
      try {
        return readdirSync(dir).length > 0
      } catch {
        return false
      }
    })
  }

  export function runMigrations(): { applied: number } {
    const db = Client()
    const migrationDir = findMigrationDir()
    const entries = migrationDir ? migrations(migrationDir) : []
    if (entries.length > 0) {
      log.info("applying migrations (manual)", { count: entries.length })
      migrate(db, entries)
    }
    return { applied: entries.length }
  }

  export const Client = lazy(() => {
    log.info("opening database", { path: Database.Path })

    customSQLite()
    const sqlite = new BunDatabase(Database.Path, { create: true })
    loadSqliteVec(sqlite)
    raw = sqlite

    sqlite.run("PRAGMA journal_mode = WAL")
    sqlite.run("PRAGMA synchronous = NORMAL")
    sqlite.run("PRAGMA busy_timeout = 5000")
    sqlite.run("PRAGMA cache_size = -64000")
    sqlite.run("PRAGMA foreign_keys = ON")
    sqlite.run("PRAGMA wal_checkpoint(PASSIVE)")

    const db = drizzle({ client: sqlite, schema })

    const migrationDir = findMigrationDir()
    const entries = migrationDir ? migrations(migrationDir) : []
    if (entries.length > 0) {
      log.info("applying migrations", { count: entries.length })
      migrate(db, entries)
    }

    Rag.init()

    return db
  })

  export function sqlite() {
    if (!raw) Client()
    if (!raw) throw new Error("database not initialized")
    return raw
  }

  export type TxOrDb = Transaction | Client

  const ctx = Context.create<{
    tx: TxOrDb
    effects: (() => void | Promise<void>)[]
  }>("database")

  export function use<T>(callback: (trx: TxOrDb) => T): T {
    try {
      return callback(ctx.use().tx)
    } catch (err) {
      if (err instanceof Context.NotFound) {
        const effects: (() => void | Promise<void>)[] = []
        const result = ctx.provide({ effects, tx: Client() }, () => callback(Client()))
        for (const effect of effects) effect()
        return result
      }
      throw err
    }
  }

  export function transaction<T>(callback: (tx: TxOrDb) => T): T {
    try {
      return callback(ctx.use().tx)
    } catch (err) {
      if (err instanceof Context.NotFound) {
        const effects: (() => void | Promise<void>)[] = []
        const result = Client().transaction((tx) => {
          return ctx.provide({ tx, effects }, () => callback(tx))
        })
        for (const effect of effects) effect()
        return result
      }
      throw err
    }
  }
}
