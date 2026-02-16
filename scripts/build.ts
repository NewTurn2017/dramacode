import { $ } from "bun"
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "fs"
import path from "path"

const root = path.resolve(import.meta.dirname, "..")
const dist = path.join(root, "dist")

// Parse target: bun-{os}-{arch}
const targetArg = process.argv[2] as string | undefined
const target = targetArg ?? `bun-${process.platform}-${process.arch}`
const [, targetOS, targetArch] = target.match(/^bun-(\w+)-(\w+)$/) || []

if (!targetOS || !targetArch) {
  console.error(`Invalid target: ${target}`)
  console.error(`Expected format: bun-{darwin|windows|linux}-{arm64|x64}`)
  process.exit(1)
}

const isWindows = targetOS === "windows" || targetOS === "win32"
const binaryName = isWindows ? "dramacode.exe" : "dramacode"
const zipName = `dramacode-${targetOS}-${targetArch}.zip`

console.log(`Building dramacode for ${target}...`)

rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })

console.log("[1/5] Building web...")
await $`bun run build`.cwd(path.join(root, "packages/web")).quiet()

console.log("[2/5] Compiling binary...")
await $`bun build --compile --target=${target} --outfile ${path.join(dist, binaryName)} src/index.ts`
  .cwd(path.join(root, "packages/dramacode"))
  .quiet()

console.log("[3/5] Copying assets...")
cpSync(path.join(root, "packages/web/dist"), path.join(dist, "web"), { recursive: true })
cpSync(path.join(root, "packages/dramacode/migration"), path.join(dist, "migration"), { recursive: true })

console.log("[4/5] Bundling native extensions...")
const vecSuffix = isWindows ? "dll" : targetOS === "darwin" ? "dylib" : "so"
const vecPlatform = isWindows ? "windows" : targetOS
const vecPkg = `sqlite-vec-${vecPlatform}-${targetArch}`
const vecSrc = path.join(root, "node_modules", vecPkg, `vec0.${vecSuffix}`)
if (existsSync(vecSrc)) {
  cpSync(vecSrc, path.join(dist, `vec0.${vecSuffix}`))
  console.log(`  Copied ${vecPkg}/vec0.${vecSuffix}`)
} else {
  console.warn(`  Warning: ${vecSrc} not found, vector search will be unavailable`)
}

console.log("[5/5] Creating release archive...")
const zipPath = path.join(root, zipName)
try {
  await $`zip -r -j ${zipPath} ${dist}`.quiet()
} catch {
  // Windows fallback — tar can create zip-like archives
  try {
    await $`tar -a -cf ${zipPath} -C ${dist} .`.quiet()
  } catch {
    console.warn("  Warning: zip/tar not available, skipping archive")
  }
}

const meta = {
  target,
  os: targetOS,
  arch: targetArch,
  binary: binaryName,
  zip: zipName,
  version: process.env.VERSION || "dev",
  buildDate: new Date().toISOString(),
}
writeFileSync(path.join(dist, "build-meta.json"), JSON.stringify(meta, null, 2))

try {
  const total = (await $`du -sh ${dist}`.text()).split("\t")[0]
  console.log(`\nDone! Output: ${dist}/ (${total})`)
} catch {
  console.log(`\nDone! Output: ${dist}/`)
}
console.log(`  ${binaryName}      (binary)`)
console.log(`  web/            (SPA)`)
console.log(`  migration/      (DB migrations)`)
console.log(`  vec0.${vecSuffix}     (sqlite-vec)`)
if (existsSync(zipPath)) console.log(`  ${zipName}  (release archive)`)
console.log(`\nRun: ./dist/${binaryName} serve --open`)
