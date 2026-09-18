export type PackCurrency = "USD"

export interface CreditPack {
  id: string
  name: string
  credits: number
  priceMinor: number
  currency: PackCurrency
  description: string
  highlights: string[]
  popular?: boolean
}

export const CREDITS_PER_SIFT = 3

export const CREDIT_PACKS: CreditPack[] = [
  {
    id: "starter",
    name: "Starter",
    credits: 50,
    priceMinor: 900,
    currency: "USD",
    description: "Test cloud sifting on a short project.",
    highlights: ["50 cloud credits", "About 16 cloud sifts", "Never expires", "Email support"]
  },
  {
    id: "creator",
    name: "Creator",
    credits: 200,
    priceMinor: 2900,
    currency: "USD",
    description: "For creators publishing every week.",
    highlights: ["200 cloud credits", "About 66 cloud sifts", "Priority queue", "Email support"],
    popular: true
  },
  {
    id: "studio",
    name: "Studio",
    credits: 1000,
    priceMinor: 9900,
    currency: "USD",
    description: "For teams shipping clips daily.",
    highlights: ["1000 cloud credits", "About 333 cloud sifts", "Highest priority queue", "Priority support"]
  }
]

export const LOCAL_CAPABILITIES = [
  "Unlimited downloads through yt-dlp",
  "Unlimited local transcription with whisper.cpp",
  "Knowledge extraction and editorial analysis",
  "Clip export with no per-minute fees",
  "Files never leave your machine"
]

export const CLOUD_CAPABILITIES = [
  "Managed transcription without local setup",
  "Server-side Gemini sifting for sharper clips",
  "Burst above your hardware limits",
  "Shared project storage through the cloud gateway",
  "Pay only for the sifts you run"
]

export interface PlanFeature {
  label: string
  included: boolean
}

export interface PlanTier {
  id: "free" | "pro"
  name: string
  priceLabel: string
  tagline: string
  cta: { label: string; href: string }
  features: PlanFeature[]
  highlighted?: boolean
}

export const PLAN_TIERS: PlanTier[] = [
  {
    id: "free",
    name: "Free",
    priceLabel: "$0",
    tagline: "Local Gemini mining with your own API key.",
    cta: { label: "Start free", href: "/account" },
    features: [
      { label: "Unlimited local downloads with yt-dlp", included: true },
      { label: "Unlimited transcription with whisper.cpp", included: true },
      { label: "Knowledge extraction and clip export", included: true },
      { label: "Local Gemini using your personal API key", included: true },
      { label: "Cloud Sifter credits", included: false },
      { label: "Priority processing queue", included: false }
    ]
  },
  {
    id: "pro",
    name: "Pro",
    priceLabel: "Pay as you go",
    tagline: "Cloud Sifter with instant backend processing.",
    cta: { label: "Buy credits", href: "/account#topup" },
    highlighted: true,
    features: [
      { label: "Everything in Free", included: true },
      { label: `Cloud Sifter (${CREDITS_PER_SIFT} credits per run)`, included: true },
      { label: "Managed transcription, zero local setup", included: true },
      { label: "Priority processing queue", included: true },
      { label: "Paystack credit top-ups", included: true },
      { label: "Priority email support", included: true }
    ]
  }
]

export function findCreditPack(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((pack) => pack.id === id)
}

export function formatPrice(pack: CreditPack): string {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: pack.currency,
    minimumFractionDigits: pack.priceMinor % 100 === 0 ? 0 : 2
  })
  return formatter.format(pack.priceMinor / 100)
}

export function formatCredits(credits: number): string {
  return new Intl.NumberFormat("en-US").format(credits)
}
