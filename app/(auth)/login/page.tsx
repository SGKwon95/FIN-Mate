"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Star, AlertCircle } from "lucide-react"
import type { Metadata } from "next"

export default function LoginPage() {
  const router = useRouter()
  const [loginId, setLoginId] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loginId.trim() || !password) {
      setError("아이디와 비밀번호를 입력해주세요.")
      return
    }
    setError("")
    setLoading(true)
    try {
      const result = await signIn("credentials", {
        loginId: loginId.trim(),
        password,
        redirect: false,
      })
      if (result?.error) {
        setError("아이디 또는 비밀번호가 올바르지 않습니다.")
      } else {
        router.push("/dashboard")
        router.refresh()
      }
    } catch {
      setError("로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* 노란 헤더 */}
      <div className="bg-kb-yellow px-6 pt-10 pb-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Star className="fill-kb-navy text-kb-navy w-7 h-7" />
          <span className="text-kb-navy text-2xl font-bold tracking-tight">
            KB Star Banking
          </span>
        </div>
        <p className="text-kb-navy/60 text-sm">안전하고 편리한 금융 서비스</p>
      </div>

      {/* 폼 영역 */}
      <div className="flex-1 flex items-start justify-center pt-8 px-5">
        <div className="w-full max-w-sm">
          <h1 className="text-white text-xl font-bold mb-5">로그인</h1>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* 아이디 */}
            <input
              type="text"
              placeholder="아이디"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              autoComplete="username"
              className="w-full bg-white/10 text-white placeholder-white/40 border border-white/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-kb-yellow focus:bg-white/15 transition-all"
            />

            {/* 비밀번호 */}
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                placeholder="비밀번호"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full bg-white/10 text-white placeholder-white/40 border border-white/20 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:border-kb-yellow focus:bg-white/15 transition-all"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* 에러 메시지 */}
            {error && (
              <div className="flex items-center gap-1.5 text-red-400 text-xs">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* 로그인 버튼 */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-kb-yellow text-kb-navy font-bold py-3 rounded-xl hover:bg-kb-yellow-dark active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-1"
            >
              {loading ? "로그인 중..." : "로그인"}
            </button>
          </form>

          {/* 보조 링크 */}
          <div className="flex items-center justify-center gap-4 mt-4">
            {["아이디 찾기", "비밀번호 찾기", "회원가입"].map((label, i, arr) => (
              <span key={label} className="flex items-center gap-4">
                <button className="text-white/50 text-xs hover:text-white/80 transition-colors">
                  {label}
                </button>
                {i < arr.length - 1 && <span className="text-white/20 text-xs">|</span>}
              </span>
            ))}
          </div>

          {/* 개발용 힌트 */}
          <div className="mt-6 p-3.5 bg-white/5 rounded-xl border border-white/10">
            <p className="text-white/40 text-[11px] text-center mb-1">개발용 테스트 계정</p>
            <p className="text-white/60 text-xs text-center font-mono">
              testuser&nbsp;&nbsp;/&nbsp;&nbsp;Test1234!
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
