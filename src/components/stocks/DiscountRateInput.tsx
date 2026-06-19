"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setDiscountRate } from "@/app/stocks/[symbol]/actions";

/**
 * 할인율(요구수익률) 직접 입력 — 내재가치 = 오너이익 / 할인율.
 * 가장 주관적인 가정이라 기본 규칙(10년물×2)을 덮어쓸 수 있게. 비우면(초기화) 규칙으로 복귀.
 * 입력은 %, 저장은 소수(9 → 0.09).
 */
export function DiscountRateInput({
  symbol,
  currentRate,
  autoRate,
}: {
  symbol: string;
  /** 저장된 수기 할인율(소수). 없으면 null(기본 규칙 사용 중). */
  currentRate: number | null;
  /** 기본 규칙 할인율(소수) — 플레이스홀더·복귀값 안내. */
  autoRate: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(
    currentRate != null ? String(+(currentRate * 100).toFixed(2)) : "",
  );

  function save() {
    const pctNum = Number(val);
    if (!(pctNum > 0 && pctNum <= 100)) {
      toast.error("할인율(%)을 0~100 사이로 입력하세요.");
      return;
    }
    start(async () => {
      const res = await setDiscountRate(symbol, pctNum / 100);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("할인율 적용됨 — 내재가치가 다시 계산돼요");
      setOpen(false);
      router.refresh();
    });
  }
  function reset() {
    start(async () => {
      const res = await setDiscountRate(symbol, null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`기본 규칙(${(autoRate * 100).toFixed(1)}%)으로 복귀`);
      setVal("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-medium text-primary underline"
      >
        할인율 직접 바꾸기
      </button>
    );
  }

  return (
    <div className="mt-1 rounded-lg border border-border bg-card p-2.5">
      <label className="text-[11px] font-medium">
        할인율 (요구수익률, %) · 기본 {(autoRate * 100).toFixed(1)}%(10년물×2)
      </label>
      <div className="mt-1.5 flex gap-2">
        <Input
          type="number"
          inputMode="decimal"
          step="0.1"
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder={(autoRate * 100).toFixed(1)}
          className="h-9"
        />
        <Button
          onClick={save}
          disabled={pending}
          className="h-9 bg-primary px-3 text-xs font-semibold text-primary-foreground"
        >
          적용
        </Button>
        {currentRate != null && (
          <Button
            variant="secondary"
            onClick={reset}
            disabled={pending}
            className="h-9 px-3 text-xs"
          >
            기본값
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="h-9 px-3 text-xs"
        >
          취소
        </Button>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        높일수록 보수적(내재가치↓). 사업 위험이 크면 높게, 안정적이면 낮게 — 본인 판단이에요.
      </p>
    </div>
  );
}
