"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { brandLogoLabel } from "@/lib/finance/brandColor";
import { assetImage } from "@/lib/finance/assetImage";

const SIZE = {
  sm: "h-7 w-7 text-[9px]",
  md: "h-9 w-9 text-[10px]",
  lg: "h-10 w-10 text-[11px]",
} as const;

export function Avatar({
  name,
  symbol,
  size = "lg",
  className,
}: {
  name: string;
  symbol?: string;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  // 후보 URL을 앞에서부터 시도. 404/로드 실패 시 다음 후보, 다 떨어지면 텍스트 폴백.
  const { srcs, fit } = assetImage(symbol, name);
  const key = symbol ?? name;
  const [failIdx, setFailIdx] = useState(0);
  // 리스트 위치 재사용으로 symbol 이 바뀌면 후보 인덱스를 리셋(stale 폴백 방지) — props 변화 시 state 보정 패턴.
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setFailIdx(0);
  }
  const url = srcs[failIdx] ?? null;
  const { bg, fg, label } = brandLogoLabel(symbol, name);
  const textClass = label.length === 1 ? "text-base font-bold" : "font-bold leading-none";

  if (url) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary",
          SIZE[size],
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- 작은 로고, 외부 로고/로컬 SVG라 next/image 불필요 */}
        <img
          src={url}
          alt={name}
          // 회사 로고(fill)는 원을 꽉 채우고, 국기·운용사 favicon(inset)은 작게 내접해 잘림 방지.
          className={fit === "inset" ? "h-[72%] w-[72%] object-contain" : "h-full w-full object-contain"}
          onError={() => setFailIdx((i) => i + 1)}
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        SIZE[size],
        className,
      )}
      style={{ backgroundColor: bg, color: fg }}
    >
      <span className={textClass}>{label}</span>
    </span>
  );
}
