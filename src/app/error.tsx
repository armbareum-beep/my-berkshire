"use client"; // 에러 바운더리는 클라이언트 컴포넌트여야 한다

import { useEffect } from "react";
import Link from "next/link";

/**
 * 루트 에러 바운더리 — 서버 컴포넌트·외부 API(시세/공시) 실패 시
 * Next 기본(영문) 화면 대신 토스풍 안내를 보여준다.
 * unstable_retry 는 세그먼트를 다시 fetch·렌더한다(일시 장애 복구).
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // 프로덕션은 digest만 내려오므로 서버 로그와 대조용으로 남긴다.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-4xl">⚠️</p>
      <h1 className="mt-2 text-xl font-bold">일시적인 오류가 발생했어요</h1>
      <p className="text-sm text-muted-foreground">
        데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
        {error.digest && (
          <span className="mt-1 block text-xs">오류 코드: {error.digest}</span>
        )}
      </p>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
        >
          다시 시도
        </button>
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-xl bg-secondary px-5 text-sm font-semibold text-secondary-foreground"
        >
          홈으로
        </Link>
      </div>
    </main>
  );
}
