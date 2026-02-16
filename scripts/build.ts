import { $ } from "bun"
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "fs"
import path from "path"

const root = path.resolve(import.meta.dirname, "..")
const dist = path.join(root, "dist")
const version = (process.env.VERSION ?? "0.1.0").replace(/^v/, "")

// Parse target: bun-{os}-{arch}
const targetArg = process.argv[2] as string | undefined
const target = targetArg ?? `bun-${process.platform}-${process.arch}`
const [, targetOS, targetArch] = target.match(/^bun-(\w+)-(\w+)$/) || []

if (!targetOS || !targetArch) {
  console.error(`Invalid target: ${target}`)
  console.error(`Expected format: bun-{darwin|windows|linux}-{arm64|x64}`)
  process.exit(1)
}

const isDarwin = targetOS === "darwin"
const isWindows = targetOS === "windows" || targetOS === "win32"
const binaryName = isWindows ? "dramacode.exe" : "dramacode"
const zipName = `dramacode-${targetOS}-${targetArch}.zip`

console.log(`Building dramacode v${version} for ${target}...`)

rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })

console.log("[1/4] Building web...")
await $`bun run build`.cwd(path.join(root, "packages/web")).quiet()

console.log("[2/4] Compiling binary...")
await $`bun build --compile --target=${target} --outfile ${path.join(dist, binaryName)} src/index.ts`
  .cwd(path.join(root, "packages/dramacode"))
  .quiet()

console.log("[3/4] Copying assets...")
cpSync(path.join(root, "packages/web/dist"), path.join(dist, "web"), { recursive: true })
cpSync(path.join(root, "packages/dramacode/migration"), path.join(dist, "migration"), { recursive: true })

console.log("[4/4] Bundling native extensions...")
const vecSuffix = isWindows ? "dll" : isDarwin ? "dylib" : "so"
const vecPlatform = isWindows ? "windows" : targetOS
const vecPkg = `sqlite-vec-${vecPlatform}-${targetArch}`
const vecSrc = path.join(root, "node_modules", vecPkg, `vec0.${vecSuffix}`)
if (existsSync(vecSrc)) {
  cpSync(vecSrc, path.join(dist, `vec0.${vecSuffix}`))
  console.log(`  Copied ${vecPkg}/vec0.${vecSuffix}`)
} else {
  console.warn(`  Warning: ${vecSrc} not found, vector search will be unavailable`)
}

const iconDir = path.join(root, "assets")
if (isWindows) {
  const icoSrc = path.join(iconDir, "AppIcon.ico")
  if (existsSync(icoSrc)) {
    cpSync(icoSrc, path.join(dist, "AppIcon.ico"))
    console.log("  Copied AppIcon.ico")
  }

  const bat = [
    "@echo off",
    "chcp 65001 >nul 2>&1",
    'cd /d "%~dp0"',
    "echo.",
    "echo   DRAMACODE v" + version,
    "echo   ---------------------------------",
    "echo   Starting...",
    "echo   Press Ctrl+C to quit.",
    "echo.",
    'dramacode.exe serve --open',
    "pause",
  ].join("\r\n")
  writeFileSync(path.join(dist, "Start DRAMACODE.bat"), bat)
  console.log("  Added Start DRAMACODE.bat")
}

// --- Release archives ---

console.log("\nCreating release archives...")

// 1) zip — always produced (used by auto-updater)
const zipPath = path.join(root, zipName)
if (isWindows) {
  await $`powershell -Command "Compress-Archive -Path '${dist}\\*' -DestinationPath '${zipPath}' -Force"`.quiet()
} else {
  await $`zip -r ${zipPath} .`.cwd(dist).quiet()
}
if (existsSync(zipPath)) console.log(`  ${zipName}`)

// 2) macOS DMG — .app bundle for drag-to-Applications install
if (isDarwin) {
  const dmgName = `DRAMACODE-mac-${targetArch}.dmg`
  const dmgPath = path.join(root, dmgName)
  const tmpApp = path.join(root, ".tmp-app")
  const tmpDmg = path.join(root, ".tmp-dmg")

  rmSync(tmpApp, { recursive: true, force: true })
  rmSync(tmpDmg, { recursive: true, force: true })

  const appDir = path.join(tmpApp, "DRAMACODE.app", "Contents")
  const macosDir = path.join(appDir, "MacOS")
  const resourcesDir = path.join(appDir, "Resources")
  mkdirSync(macosDir, { recursive: true })
  mkdirSync(resourcesDir, { recursive: true })

  // MacOS/ — only binaries (dramacode, vec0.dylib, launcher)
  const binarySrc = path.join(dist, binaryName)
  if (existsSync(binarySrc)) cpSync(binarySrc, path.join(macosDir, binaryName))
  const vecSrcApp = path.join(dist, `vec0.${vecSuffix}`)
  if (existsSync(vecSrcApp)) cpSync(vecSrcApp, path.join(macosDir, `vec0.${vecSuffix}`))

  // Resources/ — web, migration, icon (non-code assets)
  const webSrc = path.join(dist, "web")
  if (existsSync(webSrc)) cpSync(webSrc, path.join(resourcesDir, "web"), { recursive: true })
  const migSrc = path.join(dist, "migration")
  if (existsSync(migSrc)) cpSync(migSrc, path.join(resourcesDir, "migration"), { recursive: true })

  const icnsSrc = path.join(iconDir, "AppIcon.icns")
  if (existsSync(icnsSrc)) {
    cpSync(icnsSrc, path.join(resourcesDir, "AppIcon.icns"))
  }

  const launcher = ["#!/bin/bash", 'DIR="$(cd "$(dirname "$0")" && pwd)"', 'exec "$DIR/dramacode" serve --open', ""].join(
    "\n",
  )
  writeFileSync(path.join(macosDir, "launcher"), launcher)
  await $`chmod +x ${path.join(macosDir, "launcher")} ${path.join(macosDir, "dramacode")}`.quiet()

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>DRAMACODE</string>
  <key>CFBundleDisplayName</key><string>DRAMACODE</string>
  <key>CFBundleIdentifier</key><string>com.dramacode.app</string>
  <key>CFBundleVersion</key><string>${version}</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>CFBundleExecutable</key><string>launcher</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>`
  writeFileSync(path.join(appDir, "Info.plist"), plist)

  mkdirSync(tmpDmg, { recursive: true })
  cpSync(path.join(tmpApp, "DRAMACODE.app"), path.join(tmpDmg, "DRAMACODE.app"), { recursive: true })
  await $`ln -s /Applications ${path.join(tmpDmg, "Applications")}`.quiet()
  await $`hdiutil create -volname DRAMACODE -srcfolder ${tmpDmg} -ov -format UDZO ${dmgPath}`.quiet()

  rmSync(tmpApp, { recursive: true, force: true })
  rmSync(tmpDmg, { recursive: true, force: true })
  console.log(`  ${dmgName}`)
}

// --- Summary ---

try {
  const total = (await $`du -sh ${dist}`.text()).split("\t")[0]
  console.log(`\nDone! dist/ (${total})`)
} catch {
  console.log(`\nDone!`)
}
console.log(`\nRun: ./dist/${binaryName} serve --open`)
