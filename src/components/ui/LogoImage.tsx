"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * 순차 폴백 `<img>` 프리미티브 — 후보 URL을 앞에서부터 시도하고, 모두 404/로드 실패하면
 * `fallback`(이니셜+색 배지 등)을 렌더한다. 종목 아바타(`Avatar`)·증권사 배지(`BrokerChip`)가
 * 같은 폴백 동작을 공유하도록 한 곳에 둔다(단일 출처). 깨진 이미지 아이콘은 절대 노출하지 않는다.
 */
export function LogoImage({
  srcs,
  alt,
  fit,
  resetKey,
  fallback,
  className,
}: {
  /** 시도할 이미지 URL 후보(앞에서부터). 비었거나 다 실패하면 fallback. */
  srcs: string[];
  alt: string;
  /** "fill": 원을 꽉 채움(회사 브랜드 마크). "inset": 작게 내접(국기·favicon·워드마크). */
  fit: "fill" | "inset";
  /** 이 값이 바뀌면 후보 인덱스를 0으로 리셋(리스트 위치 재사용에 따른 stale 폴백 방지). */
  resetKey: string;
  /** 모든 후보 실패(또는 후보 없음) 시 렌더. */
  fallback: React.ReactNode;
  className?: string;
}) {
  const [failIdx, setFailIdx] = useState(0);
  // props 변화 시 state 보정 패턴 — resetKey 가 바뀌면 다음 렌더에서 첫 후보부터 다시.
  const [prevKey, setPrevKey] = useState(resetKey);
  if (prevKey !== resetKey) {
    setPrevKey(resetKey);
    setFailIdx(0);
  }
  const url = srcs[failIdx] ?? null;
  if (!url) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- 작은 로고, 외부 로고/로컬 SVG라 next/image 불필요
    <img
      src={url}
      alt={alt}
      // 회사 로고(fill)는 원을 꽉 채우고, 국기·favicon(inset)은 작게 내접해 잘림 방지.
      className={cn(
        fit === "inset" ? "h-[72%] w-[72%] object-contain" : "h-full w-full object-contain",
        className,
      )}
      onError={() => setFailIdx((i) => i + 1)}
    />
  );
}
