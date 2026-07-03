import { money, pct, signedPct, changeColor, type Currency } from "@/lib/format";
import type { AnnualReport } from "@/lib/finance/annualReport";
import type { LookThrough } from "@/lib/finance/lookThrough";
import { PrintAnnualReportButton } from "./PrintAnnualReportButton";

export function AnnualReportView({
  companyName,
  foundedAt,
  report,
  lookThrough,
  factor,
  currency,
}: {
  companyName: string;
  foundedAt: string;
  report: AnnualReport;
  lookThrough: LookThrough | null;
  factor: number;
  currency: Currency;
}) {
  const cv = (value: number) => value * factor;
  return (
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-5 print:max-w-none print:gap-3">
      <header className="rounded-3xl bg-foreground p-7 text-background shadow-card print:rounded-none print:shadow-none">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] opacity-65">ENUF Annual Report</p>
        <h1 className="mt-8 text-3xl font-extrabold tracking-tight">{companyName}</h1>
        <p className="mt-1 text-sm opacity-70">회장님, {report.label} · 제{report.edition}기 결산을 보고드립니다</p>
        <div className="mt-10 flex items-end justify-between gap-4">
          <p className="text-xs opacity-60">설립 {foundedAt} · 보고기간 {report.start}—{report.end}</p>
          <PrintAnnualReportButton />
        </div>
      </header>

      <section className="rounded-2xl bg-card p-6 shadow-card print:shadow-none">
        <p className="text-sm font-semibold">회장님께 보고드리는 숫자</p>
        <div className="mt-4 grid grid-cols-2 gap-5">
          <Metric label="1년 XIRR" value={report.xirr == null ? "—" : signedPct(report.xirr)} tone={report.xirr} />
          <Metric label="1년 누적 수익률" value={report.cumulative == null ? "—" : signedPct(report.cumulative)} tone={report.cumulative} />
          <Metric label="기초 평가액" value={money(cv(report.startValue), currency)} />
          <Metric label="현재 평가액" value={money(cv(report.endValue), currency)} />
        </div>
      </section>

      <section className="rounded-2xl bg-card p-6 shadow-card print:shadow-none">
        <p className="text-sm font-semibold">사업부 성적</p>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <Business label="베스트" item={report.best} />
          <Business label="워스트" item={report.worst} />
        </div>
        <p className="mt-4 text-xs text-muted-foreground">현재 보유 사업부의 보고기간 시작 종가 대비 등락입니다. 수익률은 사업의 질을 단정하지 않습니다.</p>
      </section>

      <section className="rounded-2xl bg-card p-6 shadow-card print:shadow-none">
        <p className="text-sm font-semibold">투시 실적</p>
        {lookThrough && lookThrough.coverage.includedCount > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-5">
            <Metric label="내 몫 순이익" value={money(cv(lookThrough.netIncome), currency)} />
            <Metric label="내 몫 잉여현금흐름" value={money(cv(lookThrough.fcf), currency)} />
            <Metric label="가중 ROE" value={lookThrough.roe == null ? "—" : pct(lookThrough.roe)} />
            <Metric label="반영 비중" value={pct(lookThrough.coverage.ratio)} />
          </div>
        ) : <p className="mt-3 text-sm text-muted-foreground">반영 가능한 기업 공시가 아직 없습니다.</p>}
        {lookThrough && <p className="mt-4 text-xs text-muted-foreground">{lookThrough.asOfNote}</p>}
      </section>

      <section className="rounded-2xl bg-card p-6 shadow-card print:shadow-none">
        <p className="text-sm font-semibold">자본배분 활동</p>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <Cell label="매수 / 매도" value={`${report.buys}건 / ${report.sells}건`} />
          <Cell label="받은 배당" value={money(cv(report.dividends), currency)} />
          <Cell label="마찰비용" value={money(cv(report.fees), currency)} />
        </dl>
      </section>

      <section className="rounded-2xl bg-secondary p-6 print:bg-white print:ring-1 print:ring-border">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">CFO 총평</p>
        <p className="mt-3 text-base font-medium leading-7">{report.comment}</p>
      </section>

      <p className="px-1 text-xs leading-5 text-muted-foreground">수익률은 보유종목 일별 종가와 기록된 외부 현금흐름으로 재구성한 추정치입니다. 투시 실적은 최신 가용 공시 기준이며 시장 수익률과 별개의 지표입니다.</p>
    </article>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: number | null }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-extrabold tabular-nums" style={tone == null ? undefined : { color: changeColor(tone) }}>{value}</p></div>;
}

function Business({ label, item }: { label: string; item: AnnualReport["best"] }) {
  return <div className="rounded-xl bg-secondary p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate font-bold">{item?.name ?? "—"}</p><p className="mt-1 text-sm font-bold tabular-nums" style={item?.changePct == null ? undefined : { color: changeColor(item.changePct) }}>{item?.changePct == null ? "자료 없음" : signedPct(item.changePct)}</p></div>;
}

function Cell({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-bold tabular-nums">{value}</dd></div>;
}
