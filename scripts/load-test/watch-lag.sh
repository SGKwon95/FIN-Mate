#!/bin/bash
# Kafka Consumer Lag 모니터링
# Pi에서 실행: bash scripts/load-test/watch-lag.sh
# 로컬에서 실행: KAFKA_HOST=192.168.219.110 bash scripts/load-test/watch-lag.sh

BROKER=${KAFKA_BROKER:-192.168.219.110:9092}
CONSUMER_GROUPS=("fin-mate-settlement-group" "fin-mate-inbound-group")

# Pi(Docker)에서 실행 중인지 판별
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^kafka$"; then
  RUN_CMD="docker exec kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092"
else
  RUN_CMD="kafka-consumer-groups.sh --bootstrap-server $BROKER"
fi

echo "Broker: $BROKER"
echo "Ctrl+C to stop"
echo "========================================="

while true; do
  echo ""
  echo "=== $(date '+%H:%M:%S') ==="
  for GROUP in "${CONSUMER_GROUPS[@]}"; do
    echo "--- $GROUP ---"
    $RUN_CMD --describe --group "$GROUP" 2>/dev/null \
      | awk 'NR>1 && NF>=6 && $6~/^[0-9]/ {
          printf "  %-42s  P%-2s  LAG: %s\n", $2, $3, $6
        }'
  done
  sleep 3
done
