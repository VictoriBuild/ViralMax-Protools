export interface PaystackInlineOptions {
  key: string
  email: string
  amountMinor: number
  currency: string
  reference: string
  metadata?: Record<string, unknown>
  onSuccess: (reference: string) => void
  onCancel?: () => void
}

interface PaystackSetupOptions {
  key: string
  email: string
  amount: number
  currency: string
  ref: string
  metadata?: Record<string, unknown>
  callback: (response: { reference: string }) => void
  onClose: () => void
}

interface PaystackHandler {
  openIframe: () => void
}

interface PaystackPop {
  setup: (options: PaystackSetupOptions) => PaystackHandler
}

interface PaystackWindow {
  PaystackPop?: PaystackPop
}

const SCRIPT_SRC = "https://js.paystack.co/v1/inline.js"
let scriptPromise: Promise<boolean> | null = null

export function paystackPublicConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY)
}

export function loadPaystack(): Promise<boolean> {
  if (typeof window === "undefined") {
    return Promise.resolve(false)
  }
  const paystackWindow = window as unknown as PaystackWindow
  if (paystackWindow.PaystackPop) {
    return Promise.resolve(true)
  }
  if (scriptPromise) {
    return scriptPromise
  }
  scriptPromise = new Promise<boolean>((resolve) => {
    const script = document.createElement("script")
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => resolve(Boolean((window as unknown as PaystackWindow).PaystackPop))
    script.onerror = () => resolve(false)
    document.head.appendChild(script)
  })
  return scriptPromise
}

export async function openPaystackCheckout(options: PaystackInlineOptions): Promise<boolean> {
  const ready = await loadPaystack()
  const paystackPop = ready ? (window as unknown as PaystackWindow).PaystackPop : undefined
  if (!paystackPop) {
    return false
  }
  const handler = paystackPop.setup({
    key: options.key,
    email: options.email,
    amount: options.amountMinor,
    currency: options.currency,
    ref: options.reference,
    metadata: options.metadata,
    callback: (response) => options.onSuccess(response.reference),
    onClose: () => options.onCancel?.()
  })
  handler.openIframe()
  return true
}

export function generatePaystackReference(): string {
  const random = Math.random().toString(36).slice(2, 10)
  return `ms_${Date.now().toString(36)}_${random}`
}
