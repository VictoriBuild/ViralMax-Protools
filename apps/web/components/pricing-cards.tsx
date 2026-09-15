import Link from "next/link"
import { Check } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { CREDIT_PACKS, formatCredits, formatPrice } from "@/lib/pricing"
import { cn } from "@/lib/utils"

export function PricingCards() {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {CREDIT_PACKS.map((pack) => (
        <Card key={pack.id} className={cn("flex flex-col", pack.popular && "border-primary/60 shadow-md")}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{pack.name}</CardTitle>
              {pack.popular ? <Badge>Most popular</Badge> : null}
            </div>
            <CardDescription>{pack.description}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-semibold tracking-tight">{formatPrice(pack)}</span>
              <span className="text-sm text-muted-foreground">one-time</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatCredits(pack.credits)} credits · {formatCredits(Math.floor(pack.credits / 3))} cloud sifts
            </p>
            <ul className="space-y-2 text-sm">
              {pack.highlights.map((highlight) => (
                <li key={highlight} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 text-emerald-500" />
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Link
              href="/account"
              className={cn(
                "inline-flex h-9 w-full items-center justify-center rounded-md px-4 text-sm font-medium transition-colors",
                pack.popular
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
              )}
            >
              Buy {pack.name}
            </Link>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}
