# FIN-Mate — Next.js App Router 추천 폴더 구조

```
FIN-Mate/
├── app/
│   ├── (auth)/                        # 인증 관련 라우트 그룹 (헤더 없는 레이아웃)
│   │   ├── login/
│   │   │   └── page.tsx               # 로그인 페이지
│   │   ├── register/
│   │   │   └── page.tsx               # 회원가입
│   │   └── layout.tsx                 # 인증 레이아웃 (센터 정렬, 배경)
│   │
│   ├── (main)/                        # 로그인 후 메인 라우트 그룹
│   │   ├── dashboard/
│   │   │   └── page.tsx               # 대시보드 (계좌 목록, 빠른 송금, 배너)
│   │   ├── accounts/
│   │   │   ├── page.tsx               # 전체 계좌 목록
│   │   │   └── [accountId]/
│   │   │       ├── page.tsx           # 계좌 상세 (거래내역)
│   │   │       └── loading.tsx        # 스켈레톤 UI
│   │   ├── transfer/
│   │   │   ├── page.tsx               # 이체 폼 (단계별 wizard)
│   │   │   └── complete/
│   │   │       └── page.tsx           # 이체 완료 화면
│   │   ├── products/
│   │   │   ├── page.tsx               # 금융 상품 목록
│   │   │   └── [productId]/
│   │   │       └── page.tsx           # 상품 상세
│   │   └── layout.tsx                 # 메인 레이아웃 (Header + Sidebar/BottomNav)
│   │
│   ├── api/
│   │   ├── auth/
│   │   │   └── [...nextauth]/
│   │   │       └── route.ts           # NextAuth 핸들러
│   │   ├── accounts/
│   │   │   ├── route.ts               # GET /api/accounts
│   │   │   └── [accountId]/
│   │   │       ├── route.ts           # GET /api/accounts/:id
│   │   │       └── transactions/
│   │   │           └── route.ts       # GET /api/accounts/:id/transactions
│   │   └── transfer/
│   │       └── route.ts               # POST /api/transfer
│   │
│   ├── layout.tsx                     # 루트 레이아웃 (폰트, Provider 등)
│   ├── page.tsx                       # / → /dashboard 리다이렉트 또는 랜딩
│   ├── error.tsx                      # 글로벌 에러 경계
│   ├── not-found.tsx
│   └── globals.css
│
├── components/
│   ├── ui/                            # 재사용 기본 컴포넌트 (shadcn/ui 권장)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── badge.tsx
│   │   ├── skeleton.tsx
│   │   └── dialog.tsx
│   │
│   ├── layout/
│   │   ├── Header.tsx                 # 상단 헤더 (로고, 알림, 프로필)
│   │   ├── Sidebar.tsx                # PC 사이드 네비게이션
│   │   └── BottomNav.tsx              # 모바일 하단 탭 바
│   │
│   ├── dashboard/
│   │   ├── AccountSummaryCard.tsx     # 계좌 잔액 요약 카드
│   │   ├── QuickActions.tsx           # 빠른 이체/조회 버튼 그룹
│   │   └── ProductBanner.tsx          # 금융 상품 캐러셀 배너
│   │
│   ├── accounts/
│   │   ├── AccountCard.tsx            # 계좌 목록 개별 카드
│   │   ├── TransactionList.tsx        # 거래 내역 리스트
│   │   ├── TransactionItem.tsx        # 거래 내역 행 (입금/출금 색상 분기)
│   │   └── TransactionFilter.tsx      # 기간/유형 필터 UI
│   │
│   └── transfer/
│       ├── TransferWizard.tsx         # 단계별 이체 폼 컨테이너
│       ├── steps/
│       │   ├── Step1Recipient.tsx     # 1단계: 받는 계좌 입력
│       │   ├── Step2Amount.tsx        # 2단계: 금액 입력
│       │   ├── Step3Confirm.tsx       # 3단계: 내용 확인 + 비밀번호
│       │   └── Step4Complete.tsx      # 4단계: 완료
│       └── BankSelector.tsx           # 은행 선택 모달
│
├── hooks/
│   ├── useAccounts.ts                 # 계좌 목록/상세 React Query 훅
│   ├── useTransactions.ts             # 거래내역 + 필터링 훅
│   ├── useTransfer.ts                 # 이체 mutation 훅
│   └── useSession.ts                  # 로그인 세션 유틸 훅
│
├── lib/
│   ├── prisma.ts                      # Prisma Client 싱글톤
│   ├── auth.ts                        # NextAuth 설정 (authOptions)
│   ├── utils.ts                       # cn() 등 공통 유틸
│   └── formatters.ts                  # 금액(1,234,567원), 날짜, 계좌번호 포매터
│
├── types/
│   └── index.ts                       # 공통 타입/인터페이스 (API 응답 등)
│
├── prisma/
│   ├── schema.prisma                  # ← 이미 작성 완료
│   └── seed.ts                        # 개발용 더미 데이터 시딩
│
├── public/
│   └── images/
│       └── kb-logo.svg
│
├── .env.local                         # DATABASE_URL, NEXTAUTH_SECRET 등
├── next.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

## 핵심 파일 초기 내용

### lib/prisma.ts
```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ log: ["query"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

### lib/formatters.ts
```ts
export const formatKRW = (amount: number | string) =>
  Number(amount).toLocaleString("ko-KR") + "원";

export const formatAccountNumber = (num: string) =>
  num.replace(/(\d{3})(\d{2})(\d{6})(\d+)/, "$1-$2-$3-$4");

export const formatDate = (date: string | Date) =>
  new Date(date).toLocaleDateString("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit",
  });
```
