import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter as OTLPHttpExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPTraceExporter as OTLPProtoExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'

// Tempo: JSON (application/json)
const tempoExporter = new OTLPHttpExporter({
  url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318'}/v1/traces`,
})
// Phoenix 16+: protobuf only (application/x-protobuf)
const phoenixExporter = new OTLPProtoExporter({
  url: `${process.env.PHOENIX_ENDPOINT ?? 'http://localhost:6006'}/v1/traces`,
})

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'fin-mate',
  }),
  spanProcessors: [
    new BatchSpanProcessor(tempoExporter),
    new SimpleSpanProcessor(phoenixExporter),  // Phoenix: 즉시 전송 (버퍼링 없음)
  ],
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
      '@opentelemetry/instrumentation-net': { enabled: false },
      '@opentelemetry/instrumentation-http': {
        requestHook: (span, req) => {
          const url = 'url' in req ? req.url : ''
          if (url) span.updateName(`${'method' in req ? req.method : 'HTTP'} ${url.split('?')[0]}`)
        },
      },
    }),
  ],
})

sdk.start()
