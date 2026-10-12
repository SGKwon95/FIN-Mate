# 시연(포트폴리오) 배포 가이드

고객용 기능만 공개하는 배포. **Kafka · MinIO · Docker 없이** Next.js 단독으로 실행한다.

| 배포처 | 용도 | 접속 |
|---|---|---|
| Raspberry Pi 4 (8GB) | 채용 담당자용 상시 서비스 | `https://sgbank.sgkwon.win` (Cloudflare Tunnel) |
| 데스크탑 (WSL) | 면접 현장 시연 | `http://localhost:3000` |

두 곳 모두 Pi의 PostgreSQL에 있는 **`fin-mate-demo`** DB를 사용한다. 개발용 `fin-mate` DB(과부하 테스트 거래 6.5만 건 포함)는 공개하지 않는다.

## 시연 모드에서 바뀌는 동작

| 환경변수 | 효과 |
|---|---|
| `DEMO_MODE=true` | 직원 계정 로그인 차단(`auth.ts`), `/api/test/*`·`/api/metrics` 404(`lib/demo.ts`) |
| `KAFKA_ENABLED=false` | 타행 이체·타행 계좌 조회를 안내 메시지로 거절(`lib/transfer-execute.ts`). 자행 이체는 정상 |
| `MINIO_PUBLIC_URL=` (빈 값) | 상품 약관을 MinIO 대신 `public/terms/`에서 제공(`lib/terms.ts`) |
| `ANTHROPIC_API_KEY` | LM Studio(데스크탑)가 꺼져 있으면 Claude Haiku로 응답, 하루 20회 한도 (`docs/llm-fallback-plan.md`) |

이 값들은 `.env.production.local`에 둔다. Next.js가 `next build`/`next start`에서만 읽고 `npm run dev`에는 적용하지 않으므로, 데스크탑에서 개발과 시연을 같은 저장소로 할 수 있다.

## 1. 시연 DB 준비 (최초 1회, 어느 머신에서든)

```bash
DEMO_DATABASE_URL="postgresql://postgres:<pw>@db.sgkwon.win:5432/fin-mate-demo?schema=public" \
  npx tsx --env-file=.env scripts/setup-demo-db.ts
```

- 같은 PostgreSQL 서버에 DB 생성 → `vector` 확장 → `prisma db push` → 시드(`testuser / Test1234!`) → 고객용 RAG 청크(emp-* 제외) 복사.
- 원본 `fin-mate`는 읽기만 한다.
- **초기화**: 방문자가 데이터를 바꿔 놓았으면 같은 명령에 `--recreate`를 붙인다(DB 삭제 후 재생성). 실행 중인 앱의 연결은 끊겼다가 자동으로 다시 붙는다.

## 2. 데스크탑 (면접 시연)

`.env.production.local`:
```
DATABASE_URL="postgresql://postgres:<pw>@db.sgkwon.win:5432/fin-mate-demo?schema=public"
DEMO_MODE=true
KAFKA_ENABLED=false
MINIO_PUBLIC_URL=
```

```bash
npm run build && npm start      # http://localhost:3000
```

- LM Studio를 켜 두면 RAG까지 포함한 로컬 LLM 응답을 시연할 수 있다.
- 시연이 끝나도 `.env.production.local`을 남겨 두면 이후 `npm run build`는 항상 시연 설정으로 빌드된다는 점에 주의.

## 3. Raspberry Pi (상시 서비스)

### 3-1. 준비
```bash
# Node 20 LTS (apt 기본 nodejs는 버전이 낮음)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git python3 make g++   # g++ 등은 better-sqlite3 네이티브 빌드 대비

git clone <repo-url> /home/pi/FIN-Mate && cd /home/pi/FIN-Mate
npm ci
```

### 3-2. 환경변수
`.env` (데스크탑 `.env`에서 필요한 것만):
```
AUTH_SECRET=<데스크탑과 같은 값 또는 새 값>
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_DAILY_LIMIT=20
EMBEDDING_MODEL=nomic-embed-text-v1.5
```
`.env.production.local`:
```
DATABASE_URL="postgresql://postgres:<pw>@localhost:5432/fin-mate-demo?schema=public"
DEMO_MODE=true
KAFKA_ENABLED=false
MINIO_PUBLIC_URL=
AUTH_URL=https://sgbank.sgkwon.win
AUTH_TRUST_HOST=true
# 데스크탑 LM Studio — "Serve on Local Network" 필요. 데스크탑이 꺼져 있으면 Claude 폴백
OLLAMA_BASE_URL=http://<데스크탑 IP>:1234
```
- DB가 같은 Pi에 있으므로 `db.sgkwon.win` 대신 `localhost` (공유기 헤어핀 NAT 회피).
- `AUTH_TRUST_HOST`/`AUTH_URL`이 없으면 터널 뒤에서 NextAuth 로그인 리다이렉트가 실패한다.
- Kafka·MinIO·Phoenix 관련 변수는 넣지 않는다.

### 3-3. 빌드 & 서비스 등록
```bash
npm run build                    # Pi 4 기준 5~15분, 8GB라 메모리 문제 없음
sudo cp deploy/fin-mate.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now fin-mate
journalctl -u fin-mate -f
```
- 3000번 포트를 다른 서비스(video-server 등)가 쓰고 있으면 유닛 파일의 `PORT`를 바꾼다.
- 로그가 SD 카드를 채우지 않도록 `/etc/systemd/journald.conf`의 `SystemMaxUse=200M` 권장.

### 3-4. 외부 공개 (Cloudflare Tunnel)
```bash
# cloudflared 설치 후
cloudflared tunnel login
cloudflared tunnel create fin-mate
cloudflared tunnel route dns fin-mate sgbank.sgkwon.win
```
`~/.cloudflared/config.yml`:
```yaml
tunnel: fin-mate
credentials-file: /home/pi/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: sgbank.sgkwon.win
    service: http://localhost:3000
  - service: http_status:404
```
```bash
sudo cloudflared service install && sudo systemctl enable --now cloudflared
```

### 3-5. 업데이트
```bash
cd /home/pi/FIN-Mate && git pull && npm ci && npm run build && sudo systemctl restart fin-mate
```
빌드가 끝난 뒤 재시작하므로 빌드 중에도 기존 서버는 이전 `.next`로 계속 응답한다. 다만 `.next`를 덮어쓰는 동안 일부 요청이 실패할 수 있으니 방문이 적은 시간에 한다.

## 알려진 한계
- 데스크탑이 꺼져 있으면 Pi의 채팅은 RAG 없이 Claude 일반 지식으로만 답한다(문서 검색은 LM Studio 임베딩 필요). Claude 한도(하루 20회)를 다 쓰면 그날은 503 안내.
- 모든 방문자가 `testuser` 한 계정을 공유한다. 이체 등으로 데이터가 바뀌므로 필요하면 `--recreate`로 초기화.
