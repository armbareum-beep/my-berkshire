"use client";

import { useState } from "react";
import Link from "next/link";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { AccountGroups } from "@/components/dashboard/AccountGroups";
import { qtyUnit } from "@/lib/securities";
import {
  money,
  signedMoneyShort,
  pct,
  changeColor,
  type Currency,
} from "@/lib/format";
import type { AccountGroup, AccountHolding } from "@/lib/accounts";

type SortKey = "value" | "rate" | "gain" | "name";
type Mode = "account" | "flat";

const SORT_LABEL: Record<SortKey, string> = {
  value: "평가액",
  rate: "수익률",
  gain: "수익금",
  name: "이름",
};

/** 정렬 비교 — value/rate/gain 은 숫자(널 뒤로), name 은 가나다. */
function numOf(x: { value: number; changeRate: number | null; gain: number | null }, key: SortKey) {
  if (key === "value") return x.value;
  if (key === "rate") return x.changeRate;
  return x.gain; // gain
}
function makeCmp<T extends { name: string; value: number; changeRate: number | null; gain: number | null }>(
  key: SortKey,
  dir: "asc" | "desc",
) {
  return (a: T, b: T) => {
    if (key === "name") {
      return dir === "asc"
        ? a.name.localeCompare(b.name, "ko")
        : b.name.localeCompare(a.name, "ko");
    }
    const av = numOf(a, key);
    const bv = numOf(b, key);
    if (av == null && bv == null) return 0;
    if (av == null) return 1; // 널은 항상 뒤로
    if (bv == null) return -1;
    return dir === "asc" ? av - bv : bv - av;
  };
}

/**
 * 보유 종목 탐색 — 계좌별(그룹) ↔ 전체 종목(평탄 랭킹) 토글 + 정렬(평가액/수익률/수익금/이름).
 * 데이터는 서버에서 받은 AccountGroup[] 만 클라이언트에서 정렬(추가 요청 없음).
 */
export function HoldingsBrowser({
  groups,
  currency,
}: {
  groups: AccountGroup[];
  currency: Currency;
}) {
  const [mode, setMode] = useState<Mode>("account");
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  // 정렬 키 누르면: 같은 키 → 방향 토글, 다른 키 → 그 키로(이름은 오름차순, 나머진 내림차순 기본).
  function pick(k: SortKey) {
    if (k === sortKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setDir(k === "name" ? "asc" : "desc");
    }
  }

  // 계좌별: 그룹 정렬 + 각 그룹 내부 보유 정렬.
  const sortedGroups: AccountGroup[] = [...groups]
    .sort(makeCmp(sortKey, dir))
    .map((g) => ({ ...g, holdings: [...g.holdings].sort(makeCmp(sortKey, dir)) }));

  // 전체: 모든 보유를 한 줄로(계좌 태그 부착) 평탄화 후 정렬.
  type FlatRow = AccountHolding & { accountName: string };
  const flat: FlatRow[] = groups
    .flatMap((g) => g.holdings.map((h) => ({ ...h, accountName: g.name })))
    .sort(makeCmp(sortKey, dir));

  return (
    <div className="flex flex-col gap-3">
      {/* 컨트롤 — 그룹 모드 + 정렬 키 */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-1 rounded-full bg-secondary p-1 text-sm font-semibold">
          {(["account", "flat"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={
                "flex-1 rounded-full py-1.5 transition " +
                (mode === m
                  ? "bg-card shadow-card"
                  : "text-muted-foreground")
              }
            >
              {m === "account" ? "계좌별" : "전체 종목"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => {
            const active = k === sortKey;
            return (
              <button
                key={k}
                type="button"
                onClick={() => pick(k)}
                className={
                  "rounded-full px-3 py-1.5 text-sm font-medium transition " +
                  (active
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground")
                }
              >
                {SORT_LABEL[k]}
                {active ? (dir === "asc" ? " ↑" : " ↓") : ""}
              </button>
            );
          })}
        </div>
      </div>

      {/* 본문 */}
      {mode === "account" ? (
        <AccountGroups groups={sortedGroups} currency={currency} />
      ) : (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <ul className="flex flex-col gap-1">
            {flat.map((h) => (
              <li key={`${h.accountName}-${h.symbol}`}>
                <Link
                  href={`/stocks/${h.symbol}`}
                  className="flex items-center gap-3 rounded-xl py-2 transition active:scale-[0.99]"
                >
                  <SymbolAvatar name={h.name} symbol={h.symbol} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{h.name}</span>
                    <span className="truncate text-sm text-muted-foreground">
                      {h.accountName} · {h.quantity.toLocaleString()}
                      {qtyUnit(h.symbol)}
                    </span>
                  </span>
                  <span className="ml-auto flex flex-col items-end">
                    <span className="font-semibold tabular-nums">
                      {money(h.value, currency)}
                    </span>
                    {h.changeRate !== null && (
                      <span
                        className="text-sm font-medium tabular-nums"
                        style={{ color: changeColor(h.changeRate) }}
                      >
                        {signedMoneyShort(h.gain ?? 0, currency)} (
                        {pct(Math.abs(h.changeRate))})
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
