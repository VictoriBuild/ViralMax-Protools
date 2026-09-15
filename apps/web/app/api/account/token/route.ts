import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { randomBytes } from "node:crypto"
import { authenticateBearerToken, hashToken } from "@/lib/supabase/auth"
import { getSupabaseAdmin, supabaseIsConfigured } from "@/lib/supabase/admin"

export const runtime = "nodejs"

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await authenticateBearerToken(request.headers.get("authorization"))
  if (!user) {
    return jsonError(401, "unauthorized", "a valid bearer token is required")
  }
  if (!supabaseIsConfigured()) {
    return jsonError(503, "service_unavailable", "supabase is not configured")
  }

  const rawToken = randomBytes(32).toString("base64url")
  const tokenHash = hashToken(rawToken)
  const admin = getSupabaseAdmin()

  const { error } = await admin
    .from("profiles")
    .update({
      api_token_hash: tokenHash,
      api_token_created_at: new Date().toISOString()
    })
    .eq("id", user.userId)
  if (error) {
    return jsonError(500, "token_update_failed", "could not store the api token")
  }

  return NextResponse.json({
    ok: true,
    token: rawToken,
    userId: user.userId,
    createdAt: new Date().toISOString()
  })
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await authenticateBearerToken(request.headers.get("authorization"))
  if (!user) {
    return jsonError(401, "unauthorized", "a valid bearer token is required")
  }
  if (!supabaseIsConfigured()) {
    return jsonError(503, "service_unavailable", "supabase is not configured")
  }

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from("profiles")
    .select("api_token_hash, api_token_created_at")
    .eq("id", user.userId)
    .maybeSingle()
  if (error) {
    return jsonError(500, "token_lookup_failed", "could not read the api token status")
  }

  return NextResponse.json({
    hasToken: Boolean(data?.api_token_hash),
    createdAt: data?.api_token_created_at ?? null
  })
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const user = await authenticateBearerToken(request.headers.get("authorization"))
  if (!user) {
    return jsonError(401, "unauthorized", "a valid bearer token is required")
  }
  if (!supabaseIsConfigured()) {
    return jsonError(503, "service_unavailable", "supabase is not configured")
  }

  const admin = getSupabaseAdmin()
  const { error } = await admin
    .from("profiles")
    .update({ api_token_hash: null, api_token_created_at: null })
    .eq("id", user.userId)
  if (error) {
    return jsonError(500, "token_update_failed", "could not revoke the api token")
  }

  return NextResponse.json({ ok: true })
}

function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status })
}
