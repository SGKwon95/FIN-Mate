// PM2 프로세스 관리 설정
// 사용법: pm2 start ecosystem.config.js

const APP_ROOT = __dirname

module.exports = {
  apps: [
    // ── Next.js 웹 앱 ──────────────────────────────────────────────
    {
      name: 'finmate-web',
      script: 'npm',
      args: 'run start',
      cwd: APP_ROOT,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      error_file: 'logs/web-error.log',
      out_file: 'logs/web-out.log',
    },

    // ── Kafka 워커: 공동망 게이트웨이 ──────────────────────────────
    {
      name: 'finmate-kafka-gateway',
      script: 'npm',
      args: 'run kafka:gateway',
      cwd: APP_ROOT,
      watch: false,
      max_restarts: 20,
      restart_delay: 5000,
      error_file: 'logs/kafka-gateway-error.log',
      out_file: 'logs/kafka-gateway-out.log',
    },

    // ── Kafka 워커: B은행 시뮬레이터 ───────────────────────────────
    {
      name: 'finmate-kafka-simulator',
      script: 'npm',
      args: 'run kafka:simulator',
      cwd: APP_ROOT,
      watch: false,
      max_restarts: 20,
      restart_delay: 5000,
      error_file: 'logs/kafka-simulator-error.log',
      out_file: 'logs/kafka-simulator-out.log',
    },

    // ── Kafka 워커: 타행→FIN-Mate 인바운드 입금 ────────────────────
    {
      name: 'finmate-kafka-inbound',
      script: 'npm',
      args: 'run kafka:inbound',
      cwd: APP_ROOT,
      watch: false,
      max_restarts: 20,
      restart_delay: 5000,
      error_file: 'logs/kafka-inbound-error.log',
      out_file: 'logs/kafka-inbound-out.log',
    },

    // ── Kafka 워커: 한은금융망(BOK-Wire) 게이트웨이 ────────────────
    {
      name: 'finmate-kafka-bokwire',
      script: 'npm',
      args: 'run kafka:bokwire',
      cwd: APP_ROOT,
      watch: false,
      max_restarts: 20,
      restart_delay: 5000,
      error_file: 'logs/kafka-bokwire-error.log',
      out_file: 'logs/kafka-bokwire-out.log',
    },
  ],
}
