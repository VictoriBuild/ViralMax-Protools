import { z } from "zod"
import type { CreditPack } from "./pricing"
import { serverEnv, serverEnvOrThrow } from "./server-env"

const PaystackInitializeResponseSchema = z.object({
  status: z.boolean(),
  message: z.string().optional(),
  data: z
    .object({
      authorization_url: z.string().url(),
      access_code: z.string().optional(),
      reference: z.string().min(1)
    })
    .optional()
})

export interface PaystackInitializeResult {
  authorizationUrl: string
  accessCode?: string
  reference: string
}

export function paystackConfigured(): boolean {
  return Boolean(serverEnv("PAYSTACK_SECRET_KEY"))
}

export async function initializePaystackTransaction(input: {
  email: string
  pack: CreditPack
  userId: string
  callbackUrl: string
  reference?: string
  fetchFn?: typeof fetch
}): Promise<PaystackInitializeResult> {
  const secretKey = serverEnvOrThrow("PAYSTACK_SECRET_KEY")
  const fetchFn = input.fetchFn ?? fetch
  const response = await fetchFn("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: input.email,
      amount: input.pack.priceMinor,
      currency: input.pack.currency,
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: {
        user_id: input.userId,
        pack_id: input.pack.id,
        credits: input.pack.credits
      }
    }),
    cache: "no-store"
  })

  const payload: unknown = await response.json().catch(() => null)
  const parsed = PaystackInitializeResponseSchema.safeParse(payload)
  if (!response.ok || !parsed.success || !parsed.data.status || !parsed.data.data) {
    const message = parsed.success ? (parsed.data.message ?? "paystack rejected the transaction") : "unexpected paystack response"
    throw new Error(message)
  }

  return {
    authorizationUrl: parsed.data.data.authorization_url,
    accessCode: parsed.data.data.access_code,
    reference: parsed.data.data.reference
  }
}
