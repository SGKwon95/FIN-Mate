# 로컬 LLM(LM Studio) 장애 시 Claude API 폴백

## Context

현재 `app/api/chat/route.ts`는 채팅 응답을 생성할 때 항상 로컬 LM Studio(`OLLAMA_BASE_URL`)를 호출하며, 이 호출 주변에는 **에러 처리가 전혀 없다**. LM Studio 프로세스가 꺼져 있거나 응답하지 않으면 사용자는 그냥 오류를 마주하게 된다. 로컬 개발/시연 환경에서 LM Studio가 항상 떠 있다고 보장할 수 없으므로, LM Studio에 연결할 수 없을 때는 자동으로 Anthropic Claude API를 폴백으로 사용해 서비스 연속성을 확보한다.

사용자와 합의된 범위:
- **대상**: `app/api/chat/route.ts`의 메인 채팅 응답 경로만. `suggestions`, `query-rewrite`, `rag-eval` judge는 이미 자체 try/catch로 우아하게 실패하므로 건드리지 않는다.
- **감지 방식**: 사전 헬스체크(짧은 타임아웃으로 LM Studio에 요청을 보내 생존 확인) 후 분기. 스트리밍 도중 끊기는 경우의 폴백은 범위 밖(기존에도 동일하게 허용된 한계).
- **폴백 모델**: `claude-haiku-4-5-20251001` (환경변수로 설정 가능, 기본값).
- **UX**: 폴백 여부를 프런트엔드에 노출하지 않음 — 완전히 투명하게 처리. 서버 로그(`lib/logger.ts`)에만 기록.

## 패키지 선택 (검증 완료)

`ai@4.3.19` + `@ai-sdk/openai@0.0.72` 조합에 맞춰 **`@ai-sdk/anthropic@0.0.56`**(exact pin)을 설치한다.

- `@ai-sdk/anthropic@0.0.56`의 의존성(`@ai-sdk/provider@0.0.26`, `@ai-sdk/provider-utils@1.0.22`)이 이미 설치된 `@ai-sdk/openai@0.0.72`와 **완전히 동일** — 충돌/중복 설치 없음.
- `0.0.56`은 이 세대(`LanguageModelV1`)의 **마지막 릴리스**이며(`0.0.57`은 npm에 존재하지 않음), `ai@5/6`용 `LanguageModelV2/V3` 릴리스와 섞이지 않는다.
- `createAnthropic({ apiKey })` → `anthropicProvider(modelId)`는 기존 `createOpenAI({ baseURL, apiKey })` → `lmstudio(modelId)`와 구조적으로 동일하므로, **같은 `streamText()` 호출에 provider만 바꿔 끼우면 된다.** 별도의 메시지 포맷 변환이나 수동 스트림 래핑이 필요 없다 — `systemPrompt`(string), `[...fewShotMessages, ...cleanedMessages]`(`{role, content:string}[]`), `result.toTextStreamResponse()` 모두 그대로 재사용.
- `@anthropic-ai/sdk`를 직접 붙이는 방식(수동 `ReadableStream` 래핑)은 불필요하므로 채택하지 않음.

## 구현

### 1. `lib/lmstudio-health.ts` (신규)
`app/api/models/route.ts`의 헬스체크 패턴(`GET ${OLLAMA_BASE_URL}/v1/models`, `Authorization: Bearer lm-studio`)을 재사용하되, 그 라우트에는 없는 `AbortController` 기반 타임아웃(기본 1.5초)을 추가한다.

```ts
export async function isLmStudioReachable(timeoutMs = 1500): Promise<boolean> {
  const baseURL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:1234'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${baseURL}/v1/models`, {
      headers: { Authorization: 'Bearer lm-studio' },
      signal: controller.signal,
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
```

### 2. `package.json`
`dependencies`에 `"@ai-sdk/anthropic": "0.0.56"` 추가 후 install (lockfile만 변경, 다른 패키지 버전 변동 없음).

### 3. `app/api/chat/route.ts` 수정

- 상단에 `import { createAnthropic } from '@ai-sdk/anthropic'`와 `import { isLmStudioReachable } from '@/lib/lmstudio-health'` 추가.
- `cleanedMessages` 구성 직후(RAG 파이프라인 시작 전, ~line 282)에 헬스체크를 **먼저 발사만** 해둔다:
  ```ts
  const lmStudioHealthPromise = isLmStudioReachable()
  ```
  이렇게 하면 이미 시간이 걸리는 RAG 조회(임베딩/DB)와 병렬로 실행되어, 정상 경로(LM Studio 정상)에서는 체감 지연이 거의 0에 가깝다.
- 기존 `chat_request` 로그(line 467) 직전에 결과를 `await`하고 로그를 보강:
  ```ts
  const lmStudioUp = await lmStudioHealthPromise
  const effectiveModelId = lmStudioUp ? (modelId ?? 'local-model') : anthropicFallbackModel

  logger.info({
    event: 'chat_request',
    modelId: effectiveModelId,
    provider: lmStudioUp ? 'lmstudio' : 'anthropic_fallback',
    contextSource, ragChunkCount, contextSize, messageCount,
  }, 'chat request')
  if (!lmStudioUp) {
    logger.warn({ event: 'lmstudio_unreachable' }, 'LM Studio 응답 없음 — Anthropic 폴백으로 전환')
  }
  ```
- 기존 `lmstudio` provider 생성(line 476-479) 옆에 Anthropic provider도 무조건 구성(네트워크 호출 없으므로 비용 없음):
  ```ts
  const anthropicFallbackModel = process.env.ANTHROPIC_FALLBACK_MODEL ?? 'claude-haiku-4-5-20251001'
  const anthropicProvider = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  ```
- `streamText` 호출 직전(line 680)에 "둘 다 사용 불가" 가드 추가:
  ```ts
  if (!lmStudioUp && !process.env.ANTHROPIC_API_KEY) {
    logger.error({ event: 'no_llm_available' }, 'LM Studio 및 Anthropic 폴백 모두 사용 불가')
    return new Response('AI 서비스에 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해주세요.', { status: 503 })
  }
  ```
  이 503은 `useChat`의 `error` 상태를 정상적으로 채워 기존 "오류가 발생했습니다: ..." 배너로 자연스럽게 표시된다(코드 확인 완료 — `@ai-sdk/ui-utils`는 text 프로토콜에서 `!response.ok` 시 body 텍스트로 Error를 throw).
- `streamText` 호출(line 680-686)의 `model`을 분기하고, 폴백 경로에서만 `onError` 로깅 추가:
  ```ts
  const result = streamText({
    model: lmStudioUp ? lmstudio(modelId || 'local-model') : anthropicProvider(anthropicFallbackModel),
    system: systemPrompt,
    messages: [...fewShotMessages, ...cleanedMessages],
    temperature: 0.05,
    experimental_telemetry: { isEnabled: true, functionId: 'fin-mate-chat' },
    onError: lmStudioUp ? undefined : ({ error }) => {
      logger.error({ event: 'anthropic_fallback_stream_error', err: String(error) }, 'Anthropic 폴백 스트리밍 실패')
    },
  })
  ```
  이후 코드(688-763, 캐시 저장/RAG 평가/`toTextStreamResponse()`/헤더)는 **수정 불필요** — 두 provider 모두 동일한 경로를 탄다.
- Phoenix 트레이싱 속성(line 602) `'llm.model_name': modelId ?? 'local-model'`를 `effectiveModelId`로 교체해, 폴백으로 처리된 요청이 트레이스에서 LM Studio로 오표기되지 않게 한다.

### 4. `.env` (커밋되지 않음, 로컬 테스트용)
```
ANTHROPIC_API_KEY=
ANTHROPIC_FALLBACK_MODEL=claude-haiku-4-5-20251001
```

### 5. `CLAUDE.md`
기존 "버전 주의"(line 88) 옆에 `@ai-sdk/anthropic@0.0.56`이 `@ai-sdk/provider@0.0.26`/`provider-utils@1.0.22` 세대에 맞춰 의도적으로 고정되었다는 점을 짧게 덧붙여, 이후 누군가 무심코 latest로 올려 `ollama-ai-provider`와 같은 방식으로 깨뜨리는 것을 방지한다.

## 알려진 한계 (의도적으로 범위 밖)

- LM Studio가 헬스체크 통과 후 스트리밍 도중에 끊기는 경우: 폴백 불가 (기존에도 동일한 한계였음).
- LM Studio 다운 + `ANTHROPIC_API_KEY`는 있지만 유효하지 않거나 Anthropic 쪽이 네트워크 오류인 경우: 사전에 감지할 수 없으므로 깔끔한 503으로 전환하지 않고 `onError`로만 로깅한다. 클라이언트는 빈 응답이나 부분 응답을 받을 수 있음 — 위와 대칭적인 수용된 한계.
- `query-rewrite`/`rag-eval` judge는 계속 LM Studio를 직접 호출하며 자체 try/catch로 조용히 스킵된다(회귀 아님, 기존 동작).

## 검증 방법

1. `npm ls @ai-sdk/provider @ai-sdk/provider-utils` — 중복 설치 없이 단일 버전(0.0.26 / 1.0.22)으로 dedupe 되는지 확인.
2. **정상 경로**: LM Studio 실행 상태에서 `/api/chat` 호출 → 기존과 동일하게 LM Studio가 응답, `chat_request` 로그에 `provider: 'lmstudio'`, 체감 지연 변화 없음(`curl -w '%{time_starttransfer}'`로 전후 비교).
3. **폴백 경로**: LM Studio 프로세스 중지(또는 `OLLAMA_BASE_URL`을 사용하지 않는 포트로 설정), 유효한 `ANTHROPIC_API_KEY` 설정 후 `/api/chat` 호출 → Claude Haiku 응답, `lmstudio_unreachable` 경고 로그, `provider: 'anthropic_fallback'` 로그, 프런트엔드에는 폴백 흔적이 전혀 보이지 않는지 확인.
4. **완전 다운**: LM Studio 중지 + `ANTHROPIC_API_KEY` 미설정 → 503 + 한국어 에러 메시지, UI에 기존 "오류가 발생했습니다: ..." 배너 표시, `no_llm_available` 에러 로그 확인.
5. **잘못된 키**: LM Studio 중지 + 잘못된 `ANTHROPIC_API_KEY` → `anthropic_fallback_stream_error` 로그 확인(수용된 한계이므로 UI 완전 정상 동작까지는 요구하지 않음).
6. `suggestions`/`query-rewrite`/`rag-eval` 경로가 이번 변경으로 영향받지 않았는지 회귀 확인.
