import LoginForm from "./LoginForm"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const initialError =
    error === "duplicate"
      ? "다른 기기에서 로그인되어 현재 세션이 종료되었습니다."
      : undefined

  return <LoginForm initialError={initialError} />
}
