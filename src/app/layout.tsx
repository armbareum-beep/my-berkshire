import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "ENUF",
  description: "개인 투자 지주회사 운영 콘솔",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 폰트는 Pretendard 단일(globals.css의 --font-sans / CDN import). next/font Geist 미사용.
  return (
    <html lang="ko" className="h-full font-sans antialiased">
      <body className="min-h-dvh">
        {/* 모바일 전용 단일 레이아웃 — 데스크탑에서도 중앙 480px 고정, 양옆 여백 */}
        <div className="mx-auto min-h-dvh w-full max-w-[480px] bg-background">
          {children}
        </div>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
