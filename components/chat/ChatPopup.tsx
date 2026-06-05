"use client"

import { useState, useEffect } from "react"
import { BotMessageSquare } from "lucide-react"
import ChatInterface from "./ChatInterface"

/** HTML 문자열에서 가시 텍스트만 추출 */
function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html")
  return doc.body.innerText.replace(/\n{3,}/g, "\n\n").trim()
}

export default function ChatPopup({
  contextUrls = [],
  productContext = "",
}: {
  contextUrls?: string[]
  productContext?: string  // 서버 컴포넌트에서 직렬화한 상품 메타데이터
}) {
  const [open, setOpen] = useState(false)
  const [context, setContext] = useState("")

  useEffect(() => {
    const parts: string[] = []
    if (productContext) parts.push(productContext)

    if (contextUrls.length === 0) {
      setContext(parts.join("\n\n"))
      return
    }

    Promise.all(
      contextUrls.map((url) =>
        fetch(url)
          .then((r) => r.text())
          .then(htmlToText)
          .catch(() => "")
      )
    ).then((texts) => {
      parts.push(...texts.filter(Boolean))
      setContext(parts.join("\n\n---\n\n"))
    })
  }, [contextUrls.join(","), productContext])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {open && (
        <>
          {/* 모바일 딤 처리 */}
          <div
            className="fixed inset-0 z-40 bg-black/20 lg:hidden"
            onClick={() => setOpen(false)}
          />

          {/* 팝업 패널 */}
          <div
            className={[
              "fixed z-50 flex flex-col overflow-hidden",
              "bg-white rounded-2xl shadow-2xl border border-kb-gray-border",
              "bottom-[57px] left-2 right-2",
              "h-[min(calc(100dvh-130px),520px)]",
              "lg:left-auto lg:right-6 lg:bottom-6 lg:w-[400px] lg:h-[560px]",
            ].join(" ")}
          >
            <ChatInterface
              onClose={() => setOpen(false)}
              initialContext={context}
            />
          </div>
        </>
      )}

      {/* 플로팅 버튼 — 팝업 열리면 숨김 (헤더 X 버튼으로 닫기) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={[
            "fixed z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center",
            "bg-kb-navy text-white hover:bg-kb-navy-light transition-all active:scale-95",
            "bottom-[72px] right-4",
            "lg:bottom-6 lg:right-6",
          ].join(" ")}
          aria-label="AI 상담 열기"
        >
          <BotMessageSquare className="w-6 h-6" />
        </button>
      )}
    </>
  )
}
