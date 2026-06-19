"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * 펀더멘털 기준 셀렉터 — 연도만(가로 스크롤). 다년 평균·추세는 "최근 실적 추이"에 있으므로
 * 셀렉터는 단년 선택만 깔끔하게. 선택은 ?fy= 로 URL 에 박혀 서버가 카드 전체를 그 해 기준으로 재계산.
 */
export function PeriodSelector({
  availableYears,
  current,
}: {
  /** 데이터 있는 연도(최신순). */
  availableYears: number[];
  /** 현재 선택값("2024" …). */
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const chips = [
    { key: "TTM", label: "최근12개월" },
    ...availableYears.slice(0, 5).map((y) => ({
      key: String(y),
      label: String(y),
    })),
  ];

  function select(key: string) {
    const next = new URLSearchParams(params.toString());
    next.set("fy", key);
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  return (
    <div
      className={`grid w-full grid-cols-[1.5fr_repeat(5,minmax(0,1fr))] gap-1 ${
        pending ? "opacity-60" : ""
      }`}
    >
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => select(c.key)}
          className={`min-w-0 whitespace-nowrap rounded-full px-1 py-1.5 text-[10px] font-medium transition sm:text-xs ${
            current === c.key
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground"
          }`}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
