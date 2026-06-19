import {
  money,
  signedMoney,
  signedPct,
  changeColor,
  type Currency,
} from "@/lib/format";
import type { QuarterReport } from "@/lib/finance/quarterClose";
import type { Disclosure, HintTone } from "@/lib/finance/dart";
import { CountUp } from "@/components/ui/CountUp";
import { EmojiIcon } from "@/components/ui/EmojiIcon";

/** 해석 힌트 톤 → 색. 등락 빨강/파랑은 시세에만 — 경고=앰버(--warn), 긍정/정보=잉크·무채색. */
function hintColor(tone: HintTone): string {
  if (tone === "warn") return "var(--warn)";
  if (tone === "good") return "var(--foreground)";
  return "var(--muted-foreground)";
}

/**
 * CFO 분기 결산 리포트 뷰 — 이번 분기 경영 실적.
 * 금액은 ₩ 기준으로 받아 factor 로 표시 통화 환산. 비율은 통화 무관.
 */
export function QuarterReportView({
  report,
  netWorthKrw,
  score,
  gradeLabel,
  disclosures,
  streak,
  factor,
  currency,
}: {
  report: QuarterReport;
  netWorthKrw: number | null;
  score: number | null;
  gradeLabel: string | null;
  /** 이번 분기 보유종목 주요 공시(DART). 없으면 섹션 숨김. */
  disclosures: Disclosure[];
  /** 결산 스트릭(연속 결산 분기 수). 0이면 배지 숨김. */
  streak: number;
  factor: number;
  currency: Currency;
}) {
  const cv = (n: number) => n * factor;
  const a = report.activity;
  // 정기 회고(분기 결산)라는 보편 습관을 게임화 — 스타일 중립, 인내 보상.
  const streakText =
    streak <= 0
      ? null
      : streak === 1
        ? "🔥 결산 스트릭 시작"
        : `🔥 ${streak}분기 연속 결산`;

  return (
    <div className="flex flex-col gap-4">
      {/* 분기 수익률 히어로 */}
      <section className="rounded-2xl bg-card p-6 shadow-card">
        {streakText && (
          <span className="mb-2 inline-flex items-center rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground">
            {streakText}
          </span>
        )}
        <p className="text-sm font-medium text-muted-foreground">
          {report.label} · 진행 중 ({report.days}일째)
        </p>
        <p className="mt-1 text-sm text-muted-foreground">분기 누적 수익률</p>
        {report.cumulative != null ? (
          <CountUp
            value={report.cumulative}
            format="signedPct"
            className="mt-1 block text-4xl font-extrabold tracking-tight"
            style={{ color: changeColor(report.cumulative) }}
          />
        ) : (
          <p className="mt-1 text-2xl font-bold text-muted-foreground">
            시세 갱신 필요
          </p>
        )}

        {/* CFO 한마디 */}
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-secondary px-4 py-3 text-sm leading-relaxed text-secondary-foreground">
          <EmojiIcon emoji="🧾" size={15} className="mt-0.5 text-muted-foreground" />
          <span>{report.comment}</span>
        </p>
      </section>

      {/* 분기 활동 */}
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <p className="mb-3 text-sm font-semibold">이번 분기 활동</p>
        <dl className="grid grid-cols-2 gap-y-3 text-sm">
          <Cell k="매수 / 매도" v={`${a.buys}건 / ${a.sells}건`} />
          <Cell
            k="순투입(증자−인출)"
            v={signedMoney(cv(a.netInvested), currency)}
          />
          <Cell k="받은 배당" v={money(cv(a.dividends), currency)} />
          <Cell k="마찰비용(수수료·세금)" v={money(cv(a.fees), currency)} />
        </dl>
      </section>

      {/* 종목 성적(분기초 대비) */}
      {report.stocks.some((s) => s.changePct != null) && (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <p className="mb-3 text-sm font-semibold">종목 성적 (분기초 대비)</p>
          {report.best && report.best.changePct != null && (
            <PerfRow label="베스트" perf={report.best} />
          )}
          {report.worst &&
            report.worst.changePct != null &&
            report.worst.symbol !== report.best?.symbol && (
              <PerfRow label="워스트" perf={report.worst} />
            )}
        </section>
      )}

      {/* 이번 분기 주요 공시(DART) */}
      {disclosures.length > 0 && (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <p className="mb-3 text-sm font-semibold">이번 분기 주요 공시</p>
          <ul className="flex flex-col gap-3">
            {disclosures.map((d) => (
              <li key={d.rceptNo}>
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">
                      {d.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {d.corpName} · {d.date}
                    </span>
                    {d.hint && (
                      <span
                        className="mt-0.5 inline-flex items-start gap-1 text-xs"
                        style={{ color: hintColor(d.hint.tone) }}
                      >
                        <EmojiIcon emoji="💡" size={13} className="mt-0.5" />
                        <span>{d.hint.text}</span>
                      </span>
                    )}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    원문 ›
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            출처: 금융감독원 DART. 제목만 표시 — 원문은 링크에서.
          </p>
        </section>
      )}

      {/* 현재 스냅샷 */}
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <p className="mb-3 text-sm font-semibold">분기말 현재</p>
        <dl className="grid grid-cols-2 gap-y-3 text-sm">
          <Cell
            k="순자산"
            v={netWorthKrw != null ? money(cv(netWorthKrw), currency) : "—"}
          />
          <Cell
            k="규율 점수"
            v={score != null ? `${score}점${gradeLabel ? ` · ${gradeLabel}` : ""}` : "—"}
          />
        </dl>
      </section>

      <p className="px-1 text-xs text-muted-foreground">
        분기 수익률은 보유종목 일별 종가로 재구성한 추정이며, 부동산 등 수기 자산은
        투자 수익률에 포함되지 않아요. 활동·배당·비용은 실제 기록 기준입니다.
      </p>
    </div>
  );
}

function Cell({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="font-bold tabular-nums">{v}</dd>
    </div>
  );
}

function PerfRow({
  label,
  perf,
}: {
  label: string;
  perf: { name: string; changePct: number | null };
}) {
  const c = perf.changePct ?? 0;
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm">
        <span className="mr-2 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
          {label}
        </span>
        {perf.name}
      </span>
      <span
        className="font-bold tabular-nums"
        style={{ color: changeColor(c) }}
      >
        {signedPct(c)}
      </span>
    </div>
  );
}
