"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  QuickAdd,
  WON_STEPS,
  wonStepLabel,
  usdStepLabel,
} from "@/components/ui/QuickAdd";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import {
  setCategoryTargets,
  setTargetWeights,
  saveRebalancePlan,
} from "@/app/rebalance/actions";
import { planInvestment } from "@/lib/rebalance";
import { money, type Currency } from "@/lib/format";

/** 현금 유형 목표 키(유형 라벨과 구분 — 현금은 구성종목 없는 1단계 전용 슬리브). */
const CASH = "현금";
const USD_STEPS = [100, 1_000, 10_000];

export interface SleeveItem {
  symbol: string;
  name: string;
  value: number; // 현재 평가액(표시 통화)
  price: number; // 주당 현재가(표시 통화)
  withinTarget: number; // 0~1 (유형 내 목표비중)
}
export interface Sleeve {
  type: string; // 주식/ETF/원자재/코인
  value: number; // 유형 합계 평가액
  typeTarget: number; // 0~1 (전체 대비 유형 목표)
  items: SleeveItem[];
}

/** 드리프트(현재−목표, %p) 라벨. */
function driftLabel(currentFrac: number, targetPct: number) {
  const d = currentFrac * 100 - targetPct;
  return d >= 0 ? `+${d.toFixed(0)}%p 초과` : `${Math.abs(d).toFixed(0)}%p 부족`;
}

/**
 * 2단계 계층 리밸런싱 — 1단계: 유형 목표(주식/ETF/…/현금, 합 100%),
 * 2단계: 유형 내 종목 목표(유형별 합 100%). 실제 종목비중 = 유형목표 × 유형내목표.
 */
export function SleeveRebalanceEditor({
  sleeves,
  cashValue,
  cashTarget,
  currency,
}: {
  sleeves: Sleeve[];
  cashValue: number;
  cashTarget: number;
  currency: Currency;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const from = encodeURIComponent(pathname);
  const [pending, startTransition] = useTransition();

  const totalValue =
    sleeves.reduce((s, sl) => s + sl.value, 0) + cashValue;

  // 1단계(유형) 목표 퍼센트 문자열 — 슬리브 유형 + 현금
  const initialType = (): Record<string, string> => ({
    ...Object.fromEntries(
      sleeves.map((s) => [
        s.type,
        s.typeTarget > 0 ? String(Math.round(s.typeTarget * 100)) : "",
      ]),
    ),
    [CASH]: cashTarget > 0 ? String(Math.round(cashTarget * 100)) : "",
  });
  // 2단계(유형 내 종목) 목표 퍼센트 문자열 — 심볼별
  const initialWithin = (): Record<string, string> =>
    Object.fromEntries(
      sleeves.flatMap((s) =>
        s.items.map((it) => [
          it.symbol,
          it.withinTarget > 0 ? String(Math.round(it.withinTarget * 100)) : "",
        ]),
      ),
    );

  const [typeTargets, setTypeTargets] = useState<Record<string, string>>(initialType);
  const [withinTargets, setWithinTargets] = useState<Record<string, string>>(initialWithin);
  const [invest, setInvest] = useState("");

  // 저장된 값과 다를 때만 저장 노출(dirty)
  const savedType = initialType();
  const savedWithin = initialWithin();
  const dirty =
    Object.keys(savedType).some((k) => (typeTargets[k] ?? "") !== savedType[k]) ||
    Object.keys(savedWithin).some(
      (k) => (withinTargets[k] ?? "") !== savedWithin[k],
    );

  // 1단계 합계(유형 + 현금)
  const l1Pct =
    sleeves.reduce((s, sl) => s + (Number(typeTargets[sl.type]) || 0), 0) +
    (Number(typeTargets[CASH]) || 0);
  const l1Over = l1Pct > 100;

  // 2단계 합계(슬리브별) — 어느 슬리브든 100% 초과면 저장 막음
  const l2SumOf = (s: Sleeve) =>
    s.items.reduce((acc, it) => acc + (Number(withinTargets[it.symbol]) || 0), 0);
  const l2Over = sleeves.some((s) => l2SumOf(s) > 100);

  // ── 2단계 계산기 ────────────────────────────────────────────────
  const investN = Number(invest) || 0;
  // 1단계: 유형 레벨 배분(현금 포함)
  const l1Plan = planInvestment(
    [
      ...sleeves.map((s) => ({
        key: s.type,
        label: s.type,
        value: s.value,
        targetFrac: (Number(typeTargets[s.type]) || 0) / 100,
      })),
      {
        key: CASH,
        label: CASH,
        value: cashValue,
        targetFrac: (Number(typeTargets[CASH]) || 0) / 100,
      },
    ],
    investN,
  );
  const l1AmountOf = (key: string) =>
    l1Plan.find((p) => p.key === key)?.amount ?? 0;

  // 2단계: 각 유형 내 종목 배분
  const sleevePlans = sleeves.map((s) => {
    const typeAmount = l1AmountOf(s.type);
    const l2 = planInvestment(
      s.items.map((it) => ({
        key: it.symbol,
        label: it.name,
        value: it.value,
        targetFrac: (Number(withinTargets[it.symbol]) || 0) / 100,
      })),
      typeAmount,
    );
    const buys = s.items.map((it) => {
      const amount = l2.find((p) => p.key === it.symbol)?.amount ?? 0;
      const shares = it.price > 0 ? Math.floor(amount / it.price) : 0;
      return { symbol: it.symbol, name: it.name, amount, shares };
    });
    return { type: s.type, typeAmount, buys };
  });
  const cashKeep = l1AmountOf(CASH);
  const planLegs = sleevePlans.flatMap((sp) =>
    sp.buys
      .filter((b) => b.shares > 0)
      .map((b) => ({ symbol: b.symbol, name: b.name, shares: b.shares })),
  );

  function save() {
    // 1단계: 유형 목표(전체 대비) — category_targets["assetType:*"]
    const typeMap: Record<string, number> = {};
    for (const s of sleeves) {
      const v = Number(typeTargets[s.type]);
      if (v > 0) typeMap[s.type] = v / 100;
    }
    const cashV = Number(typeTargets[CASH]);
    if (cashV > 0) typeMap[CASH] = cashV / 100;

    // 2단계: 유형 내 종목 목표(유형별 합=1) — target_weights
    const withinMap: Record<string, number> = {};
    for (const s of sleeves)
      for (const it of s.items) {
        const v = Number(withinTargets[it.symbol]);
        if (v > 0) withinMap[it.symbol] = v / 100;
      }

    startTransition(async () => {
      const r1 = await setCategoryTargets("assetType", typeMap);
      if (!r1.ok) {
        toast.error(r1.error);
        return;
      }
      const r2 = await setTargetWeights(withinMap);
      if (!r2.ok) {
        toast.error(r2.error);
        return;
      }
      toast.success("목표비중 저장됨");
      router.refresh();
    });
  }

  function savePlan() {
    startTransition(async () => {
      const res = await saveRebalancePlan(planLegs);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("자본배분 계획으로 저장됨");
        router.refresh();
      }
    });
  }

  if (sleeves.length === 0) {
    return (
      <div className="rounded-2xl bg-card p-6 text-center shadow-card">
        <p className="text-sm text-muted-foreground">보유 종목이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 유형 슬리브 — 헤더(유형 목표) + 유형 내 종목(유형내 목표) */}
      {sleeves.map((s) => {
        const typePct = Number(typeTargets[s.type]) || 0;
        const typeSet = typeTargets[s.type] !== "" && typePct > 0;
        const sleeveWeight = totalValue > 0 ? s.value / totalValue : 0;
        const l2sum = l2SumOf(s);
        return (
          <section key={s.type} className="rounded-2xl bg-card p-4 shadow-card">
            {/* 유형 헤더(1단계) */}
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <span className="font-bold">{s.type}</span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  현재 {(sleeveWeight * 100).toFixed(0)}%
                  {typeSet && <> · {driftLabel(sleeveWeight, typePct)}</>}
                </span>
              </div>
              <div className="ml-auto flex items-center gap-1">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  placeholder="유형 목표"
                  value={typeTargets[s.type] ?? ""}
                  onChange={(e) =>
                    setTypeTargets((t) => ({ ...t, [s.type]: e.target.value }))
                  }
                  className="h-10 w-16 text-right"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>

            {/* 유형 내 종목(2단계) — 유형별 합 100% */}
            <ul className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
              {s.items.map((it) => {
                const wPct = Number(withinTargets[it.symbol]) || 0;
                const wSet = withinTargets[it.symbol] !== "" && wPct > 0;
                const withinNow = s.value > 0 ? it.value / s.value : 0;
                return (
                  <li key={it.symbol} className="flex items-center gap-3">
                    <SymbolAvatar name={it.name} />
                    <div className="flex flex-col">
                      <span className="font-semibold">{it.name}</span>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        유형 내 {(withinNow * 100).toFixed(0)}%
                        {wSet && <> · {driftLabel(withinNow, wPct)}</>}
                      </span>
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        placeholder="목표"
                        value={withinTargets[it.symbol] ?? ""}
                        onChange={(e) =>
                          setWithinTargets((t) => ({
                            ...t,
                            [it.symbol]: e.target.value,
                          }))
                        }
                        className="h-10 w-16 text-right"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </li>
                );
              })}
            </ul>
            {l2sum > 100 && (
              <p className="mt-2 text-right text-xs text-rise tabular-nums">
                {s.type} 내 합계 {l2sum}% — 100%를 넘을 수 없습니다
              </p>
            )}
          </section>
        );
      })}

      {/* 현금 — 1단계 전용 슬리브(구성종목 없음) */}
      <section className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-card">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-base font-bold text-secondary-foreground">
          ₩
        </span>
        <div className="flex flex-col">
          <span className="font-bold">현금</span>
          <span className="text-sm text-muted-foreground tabular-nums">
            현재 {totalValue > 0 ? ((cashValue / totalValue) * 100).toFixed(0) : 0}%
            {(Number(typeTargets[CASH]) || 0) > 0 && (
              <>
                {" · "}
                {driftLabel(
                  totalValue > 0 ? cashValue / totalValue : 0,
                  Number(typeTargets[CASH]) || 0,
                )}
              </>
            )}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            placeholder="유형 목표"
            value={typeTargets[CASH] ?? ""}
            onChange={(e) =>
              setTypeTargets((t) => ({ ...t, [CASH]: e.target.value }))
            }
            className="h-10 w-16 text-right"
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      </section>

      {/* 변경됐을 때만 합계·저장 노출 */}
      {dirty && (
        <>
          <p
            className="text-center text-sm tabular-nums"
            style={{
              color: l1Pct === 100 ? "var(--muted-foreground)" : "var(--warn)",
            }}
          >
            유형 목표 합계 {l1Pct}%
            {l1Over
              ? " — 100%를 넘을 수 없습니다"
              : l1Pct !== 100 && " — 100%를 권장"}
          </p>
          <Button
            onClick={save}
            disabled={pending || l1Over || l2Over}
            className="h-12 w-full bg-primary font-semibold text-primary-foreground"
          >
            {pending
              ? "저장 중…"
              : l1Over || l2Over
                ? "합계 100% 초과"
                : "목표비중 저장"}
          </Button>
        </>
      )}

      {/* 2단계 리밸런싱 계산기 */}
      <div className="mt-4 rounded-2xl bg-card p-5 shadow-card">
        <p className="text-sm font-semibold">얼마 넣으면 어디에 살까?</p>
        <p className="mt-1 text-xs text-muted-foreground">
          넣을 금액을 유형 목표에 맞춰 부족한 유형에 배분하고, 유형 안에서는 종목 목표대로
          나눕니다. 현금 목표만큼은 남깁니다.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            placeholder={currency === "USD" ? "예: 3000" : "예: 4000000"}
            value={invest}
            onChange={(e) => setInvest(e.target.value)}
            className="h-12 text-lg"
          />
          <span className="text-sm text-muted-foreground">
            {currency === "USD" ? "달러" : "원"}
          </span>
        </div>
        <QuickAdd
          value={invest}
          onChange={setInvest}
          steps={currency === "USD" ? USD_STEPS : WON_STEPS}
          label={currency === "USD" ? usdStepLabel : wonStepLabel}
        />

        {investN > 0 && l1Pct > 0 && (
          <>
            <p className="mt-4 text-xs text-muted-foreground">
              종목을 누르면 그 수량으로 바로 매수 화면이 열려요.
            </p>
            <ul className="mt-2 flex flex-col gap-3">
              {sleevePlans.map((sp) => {
                if (sp.typeAmount <= 0) return null;
                return (
                  <li key={sp.type} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">{sp.type}</span>
                      <span className="font-semibold tabular-nums">
                        {money(sp.typeAmount, currency)}
                      </span>
                    </div>
                    <ul className="ml-1 flex flex-col gap-1">
                      {sp.buys.map((b) => {
                        const row = (
                          <>
                            <span>{b.name}</span>
                            <span className="ml-auto tabular-nums text-muted-foreground">
                              {b.shares.toLocaleString()}주 ·{" "}
                              {money(b.amount, currency)}
                            </span>
                            {b.shares > 0 && (
                              <span className="text-muted-foreground">›</span>
                            )}
                          </>
                        );
                        return b.shares > 0 ? (
                          <li key={b.symbol}>
                            <Link
                              href={`/transactions?type=BUY&symbol=${encodeURIComponent(
                                b.symbol,
                              )}&qty=${b.shares}&from=${from}`}
                              className="flex items-center gap-2 text-sm transition active:scale-[0.99]"
                            >
                              {row}
                            </Link>
                          </li>
                        ) : (
                          <li
                            key={b.symbol}
                            className="flex items-center gap-2 text-sm text-muted-foreground"
                          >
                            {row}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
              {/* 현금으로 남길 금액 */}
              {cashKeep > 0 && (
                <li className="flex items-center justify-between">
                  <span className="font-bold">
                    현금
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      현금으로 남김
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">
                    {money(cashKeep, currency)}
                  </span>
                </li>
              )}
            </ul>
            {planLegs.length > 0 && (
              <>
                <Button
                  onClick={savePlan}
                  disabled={pending}
                  className="mt-4 h-12 w-full bg-primary font-semibold text-primary-foreground"
                >
                  📋 이 계획 세우기
                </Button>
                <p className="mt-1.5 text-center text-xs text-muted-foreground">
                  세워두면 홈에서 진행을 추적하고, 까먹지 않게 알려드려요.
                </p>
              </>
            )}
            <Link
              href={`/transactions?type=BUY&from=${from}`}
              className="mt-2 flex h-11 w-full items-center justify-center rounded-xl bg-secondary text-sm font-semibold text-secondary-foreground"
            >
              계획 없이 바로 매수
            </Link>
          </>
        )}
        {investN > 0 && l1Pct === 0 && (
          <p className="mt-3 text-sm text-rise">먼저 유형 목표비중을 설정하세요.</p>
        )}
      </div>
    </div>
  );
}
