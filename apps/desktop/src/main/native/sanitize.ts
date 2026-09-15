export class UnsafeArgumentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UnsafeArgumentError"
  }
}

const MAX_ARGUMENT_LENGTH = 4096

function containsForbiddenCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code === 0x00 || code === 0x0a || code === 0x0d) {
      return true
    }
    if (code < 0x20 || code === 0x7f) {
      return true
    }
  }
  return false
}

export function sanitizeToolArgument(value: string, label: string): string {
  if (value.length === 0) {
    throw new UnsafeArgumentError(`${label} must not be empty`)
  }
  if (value.length > MAX_ARGUMENT_LENGTH) {
    throw new UnsafeArgumentError(`${label} exceeds the maximum allowed length`)
  }
  if (containsForbiddenCharacter(value)) {
    throw new UnsafeArgumentError(`${label} contains forbidden characters`)
  }
  return value
}

export function assertHttpUrl(value: string, label = "url"): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new UnsafeArgumentError(`${label} is not a valid URL`)
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeArgumentError(`${label} must use http or https`)
  }
  return value
}
