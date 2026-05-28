import { minioClient, BUCKET } from "../lib/minio"
import * as fs from "fs"
import * as path from "path"

const PUBLIC_POLICY = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { AWS: ["*"] },
      Action: ["s3:GetObject"],
      Resource: [`arn:aws:s3:::${BUCKET}/*`],
    },
  ],
})

const FILES = [
  { local: "public/terms/savings.html",      object: "terms/savings.html" },
  { local: "public/terms/time-deposit.html", object: "terms/time-deposit.html" },
]

async function main() {
  const exists = await minioClient.bucketExists(BUCKET)
  if (!exists) {
    await minioClient.makeBucket(BUCKET)
    console.log(`✔ 버킷 생성: ${BUCKET}`)
  }

  await minioClient.setBucketPolicy(BUCKET, PUBLIC_POLICY)
  console.log(`✔ 버킷 public 정책 설정`)

  for (const { local, object } of FILES) {
    const filePath = path.resolve(process.cwd(), local)
    const content = fs.readFileSync(filePath)
    await minioClient.putObject(BUCKET, object, content, content.length, {
      "Content-Type": "text/html; charset=utf-8",
    })
    console.log(`✔ 업로드: ${object}`)
  }

  const publicUrl = process.env.MINIO_PUBLIC_URL ?? `http://localhost:9000`
  console.log(`\n약관 URL:`)
  for (const { object } of FILES) {
    console.log(`  ${publicUrl}/${BUCKET}/${object}`)
  }
}

main().catch(err => {
  console.error("업로드 실패:", err)
  process.exit(1)
})
