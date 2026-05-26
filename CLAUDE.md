# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npx tsc --noEmit     # Type-check without emitting
npm run db:seed      # Seed database (tsx prisma/seed.ts)
npx prisma migrate dev --name <name>   # Create and apply a migration
npx prisma generate  # Regenerate Prisma client after schema changes
```

**Kafka workers** — all require `--env-file=.env` (already wired in package.json):
```bash
npm run kafka:all        # gateway + simulator + settlement + inbound (concurrently)
npm run kafka:gateway    # 공동망 게이트웨이
npm run kafka:simulator  # 타행(B은행) 시뮬레이터
npm run kafka:settlement # 정산 컨슈머 (FIN-Mate 측)
npm run kafka:inbound    # 인바운드 입금 컨슈머
npm run worker:scheduled # 자동이체 워커 (단발성 실행 후 종료)
```

**Environment** (`.env`):
- `DATABASE_URL` — PostgreSQL 연결 문자열
- `AUTH_SECRET` — NextAuth 서명 키 (≥32자)
- `KAFKA_BROKER` — Kafka 브로커 주소 (예: `192.168.219.110:9092`)
- `OLLAMA_BASE_URL` — LM Studio 서버 주소 (예: `http://192.168.219.1:1234`)

## Architecture

### Route Groups
- `app/(auth)/` — 비인증 라우트 (login, register). 다크 네이비 그라디언트 레이아웃.
- `app/(main)/` — 인증 라우트. 레이아웃에서 `auth()` 호출 후 미세션이면 `/login` 리다이렉트. Header + Sidebar(데스크톱) + BottomNav(모바일) 렌더링.
- `app/api/` — API 라우트. `[...nextauth]`(NextAuth), `chat`(AI), `transfers`, `notifications`.

### Auth Flow
`auth.ts`가 NextAuth v5의 `{ handlers, auth, signIn, signOut }`를 export. Credentials provider가 `party_auth` 테이블을 Prisma로 조회. JWT 전략(DB 세션 없음). `middleware.ts`가 `auth()`를 래핑해 비API 라우트 전체를 보호. `session.user.partyId` UUID는 `jwt`/`session` 콜백으로 전파되며 `types/next-auth.d.ts`에 선언됨.

### Database (Prisma 7 — breaking change)
**Prisma 7은 datasource 블록의 `url` 필드를 제거함.** 연결은 어댑터로 설정:

```ts
// lib/prisma.ts
const pool = new Pool({ connectionString: process.env.DATABASE_URL! })
const adapter = new PrismaPg(pool)
new PrismaClient({ adapter })
```

`prisma.config.ts`(`.js` 아님)에서 스키마 경로 지정. `datasource db` 블록에 **`url` 필드 없음**. `DATABASE_URL`은 `lib/prisma.ts`와 마이그레이션에서만 사용.

### Prisma Schema Key Points
- 모든 UUID PK: `@default(dbgenerated("gen_random_uuid()")) @db.Uuid`
- `Transaction`은 `Account`와 두 개의 named relation: `"AccountTxns"`(소유), `"CounterpartyAccountTxns"`(상대 계좌)
- `Product.productTypeCode`는 `CommonCode`의 FK가 아닌 plain `String`
- `Employee.partyId`는 `@unique` (1-1 relation 필수)
- Prisma `Decimal`은 직렬화 전 변환 필요: `balance.toFixed(0)`

### Interbank Transfer (Kafka)
타행 이체는 Kafka 기반 비동기 9-step 흐름. `lib/kafka.ts`에 토픽 상수(`TOPICS`) 및 싱글턴 Producer(`getProducer()`) 정의.

```
FIN-Mate(A) → [TRANSFER_REQUESTS] → Gateway → [ROUTED_REQUESTS] → Simulator(B)
Simulator(B) → [B_RESULTS] → Gateway → [TRANSFER_SETTLEMENTS] → FIN-Mate(A)
```

- `workers/interbank-gateway.ts` — 공동망 라우터 역할
- `workers/settlement-consumer.ts` — A은행(FIN-Mate) 정산 처리
- `workers/inbound-consumer.ts` — 타행→FIN-Mate 입금 처리
- `interbank-simulator/` — B은행 시뮬레이터 (SQLite `data/other-bank.db` 사용)
- 자행 이체는 Kafka 없이 DB 트랜잭션으로 즉시 처리 (`app/(main)/transfer/actions.ts`)
- `lib/interbank-db.ts` — `data/other-bank.db` SQLite 읽기 전용 접근 (타행 계좌 조회용)

### AI Chat (LM Studio)
`app/api/chat/route.ts` — POST 핸들러. `@ai-sdk/openai`의 `createOpenAI`로 LM Studio OpenAI 호환 API 연결.

```ts
createOpenAI({ baseURL: `${OLLAMA_BASE_URL}/v1`, apiKey: 'lm-studio' })
```

`components/chat/ChatInterface.tsx` — `@ai-sdk/react`의 `useChat` 훅. 모델 선택 드롭다운, `.txt`/`.md` 문서 업로드(FileReader), 스트리밍 응답. 업로드된 문서 텍스트를 `retrievedContext`로 매 요청에 포함.

**버전 주의**: `ai@4` + `@ai-sdk/react@0` + `@ai-sdk/openai@0` 조합 사용. v5/v6는 `ollama-ai-provider`와 타입 불일치(`LanguageModelV1 vs V2`)로 사용 불가.

### Styling
Tailwind v4 — **`tailwind.config.ts` 없음**. 커스텀 토큰은 `app/globals.css`의 `@theme`에 정의:
- `kb-yellow` (#FFCC00), `kb-navy` (#1A2B4A) — 주 브랜드 컬러
- `shadow-card`, `shadow-card-hover` — 카드 elevation
- `scrollbar-none` — `@utility`로 정의 (Firefox + WebKit 모두 처리)
- 폰트: Noto Sans KR (`app/layout.tsx`에서 `next/font/google`로 로드)

### Data Fetching Pattern
Server Component에서 `prisma`로 직접 조회 (별도 API 레이어 없음). `auth()`는 모든 Server Component에서 호출 가능 — JWT를 읽으며 요청 내 캐시됨. Prisma `Decimal` 값은 Client Component에 props로 넘기기 전 직렬화 필요.

### lib/
- `formatters.ts` — `formatKRW`, `maskAccountNumber`, `formatAccountNumber`, `formatDate`, `TX_TYPE_LABEL`, `toKSTDateCode`
- `utils.ts` — `cn()` (clsx + tailwind-merge)
- `prisma.ts` — pg 어댑터 기반 싱글턴 Prisma 클라이언트
- `kafka.ts` — KafkaJS 싱글턴 + `TOPICS` 상수 + `getProducer()`
- `notifications.ts` — 알림 생성 유틸
- `interbank-db.ts` — SQLite other-bank.db 읽기 전용 접근

## Seed Data
테스트 계정: **testuser / Test1234!** — Party: 홍길동, 계좌 3개 (입출금/급여/적금), 입출금 계좌에 거래내역 9건.
