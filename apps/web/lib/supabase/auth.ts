import { createHash } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { getSupabaseAdmin } from "./admin"
import { serverEnvOrThrow } from "../server-env"

export interface AuthenticatedUser {
  userId: string
  email: string | null
  method: "supabase_jwt" | "api_token"
}

export async function authenticateBearerToken(authorization: string | null): Promise<AuthenticatedUser | null> {
  if (!authorization) {
    return null
  }
  const [scheme, token, ...rest] = authorization.split(" ")
  if (scheme?.toLowerCase() !== "bearer" || !token || rest.length > 0) {
    return null
  }
  const trimmed = token.trim()
  if (trimmed.length === 0) {
    return null
  }
  if (looksLikeJwt(trimmed)) {
    return authenticateWithSupabaseJwt(trimmed)
  }
  return authenticateWithApiToken(trimmed)
}

function looksLikeJwt(token: string): boolean {
  const parts = token.split(".")
  return parts.length === 3 && parts.every((part) => part.length > 0)
}

async function authenticateWithSupabaseJwt(token: string): Promise<AuthenticatedUser | null> {
  const url = serverEnvOrThrow("NEXT_PUBLIC_SUPABASE_URL")
  const anonKey = serverEnvOrThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) {
    return null
  }
  return { userId: data.user.id, email: data.user.email ?? null, method: "supabase_jwt" }
}

async function authenticateWithApiToken(token: string): Promise<AuthenticatedUser | null> {
  const tokenHash = hashToken(token)
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from("profiles")
    .select("id, email")
    .eq("api_token_hash", tokenHash)
    .maybeSingle()
  if (error || !data) {
    return null
  }
  return { userId: data.id, email: data.email, method: "api_token" }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}
