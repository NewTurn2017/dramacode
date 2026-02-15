import type { CommandModule } from "yargs"
import { Drama, Episode, Character, World, PlotPoint } from "../../drama"

export const DramaCommand: CommandModule = {
  command: "drama",
  describe: "Manage dramas",
  builder: (yargs) =>
    yargs
      .command({
        command: "list",
        describe: "List all dramas",
        handler() {
          const dramas = Drama.list()
          if (dramas.length === 0) {
            console.log("No dramas yet. Start a chat to create one!")
            return
          }
          for (const d of dramas) {
            console.log(`  ${d.id.slice(0, 8)}  ${d.title}  ${d.genre ?? ""}  ${d.logline ?? ""}`)
          }
        },
      })
      .command({
        command: "show <id>",
        describe: "Show drama details",
        builder: (y) => y.positional("id", { type: "string", demandOption: true }),
        handler(args) {
          const d = Drama.get(args.id as string)
          console.log(`\n  ■ ${d.title}`)
          if (d.logline) console.log(`    로그라인: ${d.logline}`)
          if (d.genre) console.log(`    장르: ${d.genre}`)
          if (d.setting) console.log(`    배경: ${d.setting}`)
          if (d.tone) console.log(`    톤: ${d.tone}`)
          if (d.total_episodes) console.log(`    총 화수: ${d.total_episodes}화`)

          const episodes = Episode.listByDrama(d.id)
          if (episodes.length > 0) {
            console.log(`\n  에피소드 (${episodes.length}):`)
            for (const ep of episodes) {
              console.log(`    ${ep.number}화 "${ep.title}" [${ep.status}]`)
            }
          }

          const characters = Character.listByDrama(d.id)
          if (characters.length > 0) {
            console.log(`\n  캐릭터 (${characters.length}):`)
            for (const ch of characters) {
              const role = ch.role ? ` (${ch.role})` : ""
              const occ = ch.occupation ? ` — ${ch.occupation}` : ""
              console.log(`    ${ch.name}${role}${occ}`)
            }
          }

          const worlds = World.listByDrama(d.id)
          if (worlds.length > 0) {
            console.log(`\n  세계관 (${worlds.length}):`)
            for (const w of worlds) {
              console.log(`    [${w.category}] ${w.name}`)
            }
          }

          const plots = PlotPoint.listByDrama(d.id)
          if (plots.length > 0) {
            const unresolved = plots.filter((p) => !p.resolved).length
            console.log(`\n  플롯 포인트 (${plots.length}, 미해결: ${unresolved}):`)
            for (const p of plots) {
              const mark = p.resolved ? "✓" : "○"
              console.log(`    ${mark} [${p.type}] ${p.description.slice(0, 60)}`)
            }
          }
          console.log()
        },
      })
      .command({
        command: "rm <id>",
        describe: "Delete a drama and all related data",
        builder: (y) => y.positional("id", { type: "string", demandOption: true }),
        handler(args) {
          const d = Drama.get(args.id as string)
          Drama.remove(d.id)
          console.log(`Deleted: ${d.title}`)
        },
      })
      .demandCommand(1, ""),
  handler() {},
}
