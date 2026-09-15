import { create } from "zustand"

interface AuthState {
  token: string | null
  plan: string
  features: string[]
  balance: number
  currency: string
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  signIn: (token: string) => void
  signOut: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  plan: "local",
  features: [],
  balance: 0,
  currency: "usd",
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null })
    try {
      const [balanceResult, entitlementResult] = await Promise.all([
        window.api.billing.getBalance(),
        window.api.billing.getEntitlement()
      ])
      set({
        balance: balanceResult.ok ? balanceResult.value.balance : 0,
        currency: balanceResult.ok ? balanceResult.value.currency : "usd",
        plan: entitlementResult.ok ? entitlementResult.value.plan : "local",
        features: entitlementResult.ok ? entitlementResult.value.features : [],
        error: balanceResult.ok ? null : balanceResult.message
      })
    } finally {
      set({ loading: false })
    }
  },

  signIn: (token) => set({ token }),
  signOut: () => set({ token: null, plan: "local", features: [] })
}))
