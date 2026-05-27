import type { EvaluationResult } from 'langsmith/evaluation'

type EvalArgs = {
  inputs: Record<string, unknown>
  outputs: Record<string, unknown>
}

async function judgeWithLLM(prompt: string): Promise<number> {
  const baseURL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:1234'
  const res = await fetch(`${baseURL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer lm-studio' },
    body: JSON.stringify({
      model: process.env.EVAL_MODEL ?? 'local-model',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 10,
    }),
  })
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
  const raw = data.choices?.[0]?.message?.content?.trim() ?? '0'
  const score = parseFloat(raw)
  return isNaN(score) ? 0 : Math.min(1, Math.max(0, score))
}

/**
 * 답변이 reference_document에만 근거하는지 측정 (0~1)
 * 1 = 문서 내용만 사용, 0 = 외부 지식 포함
 */
export async function faithfulnessEvaluator(args: EvalArgs): Promise<EvaluationResult> {
  const prompt = `You are an evaluator. Given a context document and an answer, rate whether the answer is ONLY based on the given context (no outside knowledge).

Context:
${args.inputs.context}

Answer:
${args.outputs.answer}

Respond with a single number from 0 to 1:
- 1.0: answer uses ONLY information from the context
- 0.5: answer mostly uses context but adds minor outside info
- 0.0: answer contains significant information not in the context

Number:`

  const score = await judgeWithLLM(prompt)
  return { key: 'faithfulness', score }
}

/**
 * 질문과 답변의 관련도 측정 (0~1)
 * 1 = 완전히 관련, 0 = 무관
 */
export async function relevanceEvaluator(args: EvalArgs): Promise<EvaluationResult> {
  const prompt = `You are an evaluator. Rate how relevant the answer is to the question.

Question: ${args.inputs.question}

Answer: ${args.outputs.answer}

Respond with a single number from 0 to 1:
- 1.0: answer directly and completely addresses the question
- 0.5: answer partially addresses the question
- 0.0: answer is irrelevant to the question

Number:`

  const score = await judgeWithLLM(prompt)
  return { key: 'relevance', score }
}
