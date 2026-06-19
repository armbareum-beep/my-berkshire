"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { WeightBar } from "@/components/ui/WeightBar";
import { clearRebalancePlan } from "@/app/rebalance/actions";
import type { PlanProgress } from "@/lib/plan";

/** "2026-06-15" → "6월 15일". */
function fmtDate(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[1])}월 ${Number(m[2])}일`;
}

/**
 * 자본배분 계획(작전 명령서) — 저장한 리밸런싱 계획의 체결 진행 추적.
 * 일반 카드와 구분되는 헤더 밴드로 "내가 세운 계획"임을 드러낸다.
 * 미체결 종목은 남은 주수로 바로 인수(딥링크, 돌아올 경로 포함). 진행률은 events 파생.
 */
export function PlanCard({ progress }: { progress: PlanProgress }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function clear() {
    startTransition(async () => {
      const res = await clearRebalancePlan();
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("작전을 종료했습니다");
        router.refresh();
      }
    });
  }

  const ratio = progress.total > 0 ? progress.doneCount / progress.total : 0;
  const from = encodeURIComponent(pathname);

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      {/* 헤더 — 흰 표면(파란 면 채움 없음). 파랑은 진행바 점으로만(§무채색). */}
      <div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-bold">
            📋 자본배분 작전
          </span>
          <span className="text-xs text-muted-foreground">
            {fmtDate(progress.createdAt)} 수립
          </span>
        </div>
        <p className="mt-2 text-2xl font-extrabold tabular-nums">
          {progress.doneCount}
          <span className="text-base font-bold text-muted-foreground">
            {" "}
            / {progress.total} 종목 매수 완료
          </span>
        </p>
        <WeightBar weight={ratio} className="mt-2 h-2" />
        <p className="mt-2 text-xs text-muted-foreground">
          {progress.complete
            ? "작전 완료 🎉 계획대로 매수를 마쳤습니다."
            : "세운 계획대로 매수하면 작전이 완료됩니다."}
        </p>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <ul className="flex flex-col gap-2">
          {progress.legs.map((l) => {
            const remaining = Math.max(0, l.shares - l.bought);
            if (l.done) {
              return (
                <li
                  key={l.symbol}
                  className="flex items-center gap-3 p-1 opacity-55"
                >
                  <SymbolAvatar name={l.name} />
                  <span className="flex flex-col">
                    <span className="font-bold">{l.name}</span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {l.shares.toLocaleString()}주 매수 완료
                    </span>
                  </span>
                  <span className="ml-auto text-lg font-semibold text-foreground">✓</span>
                </li>
              );
            }
            return (
              <li key={l.symbol}>
                <Link
                  href={`/transactions?type=BUY&symbol=${encodeURIComponent(
                    l.symbol,
                  )}&qty=${remaining}&from=${from}`}
                  className="flex items-center gap-3 rounded-xl p-1 transition active:scale-[0.99]"
                >
                  <SymbolAvatar name={l.name} />
                  <span className="flex flex-col">
                    <span className="font-bold">{l.name}</span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {remaining.toLocaleString()}주 남음
                      {l.bought > 0 && ` (${l.bought.toLocaleString()}주 완료)`}
                    </span>
                  </span>
                  <span className="ml-auto rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
                    매수
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={clear}
          disabled={pending}
          className="mt-3 w-full rounded-xl py-2 text-sm font-medium text-muted-foreground"
        >
          {progress.complete ? "작전 종료" : "작전 취소"}
        </button>
      </div>
    </section>
  );
}
