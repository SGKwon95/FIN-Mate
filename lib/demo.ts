import { NextResponse } from "next/server"

// 시연(포트폴리오) 배포 플래그 — 고객용만 공개, 부하테스트·내부용 API 차단
export const DEMO_MODE = process.env.DEMO_MODE === "true"

/** DEMO_MODE면 404 응답, 아니면 null — 테스트용 API 핸들러 첫 줄에서 사용 */
export function blockInDemo(): NextResponse | null {
  return DEMO_MODE ? NextResponse.json({ error: "Not Found" }, { status: 404 }) : null
}
