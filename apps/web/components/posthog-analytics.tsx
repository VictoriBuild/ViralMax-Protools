"use client"

import { useEffect } from "react"
import { initAnalytics } from "@/lib/analytics"

export function PostHogAnalytics(): null {
  useEffect(() => {
    initAnalytics()
  }, [])
  return null
}
