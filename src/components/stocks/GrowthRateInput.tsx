"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setGrowthRate } from "@/app/stocks/[symbol]/actions";

/**
 * 성장률(고든 성장모형) 직접 입력 — 내재가치 = 오너이익 / (할인율 − 성장률).
 * 기본 0%(무성장=보수적). g 는 할인율보다 낮아야(g≥r → 분모≤0 폭발) → 저장 전 가드.
 * 입력은 %, 저장은 소수(4 → 0.04). 초기화 → 0%.
 */
export function GrowthRateInput({
  symbol,
  currentGrowth,
  discountRate,
}: {
  symbol: string;
  /** 저장된 성장률(소수). null=0%(무성장). */
  currentGrowth: number | null;
  /** 적용 중인 할인율(소수) — g 상한(g<r 가드) 안내. */
  discountRate: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(
    currentGrowth != null && currentGrowth > 0
      ? String(+(currentGrowth * 100).toFixed(2))
      : "",
  );

  const ratePct = (discountRate * 100).toFixed(1);

  function save() {
    const pctNum = val.trim() === "" ? 0 : Number(val);
    if (!(pctNum >= 0 && pctNum < 100)) {
      toast.error("성장률(%)을 0 이상으로 입력하세요.");
      return;
    }
    if (pctNum / 100 >= discountRate) {
      toast.error(`성장률은 할인율(${ratePct}%)보다 낮아야 해요(고든 모형).`);
      return;
    }
    start(async () => {
      const res = await setGrowthRate(symbol, pctNum > 0 ? pctNum / 100 : null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("성장률 적용됨 — 내재가치가 다시 계산돼요");
      setOpen(false);
      router.refresh();
    });
  }
  function reset() {
    start(async () => {
      const res = await setGrowthRate(symbol, null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("성장률 0%(무성장)로 복귀");
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
        성장률 바꾸기
      </button>
    );
  }

  return (
    <div className="mt-1 rounded-lg border border-border bg-card p-2.5">
      <label className="text-[11px] font-medium">
        성장률 g (연, %) · 기본 0%(무성장) · 할인율 {ratePct}% 미만
      </label>
      <div className="mt-1.5 flex gap-2">
        <Input
          type="number"
          inputMode="decimal"
          step="0.1"
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="0"
          className="h-9"
        />
        <Button
          onClick={save}
          disabled={pending}
          className="h-9 bg-primary px-3 text-xs font-semibold text-primary-foreground"
        >
          적용
        </Button>
        {currentGrowth != null && currentGrowth > 0 && (
          <Button
            variant="secondary"
            onClick={reset}
            disabled={pending}
            className="h-9 px-3 text-xs"
          >
            0%
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
        오너이익이 매년 영구히 자랄 비율(고든 모형). 보수적으로 보려면 0%. 할인율에
        가까울수록 내재가치가 급격히 커지니 신중하게.
      </p>
    </div>
  );
}
