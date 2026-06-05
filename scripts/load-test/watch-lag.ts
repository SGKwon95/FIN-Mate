/**
 * Kafka Consumer Lag 모니터링
 * 실행: npm run watch:lag
 */
import { kafka } from '@/lib/kafka'

const CONSUMER_GROUPS = ['fin-mate-settlement-group', 'fin-mate-inbound-group']

async function printLag(admin: ReturnType<typeof kafka.admin>) {
  console.log(`\n=== ${new Date().toTimeString().slice(0, 8)} ===`)

  for (const groupId of CONSUMER_GROUPS) {
    console.log(`--- ${groupId} ---`)

    const groupOffsets = await admin.fetchOffsets({ groupId })

    for (const { topic, partitions } of groupOffsets) {
      const topicOffsets = await admin.fetchTopicOffsets(topic)
      const highMap = Object.fromEntries(
        topicOffsets.map((p) => [p.partition, parseInt(p.high)]),
      )

      for (const { partition, offset } of partitions) {
        const committed = parseInt(offset)
        const high = highMap[partition] ?? 0
        const lag = committed < 0 ? high : Math.max(0, high - committed)
        console.log(`  ${topic.padEnd(42)}  P${partition}   LAG: ${lag}`)
      }
    }
  }
}

async function main() {
  const admin = kafka.admin()
  await admin.connect()

  console.log('Kafka Consumer Lag 모니터링 시작 (Ctrl+C to stop)')
  console.log('=========================================')

  try {
    while (true) {
      await printLag(admin)
      await new Promise((r) => setTimeout(r, 3000))
    }
  } finally {
    await admin.disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
