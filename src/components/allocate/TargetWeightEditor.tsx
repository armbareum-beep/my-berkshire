"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { setTargetWeight } from "@/app/allocate/actions";
import { pct } from "@/lib/format";

export interface TargetRow {
  symbol: string;
  label: string;
  /** 현재 목표비중 0~1. 안 정했으면 0. */
  target: number;
  /** 현재 실제 비중 0~1. */
  currentWeight: number;
  held: boolean;
}

/**
 * 목표비중 편집 — 스펙 v1.1 §13.2 의 **평면**.
 *
 * 종목당 숫자 하나다. 재설계 전에는 "유형 목표(주식 60%) × 유형 내 목표(그 안에서 META 40%)"
 * 2층이라 META 를 24% 로 만들려면 두 화면에서 두 숫자를 맞춰야 했다. 그게 "목표비중 설정이
 * 어렵다"의 정체였다.
 *
 * 합계 100% 를 강제하지 않는다 — 합이 1 미만이면 나머지는 현금이라는 뜻이다(§16.2).
 * 대신 합계와 남은 비중을 위에 고정해 사용자가 스스로 판단하게 한다.
 */
export function TargetWeightEditor({ rows }: { rows: TargetRow[] }) {
  const total = rows.reduce((s, r) => s + r.target, 0);
  const remaining = 1 - total;

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold">목표비중</p>
        <p className="text-xs tabular-nums text-muted-foreground">
          합계 {pct(total)}
        </p>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {remaining > 0.0001
          ? `남은 ${pct(remaining)}는 현금으로 둡니다.`
          : remaining < -0.0001
            ? "합이 100%를 넘었어요. 넘은 만큼은 비율대로 줄여서 계산합니다."
            : "딱 100%예요."}
      </p>

      <ul className="mt-4 flex flex-col gap-0.5">
        {rows.map((row) => (
          <TargetRowItem key={row.symbol} row={row} />
        ))}
      </ul>

      {rows.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          후보로 고른 종목이 여기 나와요.
        </p>
      )}
    </section>
  );
}

function TargetRowItem({ row }: { row: TargetRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // 퍼센트 문자열로 들고 있다가 저장 직전에만 소수로 바꾼다.
  const [raw, setRaw] = useState(
    row.target > 0 ? String(+(row.target * 100).toFixed(2)) : "",
  );

  function save() {
    const v = raw.trim();
    const next = v === "" ? 0 : Number(v);
    if (!Number.isFinite(next) || next < 0 || next > 100) {
      toast.error("0~100 사이의 숫자를 넣어주세요.");
      setRaw(row.target > 0 ? String(+(row.target * 100).toFixed(2)) : "");
      return;
    }
    // 값이 그대로면 저장하지 않는다(포커스만 옮겨도 요청이 나가지 않게).
    if (Math.abs(next / 100 - row.target) < 1e-9) return;

    start(async () => {
      const res = await setTargetWeight(row.symbol, next / 100);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="flex items-center gap-3 rounded-xl px-1 py-2">
      <SymbolAvatar symbol={row.symbol} name={row.label} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{row.label}</p>
        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
          현재 {pct(row.currentWeight)}
          {!row.held && " · 미보유"}
        </p>
      </div>
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
          placeholder="0"
          aria-label={`${row.label} 목표비중 (%)`}
          className="h-9 w-20 text-right tabular-nums"
        />
        <span className="text-xs text-muted-foreground">%</span>
      </div>
    </li>
  );
}
