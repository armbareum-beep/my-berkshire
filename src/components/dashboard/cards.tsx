import Link from "next/link";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { SectionCard } from "@/components/ui/SectionCard";
import { StockRow } from "@/components/ui/StockRow";
import { CountUp } from "@/components/ui/CountUp";
import { CurrencyToggle } from "@/components/dashboard/CurrencyToggle";
import {
  money,
  signedMoney,
  pct,
  signedPct,
  changeColor,
  type Currency,
} from "@/lib/format";
import { nativeMoney, currencyMeta } from "@/lib/finance/currencies";
import { qtyUnit } from "@/lib/securities";
import { Flag } from "@/components/ui/Flag";
import type {
  AllocationSlice,
  ActivityFeedItem,
  TimelineItem,
} from "@/lib/dashboard";
import type { AllocationGroup } from "@/lib/allocation";
import type { ReturnResult } from "@/lib/finance/returns";
import type { BenchmarkResult } from "@/lib/finance/benchmark";

const EVENT_LABEL: Record<string, string> = {
  BUY: "매수",
  SELL: "매도",
  DIVIDEND: "배당",
  DEPOSIT: "증자",
  WITHDRAWAL: "인출",
  EXCHANGE: "환전",
};

/** 흰 카드 + soft shadow. href 있으면 우상단 › (탭 어포던스). */
/** 카드 하단 액션 행(푸터) — 데이터 카드 안에 관련 액션을 붙일 때. */
export function CardAction({
  href,
  scroll = true,
  children,
}: {
  href: string;
  /** false 면 내비 시 배경 스크롤 보존(바텀시트 진입용). */
  scroll?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={scroll}
      className="flex items-center justify-between text-sm font-medium transition active:opacity-70"
    >
      <span>{children}</span>
      <span className="text-muted-foreground">›</span>
    </Link>
  );
}

/** @deprecated 신규 코드는 `@/components/ui/SectionCard` 를 직접 쓰세요. 기존 호출 호환용 래퍼. */
export function CardShell({
  title,
  href,
  footer,
  scroll = true,
  children,
}: {
  title?: string;
  href?: string;
  /** 하단 액션 행(있으면 whole-card 링크 대신 제목·푸터가 각각 링크 — 링크 중첩 방지). */
  footer?: React.ReactNode;
  /** false 면 내비 시 배경 스크롤 보존(바텀시트 진입용). */
  scroll?: boolean;
  children: React.ReactNode;
}) {
  return (
    <SectionCard title={title} href={href} footer={footer} scroll={scroll}>
      {children}
    </SectionCard>
  );
}

/** 시세 실패 상태(PRD 6) — 0/이전값으로 대체 금지. */
export function PriceUnavailableCard({ missing }: { missing: string[] }) {
  return (
    <section className="rounded-2xl bg-card p-6 shadow-card">
      <p className="text-sm text-muted-foreground">순자산</p>
      <p className="mt-1 text-xl font-bold text-muted-foreground">시세 갱신 필요</p>
      <p className="mt-2 text-sm text-muted-foreground">
        {missing.length > 0 ? `시세 미확보: ${missing.join(", ")}` : "잠시 후 다시 시도하세요."}
      </p>
      <Link
        href="/dashboard"
        className="mt-4 inline-flex h-10 items-center rounded-xl bg-secondary px-4 text-sm font-semibold"
      >
        다시 시도
      </Link>
    </section>
  );
}

/** 히어로 — 순자산(가장 큰 숫자, 자산−부채) + 누적 수익. */
export function HeroValuationCard({
  netWorth,
  dailyChange,
  currency = "KRW",
  parts,
}: {
  netWorth: number;
  dailyChange: number | null;
  currency?: Currency;
  /** 순자산 구성(표시통화). 음수=차감(빚). 0인 항목은 숨김. */
  parts?: { label: string; value: number }[];
}) {
  // 어제 대비 % = 일일변동 ÷ 어제 순자산(현재−변동).
  const prevValue = dailyChange !== null ? netWorth - dailyChange : null;
  const dailyRate =
    prevValue !== null && prevValue > 0 ? dailyChange! / prevValue : null;
  // 칩에 보일 구성 항목 — 금액 0은 제외(예: 부동산·빚 없으면 안 보임).
  const shownParts = (parts ?? []).filter((p) => Math.abs(p.value) > 0.005);
  return (
    <section className="rounded-2xl bg-card p-6 shadow-card">
      {/* 숫자 자체는 안 누른다(레일 어포던스 규칙). 옆 › 로만 순자산 상세 진입. */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">순자산</p>
          <p className="text-xs text-muted-foreground">내 전 재산 · 빚 뺀 내 몫</p>
        </div>
        <Link
          href="/networth"
          scroll={false}
          className="text-muted-foreground"
          aria-label="순자산 상세"
        >
          ›
        </Link>
      </div>
      {/* 통화 토글은 순자산 숫자 바로 옆 — 무엇이 바뀌는지 한눈에 */}
      <div className="mt-1 flex items-center gap-2">
        <CountUp
          value={netWorth}
          format="money"
          currency={currency}
          className="text-4xl font-extrabold tracking-tight"
        />
        <CurrencyToggle current={currency} variant="icon" />
      </div>
      {dailyChange !== null && (
        <p
          className="mt-2 text-base font-semibold tabular-nums"
          style={{ color: changeColor(dailyChange) }}
        >
          어제보다 {signedMoney(dailyChange, currency)}
          {dailyRate !== null && ` (${signedPct(dailyRate, 2)})`}
        </p>
      )}
      {/* 구성 칩 — "주식은 내 재산의 일부"를 눈으로. 수익률↔순자산 혼동 차단. */}
      {shownParts.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground tabular-nums">
          {shownParts.map((p, i) => (
            <span key={p.label}>
              {i > 0 && (p.value < 0 ? " − " : " · ")}
              {p.label} {money(Math.abs(p.value), currency)}
            </span>
          ))}
        </p>
      )}
      {/* 누적손익·투입원금은 아래 성과(수익률) 카드로 이동(중복 제거). */}
    </section>
  );
}

/** 연복리 수익률(XIRR) 또는 누적 수익률. welcome 시 1회성 하이라이트. */
export function ReturnCard({
  result,
  welcome,
}: {
  result: ReturnResult;
  welcome: boolean;
}) {
  const isXirr = result.status === "xirr" && result.xirr !== null;
  const value = isXirr ? result.xirr! : (result.cumulativeReturn ?? 0);
  return (
    <Link
      href="/returns"
      className={
        "block rounded-2xl bg-card p-5 shadow-card transition active:scale-[0.99]" +
        (welcome ? " ring-2 ring-primary" : "")
      }
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">
          {isXirr ? "연복리 수익률 (XIRR)" : "누적 수익률"}
        </p>
        <span className="text-muted-foreground">›</span>
      </div>
      <p
        className="mt-1 text-3xl font-extrabold tabular-nums"
        style={{ color: changeColor(value) }}
      >
        {signedPct(value)}
      </p>
      {!isXirr && (
        <p className="mt-2 text-sm text-muted-foreground">
          {result.message ?? "연환산 수익률은 설립 90일 후 공개됩니다."}
        </p>
      )}
      {welcome && isXirr && (
        <p className="mt-2 text-sm text-muted-foreground">
          이것이 당신의 진짜 수익률입니다.
        </p>
      )}
    </Link>
  );
}


/**
 * 성과 통합 카드 — 누적수익률(XIRR) + 누적손익 + vs시장 한 장.
 * (기존 ReturnCard + BenchmarkCard 통합 — "내 수익률" 중복 제거.)
 */
export function PerformanceCard({
  result,
  benchmark,
  profit,
  invested,
  currency = "KRW",
  welcome,
}: {
  result: ReturnResult;
  benchmark: BenchmarkResult;
  profit: number | null;
  /** 투입 원금(설립자본 + 증자 − 인출). */
  invested?: number;
  currency?: Currency;
  welcome: boolean;
}) {
  const isXirr = result.status === "xirr" && result.xirr !== null;
  const mine = isXirr ? result.xirr! : (result.cumulativeReturn ?? 0);

  // vs 시장 — 같은 지표(XIRR 우선)로 비교 가능할 때만.
  const useXirr =
    result.status === "xirr" &&
    result.xirr !== null &&
    benchmark.benchmarkXirr !== null;
  const market = useXirr
    ? benchmark.benchmarkXirr
    : result.cumulativeReturn !== null
      ? benchmark.benchmarkCumulative
      : null;
  const canCompare = benchmark.status === "ok" && market !== null;
  const diff = canCompare ? mine - market! : null;

  return (
    <Link
      href="/returns"
      className={
        "block rounded-2xl bg-card p-5 shadow-card transition active:scale-[0.99]" +
        (welcome ? " ring-2 ring-primary" : "")
      }
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">
            {isXirr ? "연복리 수익률 (XIRR)" : "누적 수익률"}
          </p>
          <p className="text-xs text-muted-foreground">
            내 매매 성적표 · 산 가격 대비
          </p>
        </div>
        <span className="text-muted-foreground">›</span>
      </div>
      <p
        className="mt-1 text-3xl font-extrabold tabular-nums"
        style={{ color: changeColor(mine) }}
      >
        {signedPct(mine)}
      </p>
      {profit !== null && (
        <p className="mt-1 text-sm font-medium tabular-nums text-muted-foreground">
          누적손익 {signedMoney(profit, currency)}
          {invested != null && ` · 투입원금 ${money(invested, currency)}`}
        </p>
      )}
      {profit === null && invested != null && (
        <p className="mt-1 text-sm tabular-nums text-muted-foreground">
          투입원금 {money(invested, currency)}
        </p>
      )}

      <div className="mt-3 border-t border-border pt-3">
        {canCompare ? (
          <div className="flex items-center justify-between text-sm">
            <span
              className="font-semibold"
              style={{ color: changeColor(diff!) }}
            >
              {diff! >= 0 ? "시장을 이겼어요" : "시장에 뒤졌어요"} {signedPct(diff!)}p
            </span>
            <span className="text-muted-foreground tabular-nums">
              {benchmark.label} {signedPct(market!)}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {result.status !== "xirr" && result.message
              ? result.message
              : "데이터가 쌓이면 시장(KOSPI)과 비교해 드려요."}
          </p>
        )}
      </div>
    </Link>
  );
}

/** 손익 구성 — 누적 = 실현 + 미실현. */
export function PnlCard({
  profit,
  realized,
  unrealized,
  currency = "KRW",
}: {
  profit: number | null;
  realized: number | null;
  unrealized: number | null;
  currency?: Currency;
}) {
  if (profit === null) return null;
  return (
    <Link
      href="/pnl"
      className="block rounded-2xl bg-card p-5 shadow-card transition active:scale-[0.99]"
    >
      <div className="mb-1 flex items-center justify-between">
        <p className="text-sm font-semibold">누적 손익</p>
        <span className="text-muted-foreground">›</span>
      </div>
      <p
        className="text-2xl font-extrabold tabular-nums"
        style={{ color: changeColor(profit) }}
      >
        {signedMoney(profit, currency)}
      </p>
      <dl className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">실현 손익</dt>
          <dd
            className="font-medium tabular-nums"
            style={{ color: realized !== null ? changeColor(realized) : undefined }}
          >
            {realized !== null ? signedMoney(realized, currency) : "—"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">미실현 손익</dt>
          <dd
            className="font-medium tabular-nums"
            style={{ color: unrealized !== null ? changeColor(unrealized) : undefined }}
          >
            {unrealized !== null ? signedMoney(unrealized, currency) : "—"}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">
        미실현 = 보유 종목 평가차익 · 실현 = 매매차익 + 배당 − 비용
      </p>
    </Link>
  );
}

export function CashCard({
  cash,
  cashWeight,
  currency = "KRW",
  pools,
  footer,
}: {
  cash: number;
  cashWeight: number | null;
  currency?: Currency;
  /** 통화별 현금 풀(네이티브). 외화 잔액 있으면 분해 표시. */
  pools?: Record<string, number>;
  footer?: React.ReactNode;
}) {
  // 잔액이 있는 통화만(₩ 먼저, 그다음 보유 외화). 외화가 있을 때만 행 리스트(토스식).
  const rows = (
    pools ? Object.entries(pools).filter(([, v]) => Math.abs(v) > 0.005) : []
  ).sort((a, b) => (a[0] === "KRW" ? -1 : b[0] === "KRW" ? 1 : 0));
  const hasForeign = rows.some(([c]) => c !== "KRW");
  return (
    <CardShell title="현금 비중" href="/cash" scroll={false} footer={footer}>
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-bold tabular-nums">
          {cashWeight !== null ? pct(cashWeight) : "—"}
        </span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {money(cash, currency)}
        </span>
      </div>
      {hasForeign && (
        <ul className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
          {rows.map(([c, v]) => (
            <li key={c} className="flex items-center gap-3">
              <Flag code={c} />
              <span className="text-sm font-medium">{currencyMeta(c).name}</span>
              <span className="ml-auto font-bold tabular-nums">
                {nativeMoney(v, c)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

/**
 * 자산 구성 — 유형별 접이식 섹션(주식/ETF/원자재/코인). 계좌 카드와 동일하게 네이티브
 * `<details name>` 으로 한 번에 하나만 펼침(JS 없음), 첫 유형만 기본 펼침 → 길어지지 않음.
 * 각 유형 안에서 비중을 100%로 정규화("주식만 해서 100%"), 헤더엔 전체 대비 비중도 표시.
 * 현금은 별도 CashCard 가 전담.
 */
export function AllocationCard({
  groups,
  footer,
}: {
  groups: AllocationGroup[];
  footer?: React.ReactNode;
}) {
  if (groups.length === 0) return null;
  return (
    <CardShell title="자산 구성" href="/allocation" footer={footer}>
      <div className="flex flex-col">
        {groups.map((g, i) => {
          const totalShare = g.slices.reduce((s, a) => s + a.weight, 0); // 전체 대비
          const groupValue = g.slices.reduce((s, a) => s + a.value, 0); // 유형 내 합(정규화 분모)
          return (
            <details
              key={g.type}
              name="dash-alloc"
              open={i === 0}
              className={`group${i > 0 ? " border-t border-border" : ""}`}
            >
              {/* 유형 헤더: 유형명 + 전체 자산 대비 비중 + 펼침 화살표 */}
              <summary className="flex cursor-pointer list-none items-center gap-2 py-3 text-sm">
                <span className="font-semibold">{g.type}</span>
                <span className="ml-auto flex items-center gap-2">
                  <span className="tabular-nums text-muted-foreground">
                    전체의 {pct(totalShare)}
                  </span>
                  <span className="text-muted-foreground transition group-open:rotate-90">
                    ›
                  </span>
                </span>
              </summary>
              <ul className="flex flex-col gap-2.5 pb-3">
                {g.slices.map((a) => {
                  const w = groupValue > 0 ? a.value / groupValue : 0; // 유형 내 100% 정규화
                  return (
                    <li key={a.symbol}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{a.name}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {pct(w)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full rounded-full bg-secondary">
                        <div
                          className="h-1.5 rounded-full bg-primary"
                          style={{ width: `${Math.min(100, Math.round(w * 100))}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </div>
    </CardShell>
  );
}

export function FrictionCard({
  friction,
  drag,
  currency = "KRW",
}: {
  friction: number;
  drag: number | null;
  currency?: Currency;
}) {
  return (
    <CardShell title="누적 마찰비용" href="/friction">
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-bold tabular-nums">
          {money(friction, currency)}
        </span>
        {drag !== null && (
          <span className="text-sm text-muted-foreground tabular-nums">
            원금 대비 {pct(drag, 2)}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">수수료·세금이 수익률을 끌어내린 정도</p>
    </CardShell>
  );
}

export function HoldingsCard({
  allocation,
  currency = "KRW",
}: {
  allocation: AllocationSlice[];
  currency?: Currency;
}) {
  return (
    <SectionCard
      title="보유 종목"
      action={
        <Link href="/holdings" className="text-sm text-muted-foreground">
          전체 보기 ›
        </Link>
      }
    >
      {allocation.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">포트폴리오가 비어 있습니다.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {allocation.map((a) => (
            <li key={a.symbol}>
              <StockRow
                symbol={a.symbol}
                name={a.name}
                href={`/stocks/${a.symbol}`}
                sub={`${a.symbol} · ${a.quantity.toLocaleString()}${qtyUnit(a.symbol)}`}
                value={money(a.price, currency)}
                changeRate={a.changeRate}
              />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function RecentActivityCard({ recent }: { recent: ActivityFeedItem[] }) {
  if (recent.length === 0) return null;
  return (
    <SectionCard
      title="최근 활동"
      action={
        <Link href="/activity" className="text-sm text-muted-foreground">
          활동 더보기 ›
        </Link>
      }
    >
      <ul className="flex flex-col gap-2">
        {recent.map((e, i) => (
          <li key={i} className="flex items-center gap-3 text-sm">
            {/* 종목 이벤트는 종목 아바타, 현금 이벤트(증자·인출)는 행동명 이니셜 — 공용 Avatar 통일 */}
            <SymbolAvatar name={e.name ?? EVENT_LABEL[e.type]} symbol={e.symbol ?? undefined} />
            <span className="flex flex-col">
              <span className="font-medium">
                {EVENT_LABEL[e.type]}
                {e.name ? ` · ${e.name}` : ""}
                {e.quantity ? ` ${e.quantity}${e.symbol ? qtyUnit(e.symbol) : "주"}` : ""}
              </span>
              <span className="text-muted-foreground">
                {e.daysAgo === 0 ? "오늘" : `${e.daysAgo}일 전`}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

export function TimelineCard({ timeline }: { timeline: TimelineItem[] }) {
  return (
    <CardShell title="회사 연혁" href="/activity">
      <ul className="flex flex-col gap-3">
        {timeline.map((t, i) => (
          <li key={i} className="flex items-center gap-3 text-sm">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span className="font-medium">{t.label}</span>
            <span className="ml-auto text-muted-foreground tabular-nums">{t.date}</span>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}
