import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { MarketAutoRefresh } from "@/components/MarketAutoRefresh";

export const metadata: Metadata = {
  title: "ENUF",
  description: "개인 투자 지주회사 운영 콘솔",
};

// viewportFit:"cover" — 노치/홈 인디케이터 기기에서 화면을 세이프에어리어 밖까지 채운다.
// 하단 탭바의 env(safe-area-inset-bottom) 패딩(BottomTabBar.tsx)이 이 설정 없이는 iOS에서 0으로 계산된다.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
  sheet,
}: Readonly<{
  children: React.ReactNode;
  sheet: React.ReactNode;
}>) {
  // 폰트는 Pretendard 단일(globals.css의 --font-sans / CDN import). next/font Geist 미사용.
  return (
    <html lang="ko" className="h-full font-sans antialiased">
      <body className="min-h-dvh">
        {/* 모바일 전용 단일 레이아웃 — 데스크탑에서도 중앙 480px 고정, 양옆 여백 */}
        <div className="mx-auto min-h-dvh w-full max-w-[480px] bg-background">
          {children}
        </div>
        {/* 상세 바텀시트(드롭시트) 슬롯 — fixed 오버레이로 컬럼 위에 뜬다. 비활성 시 default→null */}
        {sheet}
        <MarketAutoRefresh />
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
