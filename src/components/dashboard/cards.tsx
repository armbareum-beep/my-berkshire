import Link from "next/link";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { EVENT_ICON, IconChip } from "@/components/transactions/eventIcons";
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
import type { CompoundingStreak } from "@/lib/finance/compoundingStreak";
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
  sinceLastSeen,
  compoundingStreak,
  cumulativeReturn,
}: {
  netWorth: number;
  dailyChange: number | null;
  currency?: Currency;
  /** 자산 구성(표시통화). 음수=차감(빚). 0인 항목은 숨김. */
  parts?: { label: string; value: number }[];
  /** 지난 접속 이후 벌어들인 손익(표시통화) + 수익률. null이면 어제 대비로 폴백. */
  sinceLastSeen?: { earned: number; pct: number | null } | null;
  /** 복리 무중단 기간(통화 무관). 빈 장부면 미표시. */
  compoundingStreak?: CompoundingStreak;
  /** 총자산 누적수익률(투자 + 부동산 등 취득가 있는 수기자산, 비율 통화무관). null이면 미표시. */
  cumulativeReturn?: number | null;
}) {
  // 구성 항목 — 금액 0은 제외(예: 부동산·빚 없으면 안 보임).
  const shownParts = (parts ?? []).filter((p) => Math.abs(p.value) > 0.005);
  // 자산(양수)은 스택 바·헤드라인(총자산)으로, 빚(음수)은 재무상태표 차감으로(헌법 IV: 브랜드색 농도만).
  const assetParts = shownParts.filter((p) => p.value > 0);
  const debtPart = shownParts.find((p) => p.value < 0);
  const totalAssets = assetParts.reduce((s, p) => s + p.value, 0);
  const partShade = (i: number) =>
    i === 0 ? "bg-primary" : i === 1 ? "bg-primary/45" : "bg-primary/20";
  return (
    <section className="rounded-2xl bg-card p-6 shadow-card">
      {/* 숫자 자체는 안 누른다(레일 어포던스 규칙). 옆 › 로만 자산 상세 진입. */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">총자산</p>
          <p className="text-xs text-muted-foreground">내가 가진 전부 · 빚 빼기 전</p>
        </div>
        <Link
          href="/networth"
          scroll={false}
          className="text-muted-foreground"
          aria-label="자산 상세"
        >
          ›
        </Link>
      </div>
      {/* 통화 토글은 총자산 숫자 바로 옆 — 무엇이 바뀌는지 한눈에 */}
      <div className="mt-1 flex items-center gap-2">
        <CountUp
          value={totalAssets}
          format="money"
          currency={currency}
          className="text-4xl font-extrabold tracking-tight"
        />
        <CurrencyToggle current={currency} variant="icon" />
      </div>
      {/* 총자산 누적수익률 — 순자산 숫자 바로 밑, 가장 큰 보조지표. 투자(시세) + 부동산 등 수기자산(추정) 합산. */}
      {cumulativeReturn != null && (
        <p
          className="mt-2 text-xl font-bold tabular-nums"
          style={{ color: changeColor(cumulativeReturn) }}
        >
          총자산 누적수익률 {signedPct(cumulativeReturn)}
        </p>
      )}
      {/* 지난 접속 이후 벌어들인 손익(₩만 — 누적수익률 아래 보조 줄, 작게). 없으면 어제 대비로 폴백. */}
      {sinceLastSeen ? (
        <p
          className="mt-0.5 text-sm font-medium tabular-nums"
          style={{ color: changeColor(sinceLastSeen.earned) }}
        >
          지난 접속 이후 {signedMoney(sinceLastSeen.earned, currency)}
        </p>
      ) : (
        dailyChange !== null && (
          <p
            className="mt-0.5 text-sm font-medium tabular-nums"
            style={{ color: changeColor(dailyChange) }}
          >
            어제보다 {signedMoney(dailyChange, currency)}
          </p>
        )
      )}
      {/* 복리 무중단 — 자본을 빼서 소비하지 않고 복리를 지켜온 기간(멍거 제1원칙). 행동·시간만, 시세 무관. */}
      {compoundingStreak && !compoundingStreak.isEmpty && (
        <p className="mt-2 text-sm font-medium text-muted-foreground tabular-nums">
          복리 무중단{" "}
          {compoundingStreak.unit === "month"
            ? `${compoundingStreak.months}개월`
            : `${compoundingStreak.days}일`}
          {compoundingStreak.bonusRecentDeposit && " 🔥"}
        </p>
      )}
      {/* 자산 구성 — "주식은 내 재산의 일부"를 눈으로. 스택 바(브랜드색 농도) + 점 범례. */}
      {assetParts.length > 0 && totalAssets > 0 && (
        <div className="mt-4">
          <span className="flex h-2 w-full overflow-hidden rounded-full bg-secondary">
            {assetParts.map((p, i) => (
              <span
                key={p.label}
                className={partShade(i)}
                style={{ width: `${(p.value / totalAssets) * 100}%` }}
              />
            ))}
          </span>
          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
            {assetParts.map((p, i) => (
              <span key={p.label} className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${partShade(i)}`} />
                {p.label} {money(p.value, currency)}
              </span>
            ))}
          </div>

          {/* 재무상태표 — 총자산(위 헤드라인) − 부채 = 순자산. 부채 있을 때만. */}
          {debtPart && (
            <dl className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-sm tabular-nums">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">− 부채</dt>
                <dd className="font-medium">
                  {money(Math.abs(debtPart.value), currency)}
                </dd>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-1 font-bold">
                <dt>= 순자산</dt>
                <dd>{money(netWorth, currency)}</dd>
              </div>
            </dl>
          )}
        </div>
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
  /** 투입 원금(설립자본 + 증자, 인출 차감 전 — 누적수익률 분모와 일치). */
  invested?: number;
  currency?: Currency;
  welcome: boolean;
}) {
  // 주식 사업부는 무조건 XIRR(연복리). 설립 90일(≈3개월) 전엔 누적으로 대체하지 않고
  // "정확한 수익률은 3개월 후" 안내만. 짧은 기간 연환산은 숫자가 크게 튀어 정직하지 않음.
  const isXirr = result.status === "xirr" && result.xirr !== null;
  const priceFailed = result.status === "price_unavailable";
  const daysLeft = Math.max(0, 90 - result.days);

  // vs 시장 — XIRR 기준으로만 비교(설립 90일 후).
  const canCompare =
    isXirr && benchmark.status === "ok" && benchmark.benchmarkXirr !== null;
  const market = canCompare ? benchmark.benchmarkXirr : null;
  const diff = canCompare ? result.xirr! - market! : null;

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
          <p className="text-sm font-semibold">연복리 수익률 (XIRR)</p>
          <p className="text-xs text-muted-foreground">
            내 매매 성적표 · 산 가격 대비
          </p>
        </div>
        <span className="text-muted-foreground">›</span>
      </div>
      {isXirr ? (
        <p
          className="mt-1 text-3xl font-extrabold tabular-nums"
          style={{ color: changeColor(result.xirr!) }}
        >
          {signedPct(result.xirr!)}
        </p>
      ) : (
        <p className="mt-1 text-2xl font-bold text-muted-foreground">
          {priceFailed ? "시세 갱신 필요" : "3개월 후 공개"}
        </p>
      )}
      {/* 투입원금(넣은 돈) → 누적손익(불어난 결과) 순. 누적수익률%는 손익 옆 괄호로. 모두 주식 사업부 한정. */}
      {invested != null && (
        <p className="mt-2 text-sm tabular-nums text-muted-foreground">
          투입원금 {money(invested, currency)}
        </p>
      )}
      {profit !== null && (
        <p className="mt-0.5 text-sm font-medium tabular-nums text-muted-foreground">
          누적손익 {signedMoney(profit, currency)}
          {result.cumulativeReturn != null &&
            ` (${signedPct(result.cumulativeReturn)})`}
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
            {priceFailed
              ? (result.message ?? "시세가 갱신되면 보여드려요.")
              : isXirr
                ? "데이터가 쌓이면 시장(KOSPI)과 비교해 드려요."
                : `설립 ${daysLeft}일 뒤 정확한 연복리 수익률(XIRR)이 공개돼요. 짧은 기간을 1년으로 환산하면 숫자가 크게 튀어서 그때까지 기다려요.`}
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
  // 외화 행을 환율 상세(/fx) 링크로 만들면 카드 전체 링크와 anchor 가 중첩된다.
  // footer 가 있으면 SectionCard 가 제목행만 링크(중첩 방지)하므로, 외화가 있는데
  // 호출자가 footer 를 안 줬으면 "환율 전체 보기" 푸터로 제목행 링크 모드를 보장한다.
  const footerToUse =
    footer ??
    (hasForeign ? (
      <CardAction href="/cash?tab=fx" scroll={false}>
        환율 전체 보기
      </CardAction>
    ) : undefined);
  return (
    <CardShell title="현금 비중" href="/cash" scroll={false} footer={footerToUse}>
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-bold tabular-nums">
          {cashWeight !== null ? pct(cashWeight) : "—"}
        </span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {money(cash, currency)}
        </span>
      </div>
      {hasForeign && (
        <ul className="mt-4 flex flex-col gap-1 border-t border-border pt-3">
          {rows.map(([c, v]) => {
            const inner = (
              <>
                <Flag code={c} />
                <span className="text-sm font-medium">{currencyMeta(c).name}</span>
                <span className="ml-auto font-bold tabular-nums">
                  {nativeMoney(v, c)}
                </span>
              </>
            );
            // ₩는 상세 없음. 외화는 탭하면 환율 상세(/fx/[code])로.
            return c === "KRW" ? (
              <li key={c} className="flex items-center gap-3 px-1 py-1.5">
                {inner}
              </li>
            ) : (
              <li key={c}>
                <Link
                  href={`/fx/${c}`}
                  scroll={false}
                  className="-mx-1 flex items-center gap-3 rounded-lg px-1 py-1.5 transition active:bg-secondary"
                >
                  {inner}
                  <span className="text-muted-foreground">›</span>
                </Link>
              </li>
            );
          })}
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
            {/* 종목 이벤트는 종목 아바타, 현금 이벤트(증자·인출·환전)는 거래화면과 같은 유형 아이콘 칩 */}
            {e.symbol ? (
              <SymbolAvatar name={e.name ?? EVENT_LABEL[e.type]} symbol={e.symbol} />
            ) : (
              <IconChip icon={EVENT_ICON[e.type]} size="md" type={e.type} />
            )}
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
    <CardShell title="회사 연혁" href="/timeline">
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
