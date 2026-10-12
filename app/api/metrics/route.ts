export const dynamic = 'force-dynamic'

import { metricsRegistry } from '@/lib/metrics'
import { blockInDemo } from '@/lib/demo'

export async function GET() {
  const blocked = blockInDemo()
  if (blocked) return blocked

  const metrics = await metricsRegistry.metrics()
  return new Response(metrics, {
    headers: { 'Content-Type': metricsRegistry.contentType },
  })
}
