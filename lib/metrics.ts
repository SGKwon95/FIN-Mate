import { Registry, collectDefaultMetrics, Histogram, Counter } from 'prom-client'

declare global {
  // eslint-disable-next-line no-var
  var _metricsRegistry: Registry | undefined
}

function buildRegistry(): Registry {
  const registry = new Registry()
  registry.setDefaultLabels({ service: 'fin-mate' })
  collectDefaultMetrics({ register: registry })

  new Histogram({
    name: 'fin_mate_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['route', 'method', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
    registers: [registry],
  })

  new Histogram({
    name: 'fin_mate_llm_response_duration_seconds',
    help: 'LLM streaming response duration in seconds',
    labelNames: ['model'],
    buckets: [0.5, 1, 2, 5, 10, 20, 30],
    registers: [registry],
  })

  new Counter({
    name: 'fin_mate_kafka_messages_total',
    help: 'Total Kafka messages processed',
    labelNames: ['topic', 'status'],
    registers: [registry],
  })

  new Histogram({
    name: 'fin_mate_kafka_message_processing_seconds',
    help: 'Kafka message processing duration in seconds',
    labelNames: ['topic'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    registers: [registry],
  })

  new Histogram({
    name: 'fin_mate_ml_inference_duration_seconds',
    help: 'ML loan screening inference duration in seconds',
    labelNames: ['decision'],
    buckets: [0.05, 0.1, 0.3, 0.5, 1, 2],
    registers: [registry],
  })

  new Counter({
    name: 'fin_mate_rag_context_bytes_total',
    help: 'Total bytes of RAG context injected into prompts',
    registers: [registry],
  })

  return registry
}

export const metricsRegistry: Registry =
  globalThis._metricsRegistry ?? (globalThis._metricsRegistry = buildRegistry())

export function getMetric<T>(name: string): T {
  return metricsRegistry.getSingleMetric(name) as T
}
