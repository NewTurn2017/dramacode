export async function runWithPending<T>(setPending: (value: boolean) => void, task: () => Promise<T>): Promise<T> {
  setPending(true)
  try {
    return await task()
  } finally {
    setPending(false)
  }
}
