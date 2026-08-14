"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { setTargetWeight } from "@/app/allocate/actions";

/**
 * 종목 한 줄의 목표비중 입력.
 *
 * 검색형 편집기를 걷어내면서(*"새로운거 말고 기존꺼만 리밸런싱"*) **개별 종목 목표를 정할
 * 곳이 하나도 안 남았다.** 묶음(유형·국가·통화) 조절만으로는 "삼성전자를 8%로" 같은 조정을
 * 할 수 없다 — 기존 것을 리밸런싱하려면 종목 줄에서 바로 고쳐져야 한다.
 *
 * 기준은 **투자자산 대비**다. 같은 줄에 표시되는 목표와 같은 기준이라야 넣은 값이 그대로
 * 보인다(줄의 `현재 %`는 이 계층 안 기준이라 다르다 — 화면 각주가 그 둘을 구분해 말한다).
 */
export function RowTargetInput({
  symbol,
  label,
  target,
}: {
  symbol: string;
  label: string;
  /** 투자자산 대비 목표 0~1. */
  target: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [raw, setRaw] = useState(String(+(target * 100).toFixed(1)));

  function save() {
    const v = raw.trim();
    const next = v === "" ? 0 : Number(v);
    if (!Number.isFinite(next) || next < 0 || next > 100) {
      toast.error("0~100 사이의 숫자를 넣어주세요.");
      setRaw(String(+(target * 100).toFixed(1)));
      return;
    }
    if (Math.abs(next / 100 - target) < 1e-9) return;

    start(async () => {
      const res = await setTargetWeight(symbol, next / 100);
      if (!res.ok) {
        toast.error(res.error);
        setRaw(String(+(target * 100).toFixed(1)));
        return;
      }
      if (next === 0) toast.success(`${label} 목표비중을 지웠어요`);
      router.refresh();
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Input
        type="number"
        inputMode="decimal"
        step="any"
        value={raw}
        disabled={pending}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        aria-label={`${label} 목표비중 (%)`}
        className="h-9 w-[4.5rem] text-right tabular-nums"
      />
      <span className="text-xs text-muted-foreground">%</span>
    </div>
  );
}
