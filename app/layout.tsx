import type { Metadata, Viewport } from "next"
import { Noto_Sans_KR } from "next/font/google"
import "./globals.css"

const notoSansKR = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
})

export const metadata: Metadata = {
  title: {
    default: "SG Star Banking",
    template: "%s | SG Star Banking",
  },
  description: "국민은행 인터넷뱅킹",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="h-full">
      <body className={`${notoSansKR.className} h-full`}>{children}</body>
    </html>
  )
}
