import pino from "pino"
import { trace } from "@opentelemetry/api"

const isDev = process.env.NODE_ENV !== "production"

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: isDev
    ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } }
    : undefined,
  base: { service: process.env.SERVICE_NAME ?? "fin-mate" },
  mixin() {
    const traceId = trace.getActiveSpan()?.spanContext().traceId
    return traceId ? { traceId } : {}
  },
})

export function createWorkerLogger(worker: string) {
  return logger.child({ worker })
}
