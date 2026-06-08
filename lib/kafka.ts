import { Kafka, type Producer, logLevel } from 'kafkajs'

export const TOPICS = {
  // Step 1 | Producer: FIN-Mate 앱  → Consumer: Gateway
  TRANSFER_REQUESTS:    'interbank-transfer-requests',
  // Step 2 | Producer: Gateway      → Consumer: FIN-Mate 앱 (이체 접수 확인)
  GATEWAY_ACK:          'interbank-gateway-ack',
  // Step 3 | Producer: Gateway      → Consumer: B은행 시뮬레이터
  ROUTED_REQUESTS:      'interbank-routed-requests',
  // Step 4 | Producer: B은행        → Consumer: Gateway (요청 수신 확인)
  B_RECEIVED_ACK:       'interbank-b-received-ack',
  // Step 6 | Producer: B은행        → Consumer: Gateway (이체 처리 결과)
  B_RESULTS:            'interbank-b-results',
  // Step 7 | Producer: Gateway      → Consumer: B은행 (결과 수신 확인)
  GATEWAY_B_ACK:        'interbank-gateway-b-ack',
  // Step 8 | Producer: Gateway      → Consumer: settlement-consumer (최종 정산)
  TRANSFER_SETTLEMENTS: 'interbank-transfer-settlements',
  // Step 9 | Producer: FIN-Mate 앱  → Consumer: Gateway (정산 완료 확인)
  A_SETTLED_ACK:        'interbank-a-settled-ack',
  // Inbound | Producer: Gateway     → Consumer: inbound-consumer (타행→FIN-Mate 입금)
  INBOUND_REQUESTS:     'interbank-inbound-requests',
  // Inbound | Producer: inbound-consumer → Consumer: Gateway (입금 처리 결과)
  INBOUND_RESULTS:      'interbank-inbound-results',
  // BOK-Wire Step 1 | Producer: FIN-Mate 앱  → Consumer: bok-wire-gateway (10억 초과 타행이체)
  BOK_WIRE_REQUESTS:    'bokwire-requests',
  // BOK-Wire Step 2 | Producer: bok-wire-gateway → Consumer: settlement-consumer (즉시 정산 완료)
  BOK_WIRE_RESULTS:     'bokwire-results',
} as const

const kafka = new Kafka({
  clientId: 'fin-mate',
  brokers:  (process.env.KAFKA_BROKERS ?? process.env.KAFKA_BROKER ?? 'localhost:9092').split(','),
  logLevel: logLevel.WARN,
  retry: { initialRetryTime: 3000, retries: 60 },  // 브로커 미기동 시 ~3분간 재시도
})

export { kafka }

const globalForKafka = globalThis as unknown as { _kafkaProducer?: Producer }

export async function getProducer(): Promise<Producer> {
  if (!globalForKafka._kafkaProducer) {
    const p = kafka.producer()
    try {
      await p.connect()
    } catch (e) {
      // 연결 실패 시 캐시하지 않고 에러를 상위로 전달
      throw e
    }
    globalForKafka._kafkaProducer = p
    // 연결 해제 시 캐시 초기화 → 다음 요청에서 재연결
    p.on('producer.disconnect', () => {
      globalForKafka._kafkaProducer = undefined
    })
  }
  return globalForKafka._kafkaProducer
}
