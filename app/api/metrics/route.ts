export const dynamic = 'force-dynamic'

import { metricsRegistry } from '@/lib/metrics'

export async function GET() {
  const metrics = await metricsRegistry.metrics()
  return new Response(metrics, {
    headers: { 'Content-Type': metricsRegistry.contentType },
  })
}
