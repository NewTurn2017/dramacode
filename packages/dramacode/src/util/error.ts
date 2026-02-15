import z from "zod"

export class NamedError extends Error {
  constructor(
    name: string,
    public readonly data: Record<string, unknown>,
  ) {
    super(name)
    this.name = name
  }

  toObject() {
    return { name: this.name, data: this.data }
  }

  static create<S extends z.ZodObject<z.ZodRawShape>>(name: string, shape: S) {
    return class extends NamedError {
      constructor(data: z.input<S>) {
        super(name, shape.parse(data) as Record<string, unknown>)
      }
    }
  }
}
