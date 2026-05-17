import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // KB Star Banking 메인 컬러
        kb: {
          yellow:     "#FFCC00",  // 메인 브랜드 옐로우
          "yellow-dark": "#E6B800",  // hover/active 상태
          "yellow-light": "#FFF5B8", // 배경 강조용
          navy:       "#1A2B4A",  // 메인 텍스트/헤더
          "navy-light": "#2C4166",
          gray:       "#6B7280",  // 서브 텍스트
          "gray-light": "#F3F4F6", // 카드/섹션 배경
          "gray-border": "#E5E7EB",
          red:        "#E53E3E",  // 출금/마이너스 금액
          blue:       "#3182CE",  // 입금/플러스 금액
          green:      "#38A169",  // 성공/완료 뱃지
        },
      },
      fontFamily: {
        // 금융 사이트에 어울리는 한글 폰트 (Pretendard 권장)
        sans: ["Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", "sans-serif"],
        mono: ["Roboto Mono", "monospace"], // 계좌번호/금액 표시용
      },
      fontSize: {
        // 금액 표시용 커스텀 크기
        "amount-xl": ["2rem",   { lineHeight: "1.2", fontWeight: "700" }],
        "amount-lg": ["1.5rem", { lineHeight: "1.3", fontWeight: "600" }],
        "amount-md": ["1.125rem", { lineHeight: "1.4", fontWeight: "500" }],
      },
      boxShadow: {
        card: "0 1px 4px 0 rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)",
        "card-hover": "0 4px 12px 0 rgba(0,0,0,0.12)",
        "kb-yellow": "0 2px 8px 0 rgba(255,204,0,0.4)",
      },
      borderRadius: {
        card: "12px",
        pill: "9999px",
      },
      keyframes: {
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition:  "200% 0" },
        },
      },
      animation: {
        shimmer: "shimmer 1.5s infinite linear",
      },
    },
  },
  plugins: [],
};

export default config;
