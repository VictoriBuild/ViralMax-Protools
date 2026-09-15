import type { Metadata } from "next"
import { PostHogAnalytics } from "@/components/posthog-analytics"
import "./globals.css"

export const metadata: Metadata = {
  title: "MediaSuite",
  description: "Local-first media download and transcription"
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <PostHogAnalytics />
        {children}
      </body>
    </html>
  )
}
