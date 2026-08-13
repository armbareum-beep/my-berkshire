"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { setUniverseStatus } from "@/app/allocate/actions";
import { groupBySector, type UniverseStatus } from "@/lib/universe";
import { moneyCompact, type Currency } from "@/lib/format";

export interface UniverseRow {
  symbol: string;
  name: string;
  status: UniverseStatus;
  held: boolean;
  /** 현재 평가액(표시통화). 미보유면 0. */
  value: number;
  sector: string | null;
}

/**
 * 자본배분 후보 관리 — Capital Allocator PRD v0.3 §3.1 Approved Universe.
 *
 * > 기업 선택은 인간의 영역이고, 가격과 자본배분은 시스템의 영역이다.
 *
 * 그래서 이 화면은 **고르는 일만** 한다. 좋은 기업인지 점수를 매기거나 추천하지 않는다.
 * 산업별로 묶어 보여주는 이유도 같다 — 어디에 쏠려 있는지 사람이 보고 판단하라는 것.
 */
export function UniversePanel({
  rows,
  currency,
}: {
  rows: UniverseRow[];
  currency: Currency;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // 낙관적 표시 — 서버 왕복 동안 토글이 굳어 보이지 않게.
  const [pendingSymbol, setPendingSymbol] = useState<string | null>(null);

  const sectorOf = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const r of rows) m[r.symbol] = r.sector;
    return m;
  }, [rows]);

  const groups = useMemo(
    () => groupBySector(rows, (s) => sectorOf[s]),
    [rows, sectorOf],
  );

  const approved = rows.filter((r) => r.status === "APPROVED");

  function toggle(row: UniverseRow) {
    const next: UniverseStatus = row.status === "APPROVED" ? "WATCH" : "APPROVED";
    setPendingSymbol(row.symbol);
    start(async () => {
      const res = await setUniverseStatus(row.symbol, next);
      setPendingSymbol(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        next === "APPROVED"
          ? `${row.name} — 자본배분 후보에 넣었어요`
          : `${row.name} — 후보에서 뺐어요`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <p className="text-sm font-semibold">
          후보 {approved.length}종목 / 전체 {rows.length}종목
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          후보만 자본배분 대상이 됩니다. 아직 한 주도 없는 기업도 후보로 넣을 수 있어요 —
          목표비중을 정해두면 첫 매수부터 배분안에 나옵니다.
        </p>
        <Link
          href="/search"
          className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-secondary px-5 text-sm font-semibold transition active:scale-[0.98]"
        >
          기업 찾아서 추가하기
        </Link>
      </section>

      {groups.length === 0 ? (
        <div className="rounded-2xl bg-card p-6 text-center shadow-card">
          <p className="text-sm text-muted-foreground">
            아직 종목이 없어요. 기업을 찾아 후보로 넣어보세요.
          </p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.sector} className="rounded-2xl bg-card p-5 shadow-card">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-semibold">{group.sector}</p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {group.items.filter((i) => i.status === "APPROVED").length}/
                {group.items.length}
              </p>
            </div>

            <ul className="mt-3 flex flex-col gap-1">
              {group.items.map((row) => {
                const on = row.status === "APPROVED";
                const busy = pending && pendingSymbol === row.symbol;
                return (
                  <li
                    key={row.symbol}
                    className="flex items-center gap-3 rounded-xl px-1 py-2"
                  >
                    <Link
                      href={`/stocks/${row.symbol}`}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <SymbolAvatar symbol={row.symbol} name={row.name} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{row.name}</p>
                        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                          {row.held
                            ? `보유 ${moneyCompact(row.value, currency)}`
                            : "미보유"}
                        </p>
                      </div>
                    </Link>

                    <button
                      type="button"
                      onClick={() => toggle(row)}
                      disabled={busy}
                      aria-pressed={on}
                      className={
                        "shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition active:scale-[0.97] disabled:opacity-50 " +
                        (on ? "bg-accent text-primary" : "bg-secondary text-muted-foreground")
                      }
                    >
                      {on ? "후보" : "관심"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <p className="px-2 text-xs leading-relaxed text-muted-foreground">
        이 앱은 좋은 기업인지 평가하지 않아요. 기업을 고르는 건 사람이 하고, 가격과 배분은
        시스템이 계산합니다. 산업별로 묶어 보여주는 건 어디에 쏠려 있는지 직접 보시라는
        뜻이에요.
      </p>
    </div>
  );
}
