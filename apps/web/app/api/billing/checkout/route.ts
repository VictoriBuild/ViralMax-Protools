import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod"
import { authenticateBearerToken } from "@/lib/supabase/auth"
import { findCreditPack } from "@/lib/pricing"
import { initializePaystackTransaction, paystackConfigured } from "@/lib/paystack"
import { serverEnvOr } from "@/lib/server-env"

export const runtime = "nodejs"

const CheckoutRequestSchema = z.object({
  packId: z.string().min(1)
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await authenticateBearerToken(request.headers.get("authorization"))
  if (!user) {
    return jsonError(401, "unauthorized", "a valid bearer token is required")
  }
  if (!paystackConfigured()) {
    return jsonError(503, "billing_unavailable", "paystack is not configured")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError(400, "invalid_request", "request body is not valid json")
  }
  const parsed = CheckoutRequestSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(400, "invalid_request", "packId is required")
  }

  const pack = findCreditPack(parsed.data.packId)
  if (!pack) {
    return jsonError(404, "unknown_pack", "the requested credit pack does not exist")
  }
  if (!user.email) {
    return jsonError(400, "email_required", "the account needs an email address before checkout")
  }

  const origin = serverEnvOr("NEXT_PUBLIC_WEB_URL", request.nextUrl.origin).replace(/\/$/, "")

  try {
    const result = await initializePaystackTransaction({
      email: user.email,
      pack,
      userId: user.userId,
      callbackUrl: `${origin}/account?checkout=success`
    })
    return NextResponse.json({
      ok: true,
      packId: pack.id,
      credits: pack.credits,
      reference: result.reference,
      authorizationUrl: result.authorizationUrl
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "could not initialize checkout"
    return jsonError(502, "checkout_failed", message)
  }
}

function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status })
}
