import { create } from "zustand"
import { getDesktopApi } from "@renderer/lib/desktop-api"

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
    const api = getDesktopApi()
    if (!api) {
      set({ loading: false, error: "Desktop bridge is unavailable" })
      return
    }
    set({ loading: true, error: null })
    try {
      const [balanceResult, entitlementResult] = await Promise.all([
        api.billing.getBalance(),
        api.billing.getEntitlement()
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
