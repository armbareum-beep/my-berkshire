"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { setTargetWeight } from "@/app/allocate/actions";
import { cashKey } from "@/lib/targetLens";
import { currencyMeta, nativeMoney } from "@/lib/finance/currencies";
import { money, pct, type Currency } from "@/lib/format";

export interface CurrencyRow {
  currency: string;
  /** 네이티브 잔액(₩·$·¥). */
  native: number;
  /** 표시통화 환산 평가액. */
  value: number;
  /** 현금 안에서의 비중 0~1. */
  weight: number;
  /** 전체(금융자산+현금) 대비 목표 0~1. */
  target: number;
}

/**
 * 통화별 현금 목표 — 달러·엔·원화를 얼마나 들고 갈지.
 *
 * 목표는 `CASH:USD` 예약 키로 **종목과 같은 평면 맵**에 저장된다(`lib/targetLens.ts`).
 * 새 저장 형식을 만들지 않으므로 스펙 §13.2 의 평면 원칙이 그대로다.
 *
 * 배분 레일은 이 목표를 쓰지 않는다 — 통화를 늘리는 건 매수가 아니라 **환전**이라
 * buy-only 배분과 성격이 다르다. 여기서는 목표와 갭만 보여준다.
 */
export function CurrencyTargetList({
  rows,
  currency,
}: {
  rows: CurrencyRow[];
  currency: Currency;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <CurrencyRowItem key={r.currency} row={r} currency={currency} />
      ))}
    </ul>
  );
}

function CurrencyRowItem({
  row,
  currency,
}: {
  row: CurrencyRow;
  currency: Currency;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [raw, setRaw] = useState(String(+(row.target * 100).toFixed(1)));
  const meta = currencyMeta(row.currency);

  function save() {
    const v = raw.trim();
    const next = v === "" ? 0 : Number(v);
    if (!Number.isFinite(next) || next < 0 || next > 100) {
      toast.error("0~100 사이의 숫자를 넣어주세요.");
      setRaw(String(+(row.target * 100).toFixed(1)));
      return;
    }
    if (Math.abs(next / 100 - row.target) < 1e-9) return;

    start(async () => {
      const res = await setTargetWeight(cashKey(row.currency), next / 100);
      if (!res.ok) {
        toast.error(res.error);
        setRaw(String(+(row.target * 100).toFixed(1)));
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-card">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-lg">
        {meta.flag}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{meta.name}</p>
        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
          {pct(row.weight)} · {nativeMoney(row.native, row.currency)}
          {row.currency !== currency && ` · ${money(row.value, currency)}`}
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
          aria-label={`${meta.name} 목표비중 (%)`}
          className="h-9 w-[4.5rem] text-right tabular-nums"
        />
        <span className="text-xs text-muted-foreground">%</span>
      </div>
    </li>
  );
}
