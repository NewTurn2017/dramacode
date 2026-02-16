import { $ } from "bun"
import { readFileSync, writeFileSync } from "fs"
import path from "path"

const root = path.resolve(import.meta.dirname, "..")
const versionFile = path.join(root, "packages/dramacode/src/index.ts")

const bump = (process.argv[2] ?? "patch") as "patch" | "minor" | "major"
if (!["patch", "minor", "major"].includes(bump)) {
  console.error(`Usage: bun run scripts/release.ts [patch|minor|major]`)
  process.exit(1)
}

const src = readFileSync(versionFile, "utf-8")
const match = src.match(/export const VERSION = "(\d+)\.(\d+)\.(\d+)"/)
if (!match) {
  console.error("VERSION not found in index.ts")
  process.exit(1)
}

let [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])]
const oldVersion = `${major}.${minor}.${patch}`

if (bump === "major") {
  major++
  minor = 0
  patch = 0
} else if (bump === "minor") {
  minor++
  patch = 0
} else {
  patch++
}

const newVersion = `${major}.${minor}.${patch}`
const tag = `v${newVersion}`

console.log(`\n  ${oldVersion} → ${newVersion} (${bump})\n`)

const updated = src.replace(`export const VERSION = "${oldVersion}"`, `export const VERSION = "${newVersion}"`)
writeFileSync(versionFile, updated)

await $`git add ${versionFile}`.cwd(root)
await $`git commit -m "release: ${tag}"`.cwd(root)
await $`git tag ${tag}`.cwd(root)

console.log(`  ✓ Committed and tagged ${tag}`)
console.log(`\n  Push to trigger CI/CD:`)
console.log(`  $ git push && git push origin ${tag}\n`)
