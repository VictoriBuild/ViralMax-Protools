import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { serverEnv, serverEnvOrThrow } from "../server-env"

let cachedAdmin: SupabaseClient | null = null

export function supabaseIsConfigured(): boolean {
  return Boolean(serverEnv("NEXT_PUBLIC_SUPABASE_URL") && serverEnv("SUPABASE_SERVICE_ROLE_KEY"))
}

export function getSupabaseAdmin(): SupabaseClient {
  if (cachedAdmin) {
    return cachedAdmin
  }
  const url = serverEnvOrThrow("NEXT_PUBLIC_SUPABASE_URL")
  const serviceKey = serverEnvOrThrow("SUPABASE_SERVICE_ROLE_KEY")
  cachedAdmin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  })
  return cachedAdmin
}
