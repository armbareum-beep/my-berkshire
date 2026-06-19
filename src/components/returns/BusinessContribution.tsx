"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import {
  computeReturnWithoutBusinesses,
  type BusinessCandidate,
} from "@/lib/finance/businessContribution";
import type { ReturnResult } from "@/lib/finance/returns";
import type { InvestmentEvent, PriceMap } from "@/lib/finance/valuation";
import { signedPct, changeColor } from "@/lib/format";

export function BusinessContribution({
  holding,
  events,
  prices,
  today,
  baseline,
  candidates,
}: {
  holding: { foundedAt: string; initialValuation: number };
  events: InvestmentEvent[];
  prices: PriceMap;
  today: string;
  baseline: ReturnResult;
  candidates: BusinessCandidate[];
}) {
  const [excluded, setExcluded] = useState<string[]>([]);
  const result = useMemo(
    () =>
      computeReturnWithoutBusinesses(
        holding,
        events,
        prices,
        today,
        excluded,
        baseline.status !== "price_unavailable",
      ),
    [baseline.status, events, excluded, holding, prices, today],
  );
  const baselineRate = baseline.xirr ?? baseline.cumulativeReturn;
  const resultRate = result.xirr ?? result.cumulativeReturn;
  const difference =
    baselineRate != null && resultRate != null ? resultRate - baselineRate : null;
  const rateKind = baseline.xirr != null ? "XIRR" : "누적수익률";

  const toggle = (symbol: string) => {
    setExcluded((current) =>
      current.includes(symbol)
        ? current.filter((item) => item !== symbol)
        : [...current, symbol],
    );
  };

  return (
    <section id="contribution" className="scroll-mt-6 rounded-2xl bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">사업부 기여도</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            체크한 사업부를 인수하지 않았다면 수익률이 어땠을지 계산합니다.
          </p>
        </div>
        {excluded.length > 0 && (
          <button
            type="button"
            onClick={() => setExcluded([])}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground"
          >
            <RotateCcw size={13} /> 초기화
          </button>
        )}
      </div>

      <div className="mt-4 rounded-xl bg-secondary p-4">
        <div className="grid grid-cols-2 gap-4">
          <Rate label={`실제 ${rateKind}`} value={baselineRate} />
          <Rate
            label={excluded.length ? `제외 후 ${rateKind}` : "비교 결과"}
            value={excluded.length ? resultRate : null}
          />
        </div>
        {excluded.length > 0 && difference != null && (
          <p className="mt-3 border-t border-border pt-3 text-sm font-semibold">
            {difference > 0
              ? `이 사업부들을 빼면 ${signedPct(Math.abs(difference), 2)}p 높아집니다.`
              : difference < 0
                ? `이 사업부들이 ${signedPct(Math.abs(difference), 2).replace("+", "")}p 기여했습니다.`
                : "제외 전후 수익률이 같습니다."}
          </p>
        )}
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">
          빼고 비교할 사업부
        </p>
        <div className="flex flex-col gap-1">
          {candidates.map((candidate) => {
            const checked = excluded.includes(candidate.symbol);
            return (
              <button
                type="button"
                key={candidate.symbol}
                aria-pressed={checked}
                onClick={() => toggle(candidate.symbol)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition active:scale-[0.99] ${
                  checked
                    ? "border-primary bg-primary/10"
                    : "border-transparent hover:bg-secondary"
                }`}
              >
                <SymbolAvatar name={candidate.name} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {candidate.name}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    checked
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {checked ? "제외 중" : "빼보기"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        증자·인출 시점은 그대로 두고 해당 종목의 매수·매도·배당·비용만 제거합니다.
        쓰지 않은 인수대금은 현금으로 남는다고 가정합니다.
      </p>
    </section>
  );
}

function Rate({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className="mt-1 text-xl font-extrabold tabular-nums"
        style={value == null ? undefined : { color: changeColor(value) }}
      >
        {value == null ? "—" : signedPct(value)}
      </p>
    </div>
  );
}
