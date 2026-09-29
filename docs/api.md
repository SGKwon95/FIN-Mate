# FIN-Mate API 문서

FIN-Mate의 API 문서입니다.

## 인증

대부분의 API는 NextAuth JWT 세션이 필요합니다. 세션 쿠키가 없으면 `401 Unauthorized`를 반환합니다.

| 권한 수준 | 설명 |
|-----------|------|
| 일반 사용자 | 로그인한 모든 사용자 (`session.user.partyId` 존재) |
| 직원 | `session.user.isEmployee === true` |
| 관리자 | `session.user.isAdmin === true` |

---

## 인증 (Auth)

### `GET/POST /api/auth/[...nextauth]`
NextAuth v5 핸들러. 로그인, 로그아웃, 세션 조회 등 NextAuth 기본 엔드포인트를 처리합니다.

---

## 회원가입

### `POST /api/register`
신규 회원을 등록합니다. (인증 불필요)

**Request Body**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `partyType` | `"INDIVIDUAL" \| "CORPORATE"` | Y | 개인 / 법인 |
| `partyName` | string | Y | 이름 또는 법인명 |
| `loginId` | string | Y | 아이디 (4~20자, 영문·숫자·밑줄) |
| `password` | string | Y | 비밀번호 (8자 이상) |
| `residentNo` | string | 개인 필수 | 주민등록번호 (`YYMMDD-NNNNNNN`) |
| `phone` | string | N | 전화번호 |
| `email` | string | N | 이메일 |
| `businessRegNo` | string | 법인 필수 | 사업자등록번호 (`NNN-NN-NNNNN`) |
| `representativeName` | string | N | 대표자 이름 (법인) |

**Response**
```json
{ "success": true }
```

**Error Codes**
- `400` — 필수 항목 누락 / 형식 오류
- `409` — 이미 사용 중인 아이디

---

## AI 채팅

### `POST /api/chat`
LM Studio 모델을 이용한 스트리밍 LLM 채팅입니다. RAG(Hybrid Search), 상품 컨텍스트, 약관 문서 검색을 지원합니다.

**권한**: 로그인 필요

**Request Body**

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `messages` | `{role, content}[]` | - | 대화 히스토리 |
| `modelId` | string | `"local-model"` | LM Studio 모델 ID |
| `useRag` | boolean | `true` | RAG 활성화 여부 |
| `productId` | string | N | 특정 상품 ID (상품 상세 페이지용) |
| `retrievedContext` | string | N | 수동으로 전달할 컨텍스트 |
| `docNames` | string[] | N | 검색 범위 제한 (문서명 배열) |
| `docCategory` | `"all" \| "banking" \| "product"` | N | 직원 업로드 문서 카테고리 |

**Response**
- `Content-Type: text/plain; charset=utf-8` 스트리밍 응답
- `X-Feedback-Id` 헤더: 피드백 제출용 ID
- `X-Cache` 헤더: `HIT` 또는 `MISS`

**컨텍스트 우선순위**
1. 직원 상품목록 조회 (`isEmployee && "상품목록"` 포함)
2. 단일 상품 (`productId` 지정)
3. 고객 상품 검색 (상품/예금/대출 관련 키워드)
4. 수동 컨텍스트 (`retrievedContext`)
5. RAG 벡터 검색
6. 없음 (일반 금융 상담)

---

### `POST /api/chat/feedback`
채팅 응답에 대한 피드백(좋아요/싫어요)을 제출합니다. RAG 청크 품질 점수에 반영됩니다.

**권한**: 없음 (feedbackId 기반)

**Request Body**
```json
{
  "feedbackId": "uuid",
  "feedback": "up"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `feedbackId` | string | `/api/chat` 응답의 `X-Feedback-Id` |
| `feedback` | `"up" \| "down"` | 피드백 유형 |

**Response**
```json
{ "ok": true }
```

**Error Codes**
- `400` — 잘못된 payload
- `404` — feedbackId 없음
- `409` — 이미 제출된 피드백

---

### `POST /api/chat/suggestions`
현재 대화 맥락 또는 문서를 기반으로 추천 질문 3개를 생성합니다.

**권한**: 로그인 필요

**Request Body**

| 필드 | 타입 | 설명 |
|------|------|------|
| `modelId` | string | LM Studio 모델 ID (필수, 없으면 빈 배열 반환) |
| `messages` | `{role, content}[]` | 대화 히스토리 (있으면 파생 질문 생성) |
| `context` | string | N — 수동 컨텍스트 |
| `docCategory` | `"all" \| "banking" \| "product"` | N — 직원 업로드 문서 카테고리 |

**Response**
```json
{ "questions": ["질문1", "질문2", "질문3"] }
```

---

## 모델

### `GET /api/models`
LM Studio에 현재 로드된 채팅가능한 LLM 모델 목록을 반환합니다.

**권한**: 없음

**Response**
```json
[
  { "id": "qwen2.5-14b-instruct", "label": "qwen2.5-14b-instruct" }
]
```
LM Studio 미연결 시 빈 배열 `[]` 반환.

---

## 알림

### `GET /api/notifications`
로그인한 사용자의 최근 알림 20건을 반환합니다.

**권한**: 로그인 필요

**Response**
```json
[
  {
    "notificationId": "uuid",
    "notificationType": "TRANSFER_COMPLETE",
    "notificationTitle": "이체 완료",
    "notificationBody": "홍길동님에게 50,000원 이체가 완료되었습니다.",
    "isRead": false,
    "linkedEntityId": "uuid",
    "createdAt": "2026-07-15T10:00:00.000Z"
  }
]
```

---

### `PATCH /api/notifications`
로그인한 사용자의 모든 미읽음 알림을 읽음 처리합니다.

**권한**: 로그인 필요

**Response**
```json
{ "ok": true }
```

---

## 이체

### `GET /api/transfers`
이체 거래내역(TRANSFER_IN / TRANSFER_OUT)을 페이지 별로 조회합니다.

**권한**: 로그인 필요

**Query Parameters**

| 파라미터 | 타입 | 기본값 | 설명 |
|----------|------|--------|------|
| `accountId` | string | N | 특정 계좌 ID (미지정 시 본인 전체 계좌) |
| `from` | string | N | 시작일 `YYYY-MM-DD` |
| `to` | string | N | 종료일 `YYYY-MM-DD` |
| `page` | number | `1` | 페이지 번호 |
| `limit` | number | `20` | 페이지 크기 (최대 100) |

**Response**
```json
{
  "data": [
    {
      "transactionId": "uuid",
      "accountId": "uuid",
      "accountNumber": "004-1234-5678901",
      "accountPurpose": "DEMAND",
      "transactionType": "TRANSFER_OUT",
      "amount": "50000",
      "balanceBefore": "1000000",
      "balanceAfter": "950000",
      "transactionStatus": "COMPLETED",
      "channel": "MOBILE",
      "counterpartAccountNumber": "302-0000000001",
      "counterpartName": "홍길동",
      "memo": "점심값",
      "remark": null,
      "transactionDate": "20260715",
      "transactedAt": "2026-07-15T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

**Error Codes**
- `403` — 타인 계좌 조회 시도

---

### `POST /api/transfers`
이체를 실행합니다. 자행은 즉시 처리, 타행은 Kafka를 통한 비동기 처리(`PENDING` 상태 반환).

**권한**: 로그인 필요

**Request Body**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `fromAccountId` | string | Y | 출금 계좌 ID |
| `toAccountNumber` | string | Y | 수신 계좌번호 |
| `toName` | string | Y | 수신자 이름 |
| `bankCode` | string | N | 수신 은행 코드 (미지정 시 자행 `"004"`) |
| `amount` | number | Y | 이체 금액 (원) |
| `memo` | string | N | 메모 |
| `idempotencyKey` | string | Y | 중복 방지 키 |

**Response**
```json
{ "ok": true, "transactionId": "uuid", "status": "COMPLETED" }
```
타행 이체는 `"status": "PENDING"`.

---

### `POST /api/transfers/inbound`
타행에서 FIN-Mate 계좌로 입금하는 인바운드 이체를 Kafka 큐에 발행합니다.

**권한**: `X-Gateway-Token` 헤더 (환경변수 `GATEWAY_SECRET` 설정 시)

**Request Body**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `transactionNo` | string | Y | 공동망 거래 번호 |
| `fromBankCode` | string | Y | 송신 은행 코드 |
| `fromAccountNumber` | string | Y | 송신 계좌번호 |
| `fromPartyName` | string | Y | 송신자 이름 |
| `toBankCode` | string | Y | 수신 은행 코드 |
| `toAccountNumber` | string | Y | 수신 계좌번호 |
| `toAccountName` | string | Y | 수신자 이름 |
| `amount` | number | Y | 금액 (양수) |
| `memo` | string | N | 메모 |
| `requestedAt` | string | N | 요청 시각 ISO 8601 |

**Response** `202 Accepted`
```json
{ "transactionId": "uuid", "status": "QUEUED" }
```

---

## 상품

### `GET /api/products/[productId]/terms`
판매 중인 특정 상품의 현재 유효한 약관 목록을 반환합니다.

**권한**: 없음

**Path Parameters**
- `productId` — 상품 UUID

**Response**
```json
{
  "terms": [
    {
      "termsId": "uuid",
      "termsType": "STANDARD",
      "version": "1.0",
      "effectiveDate": "20250101",
      "contentUrl": "https://..."
    }
  ]
}
```

**Error Codes**
- `404` — 상품 없음 또는 판매 중지

---

## 대출 신청

### `POST /api/loan-applications`
대출 신청서를 제출합니다.

**권한**: 로그인 필요

**Request Body**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `productId` | string | Y | 대출 상품 ID |
| `requestedAmount` | number | Y | 신청 금액 |
| `requestedPeriodMonths` | number | Y | 신청 기간 (개월) |
| `loanPurpose` | string | N | 대출 목적 |
| `mlCreditScore` | number | N | 신용점수 (ML 입력) |
| `mlHomeOwnership` | string | N | 주거 유형 (ML 입력) |
| `mlDti` | number | N | DTI (ML 입력) |
| `mlInqLast6Mths` | number | N | 최근 6개월 신용조회 수 (ML 입력) |
| `mlPubRec` | number | N | 공공기록 건수 (ML 입력) |

**Response** `201 Created`
```json
{ "applicationId": "uuid" }
```

---

### `POST /api/loan-applications/[id]/screen`
ML 모델을 이용해 대출 신청을 심사합니다. 점수 기반으로 자동 승인/거절/검토 대기를 결정합니다.

**권한**: 로그인 필요 (본인 신청건 또는 직원은 전체)

**점수 기준**
| 점수 | 결과 |
|------|------|
| 800 이상 | 자동 승인 (`APPROVED`) |
| 300~799 | 직원 검토 대기 (`PENDING_REVIEW`) |
| 300 미만 | 자동 거절 (`REJECTED`) |

**Response**
```json
{
  "applicationId": "uuid",
  "mlScore": 720,
  "mlDecision": "PENDING_REVIEW",
  "mlDefaultProb": 0.123,
  "mlScreenedAt": "2026-07-15T10:00:00.000Z",
  "applicationStatus": "PENDING_REVIEW"
}
```

**Error Codes**
- `404` — 신청건 없음 또는 권한 없음
- `500` — ML 추론 실패

---

### `POST /api/loan-applications/[id]/decide`
직원이 `PENDING_REVIEW` 상태인 대출 신청건의 최종 결정을 내립니다.

**권한**: 직원 전용

**Request Body**
```json
{ "decision": "APPROVED" }
```
`decision`: `"APPROVED"` 또는 `"REJECTED"`

**Response**
```json
{
  "applicationId": "uuid",
  "applicationStatus": "APPROVED",
  "decidedAt": "2026-07-15T10:00:00.000Z"
}
```

**Error Codes**
- `400` — 잘못된 decision 값
- `404` — 신청건 없음
- `409` — PENDING_REVIEW 상태가 아님

---

## 직원 문서 관리

### `GET /api/employee/documents`
업로드된 직원 문서 목록을 반환합니다.

**권한**: 직원 전용

**Query Parameters**
- `category` — `"banking"` 또는 `"product"` (미지정 시 전체)

**Response**
```json
[
  {
    "documentId": "uuid",
    "originalName": "KB_정기예금_약관.pdf",
    "storedName": "emp-product-1720000000000",
    "documentType": "product",
    "uploadedAt": "2026-07-15T10:00:00.000Z"
  }
]
```

---

### `POST /api/employee/documents`
문서를 업로드하고 RAG 청크를 생성합니다. MinIO에 원본 파일을 저장합니다.

**권한**: 직원 전용

**Request**: `multipart/form-data`

| 필드 | 타입 | 설명 |
|------|------|------|
| `file` | File | 업로드할 파일 (`.txt`, `.md`, `.html`, `.htm`, `.pdf`) |
| `category` | string | `"banking"` 또는 `"product"` |

**Response**
```json
{
  "ok": true,
  "document": {
    "documentId": "uuid",
    "originalName": "약관.pdf",
    "storedName": "emp-product-1720000000000",
    "documentType": "product",
    "uploadedAt": "2026-07-15T10:00:00.000Z"
  }
}
```

---

### `GET /api/employee/documents/[documentId]`
특정 문서의 전체 텍스트 내용(RAG 청크 조합)과 MinIO 다운로드 URL을 반환합니다.

**권한**: 직원 전용

**Response**
```json
{
  "originalName": "약관.pdf",
  "content": "제1조 (목적) ...",
  "downloadUrl": "https://minio.../presigned-url"
}
```

---

### `DELETE /api/employee/documents/[documentId]`
문서와 관련 RAG 청크를 삭제합니다. MinIO 원본 파일도 삭제합니다.

**권한**: 관리자 전용

**Response**
```json
{ "ok": true }
```

---

## 관리자 — AI 모니터링

### `GET /api/admin/ai/cache`
RAG 캐시 목록을 히트 수 내림차순으로 반환합니다.

**권한**: 직원 전용

**Response**
```json
[
  {
    "cacheId": "uuid",
    "question": "중도해지 이율은 어떻게 되나요",
    "docScope": "banking",
    "hitCount": 12,
    "createdAt": "2026-07-01T00:00:00.000Z",
    "lastHitAt": "2026-07-15T09:00:00.000Z"
  }
]
```

---

### `DELETE /api/admin/ai/cache`
전체 RAG 캐시를 삭제합니다.

**권한**: 관리자 전용

**Response**
```json
{ "ok": true, "deleted": 42 }
```

---

### `DELETE /api/admin/ai/cache/[cacheId]`
특정 RAG 캐시 항목을 삭제합니다.

**권한**: 관리자 전용

**Response**
```json
{ "ok": true }
```

**Error Codes**
- `404` — 캐시 항목 없음

---

### `GET /api/admin/ai/feedback`
최근 채팅 피드백 50건을 반환합니다.

**권한**: 직원 전용

**Response**
```json
[
  {
    "feedbackId": "uuid",
    "feedback": "up",
    "question": "중도해지 이율이 얼마예요?",
    "createdAt": "2026-07-15T10:00:00.000Z"
  }
]
```

---

### `GET /api/admin/ai/stats?type=quality`
업로드 문서별 RAG 청크 수와 평균 품질 점수를 반환합니다.

**권한**: 직원 전용

**Query Parameters**
- `type=quality` (필수)

**Response**
```json
[
  {
    "documentId": "uuid",
    "originalName": "약관.pdf",
    "storedName": "emp-product-1720000000000",
    "documentType": "product",
    "uploadedAt": "2026-07-15T10:00:00.000Z",
    "chunkCount": 48,
    "avgQuality": 0.512
  }
]
```

---

### `GET /api/admin/ai/traces`
Arize Phoenix에서 최근 채팅 트레이스 30건을 가져옵니다. RAG 평가 점수(context_relevance, faithfulness, answer_relevance)를 포함합니다.

**권한**: 관리자 전용

**Response**
```json
[
  {
    "spanId": "abc123",
    "traceId": "xyz789",
    "question": "중도해지 이율은?",
    "answer": "중도해지 시...",
    "startTime": "2026-07-15T10:00:00.000Z",
    "totalMs": 3240,
    "llmMs": 2800,
    "dbMs": 120,
    "status": "OK",
    "chunks": [...],
    "prompt": [...],
    "evals": {
      "context_relevance": 0.85,
      "faithfulness": 0.92,
      "answer_relevance": 0.78
    }
  }
]
```

**Error Codes**
- `503` — Phoenix 연결 실패

---