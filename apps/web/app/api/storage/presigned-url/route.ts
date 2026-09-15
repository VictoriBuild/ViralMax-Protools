import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { z } from "zod"
import {
  createDownloadUrl,
  createUploadUrl,
  isValidStorageKey,
  storageConfigured
} from "@/lib/storage"

export const runtime = "nodejs"

const PresignedUrlRequestSchema = z.object({
  operation: z.enum(["upload", "download"]),
  key: z.string().min(1),
  contentType: z.string().optional(),
  expiresInSeconds: z.number().int().min(60).max(3600).default(900)
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!storageConfigured()) {
    return jsonError(503, "storage_unavailable", "r2 storage is not configured")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError(400, "invalid_request", "request body is not valid json")
  }
  const result = PresignedUrlRequestSchema.safeParse(body)
  if (!result.success) {
    return jsonError(400, "invalid_request", "invalid presigned url request")
  }
  const { operation, key, contentType, expiresInSeconds } = result.data

  if (!isValidStorageKey(key)) {
    return jsonError(400, "invalid_key", "storage key contains unsafe path segments")
  }
  if (operation === "upload" && !contentType) {
    return jsonError(400, "invalid_request", "contentType is required for upload operations")
  }

  try {
    if (operation === "upload") {
      const presigned = await createUploadUrl({
        key,
        contentType: contentType as string,
        expiresInSeconds
      })
      return NextResponse.json({ ...presigned })
    }
    const presigned = await createDownloadUrl({ key, expiresInSeconds })
    return NextResponse.json({ ...presigned })
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to sign storage url"
    return jsonError(500, "storage_error", message)
  }
}

function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status })
}
