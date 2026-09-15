import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createHmac, timingSafeEqual } from "node:crypto"
import { z } from "zod"
import { getSupabaseAdmin, supabaseIsConfigured } from "@/lib/supabase/admin"
import { grantCredits } from "@/lib/credits"
import { sendWelcomeEmail } from "@/lib/email"
import { serverEnv } from "@/lib/server-env"

export const runtime = "nodejs"

const PaystackEventSchema = z.object({
  event: z.string(),
  data: z.object({
    reference: z.string().min(1).optional(),
    amount: z.number().optional(),
    currency: z.string().optional(),
    customer: z.object({ email: z.string().email().optional() }).optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
  })
})

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = serverEnv("PAYSTACK_WEBHOOK_SECRET")
  if (!secret) {
    return jsonError(503, "webhook_not_configured", "paystack webhook secret is not configured")
  }
  if (!supabaseIsConfigured()) {
    return jsonError(503, "ledger_unavailable", "supabase is not configured")
  }

  const rawBody = await request.text()
  const signature = request.headers.get("x-paystack-signature")
  if (!signature || !verifySignature(secret, rawBody, signature)) {
    return jsonError(401, "invalid_signature", "webhook signature verification failed")
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return jsonError(400, "invalid_payload", "webhook body is not valid json")
  }

  const parsed = PaystackEventSchema.safeParse(payload)
  if (!parsed.success) {
    return jsonError(400, "invalid_payload", "webhook payload does not match the paystack schema")
  }

  if (parsed.data.event !== "charge.success") {
    return NextResponse.json({ ok: true, ignored: parsed.data.event })
  }

  const data = parsed.data.data
  const reference = data.reference
  const admin = getSupabaseAdmin()

  const userId = await resolveUserId(admin, data)
  if (!userId) {
    return NextResponse.json({ ok: true, ignored: "user_not_found" })
  }

  const credits = creditsForCharge(data)
  if (credits <= 0) {
    return NextResponse.json({ ok: false, reason: "invalid_credit_amount", credits })
  }

  const grant = await grantCredits(admin, {
    userId,
    amount: credits,
    reason: "paystack_top_up",
    reference,
    metadata: {
      event: "charge.success",
      reference,
      amount: data.amount ?? null,
      currency: data.currency ?? null
    }
  })

  if (!grant.ok) {
    return jsonError(500, "ledger_error", "failed to credit the user balance", grant)
  }

  const isFirstGrant = !grant.duplicate && (await isFirstTopUp(admin, userId))
  const email = data.customer?.email
  if (isFirstGrant && email) {
    void sendWelcomeEmail({ to: email }).catch(() => undefined)
  }

  return NextResponse.json({
    ok: true,
    userId,
    credits,
    balance: grant.balance ?? 0,
    duplicate: grant.duplicate ?? false
  })
}

function verifySignature(secret: string, rawBody: string, signature: string): boolean {
  const expected = createHmac("sha512", secret).update(rawBody, "utf8").digest("hex")
  const provided = Buffer.from(signature, "hex")
  const digest = Buffer.from(expected, "hex")
  if (provided.length !== digest.length) {
    return false
  }
  return timingSafeEqual(provided, digest)
}

async function resolveUserId(
  admin: ReturnType<typeof getSupabaseAdmin>,
  data: z.infer<typeof PaystackEventSchema>["data"]
): Promise<string | null> {
  const metadataUserId = typeof data.metadata?.user_id === "string" ? data.metadata.user_id : undefined
  if (metadataUserId && UUID_PATTERN.test(metadataUserId)) {
    const { data: profile, error } = await admin
      .from("profiles")
      .select("id")
      .eq("id", metadataUserId)
      .maybeSingle()
    if (!error && profile) {
      return profile.id
    }
  }

  const email = data.customer?.email
  if (email) {
    const { data: profile, error } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle()
    if (!error && profile) {
      return profile.id
    }
  }
  return null
}

async function isFirstTopUp(
  admin: ReturnType<typeof getSupabaseAdmin>,
  userId: string
): Promise<boolean> {
  const { count, error } = await admin
    .from("usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_type", "credit_grant")
  if (error) {
    return false
  }
  return (count ?? 0) <= 1
}

function creditsForCharge(data: z.infer<typeof PaystackEventSchema>["data"]): number {
  const metadataCredits = Number(data.metadata?.credits)
  if (Number.isInteger(metadataCredits) && metadataCredits > 0) {
    return metadataCredits
  }
  const amount = data.amount ?? 0
  const majorUnits = Math.floor(amount / 100)
  return Math.max(1, majorUnits)
}

function jsonError(
  status: number,
  code: string,
  message: string,
  details?: object
): NextResponse {
  return NextResponse.json({ error: { code, message, ...(details ?? {}) } }, { status })
}
