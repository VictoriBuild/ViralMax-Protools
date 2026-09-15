import posthog from "posthog-js"

let initialized = false

export function analyticsConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY)
}

export function initAnalytics(): void {
  if (initialized || typeof window === "undefined") {
    return
  }
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key) {
    return
  }
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    capture_pageview: true,
    person_profiles: "identified_only"
  })
  initialized = true
}

export function capture(event: string, properties?: Record<string, unknown>): void {
  if (!initialized || typeof window === "undefined") {
    return
  }
  posthog.capture(event, properties)
}

export function identifyUser(userId: string, properties?: Record<string, unknown>): void {
  if (!initialized || typeof window === "undefined") {
    return
  }
  posthog.identify(userId, properties)
}

export function resetAnalytics(): void {
  if (!initialized || typeof window === "undefined") {
    return
  }
  posthog.reset()
}
