# FIN-Mate — SG Star Banking 모바일 뱅킹 클론

Next.js 15 App Router 기반의 SG Star Banking 스타일 금융 서비스 웹앱입니다.

## 일정표 및 RAW 데이터

[링크](https://docs.google.com/spreadsheets/d/1tIi7CB2FVE8Y2MPfnZwHhe5HgwiIH48ggV7e40yNLUU/edit?usp=sharing)

## 기술 스택

| 영역       | 기술                           |
| ---------- | ------------------------------ |
| 프레임워크 | Next.js 15 (App Router)        |
| 언어       | TypeScript                     |
| 스타일     | Tailwind CSS v4                |
| ORM        | Prisma 7 + PostgreSQL          |
| 인증       | NextAuth v5 (JWT, Credentials) |
| 아이콘     | Lucide React                   |
| 폰트       | Noto Sans KR                   |

## 시작하기

### 사전 요구사항

- Node.js 20+
- PostgreSQL (로컬)
- Docker (컨테이너 실행 시)

### 환경 설정

```bash
cp .env.local.example .env.local
```

`.env.local`에 다음 값을 설정합니다.

```
DATABASE_URL=postgresql://user:password@localhost:5432/finmate
AUTH_SECRET=<32자 이상의 랜덤 문자열>
```

### 설치 및 실행

```bash
npm install

# DB 마이그레이션
npx prisma migrate dev

# 시드 데이터 삽입
npm run db:seed

# 개발 서버 시작
npm run dev
```

`http://localhost:3000` 접속 후 아래 테스트 계정으로 로그인합니다.

| 항목     | 값          |
| -------- | ----------- |
| 아이디   | `testuser`  |
| 비밀번호 | `Test1234!` |

## 주요 기능

### 구현 완료

- **로그인** — Credentials 기반 인증, JWT 세션 유지
- **대시보드** — 총 자산 현황, 계좌 요약, 빠른 이체, 금융상품 배너
- **계좌 목록** — 전체 계좌 잔액 합산, 카드형 계좌 목록
- **계좌 상세** — 잔액 조회, 기간/유형별 거래내역 필터링 (URL 기반)
- **이체** — 단계별 wizard (받는 계좌 → 금액 → 확인 → 완료), 멱등성 보장
- **이체 내역 API** — `GET /api/transfers` (계좌·날짜 필터, 페이지네이션)

### 예정

- **금융상품** — 상품 목록 및 상세

## 프로젝트 구조

```
app/
├── (auth)/login/          # 로그인 페이지
├── (main)/
│   ├── dashboard/         # 홈 대시보드
│   └── accounts/
│       ├── page.tsx       # 계좌 목록
│       └── [accountId]/   # 계좌 상세 + 거래내역
└── api/auth/              # NextAuth 핸들러

components/
├── layout/                # Header, Sidebar, BottomNav
├── dashboard/             # AccountSummaryCard, QuickActions, ProductBanner
└── accounts/              # AccountCard, TransactionList, TransactionFilter, TransactionItem
```

## Docker 실행

### 빌드

```bash
docker build -t fin-mate .
```

### 실행

```bash
# 기본 실행
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:password@host:5432/finmate" \
  -e AUTH_SECRET="<32자 이상의 랜덤 문자열>" \
  fin-mate

# 첫 배포 — DB 시드 포함 (기존 데이터 초기화 주의)
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:password@host:5432/finmate" \
  -e AUTH_SECRET="<32자 이상의 랜덤 문자열>" \
  -e SEED_DB=true \
  fin-mate
```

컨테이너 시작 시 `prisma migrate deploy`가 자동으로 실행됩니다.  
`SEED_DB=true` 설정 시 시드 데이터도 함께 삽입됩니다 (기존 데이터 전체 초기화).

## 개발 명령어

```bash
npm run dev                              # 개발 서버 (localhost:3000)
npm run build                            # 프로덕션 빌드
npm run lint                             # ESLint
npx tsc --noEmit                         # 타입 체크
npx prisma migrate dev --name <name>     # 마이그레이션 생성 및 적용
npx prisma generate                      # Prisma 클라이언트 재생성
npm run db:seed                          # 시드 데이터 삽입
```

## 브랜드 컬러

| 이름        | 값        |
| ----------- | --------- |
| `kb-yellow` | `#FFCC00` |
| `kb-navy`   | `#1A2B4A` |
