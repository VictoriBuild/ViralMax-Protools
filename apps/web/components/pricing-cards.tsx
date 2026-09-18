import Link from "next/link"
import { Check, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { PLAN_TIERS } from "@/lib/pricing"
import { cn } from "@/lib/utils"

export function PricingCards() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {PLAN_TIERS.map((tier) => (
        <Card key={tier.id} className={cn("flex flex-col", tier.highlighted && "border-primary/60 shadow-md")}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{tier.name}</CardTitle>
              {tier.highlighted ? <Badge>Cloud Sifter</Badge> : <Badge variant="outline">Local-first</Badge>}
            </div>
            <CardDescription>{tier.tagline}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-semibold tracking-tight">{tier.priceLabel}</span>
              {tier.id === "free" ? <span className="text-sm text-muted-foreground">forever</span> : null}
            </div>
            <ul className="space-y-2 text-sm">
              {tier.features.map((feature) => (
                <li key={feature.label} className="flex items-start gap-2">
                  {feature.included ? (
                    <Check className="mt-0.5 size-4 text-emerald-500" />
                  ) : (
                    <X className="mt-0.5 size-4 text-muted-foreground/60" />
                  )}
                  <span className={cn(!feature.included && "text-muted-foreground")}>{feature.label}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Link
              href={tier.cta.href}
              className={cn(
                "inline-flex h-10 w-full items-center justify-center rounded-md px-4 text-sm font-medium transition-colors",
                tier.highlighted
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {tier.cta.label}
            </Link>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}
