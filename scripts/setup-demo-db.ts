/**
 * 시연(포트폴리오)용 DB 생성 — 같은 PostgreSQL 서버에 깨끗한 DB를 만들고 스키마·시드·고객용 RAG 청크를 채운다.
 *
 *   DEMO_DATABASE_URL="postgresql://.../fin-mate-demo" npx tsx --env-file=.env scripts/setup-demo-db.ts [--recreate]
 *
 * - 원본: .env의 DATABASE_URL (개발용 fin-mate). 원본은 읽기만 한다.
 * - 대상 DB가 이미 있으면 중단. --recreate를 주면 DROP 후 다시 만든다 (시연 데이터 초기화용).
 * - 스키마는 prisma db push로 생성 — 마이그레이션 이력이 schema.prisma와 완전히 일치하지 않아(과거 db push 사용) 빈 DB에는 push가 정확하다.
 * - RAG 청크는 고객용 문서(emp-* 제외)만 복사 — 임베딩을 다시 만들 필요 없음 (LM Studio 불필요).
 */
import { execSync } from "node:child_process"
import { Pool } from "pg"

const SOURCE_URL = process.env.DATABASE_URL
const TARGET_URL = process.env.DEMO_DATABASE_URL
const RECREATE = process.argv.includes("--recreate")

function dbName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.slice(1))
}

async function main() {
  if (!SOURCE_URL || !TARGET_URL) throw new Error("DATABASE_URL(원본)과 DEMO_DATABASE_URL(대상)이 필요합니다.")
  const source = dbName(SOURCE_URL)
  const target = dbName(TARGET_URL)
  if (source === target) throw new Error(`원본과 대상 DB가 같습니다: ${target}`)

  // 1. DB 생성 (원본 DB 연결로 CREATE DATABASE 실행)
  const admin = new Pool({ connectionString: SOURCE_URL })
  const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [target])
  if (rowCount) {
    if (!RECREATE) throw new Error(`"${target}" DB가 이미 있습니다. 초기화하려면 --recreate를 붙이세요.`)
    console.log(`▶ "${target}" 삭제`)
    await admin.query(`DROP DATABASE "${target}" WITH (FORCE)`)
  }
  console.log(`▶ "${target}" 생성`)
  await admin.query(`CREATE DATABASE "${target}"`)

  const demo = new Pool({ connectionString: TARGET_URL })
  await demo.query("CREATE EXTENSION IF NOT EXISTS vector")

  // 2. 스키마 + 시드 (prisma.config.ts·seed.ts의 dotenv는 기존 환경변수를 덮어쓰지 않으므로 대상 URL이 유지됨)
  const env = { ...process.env, DATABASE_URL: TARGET_URL }
  console.log("▶ 스키마 생성 (prisma db push)")
  execSync("npx prisma db push", { env, stdio: "inherit" })
  console.log("▶ 시드")
  execSync("npx tsx prisma/seed.ts", { env, stdio: "inherit" })

  // 3. 고객용 RAG 청크 복사
  const { rows } = await admin.query(
    `SELECT id, doc_name, article_num, section_num, content, metadata, embedding::text AS embedding, quality_score
       FROM document_chunks WHERE doc_name NOT LIKE 'emp-%'`,
  )
  for (const r of rows) {
    await demo.query(
      `INSERT INTO document_chunks (id, doc_name, article_num, section_num, content, metadata, embedding, quality_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8)`,
      [r.id, r.doc_name, r.article_num, r.section_num, r.content, r.metadata, r.embedding, r.quality_score],
    )
  }
  console.log(`▶ RAG 청크 ${rows.length}건 복사`)

  await Promise.all([admin.end(), demo.end()])
  console.log(`✔ "${target}" 준비 완료`)
}

main().catch((err) => {
  console.error("✖", err instanceof Error ? err.message : err)
  process.exit(1)
})
