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

**Environment**: Copy `.env.local` and set `DATABASE_URL` (local PostgreSQL) and `AUTH_SECRET` (≥32 chars).

## Architecture

### Route Groups
- `app/(auth)/` — unauthenticated routes (login). Layout has dark navy gradient.
- `app/(main)/` — authenticated routes. Layout calls `auth()` and redirects if no session, then renders Header + Sidebar (desktop) + BottomNav (mobile) around children.
- `app/api/` — API routes (NextAuth handler at `[...nextauth]`).

### Auth Flow
`auth.ts` exports `{ handlers, auth, signIn, signOut }` from NextAuth v5 with a Credentials provider that checks the `party_auth` table via Prisma. JWT strategy — no DB sessions. `middleware.ts` wraps `auth()` to protect all non-API routes. The `session.user.partyId` UUID is propagated via `jwt`/`session` callbacks and declared in `types/next-auth.d.ts`.

### Database (Prisma 7 — breaking change)
**Prisma 7 drops `url` from the datasource block.** Connection is established via adapter:

```ts
// lib/prisma.ts
const pool = new Pool({ connectionString: process.env.DATABASE_URL! })
const adapter = new PrismaPg(pool)
new PrismaClient({ adapter })
```

`prisma.config.ts` (not `prisma.config.js`) points to the schema path. The `datasource db` block has **no `url` field**. `DATABASE_URL` is only used in `lib/prisma.ts` and for migrations (if configured separately).

### Prisma Schema Key Points
- All UUID PKs use `@default(dbgenerated("gen_random_uuid()")) @db.Uuid`
- `Transaction` has two named relations to `Account`: `"AccountTxns"` (owner) and `"CounterpartyAccountTxns"` (counterpart account)
- `productTypeCode` on `Product` is a plain `String`, not a FK to `CommonCode`
- `Employee.partyId` has `@unique` (required for 1-1 relation)
- Prisma `Decimal` fields must be converted before serialization: `balance.toFixed(0)`

### Styling
Tailwind v4 — **no `tailwind.config.ts`**. All custom tokens are in `app/globals.css` under `@theme`:
- `kb-yellow` (#FFCC00), `kb-navy` (#1A2B4A) are the primary brand colors
- `shadow-card`, `shadow-card-hover` for card elevation
- Font: Noto Sans KR (loaded via `next/font/google` in `app/layout.tsx`)

### Data Fetching Pattern
Server Components fetch directly via `prisma` (no API layer). `auth()` from `@/auth` can be called in any Server Component — it reads the JWT and is cached within the request. Prisma `Decimal` values must be serialized (`.toFixed(0)`) before being passed as props to Client Components.

### lib/
- `formatters.ts` — `formatKRW`, `maskAccountNumber`, `formatAccountNumber`, `formatDate`, `TX_TYPE_LABEL`
- `utils.ts` — `cn()` (clsx + tailwind-merge)
- `prisma.ts` — singleton Prisma client with pg adapter

## Seed Data
Test credentials: **testuser / Test1234!** — Party: 홍길동, 3 accounts (입출금/급여/적금), 9 transactions on the checking account.
