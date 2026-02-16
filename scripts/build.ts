import { $ } from "bun"
import { cpSync, existsSync, mkdirSync, rmSync } from "fs"
import path from "path"

const root = path.resolve(import.meta.dirname, "..")
const dist = path.join(root, "dist")

const target = (process.argv[2] as `bun-${string}` | undefined) ?? `bun-${process.platform}-${process.arch}`

console.log(`Building dramacode for ${target}...`)

rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })

console.log("[1/4] Building web...")
await $`bun run build`.cwd(path.join(root, "packages/web")).quiet()

console.log("[2/4] Compiling binary...")
await $`bun build --compile --target=${target} --outfile ${path.join(dist, "dramacode")} src/index.ts`
  .cwd(path.join(root, "packages/dramacode"))
  .quiet()

console.log("[3/4] Copying assets...")
cpSync(path.join(root, "packages/web/dist"), path.join(dist, "web"), { recursive: true })
cpSync(path.join(root, "packages/dramacode/migration"), path.join(dist, "migration"), { recursive: true })

console.log("[4/4] Bundling native extensions...")
const vecSuffix = process.platform === "win32" ? "dll" : process.platform === "darwin" ? "dylib" : "so"
const vecPlatform = process.platform === "win32" ? "windows" : process.platform
const vecPkg = `sqlite-vec-${vecPlatform}-${process.arch}`
const vecSrc = path.join(root, "node_modules", vecPkg, `vec0.${vecSuffix}`)
if (existsSync(vecSrc)) {
  cpSync(vecSrc, path.join(dist, `vec0.${vecSuffix}`))
  console.log(`  Copied ${vecPkg}/vec0.${vecSuffix}`)
} else {
  console.warn(`  Warning: ${vecSrc} not found, vector search will be unavailable`)
}

const total = (await $`du -sh ${dist}`.text()).split("\t")[0]
console.log(`\nDone! Output: ${dist}/ (${total})`)
console.log(`  dramacode      (binary)`)
console.log(`  web/            (SPA)`)
console.log(`  migration/      (DB migrations)`)
console.log(`  vec0.${vecSuffix}     (sqlite-vec)`)
console.log(`\nRun: ./dist/dramacode serve --open`)
