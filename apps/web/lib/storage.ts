import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { serverEnv, serverEnvOrThrow } from "./server-env"

let cachedClient: S3Client | null = null

export function storageConfigured(): boolean {
  return Boolean(
    serverEnv("R2_ACCOUNT_ID") &&
      serverEnv("R2_ACCESS_KEY_ID") &&
      serverEnv("R2_SECRET_ACCESS_KEY") &&
      serverEnv("R2_BUCKET_NAME")
  )
}

function getS3Client(): S3Client {
  if (cachedClient) {
    return cachedClient
  }
  const accountId = serverEnvOrThrow("R2_ACCOUNT_ID")
  const accessKeyId = serverEnvOrThrow("R2_ACCESS_KEY_ID")
  const secretAccessKey = serverEnvOrThrow("R2_SECRET_ACCESS_KEY")
  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey }
  })
  return cachedClient
}

export interface PresignedUploadUrl {
  url: string
  method: "PUT"
  key: string
  headers: { "Content-Type": string }
  expiresInSeconds: number
}

export interface PresignedDownloadUrl {
  url: string
  method: "GET"
  key: string
  expiresInSeconds: number
}

export async function createUploadUrl(input: {
  key: string
  contentType: string
  expiresInSeconds: number
}): Promise<PresignedUploadUrl> {
  const command = new PutObjectCommand({
    Bucket: serverEnvOrThrow("R2_BUCKET_NAME"),
    Key: input.key,
    ContentType: input.contentType
  })
  const url = await getSignedUrl(getS3Client(), command, { expiresIn: input.expiresInSeconds })
  return {
    url,
    method: "PUT",
    key: input.key,
    headers: { "Content-Type": input.contentType },
    expiresInSeconds: input.expiresInSeconds
  }
}

export async function createDownloadUrl(input: {
  key: string
  expiresInSeconds: number
}): Promise<PresignedDownloadUrl> {
  const command = new GetObjectCommand({
    Bucket: serverEnvOrThrow("R2_BUCKET_NAME"),
    Key: input.key
  })
  const url = await getSignedUrl(getS3Client(), command, { expiresIn: input.expiresInSeconds })
  return {
    url,
    method: "GET",
    key: input.key,
    expiresInSeconds: input.expiresInSeconds
  }
}

export function isValidStorageKey(key: string): boolean {
  if (!key || key.length > 1024) {
    return false
  }
  if (key.startsWith("/") || key.includes("\\")) {
    return false
  }
  if (key.split("/").some((segment) => segment === "..")) {
    return false
  }
  if (key.includes("://") || key.startsWith(".")) {
    return false
  }
  return true
}

export function joinStorageKey(parts: string[]): string {
  return parts.filter((part) => part.length > 0).join("/")
}
