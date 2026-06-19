import Link from "next/link";
import { money, pct, type Currency } from "@/lib/format";
import type { FrictionAnalysis } from "@/lib/finance/friction";
import type { TaxCreditSummary } from "@/lib/config/tax";

export function FrictionView({
  analysis,
  factor,
  currency,
  selectedYear,
  taxCreditSummaries,
}: {
  analysis: FrictionAnalysis;
  factor: number;
  currency: Currency;
  selectedYear: number | null;
  taxCreditSummaries: TaxCreditSummary[];
}) {
  const amount = (value: number) => money(value * factor, currency);
  const selectedYearIndex =
    selectedYear == null
      ? -1
      : analysis.yearly.findIndex((row) => row.year === selectedYear);
  const selectedYearData =
    selectedYearIndex >= 0 ? analysis.yearly[selectedYearIndex] : null;
  const chartRows = selectedYearData?.monthly ?? analysis.monthly;
  const maxMonth = Math.max(...chartRows.map((row) => row.value), 1);

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl bg-card p-6 shadow-card">
        <p className="text-sm text-muted-foreground">장부에 기록된 누적 비용</p>
        <p className="mt-1 text-4xl font-extrabold tracking-tight tabular-nums">
          {amount(analysis.recordedTotal)}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4">
          <Metric label="올해" value={amount(analysis.thisYear)} />
          <Metric label="최근 12개월" value={amount(analysis.last12Months)} />
          <Metric
            label="투입원금 대비"
            value={analysis.drag == null ? "—" : pct(analysis.drag, 2)}
          />
          <Metric
            label="ETF 연간 보수 추정"
            value={amount(analysis.ter.annualTotal)}
          />
        </div>
      </section>

      <section className="rounded-2xl bg-card p-5 shadow-card">
        <p className="text-sm font-semibold">비용이 생긴 활동</p>
        {analysis.byType.length > 0 ? (
          <dl className="mt-3 flex flex-col gap-3">
            {analysis.byType.map((row) => (
              <Row key={row.type} label={row.label} value={amount(row.value)} />
            ))}
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">기록된 비용이 없습니다.</p>
        )}
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          현재 장부는 수수료와 세금을 하나의 금액으로 저장합니다. 활동별 합계는 정확하지만
          수수료와 세금의 개별 분리는 할 수 없습니다.
        </p>
      </section>

      {analysis.byAccount.length > 0 && (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <p className="text-sm font-semibold">계좌별 비용</p>
          <dl className="mt-3 flex flex-col gap-3">
            {analysis.byAccount.map((row) => (
              <Row key={row.id} label={row.name} value={amount(row.value)} />
            ))}
          </dl>
        </section>
      )}

      <section className="rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            {selectedYearData && selectedYearIndex > 0 ? (
              <Link
                href={`?year=${analysis.yearly[selectedYearIndex - 1].year}`}
                scroll={false}
                aria-label={`${analysis.yearly[selectedYearIndex - 1].year}년`}
                className="rounded-full px-1 text-muted-foreground"
              >
                ‹
              </Link>
            ) : !selectedYearData && analysis.yearly.length > 0 ? (
              <Link
                href={`?year=${analysis.yearly[analysis.yearly.length - 1].year}`}
                scroll={false}
                aria-label={`${analysis.yearly[analysis.yearly.length - 1].year}년`}
                className="rounded-full px-1 text-muted-foreground"
              >
                ‹
              </Link>
            ) : (
              <span className="px-1 text-border">‹</span>
            )}
            <p className="text-sm font-semibold">
              {selectedYearData ? `${selectedYearData.year}년` : "최근 12개월"}
            </p>
            {selectedYearData && selectedYearIndex < analysis.yearly.length - 1 ? (
              <Link
                href={`?year=${analysis.yearly[selectedYearIndex + 1].year}`}
                scroll={false}
                aria-label={`${analysis.yearly[selectedYearIndex + 1].year}년`}
                className="rounded-full px-1 text-muted-foreground"
              >
                ›
              </Link>
            ) : selectedYearData && selectedYearIndex === analysis.yearly.length - 1 ? (
              <Link
                href="/friction"
                scroll={false}
                aria-label="최근 12개월"
                className="rounded-full px-1 text-muted-foreground"
              >
                ›
              </Link>
            ) : (
              <span className="px-1 text-border">›</span>
            )}
          </div>
          {selectedYearData ? (
            <Link
              href="/friction"
              scroll={false}
              className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold"
            >
              최근 12개월
            </Link>
          ) : (
            <span className="text-xs font-semibold text-muted-foreground">
              합계 {amount(analysis.last12Months)}
            </span>
          )}
        </div>
        {selectedYearData && (
          <p className="mt-1 text-xs text-muted-foreground">
            연간 합계 {amount(selectedYearData.total)}
          </p>
        )}
        <div className="mt-4 flex h-32 items-end gap-1.5">
          {chartRows.map((row) => (
            <div
              key={row.month}
              className="group relative flex h-full flex-1 flex-col justify-end gap-1"
            >
              <button
                type="button"
                aria-label={`${row.month} 비용 ${amount(row.value)}`}
                className="min-h-0.5 w-full rounded-sm bg-primary outline-none ring-primary/30 transition hover:opacity-80 focus-visible:ring-4"
                style={{ height: `${Math.max(2, (row.value / maxMonth) * 100)}%` }}
              />
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-max -translate-x-1/2 rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-semibold text-background shadow-lg group-hover:block group-focus-within:block">
                {row.month.replace("-", "년 ")}월 · {amount(row.value)}
              </span>
              <span className="text-center text-[9px] text-muted-foreground">
                {Number(row.month.slice(5))}월
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          {analysis.yearly.map((row) => (
            <Link
              key={row.year}
              href={`?year=${row.year}`}
              scroll={false}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                selectedYear === row.year
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              {row.year} · {amount(row.total)}
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-card p-5 shadow-card">
        <p className="text-sm font-semibold">매매 회전율</p>
        <p className="mt-2 text-3xl font-extrabold tabular-nums">
          {analysis.turnover.annualized == null
            ? "—"
            : pct(analysis.turnover.annualized, 1)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">연환산 · 매도대금 ÷ 투입원금</p>
        <dl className="mt-4 border-t border-border pt-3">
          <Row label="누적 매도대금" value={amount(analysis.turnover.sellGross)} />
        </dl>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          회전율은 스타일이지 점수가 아닙니다. 높고 낮음보다 실제 비용과 의도한 운용 방식이
          일치하는지 확인하세요.
        </p>
      </section>

      <section className="rounded-2xl bg-card p-5 shadow-card">
        <p className="text-sm font-semibold">ETF·ETP 보수 추정</p>
        {analysis.ter.holdings.length > 0 ? (
          <>
            <dl className="mt-3 flex flex-col gap-4">
              {analysis.ter.holdings.map((row) => (
                <div key={row.symbol} className="flex items-start justify-between gap-4">
                  <dt>
                    <p className="text-sm font-medium">{row.name}</p>
                    <p className="text-xs text-muted-foreground">
                      TER {pct(row.ter, 2)} · 보유 {row.holdingDays}일
                    </p>
                  </dt>
                  <dd className="text-right">
                    <p className="text-sm font-bold tabular-nums">연 {amount(row.annualCost)}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      누적 추정 {amount(row.cumulativeCost)}
                    </p>
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4">
              <Metric label="연간 합계" value={amount(analysis.ter.annualTotal)} />
              <Metric label="누적 추정" value={amount(analysis.ter.cumulativeTotal)} />
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            TER 정보가 있는 ETF·ETP 보유 종목이 없습니다.
          </p>
        )}
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          TER는 가격에 매일 반영되어 별도 출금되지 않습니다. 누적값은 현재 평가액과 현재
          TER가 보유기간 내내 같았다고 가정한 근사치입니다.
        </p>
      </section>

      {taxCreditSummaries.some((s) => s.annualLimit > 0) && (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <p className="text-sm font-semibold">절세계좌 세액공제 현황</p>
          <p className="mt-1 text-xs text-muted-foreground">
            올해 절세계좌 납입 현황과 예상 세액공제액 (소득공제율 13.2% 기준).
          </p>
          <div className="mt-4 flex flex-col gap-5">
            {taxCreditSummaries.map((s) => (
              <div key={s.accountType}>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{s.label}</p>
                  <p className="text-sm font-bold tabular-nums">
                    {money(s.yearDeposit, "KRW")}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      / {money(s.annualLimit, "KRW")}
                    </span>
                  </p>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.round(s.fillRatio * 100)}%` }}
                  />
                </div>
                {s.creditRate > 0 && (
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>예상 세액공제</span>
                    <span className="font-semibold text-foreground tabular-nums">
                      {s.estimatedCredit > 0 ? money(s.estimatedCredit, "KRW") : "—"}
                    </span>
                  </div>
                )}
                {s.accountType === "ISA" && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    ISA는 세액공제 대신 비과세 혜택(한도 내 이익·배당 비과세).
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            연금저축+IRP 합산 공제 한도는 연 900만원. 총급여 5,500만원 이하 시 공제율 16.5% 적용.
            납입액은 올해 DEPOSIT 거래 합산 기준입니다.
          </p>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-bold tabular-nums">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-bold tabular-nums">{value}</dd>
    </div>
  );
}
