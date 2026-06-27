import Link from "next/link";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import {
  money,
  signedMoneyShort,
  pct,
  changeColor,
  type Currency,
} from "@/lib/format";
import { qtyUnit } from "@/lib/securities";
import { flattenHoldings, type AccountGroup } from "@/lib/accounts";

/**
 * 홈화면용 종목별 통합 보유목록 — 계좌 구분 없이 심볼 단위로 합산.
 * 각 행은 전 계좌 합산 수량·평가액·평가차익.
 */
export function ConsolidatedHoldings({
  groups,
  currency,
}: {
  groups: AccountGroup[];
  currency: Currency;
}) {
  const holdings = flattenHoldings(groups);

  if (holdings.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        보유 종목 없음
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {holdings.map((h) => (
        <li key={h.symbol}>
          <Link
            href={`/stocks/${h.symbol}`}
            scroll={false}
            className="flex items-center gap-3 py-3 transition active:scale-[0.99]"
          >
            <SymbolAvatar name={h.name} symbol={h.symbol} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{h.name}</span>
              <span className="text-sm text-muted-foreground">
                {h.totalQuantity.toLocaleString()}
                {qtyUnit(h.symbol)}
              </span>
            </span>
            <span className="ml-auto flex shrink-0 flex-col items-end">
              <span className="font-semibold tabular-nums">
                {money(h.totalValue, currency)}
              </span>
              {h.changeRate !== null && (
                <span
                  className="text-sm font-medium tabular-nums"
                  style={{ color: changeColor(h.changeRate) }}
                >
                  {signedMoneyShort(h.totalGain ?? 0, currency)} (
                  {pct(Math.abs(h.changeRate))})
                </span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
