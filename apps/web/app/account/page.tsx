import type { Metadata } from "next"
import { AccountPortal } from "@/components/account-portal"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"

export const metadata: Metadata = {
  title: "Account | MediaSuite",
  description: "Manage cloud credits, sign in, and connect the MediaSuite desktop app."
}

export default function AccountPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
        <AccountPortal />
      </main>
      <SiteFooter />
    </div>
  )
}
