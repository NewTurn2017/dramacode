import { Database as BunDatabase } from "bun:sqlite"
import * as sqliteVec from "sqlite-vec"
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
import { readFileSync, readdirSync } from "fs"
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

  function customSQLite() {
    const paths = ["/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib", "/usr/local/opt/sqlite/lib/libsqlite3.dylib"]
    for (const file of paths) {
      try {
        BunDatabase.setCustomSQLite(file)
        log.info("custom sqlite loaded", { file })
        return
      } catch {
        continue
      }
    }
    log.warn("custom sqlite not configured")
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

  export const Client = lazy(() => {
    log.info("opening database", { path: Database.Path })

    customSQLite()
    const sqlite = new BunDatabase(Database.Path, { create: true })
    sqliteVec.load(sqlite)
    raw = sqlite

    sqlite.run("PRAGMA journal_mode = WAL")
    sqlite.run("PRAGMA synchronous = NORMAL")
    sqlite.run("PRAGMA busy_timeout = 5000")
    sqlite.run("PRAGMA cache_size = -64000")
    sqlite.run("PRAGMA foreign_keys = ON")
    sqlite.run("PRAGMA wal_checkpoint(PASSIVE)")

    const db = drizzle({ client: sqlite, schema })

    const entries = migrations(path.join(import.meta.dirname, "../../migration"))
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
