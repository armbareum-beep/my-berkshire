import { won, pct, moneyShort } from "@/lib/format";

export function EtfPortfolioHeader({
  totalEtfValue,
  weightedAvgTer,
  annualCost,
}: {
  totalEtfValue: number;
  weightedAvgTer: number | null;
  annualCost: number | null;
}) {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card">
      <p className="text-xs text-muted-foreground">ETF 총 평가액</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums tracking-tight">
        {won(totalEtfValue)}
      </p>
      {weightedAvgTer !== null && (
        <div className="mt-3 flex items-center gap-4 border-t border-border pt-3">
          <div>
            <p className="text-xs text-muted-foreground">가중평균 보수</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums">
              {pct(weightedAvgTer, 2)}
            </p>
          </div>
          {annualCost !== null && (
            <div>
              <p className="text-xs text-muted-foreground">연간 예상 비용</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums">
                {moneyShort(annualCost)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
