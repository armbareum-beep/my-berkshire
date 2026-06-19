import { money, pct, type Currency } from "@/lib/format";
import { StockRow } from "@/components/ui/StockRow";

/** 종목별 배당수익률 한 줄. 금액은 ₩ 기준(표시 통화 환산은 factor). */
export interface HoldingYield {
  symbol: string;
  name: string;
  /** 연 예상 배당(₩) = 보유수량 × 연 주당배당 × 환율. */
  annualDivKrw: number;
  /** 현재가 기준 배당수익률(소수). 평가액 0이면 null. */
  yieldOnPrice: number | null;
  /** 1주당 연 배당(네이티브). */
  annualDpsNative: number;
  currency: string;
}

/**
 * 종목별 배당수익률 — "현재가 대비 연 몇 % 배당받나"(클래식 dividend yield).
 * 기존 월별 배당(언제 받나)과 다른 질문: 지금 자산이 만드는 인컴 비율.
 * 배당 없는 종목은 제외. 수익률 높은 순.
 */
export function DividendYields({
  items,
  totalAnnualDivKrw,
  portfolioYield,
  factor,
  currency,
}: {
  items: HoldingYield[];
  totalAnnualDivKrw: number;
  /** 포트폴리오 배당수익률(연배당 ÷ 보유 평가액, 소수). null=평가액 0. */
  portfolioYield: number | null;
  factor: number;
  currency: Currency;
}) {
  if (items.length === 0) return null;
  const disp = (krw: number) => money(krw * factor, currency);
  const sorted = [...items].sort(
    (a, b) => (b.yieldOnPrice ?? 0) - (a.yieldOnPrice ?? 0),
  );

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-muted-foreground">
          배당수익률 (현재가 기준)
        </p>
        {portfolioYield != null && (
          <p className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold tabular-nums text-secondary-foreground">
            포트폴리오 {pct(portfolioYield, 2)}
          </p>
        )}
      </div>
      <p className="mt-1 text-3xl font-extrabold tabular-nums tracking-tight">
        {disp(totalAnnualDivKrw)}
        <span className="ml-1.5 text-sm font-medium text-muted-foreground">
          / 연 예상
        </span>
      </p>

      <ul className="mt-4 flex flex-col gap-1">
        {sorted.map((h) => (
          <li key={h.symbol}>
            <StockRow
              symbol={h.symbol}
              name={h.name}
              href={`/stocks/${h.symbol}`}
              sub={`1주당 연 ${
                h.currency === "KRW"
                  ? `₩${Math.round(h.annualDpsNative).toLocaleString()}`
                  : `${h.annualDpsNative.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })} ${h.currency}`
              }`}
              right={
                <span className="flex flex-col items-end">
                  <span className="font-bold tabular-nums">
                    {h.yieldOnPrice != null ? pct(h.yieldOnPrice, 2) : "—"}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {disp(h.annualDivKrw)}
                  </span>
                </span>
              }
            />
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        최근 12개월 배당 기준(이력 부족 시 과거 주기로 추정). 시세 변동에 따라 수익률은
        매일 달라져요.
      </p>
    </section>
  );
}
