"use client"

import { useCallback, useEffect, useState } from "react"
import type { FormEvent } from "react"
import type { Session } from "@supabase/supabase-js"
import { Check, Copy, KeyRound, Loader2, LogOut, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { capture, identifyUser, resetAnalytics } from "@/lib/analytics"
import { CREDIT_PACKS, formatCredits, formatPrice } from "@/lib/pricing"
import { getSupabaseBrowser, supabaseBrowserConfigured } from "@/lib/supabase/client"

interface AccountSnapshot {
  balance: number
  currency: string
  plan: string
  updatedAt: string | null
  email: string | null
}

interface TokenStatus {
  hasToken: boolean
  createdAt: string | null
}

type AuthMode = "signin" | "signup"

export function AccountPortal() {
  const [configured] = useState(() => supabaseBrowserConfigured())
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [mode, setMode] = useState<AuthMode>("signin")
  const [formEmail, setFormEmail] = useState("")
  const [password, setPassword] = useState("")
  const [authError, setAuthError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null)
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null)
  const [issuedToken, setIssuedToken] = useState<string | null>(null)
  const [checkoutPackId, setCheckoutPackId] = useState<string | null>(null)

  const accessToken = session?.access_token ?? null
  const email = session?.user.email ?? null

  useEffect(() => {
    const client = getSupabaseBrowser()
    if (!client) {
      setReady(true)
      return
    }
    let active = true
    void client.auth.getSession().then(({ data }) => {
      if (!active) {
        return
      }
      setSession(data.session)
      setReady(true)
    })
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession?.user) {
        identifyUser(nextSession.user.id, { email: nextSession.user.email })
      }
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const refreshAccount = useCallback(async (token: string) => {
    const [balanceResponse, tokenResponse] = await Promise.all([
      fetch("/api/billing/balance", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/account/token", { headers: { Authorization: `Bearer ${token}` } })
    ])
    if (balanceResponse.ok) {
      setSnapshot((await balanceResponse.json()) as AccountSnapshot)
    }
    if (tokenResponse.ok) {
      setTokenStatus((await tokenResponse.json()) as TokenStatus)
    }
  }, [])

  useEffect(() => {
    if (accessToken) {
      void refreshAccount(accessToken)
    }
  }, [accessToken, refreshAccount])

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("checkout")
    if (status === "success") {
      setNotice("Payment received. Credits land as soon as Paystack confirms the charge.")
      capture("checkout_returned", { status })
    } else if (status === "cancelled") {
      setNotice("Checkout cancelled. No charge was made.")
    }
  }, [])

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const client = getSupabaseBrowser()
    if (!client) {
      return
    }
    setBusy(true)
    setAuthError(null)
    setNotice(null)
    const { data, error } =
      mode === "signup"
        ? await client.auth.signUp({ email: formEmail, password })
        : await client.auth.signInWithPassword({ email: formEmail, password })
    setBusy(false)
    if (error) {
      setAuthError(error.message)
      capture("auth_failed", { mode })
      return
    }
    setPassword("")
    capture(mode === "signup" ? "signup_submitted" : "login_submitted")
    if (mode === "signup" && !data.session) {
      setNotice("Check your inbox to confirm your email, then sign in.")
    }
  }

  const handleSignOut = async () => {
    const client = getSupabaseBrowser()
    await client?.auth.signOut()
    resetAnalytics()
    setIssuedToken(null)
    setTokenStatus(null)
    setSnapshot(null)
    setNotice(null)
  }

  const handleCheckout = async (packId: string) => {
    if (!accessToken) {
      setNotice("Sign in to buy credits.")
      return
    }
    setCheckoutPackId(packId)
    setNotice(null)
    capture("checkout_started", { packId })
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ packId })
      })
      const payload = (await response.json()) as {
        authorizationUrl?: string
        reference?: string
        error?: { message?: string }
      }
      if (!response.ok || !payload.authorizationUrl) {
        setNotice(payload.error?.message ?? "Checkout could not be started.")
        capture("checkout_failed", { packId })
        return
      }
      capture("checkout_redirected", { packId, reference: payload.reference })
      window.location.assign(payload.authorizationUrl)
    } catch {
      setNotice("Network error while starting checkout.")
    } finally {
      setCheckoutPackId(null)
    }
  }

  const handleIssueToken = async () => {
    if (!accessToken) {
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      const response = await fetch("/api/account/token", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      const payload = (await response.json()) as { token?: string; createdAt?: string; error?: { message?: string } }
      if (!response.ok || !payload.token) {
        setNotice(payload.error?.message ?? "Could not issue a token.")
        return
      }
      setIssuedToken(payload.token)
      setTokenStatus({ hasToken: true, createdAt: payload.createdAt ?? new Date().toISOString() })
      capture("desktop_token_issued")
    } finally {
      setBusy(false)
    }
  }

  const handleRevokeToken = async () => {
    if (!accessToken) {
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      const response = await fetch("/api/account/token", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      if (!response.ok) {
        setNotice("Could not revoke the token.")
        return
      }
      setIssuedToken(null)
      setTokenStatus({ hasToken: false, createdAt: null })
      capture("desktop_token_revoked")
    } finally {
      setBusy(false)
    }
  }

  const handleCopyToken = async () => {
    if (!issuedToken) {
      return
    }
    try {
      await navigator.clipboard.writeText(issuedToken)
      setNotice("Token copied to clipboard.")
    } catch {
      setNotice("Copy failed. Select the token and copy it manually.")
    }
  }

  if (!ready) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <CardTitle>Loading your account</CardTitle>
          <CardDescription>Checking for an existing session.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Connecting to Supabase
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!configured) {
    return (
      <Card className="mx-auto w-full max-w-lg">
        <CardHeader>
          <CardTitle>Auth is not configured</CardTitle>
          <CardDescription>
            Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable accounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            The rest of the pipeline keeps working locally. Accounts are only required to sync credits and issue desktop
            tokens.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (!accessToken) {
    return (
      <div className="mx-auto w-full max-w-md space-y-4">
        <Card>
          <CardHeader>
            <div className="flex gap-2">
              <ModeButton active={mode === "signin"} onClick={() => setMode("signin")}>
                Sign in
              </ModeButton>
              <ModeButton active={mode === "signup"} onClick={() => setMode("signup")}>
                Create account
              </ModeButton>
            </div>
            <CardTitle className="mt-3">{mode === "signup" ? "Create your account" : "Welcome back"}</CardTitle>
            <CardDescription>
              {mode === "signup"
                ? "Use an email and password to unlock cloud sifting and desktop tokens."
                : "Sign in to manage credits and your desktop connection."}
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleAuth}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={formEmail}
                  onChange={(event) => setFormEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>
              {authError ? <p className="text-sm text-destructive">{authError}</p> : null}
              {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {mode === "signup" ? "Create account" : "Sign in"}
              </Button>
            </CardFooter>
          </form>
        </Card>
        <p className="text-center text-xs text-muted-foreground">
          By continuing you agree to fair use of cloud credits. Local processing is always free.
        </p>
      </div>
    )
  }

  const balance = snapshot?.balance ?? 0
  const plan = snapshot?.plan ?? "free"
  const capacity = CREDIT_PACKS[CREDIT_PACKS.length - 1]?.credits ?? 1000
  const usagePercent = capacity > 0 ? (balance / capacity) * 100 : 0

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
          <p className="text-sm text-muted-foreground">{email ?? "Signed in"}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={plan === "pro" ? "success" : "secondary"}>{plan === "pro" ? "Pro" : "Free"}</Badge>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </div>

      {notice ? (
        <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">{notice}</div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader>
            <CardTitle>Credit balance</CardTitle>
            <CardDescription>Each cloud sift costs 3 credits.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-4xl font-semibold tracking-tight">{formatCredits(balance)}</p>
            <Progress value={usagePercent} />
            <p className="text-xs text-muted-foreground">
              {snapshot?.updatedAt ? `Last updated ${new Date(snapshot.updatedAt).toLocaleString()}` : "No credits used yet."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => accessToken && void refreshAccount(accessToken)}
            >
              Refresh balance
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4" />
              Desktop connection
            </CardTitle>
            <CardDescription>Issue a token and paste it into the desktop app settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tokenStatus?.hasToken && !issuedToken ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="size-4 text-emerald-500" />
                An API token is active
                {tokenStatus.createdAt ? ` (created ${new Date(tokenStatus.createdAt).toLocaleDateString()})` : ""}.
              </div>
            ) : null}
            {issuedToken ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                  <code className="flex-1 truncate text-xs">{issuedToken}</code>
                  <Button variant="ghost" size="icon" onClick={handleCopyToken} aria-label="Copy token">
                    <Copy className="size-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Copy it now. It is shown once and stored hashed on the server.
                </p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleIssueToken} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                {tokenStatus?.hasToken ? "Rotate token" : "Generate token"}
              </Button>
              {tokenStatus?.hasToken ? (
                <Button variant="outline" onClick={handleRevokeToken} disabled={busy}>
                  Revoke
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight">Top up credits</h2>
          <p className="text-sm text-muted-foreground">Purchases are processed securely by Paystack.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {CREDIT_PACKS.map((pack) => (
            <Card key={pack.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{pack.name}</CardTitle>
                  {pack.popular ? <Badge>Popular</Badge> : null}
                </div>
                <CardDescription>
                  {formatCredits(pack.credits)} credits · {formatPrice(pack)}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {pack.highlights.slice(0, 3).map((highlight) => (
                    <li key={highlight} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 text-emerald-500" />
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  variant={pack.popular ? "default" : "outline"}
                  disabled={checkoutPackId !== null}
                  onClick={() => void handleCheckout(pack.id)}
                >
                  {checkoutPackId === pack.id ? <Loader2 className="size-4 animate-spin" /> : null}
                  Buy {pack.name}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button type="button" size="sm" variant={active ? "default" : "ghost"} onClick={onClick}>
      {children}
    </Button>
  )
}
