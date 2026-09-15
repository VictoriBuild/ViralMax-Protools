import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { randomUUID } from "node:crypto"
import { AiError } from "@repo/ai"
import { CloudSifterInputSchema, ClipsSchema } from "@repo/shared"
import { authenticateBearerToken } from "@/lib/supabase/auth"
import { supabaseIsConfigured, getSupabaseAdmin } from "@/lib/supabase/admin"
import { getCreditBalance, debitCredits, recordUsage } from "@/lib/credits"
import { siftTranscript, geminiConfigured } from "@/lib/sifter"
import { sendLowCreditAlert } from "@/lib/email"
import { numberEnvOr } from "@/lib/server-env"

export const runtime = "nodejs"

const creditCost = numberEnvOr("SIFTER_CREDIT_COST", 3)
const lowCreditThreshold = numberEnvOr("LOW_CREDIT_THRESHOLD", 10)

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await authenticateBearerToken(request.headers.get("authorization"))
  if (!user) {
    return jsonError(401, "unauthorized", "a valid bearer token is required")
  }

  if (!supabaseIsConfigured()) {
    return jsonError(503, "service_unavailable", "supabase is not configured")
  }
  if (!geminiConfigured()) {
    return jsonError(503, "service_unavailable", "cloud sifter provider is not configured")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError(400, "invalid_request", "request body is not valid json")
  }
  const result = CloudSifterInputSchema.safeParse(body)
  if (!result.success) {
    return jsonError(400, "invalid_request", "payload does not match CloudSifterInputSchema")
  }
  const { transcript } = result.data

  const requestId = request.headers.get("x-request-id") ?? randomUUID()
  const admin = getSupabaseAdmin()
  const metadata = { request_id: requestId, engine: "gemini-cloud-sifter" }

  const balance = await getCreditBalance(admin, user.userId).catch(() => null)
  if (balance === null) {
    return jsonError(503, "ledger_unavailable", "could not read the credit ledger")
  }
  if (balance < creditCost) {
    await recordUsage(admin, {
      userId: user.userId,
      eventType: "cloud_sifter",
      creditsDelta: 0,
      reference: requestId,
      metadata: { ...metadata, status: "rejected", reason: "insufficient_credits" }
    }).catch(() => undefined)
    return jsonError(402, "insufficient_credits", "cloud sifter requires credits", {
      required: creditCost,
      balance
    })
  }

  try {
    const clips = await siftTranscript(transcript)
    const validated = ClipsSchema.safeParse(clips)
    if (!validated.success) {
      throw new AiError({
        providerId: "gemini",
        code: "invalid_response",
        message: "cloud sifter produced clips that failed schema validation",
        retryable: false
      })
    }

    const debit = await debitCredits(admin, {
      userId: user.userId,
      amount: creditCost,
      reason: "cloud_sifter",
      metadata
    })
    if (!debit.ok || debit.balance === undefined) {
      return jsonError(402, "insufficient_credits", "credit balance changed while processing", {
        required: creditCost,
        balance: debit.balance ?? balance
      })
    }

    await recordUsage(admin, {
      userId: user.userId,
      eventType: "cloud_sifter",
      creditsDelta: -creditCost,
      balanceAfter: debit.balance,
      reference: requestId,
      metadata: { ...metadata, status: "completed", clip_count: validated.data.clips.length }
    }).catch(() => undefined)

    if (user.email && debit.balance <= lowCreditThreshold) {
      void sendLowCreditAlert({
        to: user.email,
        balance: debit.balance,
        threshold: lowCreditThreshold
      }).catch(() => undefined)
    }

    return NextResponse.json(validated.data)
  } catch (error) {
    const code = error instanceof AiError ? error.code : "internal"
    const message = error instanceof Error ? error.message : "unexpected sifter failure"
    await recordUsage(admin, {
      userId: user.userId,
      eventType: "cloud_sifter",
      creditsDelta: 0,
      reference: requestId,
      metadata: { ...metadata, status: "failed", error_code: code, error_message: message }
    }).catch(() => undefined)

    if (error instanceof AiError && !error.retryable) {
      return jsonError(502, code, message)
    }
    return jsonError(502, "provider_error", message, { code })
  }
}

function jsonError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
): NextResponse {
  return NextResponse.json({ error: { code, message, ...details } }, { status })
}
