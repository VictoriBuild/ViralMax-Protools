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
    capture_pageview: false,
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

export function trackPageview(path: string): void {
  capture("$pageview", { path })
}

export function trackSignup(method: "password" | "magic_link" = "password"): void {
  capture("signup_submitted", { method })
}

export function trackLogin(method: "password" | "magic_link" = "password"): void {
  capture("login_submitted", { method })
}

export function trackCreditTopUp(properties: { packId: string; credits?: number; reference?: string }): void {
  capture("credit_top_up", properties)
}

export function trackCloudSifter(properties: { engine?: string; credits?: number; jobId?: string } = {}): void {
  capture("cloud_sifter_triggered", properties)
}
