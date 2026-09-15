import type { SupabaseClient } from "@supabase/supabase-js"

export interface LedgerResult {
  ok: boolean
  reason?: string
  balance?: number
  duplicate?: boolean
}

export interface UsageRecordInput {
  userId: string
  eventType: string
  creditsDelta?: number
  balanceAfter?: number
  reference?: string
  metadata?: Record<string, unknown>
}

export async function getCreditBalance(
  admin: SupabaseClient,
  userId: string
): Promise<number> {
  const { data, error } = await admin
    .from("credit_balances")
    .select("available_credits")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) {
    throw error
  }
  return data?.available_credits ?? 0
}

export async function debitCredits(
  admin: SupabaseClient,
  input: { userId: string; amount: number; reason: string; metadata?: Record<string, unknown> }
): Promise<LedgerResult> {
  const { data, error } = await admin.rpc("debit_credits", {
    p_user_id: input.userId,
    p_credits: input.amount,
    p_reason: input.reason,
    p_metadata: input.metadata ?? {}
  })
  if (error) {
    throw error
  }
  return normalizeLedger(data)
}

export async function grantCredits(
  admin: SupabaseClient,
  input: {
    userId: string
    amount: number
    reason: string
    reference?: string
    metadata?: Record<string, unknown>
  }
): Promise<LedgerResult> {
  const { data, error } = await admin.rpc("grant_credits", {
    p_user_id: input.userId,
    p_credits: input.amount,
    p_reason: input.reason,
    p_reference: input.reference ?? null,
    p_metadata: input.metadata ?? {}
  })
  if (error) {
    throw error
  }
  return normalizeLedger(data)
}

export async function recordUsage(
  admin: SupabaseClient,
  input: UsageRecordInput
): Promise<void> {
  const { error } = await admin.from("usage_logs").insert({
    user_id: input.userId,
    event_type: input.eventType,
    credits_delta: input.creditsDelta ?? 0,
    balance_after: input.balanceAfter ?? null,
    reference: input.reference ?? null,
    metadata: input.metadata ?? {}
  })
  if (error) {
    throw error
  }
}

function normalizeLedger(data: unknown): LedgerResult {
  if (typeof data !== "object" || data === null) {
    return { ok: false, reason: "ledger_error" }
  }
  const row = data as Record<string, unknown>
  return {
    ok: row.ok === true,
    reason: typeof row.reason === "string" ? row.reason : undefined,
    balance: typeof row.balance === "number" ? row.balance : undefined,
    duplicate: row.duplicate === true
  }
}
