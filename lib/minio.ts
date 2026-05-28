import { Client } from "minio"

export const minioClient = new Client({
  endPoint:  process.env.MINIO_ENDPOINT!,
  port:      Number(process.env.MINIO_PORT ?? 9000),
  useSSL:    process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY!,
  secretKey: process.env.MINIO_SECRET_KEY!,
})

export const BUCKET = process.env.MINIO_BUCKET ?? "finmate"
