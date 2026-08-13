"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { setInvestableCash } from "@/app/allocate/actions";
import { money, type Currency } from "@/lib/format";

/**
 * 투자 가능 현금 — 스펙 v1.1 §16.4.
 *
 * ```text
 * 전체 현금:      200,000,000원   ← 순자산이 보는 금액
 * 투자 가능 현금:  50,000,000원   ← Allocate 가 쓰는 금액
 * ```
 *
 * 둘을 나누는 이유는 "생활비와 비상금까지 배분 대상으로 삼지는 않는다"이다.
 * 안 정하면 보유 현금 전액을 쓴다 — 지금까지의 동작.
 */
export function InvestableCashCard({
  value,
  cash,
  currency,
  isSet,
}: {
  /** 현재 적용 중인 투자 가능 현금(표시통화). */
  value: number;
  /** 보유 현금 전액(표시통화). */
  cash: number;
  currency: Currency;
  isSet: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState(isSet ? String(Math.floor(value)) : "");

  function save(next: number | null) {
    start(async () => {
      const res = await setInvestableCash(next, currency);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        next == null ? "보유 현금 전액을 씁니다" : "투자 가능 현금을 정했어요",
      );
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">투자 가능 현금</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            배분에 쓸 금액. 생활비는 빼두세요
          </p>
        </div>
        <p className="shrink-0 text-lg font-bold tabular-nums">
          {money(value, currency)}
        </p>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        보유 현금 {money(cash, currency)}
        {!isSet && " · 지금은 전액을 씁니다"}
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 text-[11px] font-medium text-primary underline"
        >
          금액 정하기
        </button>
      ) : (
        <div className="mt-3 rounded-lg border border-border p-3">
          <Input
            inputMode="numeric"
            value={raw}
            placeholder={String(Math.floor(cash))}
            onChange={(e) => setRaw(e.target.value.replace(/[^\d]/g, ""))}
            aria-label="투자 가능 현금"
            className="h-11 text-right text-lg font-bold tabular-nums"
          />
          <div className="mt-3 flex gap-2">
            <Button
              onClick={() => {
                const v = Number(raw);
                if (raw.trim() === "" || !Number.isFinite(v) || v < 0) {
                  toast.error("0 이상의 금액을 넣어주세요.");
                  return;
                }
                save(v);
              }}
              disabled={pending}
              className="h-9 flex-1 bg-primary text-xs font-semibold text-primary-foreground"
            >
              저장
            </Button>
            <Button
              variant="secondary"
              onClick={() => save(null)}
              disabled={pending}
              className="h-9 px-3 text-xs"
            >
              전액 쓰기
            </Button>
            <Button
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="h-9 px-3 text-xs"
            >
              취소
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
