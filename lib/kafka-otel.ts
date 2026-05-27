import {
  context,
  trace,
  propagation,
  SpanStatusCode,
  SpanKind,
} from '@opentelemetry/api'
import type { IHeaders } from 'kafkajs'

const tracer = trace.getTracer('fin-mate-kafka')

/** 현재 활성 span의 W3C traceparent를 KafkaJS 메시지 헤더로 직렬화 */
export function injectTraceContext(): IHeaders {
  const headers: Record<string, string> = {}
  propagation.inject(context.active(), headers)
  return headers as IHeaders
}

/** producer 측: payload를 JSON 직렬화하고 traceparent 헤더를 포함한 Kafka 메시지 반환 */
export function buildTracedKafkaMessage(payload: unknown) {
  return {
    value: JSON.stringify(payload),
    headers: injectTraceContext(),
  }
}

/** consumer 측: 헤더에서 trace context를 복원하고 child span 안에서 operation 실행 */
export async function runWithKafkaSpan<T>(
  topic: string,
  headers: IHeaders | undefined,
  operation: () => Promise<T>
): Promise<T> {
  const carrier: Record<string, string> = {}
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined && value !== null) {
        carrier[key] = Buffer.isBuffer(value) ? value.toString() : String(value)
      }
    }
  }

  const parentCtx = propagation.extract(context.active(), carrier)

  return tracer.startActiveSpan(
    `kafka.consume ${topic}`,
    {
      kind: SpanKind.CONSUMER,
      attributes: { 'messaging.system': 'kafka', 'messaging.destination': topic },
    },
    parentCtx,
    async (span) => {
      try {
        const result = await operation()
        span.setStatus({ code: SpanStatusCode.OK })
        return result
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) })
        span.recordException(err as Error)
        throw err
      } finally {
        span.end()
      }
    }
  )
}
