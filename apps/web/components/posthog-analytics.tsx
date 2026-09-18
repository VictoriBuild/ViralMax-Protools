"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { initAnalytics, trackPageview } from "@/lib/analytics"

export function PostHogAnalytics(): null {
  const pathname = usePathname()

  useEffect(() => {
    initAnalytics()
  }, [])

  useEffect(() => {
    if (pathname) {
      trackPageview(pathname)
    }
  }, [pathname])

  return null
}
