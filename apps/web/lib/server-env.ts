export function serverEnv(name: string): string | undefined {
  return process.env[name]
}

export function serverEnvOrThrow(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`server environment variable ${name} is not configured`)
  }
  return value
}

export function serverEnvOr(name: string, fallback: string): string {
  return process.env[name] ?? fallback
}

export function numberEnvOr(name: string, fallback: number): number {
  const value = process.env[name]
  if (!value) {
    return fallback
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}
