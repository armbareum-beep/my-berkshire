"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addFinancingReconciliation } from "@/app/real-estate/actions";

/**
 * 금융비용 보정 입력(spec 012) — 추정 이자를 실제값에 스냅.
 *  · 추정 오차(비용): 실제 납부 이자. 수익률을 깎는다(분자 차감). 기본 선택.
 *  · 내 돈 추가(자본): 부동산에 투입한 자본. 분모(원가)만 늘린다.
 */
export function FinancingReconcileForm({
  today,
  onDone,
  onCancel,
}: {
  today: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(today);
  const [kind, setKind] = useState<"interest_actual" | "capital">(
    "interest_actual",
  );
  const [amount, setAmount] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const amt = Number(amount);
    if (!(amt >= 0) || amount.trim() === "")
      return toast.error("금액을 입력하세요.");
    if (date > today) return toast.error("미래 날짜는 보정할 수 없습니다.");
    startTransition(async () => {
      const res = await addFinancingReconciliation({ date, kind, amount: amt });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("보정을 기록했어요");
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">금융비용 보정</p>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setKind("interest_actual")}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${
            kind === "interest_actual"
              ? "bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground"
          }`}
        >
          추정 오차(비용)
        </button>
        <button
          type="button"
          onClick={() => setKind("capital")}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${
            kind === "capital"
              ? "bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground"
          }`}
        >
          내 돈 추가(자본)
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {kind === "interest_actual"
          ? "실제 납부한 이자·수수료를 입력하면 그날까지 확정되고, 이후만 다시 추정해요."
          : "부동산에 새로 넣은 자본이에요. 수익률 분모(원가)만 늘어나요."}
      </p>
      <input
        type="date"
        value={date}
        max={today}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
      />
      <input
        inputMode="numeric"
        placeholder={
          kind === "interest_actual" ? "실제 납부 이자 (원)" : "투입 자본 (원)"
        }
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm tabular-nums"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground"
        >
          기록
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium"
        >
          취소
        </button>
      </div>
    </div>
  );
}
