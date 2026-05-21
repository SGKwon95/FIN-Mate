import { Kafka, type Producer, logLevel } from 'kafkajs'

export const TOPICS = {
  TRANSFER_REQUESTS:    'interbank-transfer-requests',
  TRANSFER_SETTLEMENTS: 'interbank-transfer-settlements',
} as const

const kafka = new Kafka({
  clientId: 'fin-mate',
  brokers:  [process.env.KAFKA_BROKER ?? 'localhost:9092'],
  logLevel: logLevel.WARN,
})

export { kafka }

const globalForKafka = globalThis as unknown as { _kafkaProducer?: Producer }

export async function getProducer(): Promise<Producer> {
  if (!globalForKafka._kafkaProducer) {
    const p = kafka.producer()
    await p.connect()
    globalForKafka._kafkaProducer = p
  }
  return globalForKafka._kafkaProducer
}
