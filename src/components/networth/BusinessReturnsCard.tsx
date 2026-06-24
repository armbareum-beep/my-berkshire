import { money, signedMoney, signedPct, changeColor, type Currency } from "@/lib/format";
import type { BusinessReturnsResult } from "@/lib/finance/businessReturns";

/**
 * 사업부별 누적수익률 — 히어로의 "총자산 누적수익률"이 어디서 왔는지(주식/부동산) 분해.
 * 금액은 ₩로 받아 factor 로 표시 통화 환산. 비율은 통화 무관.
 */
export function BusinessReturnsCard({
  result,
  factor,
  currency,
}: {
  result: BusinessReturnsResult;
  factor: number;
  currency: Currency;
}) {
  if (result.divisions.length === 0) return null;
  const cv = (n: number) => n * factor;

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <p className="text-sm font-semibold">사업부별 누적수익률</p>

      {/* 총자산 누적 — 히어로와 같은 숫자(투자 + 부동산 합산) */}
      {result.total && (
        <div className="mt-3 flex items-baseline justify-between border-b border-border pb-3">
          <span className="text-sm text-muted-foreground">
            {result.total.label}
            {result.total.estimated && " · 일부 추정"}
          </span>
          <span
            className="text-2xl font-extrabold tabular-nums"
            style={{ color: changeColor(result.total.ret ?? 0) }}
          >
            {result.total.ret != null ? signedPct(result.total.ret) : "—"}
          </span>
        </div>
      )}

      {/* 사업부별 분해 */}
      <dl className="mt-3 flex flex-col gap-3">
        {result.divisions.map((d) => (
          <div key={d.key} className="flex flex-col gap-0.5">
            <div className="flex items-baseline justify-between">
              <dt className="text-sm">
                {d.label}
                {d.estimated && (
                  <span className="ml-1 text-xs text-muted-foreground">추정</span>
                )}
              </dt>
              <dd
                className="text-sm font-bold tabular-nums"
                style={{ color: changeColor(d.ret ?? 0) }}
              >
                {d.ret != null ? signedPct(d.ret) : "—"}
              </dd>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>투입 {money(cv(d.invested), currency)}</span>
              <span style={{ color: changeColor(d.gain) }}>
                {signedMoney(cv(d.gain), currency)}
              </span>
            </div>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-xs text-muted-foreground">
        투입원가 대비 현재 평가 기준. 부동산 등 수기자산은 입력한 평가액(추정)이며,
        연복리 수익률(XIRR)은 주식 사업부(성과 카드)에서 봐요.
      </p>
    </section>
  );
}
