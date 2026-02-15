import { describe, expect, it } from "bun:test"
import { runWithPending } from "./async-guard"

describe("runWithPending", () => {
  it("toggles pending around successful task", async () => {
    const states: boolean[] = []

    const result = await runWithPending(
      (value) => states.push(value),
      async () => {
        return "ok"
      },
    )

    expect(result).toBe("ok")
    expect(states).toEqual([true, false])
  })

  it("resets pending when task throws", async () => {
    const states: boolean[] = []
    const error = new Error("network")

    await expect(
      runWithPending((value) => states.push(value), async () => {
        throw error
      }),
    ).rejects.toThrow("network")

    expect(states).toEqual([true, false])
  })
})
