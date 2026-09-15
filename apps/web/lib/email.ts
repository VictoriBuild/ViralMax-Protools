import { Resend } from "resend"
import { serverEnv, serverEnvOr } from "./server-env"

export interface EmailDelivery {
  ok: boolean
  skipped: boolean
  id?: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function senderAddress(): string | undefined {
  return serverEnv("RESEND_FROM_EMAIL")
}

async function sendEmail(input: {
  to: string
  subject: string
  html: string
}): Promise<EmailDelivery> {
  const apiKey = serverEnv("RESEND_API_KEY")
  const from = senderAddress()
  if (!apiKey || !from) {
    return { ok: false, skipped: true }
  }
  const resend = new Resend(apiKey)
  const { data, error } = await resend.emails.send({
    from,
    to: [input.to],
    subject: input.subject,
    html: input.html
  })
  if (error) {
    throw error
  }
  return { ok: true, skipped: false, id: data?.id }
}

export async function sendWelcomeEmail(input: {
  to: string
  name?: string
}): Promise<EmailDelivery> {
  const displayName = input.name?.trim() || "there"
  const html = [
    "<div style=\"font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;\">",
    `<h1>Welcome to MediaSuite, ${escapeHtml(displayName)}</h1>`,
    "<p>Your cloud workspace is ready. Credits purchased in your account are available for",
    "cloud sifting and transcription immediately.</p>",
    "<p>Keep your API bearer token private. It authorizes credit usage on your account.",
    "</p>",
    "<p>Happy editing,<br/>The MediaSuite Team</p>",
    "</div>"
  ].join("\n")
  return sendEmail({ to: input.to, subject: "Welcome to MediaSuite", html })
}

export async function sendLowCreditAlert(input: {
  to: string
  balance: number
  threshold: number
}): Promise<EmailDelivery> {
  const html = [
    "<div style=\"font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;\">",
    "<h1>Low credit balance</h1>",
    `<p>Your cloud credit balance is <strong>${input.balance}</strong> credit${
      input.balance === 1 ? "" : "s"
    }, at or below the threshold of ${input.threshold}.</p>`,
    "<p>Top up before your next cloud sift so processing is never interrupted.</p>",
    "<p>The MediaSuite Team</p>",
    "</div>"
  ].join("\n")
  return sendEmail({
    to: input.to,
    subject: "Your MediaSuite credit balance is running low",
    html
  })
}

export function emailConfigured(): boolean {
  return Boolean(serverEnv("RESEND_API_KEY") && serverEnvOr("RESEND_FROM_EMAIL", ""))
}
