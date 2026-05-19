"use client"

import { useState } from "react"
import Link from "next/link"
import { Star, Eye, EyeOff, AlertCircle, ChevronLeft, CheckCircle } from "lucide-react"

type PartyType = "INDIVIDUAL" | "CORPORATE"

const INPUT =
  "w-full bg-white/10 text-white placeholder-white/40 border border-white/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-kb-yellow focus:bg-white/15 transition-all"

export default function RegisterPage() {
  const [partyType, setPartyType] = useState<PartyType>("INDIVIDUAL")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [showPwConfirm, setShowPwConfirm] = useState(false)

  // 공통
  const [partyName, setPartyName] = useState("")
  const [loginId, setLoginId] = useState("")
  const [password, setPassword] = useState("")
  const [passwordConfirm, setPasswordConfirm] = useState("")

  // 개인
  const [residentNo, setResidentNo] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")

  // 기업
  const [businessRegNo, setBusinessRegNo] = useState("")
  const [representativeName, setRepresentativeName] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partyType,
          partyName,
          loginId,
          password,
          residentNo,
          phone,
          email,
          businessRegNo,
          representativeName,
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        setError(result.error ?? "회원가입 중 오류가 발생했습니다.")
      } else {
        setSuccess(true)
      }
    } catch {
      setError("회원가입 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* 헤더 */}
      <div className="bg-kb-yellow px-6 pt-10 pb-8">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/login" className="text-kb-navy">
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <div className="flex items-center gap-2">
            <Star className="fill-kb-navy text-kb-navy w-6 h-6" />
            <span className="text-kb-navy text-xl font-bold tracking-tight">SG Star Banking</span>
          </div>
        </div>
        <p className="text-kb-navy/60 text-sm pl-9">회원가입</p>
      </div>

      <div className="flex-1 px-5 pt-6 pb-10 overflow-y-auto">
        <div className="w-full max-w-sm mx-auto">
          {success ? (
            <div className="flex flex-col items-center justify-center gap-4 mt-10">
              <CheckCircle className="w-14 h-14 text-kb-yellow" />
              <p className="text-white text-lg font-bold">가입이 완료되었습니다!</p>
              <Link
                href="/login"
                className="w-full text-center bg-kb-yellow text-kb-navy font-bold py-3 rounded-xl hover:bg-yellow-400 transition-all"
              >
                로그인하러 가기
              </Link>
            </div>
          ) : (
            <>
              {/* 개인 / 기업 토글 */}
              <div className="flex bg-white/10 rounded-xl p-1 mb-5">
                {(["INDIVIDUAL", "CORPORATE"] as PartyType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => { setPartyType(type); setError("") }}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                      partyType === type
                        ? "bg-kb-yellow text-kb-navy"
                        : "text-white/60 hover:text-white/80"
                    }`}
                  >
                    {type === "INDIVIDUAL" ? "개인" : "기업"}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                {/* 공통 필드 */}
                <input
                  placeholder={partyType === "INDIVIDUAL" ? "이름 *" : "기업명 *"}
                  value={partyName}
                  onChange={(e) => setPartyName(e.target.value)}
                  required
                  className={INPUT}
                />
                <input
                  placeholder="아이디 (4~20자, 영문·숫자·_) *"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  autoComplete="username"
                  required
                  className={INPUT}
                />
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    placeholder="비밀번호 (8자 이상) *"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    className={INPUT + " pr-11"}
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
                <div className="relative">
                  <input
                    type={showPwConfirm ? "text" : "password"}
                    placeholder="비밀번호 확인 *"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                    className={INPUT + " pr-11"}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPwConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors"
                  >
                    {showPwConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* 개인 전용 */}
                {partyType === "INDIVIDUAL" && (
                  <>
                    <input
                      placeholder="주민등록번호 (예: 900101-1234567) *"
                      value={residentNo}
                      onChange={(e) => setResidentNo(e.target.value)}
                      required
                      className={INPUT}
                    />
                    <input
                      placeholder="휴대폰 번호 (선택)"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className={INPUT}
                    />
                    <input
                      type="email"
                      placeholder="이메일 (선택)"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={INPUT}
                    />
                  </>
                )}

                {/* 기업 전용 */}
                {partyType === "CORPORATE" && (
                  <>
                    <input
                      placeholder="사업자등록번호 (예: 123-45-67890) *"
                      value={businessRegNo}
                      onChange={(e) => setBusinessRegNo(e.target.value)}
                      required
                      className={INPUT}
                    />
                    <input
                      placeholder="대표자명 (선택)"
                      value={representativeName}
                      onChange={(e) => setRepresentativeName(e.target.value)}
                      className={INPUT}
                    />
                  </>
                )}

                {error && (
                  <div className="flex items-center gap-1.5 text-red-400 text-xs">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-kb-yellow text-kb-navy font-bold py-3 rounded-xl hover:bg-yellow-400 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-1"
                >
                  {loading ? "처리 중..." : "회원가입"}
                </button>
              </form>

              <p className="text-white/40 text-xs text-center mt-5">
                이미 계정이 있으신가요?{" "}
                <Link href="/login" className="text-kb-yellow hover:underline">
                  로그인
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
