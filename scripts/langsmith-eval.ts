/**
 * LangSmith RAG 평가 스크립트
 * 실행: npm run langsmith:eval
 *
 * 1. 데이터셋 생성 (이미 있으면 재사용)
 * 2. 각 예제에 대해 chat API 호출
 * 3. faithfulness / relevance 점수 기록
 */
import { Client } from 'langsmith'
import { evaluate } from 'langsmith/evaluation'
import { faithfulnessEvaluator, relevanceEvaluator } from '../lib/langsmith-evaluators'

const DATASET_NAME = 'fin-mate-rag-eval'
const CHAT_API_URL = process.env.CHAT_API_URL ?? 'http://localhost:3000/api/chat'

// 테스트용 QA 예제 — 실제 업무 문서 기반으로 교체 가능
const TEST_EXAMPLES = [
  {
    question: '신분증 없이 계좌를 개설할 수 있나요?',
    context: `[계좌 개설 안내]
본인 확인을 위해 반드시 신분증(주민등록증, 운전면허증, 여권 중 하나)을 지참해야 합니다.
신분증 미지참 시 계좌 개설이 불가능합니다.`,
    expected: '신분증 없이는 계좌 개설이 불가능합니다.',
  },
  {
    question: '해외 송금 한도가 얼마인가요?',
    context: `[계좌 개설 안내]
본인 확인을 위해 반드시 신분증(주민등록증, 운전면허증, 여권 중 하나)을 지참해야 합니다.
신분증 미지참 시 계좌 개설이 불가능합니다.`,
    expected: '문서에 없는 내용에 대한 거절 응답',
  },
  {
    question: '이체 수수료는 얼마인가요?',
    context: `[이체 수수료 안내]
• 자행 이체: 무료
• 타행 이체: 건당 500원 (단, 인터넷뱅킹 이용 시 무료)
• 자동이체: 건당 300원`,
    expected: '자행 이체는 무료, 타행 이체는 건당 500원(인터넷뱅킹 무료), 자동이체는 건당 300원입니다.',
  },
]

async function createOrGetDataset(client: Client) {
  const datasets = client.listDatasets({ datasetName: DATASET_NAME })
  for await (const ds of datasets) {
    if (ds.name === DATASET_NAME) {
      console.log(`기존 데이터셋 사용: ${ds.id}`)
      return ds
    }
  }

  console.log('새 데이터셋 생성 중...')
  const dataset = await client.createDataset(DATASET_NAME, {
    description: 'FIN-Mate RAG 챗봇 평가 데이터셋',
  })

  await client.createExamples({
    inputs: TEST_EXAMPLES.map((e) => ({ question: e.question, context: e.context })),
    outputs: TEST_EXAMPLES.map((e) => ({ expected: e.expected })),
    datasetId: dataset.id,
  })

  console.log(`데이터셋 생성 완료: ${dataset.id} (${TEST_EXAMPLES.length}개 예제)`)
  return dataset
}

async function chatTarget(input: { question: string; context: string }) {
  const res = await fetch(CHAT_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: input.question }],
      retrievedContext: input.context,
      modelId: process.env.EVAL_MODEL ?? 'local-model',
    }),
  })

  if (!res.ok) throw new Error(`chat API error: ${res.status}`)

  // streaming response → full text 수집
  const reader = res.body?.getReader()
  if (!reader) throw new Error('no response body')

  const decoder = new TextDecoder()
  let answer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    answer += decoder.decode(value, { stream: true })
  }

  return { answer: answer.trim() }
}

async function main() {
  const client = new Client()
  await createOrGetDataset(client)

  console.log('평가 시작...')
  const results = await evaluate(chatTarget, {
    data: DATASET_NAME,
    evaluators: [faithfulnessEvaluator, relevanceEvaluator],
    experimentPrefix: 'fin-mate-rag',
    client,
  })

  console.log('\n평가 완료.')
  console.log(`결과 확인: https://smith.langchain.com (프로젝트: ${process.env.LANGCHAIN_PROJECT ?? 'fin-mate-rag'})`)

  let faithSum = 0, relSum = 0, count = 0
  for (const row of results.results) {
    const evals = row.evaluationResults.results
    faithSum += Number(evals.find((r) => r.key === 'faithfulness')?.score ?? 0)
    relSum   += Number(evals.find((r) => r.key === 'relevance')?.score ?? 0)
    count++
  }

  if (count > 0) {
    console.log(`\n평균 점수 (${count}개 예제):`)
    console.log(`  faithfulness: ${(faithSum / count).toFixed(2)}`)
    console.log(`  relevance:    ${(relSum   / count).toFixed(2)}`)
  }
}

main().catch((err) => {
  console.error('평가 실패:', err)
  process.exit(1)
})
