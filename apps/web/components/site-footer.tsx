import Link from "next/link"
import { AudioLines } from "lucide-react"

const FOOTER_GROUPS = [
  {
    title: "Product",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#pricing", label: "Pricing" },
      { href: "/account", label: "Account" }
    ]
  },
  {
    title: "Developers",
    links: [
      { href: "/account", label: "Desktop API token" },
      { href: "/api/health", label: "Service status" }
    ]
  }
]

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-12 md:grid-cols-[2fr_1fr_1fr]">
        <div className="space-y-3">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <AudioLines className="size-5" />
            <span>MediaSuite</span>
          </div>
          <p className="max-w-sm text-sm text-muted-foreground">
            Local-first video mining for creators. Transcribe, analyze, and cut clips without uploading a single second.
          </p>
        </div>
        {FOOTER_GROUPS.map((group) => (
          <div key={group.title} className="space-y-3">
            <p className="text-sm font-medium">{group.title}</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {group.links.map((link) => (
                <li key={link.href + link.label}>
                  <Link href={link.href} className="transition-colors hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border/60 py-6">
        <p className="mx-auto w-full max-w-6xl px-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} MediaSuite. Cloud sifting is billed in credits.
        </p>
      </div>
    </footer>
  )
}
