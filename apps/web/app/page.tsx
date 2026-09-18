import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import {
  Brain,
  Cloud,
  Download,
  FileText,
  KeyRound,
  Laptop,
  Scissors,
  ShieldCheck,
  Sparkles,
  Zap
} from "lucide-react"
import { PricingCards } from "@/components/pricing-cards"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CLOUD_CAPABILITIES, CREDITS_PER_SIFT, LOCAL_CAPABILITIES } from "@/lib/pricing"

const FEATURES: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Download,
    title: "Download anything",
    description: "Pull video and audio from supported sources with yt-dlp, then normalize it with ffmpeg."
  },
  {
    icon: FileText,
    title: "Accurate transcripts",
    description: "Run whisper.cpp locally for free, or let the managed Cloud Sifter handle the heavy lifting."
  },
  {
    icon: Brain,
    title: "Knowledge extraction",
    description: "Turn a long recording into topics, entities, and claims you can act on."
  },
  {
    icon: Scissors,
    title: "Viral moment extraction",
    description: "Score every moment and export the highest-potential shorts with burned-in captions."
  },
  {
    icon: ShieldCheck,
    title: "Local-first privacy",
    description: "Files stay on your machine. The desktop app never uploads your media by default."
  },
  {
    icon: Zap,
    title: "Pay per sift",
    description: `Cloud Sifter costs ${CREDITS_PER_SIFT} credits per run. Top up only when you need the cloud.`
  }
]

const STEPS: { title: string; description: string }[] = [
  { title: "Ingest", description: "Paste a URL or pick a local file. MediaSuite downloads and probes it." },
  { title: "Transcript", description: "Transcribe locally with whisper.cpp or import existing captions." },
  { title: "Analyze", description: "Extract knowledge, themes, and the moments worth clipping." },
  { title: "Edit", description: "Score the timeline and let the editorial pass choose the winners." },
  { title: "Export", description: "Render vertical clips with captions, ready to publish." }
]

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-border/60">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-20 md:grid-cols-[1.1fr_0.9fr] md:py-28">
            <div className="flex flex-col justify-center gap-6">
              <Badge variant="outline" className="w-fit gap-1">
                <Sparkles className="size-3.5" />
                Local-first, cloud when you want it
              </Badge>
              <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
                Automated Video Content Mining &amp; Viral Moment Extraction
              </h1>
              <p className="max-w-xl text-lg text-muted-foreground">
                MediaSuite runs the full pipeline: download, transcribe, analyze, and cut. Keep everything private with
                Local Gemini, or burst into the Cloud Sifter when you need more horsepower.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/account"
                  className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-7 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Get started free
                </Link>
                <Link
                  href="#pricing"
                  className="inline-flex h-11 items-center justify-center rounded-md border border-input bg-background px-7 text-base font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  View pricing
                </Link>
              </div>
            </div>
            <Card className="self-center">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Laptop className="size-4" />
                  Two processing engines
                </CardTitle>
                <CardDescription>Same pipeline, you choose where the AI runs.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6">
                <CapabilityList
                  icon={KeyRound}
                  title="Local Gemini"
                  description="Free and privacy-focused, using your own Gemini API key."
                  items={LOCAL_CAPABILITIES}
                />
                <CapabilityList
                  icon={Cloud}
                  title="Cloud Sifter"
                  description={`Instant backend processing, ${CREDITS_PER_SIFT} credits per run.`}
                  items={CLOUD_CAPABILITIES}
                />
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="features" className="mx-auto w-full max-w-6xl px-6 py-20">
          <SectionHeading
            eyebrow="Features"
            title="Everything from raw link to publishable clip"
            description="One pipeline, seven stages, and an interface built for creators who ship every week."
          />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <Card key={feature.title}>
                <CardHeader>
                  <feature.icon className="size-5 text-muted-foreground" />
                  <CardTitle className="mt-2">{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section id="engines" className="border-y border-border/60 bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-6 py-20">
            <SectionHeading
              eyebrow="Dual processing model"
              title="Local Gemini or Cloud Sifter"
              description="Run everything on your own hardware with your personal API key, or offload heavy work to the managed backend."
            />
            <div className="mt-12 grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <KeyRound className="size-4" />
                      Local Gemini
                    </CardTitle>
                    <Badge variant="success">Free</Badge>
                  </div>
                  <CardDescription>
                    Privacy-focused. Bring your own Gemini API key and keep every file on your machine.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {LOCAL_CAPABILITIES.map((item) => (
                      <li key={item} className="flex gap-2 text-muted-foreground">
                        <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card className="border-primary/50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Cloud className="size-4" />
                      Cloud Sifter
                    </CardTitle>
                    <Badge>{CREDITS_PER_SIFT} credits / run</Badge>
                  </div>
                  <CardDescription>Instant backend processing using your credit balance. No local setup required.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {CLOUD_CAPABILITIES.map((item) => (
                      <li key={item} className="flex gap-2 text-muted-foreground">
                        <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground/50" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="border-b border-border/60">
          <div className="mx-auto w-full max-w-6xl px-6 py-20">
            <SectionHeading
              eyebrow="How it works"
              title="Five steps, fully automated"
              description="Drop in a source and watch the pipeline move from acquisition to export."
            />
            <ol className="mt-12 grid gap-6 md:grid-cols-5">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex flex-col gap-3">
                  <span className="flex size-9 items-center justify-center rounded-full border border-border bg-background text-sm font-semibold">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-medium">{step.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="pricing" className="mx-auto w-full max-w-6xl px-6 py-20">
          <SectionHeading
            eyebrow="Pricing"
            title="Free to start, pay only for cloud sifting"
            description="Local processing is unlimited and free. Pro credits are a one-time top-up processed by Paystack."
          />
          <div className="mt-12">
            <PricingCards />
          </div>
        </section>

        <section className="border-t border-border/60">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-6 py-16 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Ready to mine your library?</h2>
              <p className="mt-1 text-muted-foreground">Create an account, connect the desktop app, and start cutting.</p>
            </div>
            <Link
              href="/account"
              className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-7 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Open your account
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-3 text-muted-foreground">{description}</p>
    </div>
  )
}

function CapabilityList({
  icon: Icon,
  title,
  description,
  items
}: {
  icon: LucideIcon
  title: string
  description: string
  items: string[]
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="size-4" />
        <p className="font-medium">{title}</p>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
      <ul className="space-y-1.5 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
