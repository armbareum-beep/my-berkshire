"use client"; // 에러 바운더리는 클라이언트 컴포넌트여야 한다

import "./globals.css";

/**
 * 루트 레이아웃 자체가 죽었을 때의 최후 폴백 — 자체 html/body 필수.
 * globals.css 를 직접 import 해 폰트·토큰을 유지한다.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="ko" className="h-full font-sans antialiased">
      <body className="min-h-dvh">
        <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center gap-2 bg-background px-6 text-center">
          <p className="text-4xl">⚠️</p>
          <h1 className="mt-2 text-xl font-bold">문제가 발생했어요</h1>
          <p className="text-sm text-muted-foreground">
            잠시 후 다시 시도해 주세요.
            {error.digest && (
              <span className="mt-1 block text-xs">오류 코드: {error.digest}</span>
            )}
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="mt-4 inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            다시 시도
          </button>
        </main>
      </body>
    </html>
  );
}
