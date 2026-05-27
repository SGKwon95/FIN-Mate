import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'

const tempoExporter = new OTLPTraceExporter({
  url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318'}/v1/traces`,
})
const phoenixExporter = new OTLPTraceExporter({
  url: `${process.env.PHOENIX_ENDPOINT ?? 'http://localhost:6006'}/v1/traces`,
})

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'fin-mate-worker',
  }),
  spanProcessors: [
    new SimpleSpanProcessor(tempoExporter),
    new SimpleSpanProcessor(phoenixExporter),
  ],
})

sdk.start()

process.on('SIGTERM', () => sdk.shutdown())
process.on('SIGINT', () => sdk.shutdown())
