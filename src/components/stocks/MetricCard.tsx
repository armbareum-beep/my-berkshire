"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BarChart3, Info, X } from "lucide-react";
import { METRIC_INFO } from "@/lib/metricInfo";
import { useMounted } from "@/components/ui/useMounted";

/**
 * 기본지표 한 칸 — 탭하면 교육 모달(설명 + 회사 맥락). 설명이 있는 지표만 탭 가능(ⓘ).
 * 톤: 중립·교육용(매수 추천 아님). 라벨(k)로 METRIC_INFO 매핑.
 */
export function Metric({
  k,
  v,
  hint,
  context,
}: {
  k: string;
  v: string;
  hint: string;
  /** 회사별 맥락(예: "5년 평균 12배 대비 높음"). 있으면 모달 강조 박스. */
  context?: string;
}) {
  const info = METRIC_INFO[k];
  const [open, setOpen] = useState(false);
  const mounted = useMounted();

  // 모달 열려있을 때만 스크롤 락 + ESC 닫기(트리거 버튼은 그대로 인라인)
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => info && setOpen(true)}
        className="flex flex-col text-left"
        aria-label={info ? `${k} 설명` : undefined}
      >
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {k}
          {info && <Info size={11} className="text-primary" aria-hidden />}
        </span>
        <span className="text-lg font-extrabold tabular-nums">{v}</span>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </button>

      {mounted && open && info && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-card p-5 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-base font-bold">{info.title}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="touch-target shrink-0 text-muted-foreground"
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mt-1 text-sm font-semibold tabular-nums text-primary">
              현재 {v}
            </p>
            <p className="mt-3 text-sm leading-relaxed">{info.explain}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {info.read}
            </p>
            {context && (
              <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-secondary p-3 text-sm leading-relaxed">
                <BarChart3 size={15} className="mt-0.5 shrink-0" />
                <span>{context}</span>
              </p>
            )}
            <p className="mt-3 text-[11px] text-muted-foreground">
              교육용 설명 · 매수 추천 아님
            </p>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
