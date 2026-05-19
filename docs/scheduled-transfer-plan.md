# 자동이체(Scheduled Transfer) 구현 계획 — Cron 방식

## Context

사용자가 지정한 주기(매일/매주/매월)로 자동으로 이체를 실행하는 기능.  
기존 이체 로직(`app/(main)/transfer/actions.ts`)의 Prisma 트랜잭션·멱등성 패턴을 `lib/transfer.ts`로 추출해 재사용.  
Vercel Cron이 매일 오전 9시에 `/api/cron/scheduled-transfers`를 호출 → 만기 항목 일괄 실행.  
Docker/자체 호스팅 환경에서는 시스템 cron 또는 외부 서비스(cron-job.org)로 동일 엔드포인트 호출.

---

## 구현 파일 목록

### 수정
| 파일 | 내용 |
|------|------|
| `prisma/schema.prisma` | `ScheduledTransfer` 모델 추가, `Party`·`Account`에 역관계 추가 |
| `app/(main)/transfer/actions.ts` | 이체 핵심 로직을 `lib/transfer.ts`로 위임하도록 리팩터 |
| `lib/formatters.ts` | `ST_FREQ_LABEL`, `ST_STATUS_LABEL` 상수 추가 |
| `components/layout/Sidebar.tsx` | 자동이체 nav 항목 추가 |
| `components/layout/BottomNav.tsx` | 자동이체 nav 항목 추가 |

### 신규
| 파일 | 역할 |
|------|------|
| `lib/transfer.ts` | `executeTransfer()` 순수 함수 (Prisma 트랜잭션 + 멱등성) |
| `vercel.json` | Vercel Cron 스케줄 설정 |
| `app/api/cron/scheduled-transfers/route.ts` | GET — Cron 호출 시 만기 항목 일괄 실행 |
| `app/api/scheduled-transfers/route.ts` | GET(목록) + POST(등록) |
| `app/api/scheduled-transfers/[id]/route.ts` | PATCH(일시정지/재개) + DELETE(해지) |
| `app/(main)/scheduled-transfers/page.tsx` | Server Component — 목록 |
| `app/(main)/scheduled-transfers/new/page.tsx` | Server Component — 등록 shell (내 계좌 목록 fetch) |
| `app/(main)/scheduled-transfers/new/NewScheduledTransferForm.tsx` | Client Component — 등록 폼 |

---

## Step 1 — Prisma 스키마

`prisma/schema.prisma` 끝에 추가:

```prisma
model ScheduledTransfer {
  scheduledTransferId String    @id @default(dbgenerated("gen_random_uuid()")) @map("scheduled_transfer_id") @db.Uuid
  partyId             String    @map("party_id") @db.Uuid
  fromAccountId       String    @map("from_account_id") @db.Uuid
  toAccountNumber     String    @map("to_account_number") @db.VarChar(30)
  toName              String    @map("to_name") @db.VarChar(100)
  amount              Decimal   @map("amount") @db.Decimal(15, 2)
  frequency           String    @map("frequency") @db.VarChar(20)   // DAILY | WEEKLY | MONTHLY
  nextExecutionAt     DateTime  @map("next_execution_at") @db.Timestamptz()
  endDate             DateTime? @map("end_date") @db.Date
  status              String    @default("ACTIVE") @map("status") @db.VarChar(20) // ACTIVE | PAUSED | CANCELLED
  memo                String?   @map("memo") @db.VarChar(200)
  lastExecutedAt      DateTime? @map("last_executed_at") @db.Timestamptz()
  lastFailedAt        DateTime? @map("last_failed_at") @db.Timestamptz()
  lastFailReason      String?   @map("last_fail_reason") @db.VarChar(500)
  createdAt           DateTime  @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt           DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz()

  party       Party   @relation(fields: [partyId],       references: [partyId])
  fromAccount Account @relation(fields: [fromAccountId], references: [accountId])

  @@index([partyId],                    map: "idx_scheduled_transfer_party")
  @@index([nextExecutionAt, status],    map: "idx_scheduled_transfer_exec")
  @@map("scheduled_transfer")
}
```

`Party` 모델에 `scheduledTransfers ScheduledTransfer[]` 추가.  
`Account` 모델에 `scheduledTransfers ScheduledTransfer[]` 추가.

이후: `npx prisma db push` → `npx prisma generate`

---

## Step 2 — `lib/transfer.ts` (이체 핵심 로직 추출)

기존 `actions.ts`의 Prisma 트랜잭션 블록을 순수 함수로 분리:

```typescript
export interface TransferInput {
  fromAccountId: string
  toAccountNumber: string
  amount: number
  memo?: string
  channel?: string        // 기본값 "MOBILE"
  idempotencyKey: string
}

export async function executeTransfer(input: TransferInput): Promise<{ ok: boolean; error?: string; transactionId?: string }>
```

구현 순서:
1. `transactionKey` 중복 체크 → 있으면 즉시 `{ ok: true }` 반환 (멱등성)
2. 출금계좌 조회 (소유권 파라미터는 제거 — cron에서 소유권 불필요)
3. 계좌 상태·잔액 검증
4. `prisma.$transaction()`:
   - 출금계좌 `balance -= amount`, `lastTransactionAt` 갱신
   - TRANSFER_OUT 거래 생성 (`transactionKey = idempotencyKey`, `channel` 파라미터 사용)
   - 수취 계좌가 내부 계좌이면 TRANSFER_IN도 동시 생성 (잔액 += amount)
5. 에러 시 `{ ok: false, error: message }` 반환 (throw 금지 — cron에서 개별 실패 무시)

기존 `actions.ts`는 이 함수를 호출하는 얇은 래퍼로 유지.

---

## Step 3 — `vercel.json` (Vercel Cron 설정)

```json
{
  "crons": [
    {
      "path": "/api/cron/scheduled-transfers",
      "schedule": "0 0 * * *"
    }
  ]
}
```

> UTC 00:00 = KST 09:00. Vercel이 자동으로 `Authorization: Bearer $CRON_SECRET` 헤더를 주입.  
> Docker/자체 호스팅: `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/scheduled-transfers`를 시스템 cron에 등록.

---

## Step 4 — `app/api/cron/scheduled-transfers/route.ts`

```
GET 요청 처리 순서:

1. Authorization 헤더 검증
   - req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}` → 401
   - (개발 환경: CRON_SECRET 없으면 localhost 요청만 허용)

2. 만기 항목 조회
   prisma.scheduledTransfer.findMany({
     where: { status: "ACTIVE", nextExecutionAt: { lte: new Date() } },
     include: { fromAccount: true }
   })

3. endDate 초과 항목 → status = "CANCELLED", 건너뜀

4. 각 항목에 대해 executeTransfer() 호출
   - idempotencyKey = `SCHED-${scheduledTransferId}-${YYYYMMDD}`
   - channel = "SCHEDULED"

5. 실행 결과에 따라 업데이트
   - 성공: lastExecutedAt = now(), nextExecutionAt = 다음 주기 계산, lastFailReason = null
   - 실패: lastFailedAt = now(), lastFailReason = error.message
     → nextExecutionAt은 다음 주기로 진행 (무한 재시도 방지)

6. 결과 JSON 반환 { processed, succeeded, failed }
```

**다음 실행일 계산 함수**:
```typescript
function calcNextExecution(current: Date, frequency: string): Date {
  const d = new Date(current)
  if (frequency === "DAILY")   d.setDate(d.getDate() + 1)
  if (frequency === "WEEKLY")  d.setDate(d.getDate() + 7)
  if (frequency === "MONTHLY") d.setMonth(d.getMonth() + 1)
  return d
}
```

---

## Step 5 — CRUD API Routes

### `GET /api/scheduled-transfers`
`auth()` → `partyId`로 목록 조회, 최신순 정렬

### `POST /api/scheduled-transfers`
```
검증:
- amount > 0
- frequency ∈ [DAILY, WEEKLY, MONTHLY]
- startDate >= 오늘
- fromAccount 소유권 확인 (partyId 일치)

생성:
- nextExecutionAt = startDate (사용자가 입력한 첫 실행일)
- status = "ACTIVE"
```

### `PATCH /api/scheduled-transfers/[id]`
- `status` 변경만 허용 (ACTIVE ↔ PAUSED, CANCELLED)
- 소유권 확인 필수

### `DELETE /api/scheduled-transfers/[id]`
- soft delete: `status = "CANCELLED"` (거래 내역 보존)

---

## Step 6 — UI Pages

**목록 페이지** (`scheduled-transfers/page.tsx`): Server Component
- ACTIVE/PAUSED 항목: 카드 형태, 다음 실행일 · 주기 · 금액 표시
- CANCELLED 항목: 하단에 회색으로 분리
- 상단에 "새 자동이체 등록" 버튼

**등록 페이지** (`scheduled-transfers/new/`):
- Server Component: 내 ACTIVE 계좌 목록 fetch → Client 폼에 props
- Client 폼 필드:
  - 출금계좌 (내 계좌 드롭다운)
  - 수취 계좌번호 (입력)
  - 받는 분 (입력)
  - 금액
  - 주기 (매일/매주/매월 라디오)
  - 첫 실행일 (date input)
  - 종료일 (선택, date input)
  - 메모 (선택)
- `fetch POST /api/scheduled-transfers` → 성공 시 `/scheduled-transfers`로 이동

---

## Step 7 — 네비게이션 연결

`Sidebar.tsx` / `BottomNav.tsx`의 `NAV_ITEMS`에 추가:
```typescript
{ href: "/scheduled-transfers", icon: CalendarClock, label: "자동이체" }
```

`lib/formatters.ts`에 추가:
```typescript
export const ST_FREQ_LABEL: Record<string, string> = {
  DAILY: "매일", WEEKLY: "매주", MONTHLY: "매월",
}
export const ST_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "실행중", PAUSED: "일시정지", CANCELLED: "해지됨",
}
```

---

## 핵심 설계 결정

| 주제 | 결정 |
|------|------|
| 이체 로직 | `lib/transfer.ts`로 추출, cron + 기존 이체 UI 공유 |
| 멱등성 키 | `SCHED-{scheduledTransferId}-{YYYYMMDD}` — 날짜 단위 중복 방지 |
| 실패 처리 | 실패해도 nextExecutionAt 진행 (무한 재시도 방지), 실패 사유 기록 |
| Soft delete | status = CANCELLED (거래 내역 연계 보존) |
| Cron 트리거 | Vercel: vercel.json / Docker: 시스템 cron → curl |
| 소유권 검증 | 등록·수정·해지 API에서만 partyId 확인, cron 실행 경로는 생략 |
| Client fetch | Server Action 금지 (화면 잠김 방지) — 기존 프로젝트 규칙 준수 |

---

## 검증 방법

1. `npx tsc --noEmit` — 타입 에러 없음
2. 자동이체 등록 → DB `SELECT * FROM scheduled_transfer` 확인
3. `nextExecutionAt`을 과거로 직접 UPDATE 후 cron 엔드포인트 수동 호출:
   ```
   curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/scheduled-transfers
   ```
4. 출금계좌 잔액 감소 + `transaction` 테이블에 `channel = 'SCHEDULED'` 레코드 확인
5. 동일 날짜 재호출 → 멱등성 키 충돌로 중복 이체 없음 확인
6. 잔액 부족 케이스 → `lastFailReason` 기록, `nextExecutionAt` 다음 주기로 진행 확인
