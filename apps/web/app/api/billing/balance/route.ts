import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { authenticateBearerToken } from "@/lib/supabase/auth"
import { getSupabaseAdmin, supabaseIsConfigured } from "@/lib/supabase/admin"

export const runtime = "nodejs"

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await authenticateBearerToken(request.headers.get("authorization"))
  if (!user) {
    return jsonError(401, "unauthorized", "a valid bearer token is required")
  }
  if (!supabaseIsConfigured()) {
    return jsonError(503, "service_unavailable", "supabase is not configured")
  }

  const admin = getSupabaseAdmin()
  const [balanceRow, profileRow] = await Promise.all([
    admin
      .from("credit_balances")
      .select("available_credits, updated_at")
      .eq("user_id", user.userId)
      .maybeSingle(),
    admin.from("profiles").select("plan_tier, email").eq("id", user.userId).maybeSingle()
  ])

  if (balanceRow.error || profileRow.error) {
    return jsonError(503, "ledger_unavailable", "could not read account state")
  }

  return NextResponse.json({
    balance: balanceRow.data?.available_credits ?? 0,
    currency: "usd",
    plan: profileRow.data?.plan_tier ?? "free",
    updatedAt: balanceRow.data?.updated_at ?? null,
    email: profileRow.data?.email ?? null
  })
}

function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status })
}
