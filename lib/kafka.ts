import { Kafka, type Producer, logLevel } from 'kafkajs'

export const TOPICS = {
  // Step 1 : A bank → Gateway
  TRANSFER_REQUESTS:    'interbank-transfer-requests',
  // Step 2 : Gateway → A bank  (received ACK)
  GATEWAY_ACK:          'interbank-gateway-ack',
  // Step 3 : Gateway → B bank  (routed request)
  ROUTED_REQUESTS:      'interbank-routed-requests',
  // Step 4 : B bank → Gateway  (received ACK)
  B_RECEIVED_ACK:       'interbank-b-received-ack',
  // Step 6 : B bank → Gateway  (transfer result)
  B_RESULTS:            'interbank-b-results',
  // Step 7 : Gateway → B bank  (result received ACK)
  GATEWAY_B_ACK:        'interbank-gateway-b-ack',
  // Step 8 : Gateway → A bank  (final settlement)
  TRANSFER_SETTLEMENTS: 'interbank-transfer-settlements',
  // Step 9 : A bank → Gateway  (settled ACK)
  A_SETTLED_ACK:        'interbank-a-settled-ack',
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
