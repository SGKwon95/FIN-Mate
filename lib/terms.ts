// 상품 약관 HTML URL — MINIO_PUBLIC_URL이 있으면 MinIO, 없으면 Next.js 정적 파일(public/terms/)
// 시연 배포는 MinIO 없이 운영하므로 public/terms/로 제공. 브라우저가 직접 여는 URL이라 서버 내부 주소면 안 됨
export function termsUrl(file: string): string {
  const base = process.env.MINIO_PUBLIC_URL
  return base ? `${base}/${process.env.MINIO_BUCKET}/terms/${file}` : `/terms/${file}`
}
