"use client";
import { RANKING_WEIGHTS } from "@/lib/ranking";
import { todayKST } from "@/lib/date";
import { signedPct, changeColor } from "@/lib/format";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { GRADE_COLOR } from "./ScoreCard";
import { MetricRow } from "./MetricRow";
import type { LeaderboardRow } from "./Leaderboard";

const pad = (n: number) => String(n).padStart(2, "0");

// 구성 비중 스택 바 색 농도 — 유형이 최대 5개(주식/ETF/원자재/코인/현금)라 cards.tsx의
// 3단(HeroValuationCard.partShade)보다 한 단계 더 세분화. 초과분은 마지막 농도로 방어적 폴백.
const COMPOSITION_SHADES = [
  "bg-primary",
  "bg-primary/70",
  "bg-primary/45",
  "bg-primary/25",
  "bg-primary/12",
];
function compositionShade(i: number): string {
  return COMPOSITION_SHADES[i] ?? COMPOSITION_SHADES[COMPOSITION_SHADES.length - 1];
}

/**
 * 설립일 기준 "진행 중인 연차"(1년차부터 시작, 기념일 지나면 +1).
 * celebration.ts 의 anniversary() 와 동일한 사전식 날짜 비교 방식.
 */
function yearsInProgress(foundedAt: string, today: string): number {
  const [fy, fm, fd] = foundedAt.split("-").map(Number);
  const ty = Number(today.slice(0, 4));
  const md = `${pad(fm)}-${pad(fd)}`;
  const elapsedYears = today >= `${ty}-${md}` ? ty - fy : ty - fy - 1;
  return Math.max(0, elapsedYears) + 1;
}

interface TimelineItem {
  date: string;
  label: string;
}

/** 연혁 항목을 날짜순으로 — 금액·종목명 없이 라벨 + 날짜만. */
function buildTimeline(row: LeaderboardRow): TimelineItem[] {
  const items: TimelineItem[] = [];
  if (row.foundedAt) {
    items.push({ date: row.foundedAt, label: `${row.holdingName} 설립` });
  }
  const m = row.milestones;
  if (m) {
    if (m.first_buy_at) items.push({ date: m.first_buy_at, label: "첫 매수" });
    if (m.first_overseas_at) {
      items.push({ date: m.first_overseas_at, label: "첫 해외 진출" });
    }
    if (m.first_dividend_at) {
      items.push({ date: m.first_dividend_at, label: "첫 배당" });
    }
    for (const date of m.plan_completed_dates) {
      items.push({ date, label: "자본배분 계획 완수" });
    }
    for (const d of m.drawdowns_passed) {
      items.push({ date: d.recovered_at, label: `-${d.bucket}% 구간 인내 통과` });
    }
  }
  return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

const BASE_METRICS = [
  {
    key: "holdingPeriodScore" as const,
    label: "보유기간 가중 수익률",
    description: "오래 들고 있을수록 수익률을 더 크게 인정",
    weight: RANKING_WEIGHTS.holdingPeriod,
  },
  {
    key: "contrarianScore" as const,
    label: "역발상 매수율",
    description: "하락 중인 보유 종목을 추가매수한 비율",
    weight: RANKING_WEIGHTS.contrarian,
  },
  {
    key: "marketScore" as const,
    label: "시장 대비 성과",
    description: "같은 돈을 코스피에 넣었을 때보다 얼마나 잘했는지",
    weight: RANKING_WEIGHTS.marketOutperformance,
  },
  {
    key: "diversificationScore" as const,
    label: "분산도 일관성",
    description: "지금만이 아니라 과거 내내 분산되어 있었는지",
    weight: RANKING_WEIGHTS.diversification,
  },
  {
    key: "depositScore" as const,
    label: "적립 일관성",
    description: "매달 꾸준히 돈을 넣었는지",
    weight: RANKING_WEIGHTS.deposit,
  },
] as const;

/**
 * 리더보드 행 클릭 → 프로필 상세(지표 분해 + 공개 연혁 + 자산 구간·수익률·구성 비중).
 * 035 정책: XIRR 연환산 값·자산 구간 라벨·유형별 구성 비중(%)은 공개한다.
 * 단, 정확한 자산 금액과 보유 종목명은 ranking_scores 스키마 자체에 컬럼이 없어
 * 여전히 구조적으로 유입될 수 없다(비공개 불변식은 유지, 완화된 건 XIRR·구간·%뿐).
 */
export function RankerProfileSheet({
  row,
  open,
  onClose,
}: {
  row: LeaderboardRow | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!row) return null;

  const years = row.foundedAt ? yearsInProgress(row.foundedAt, todayKST()) : null;
  const timeline = buildTimeline(row);

  return (
    <BottomSheet open={open} onClose={onClose} title={row.holdingName}>
      <div className="px-5 pb-8">
        {/* 총점 + 등급 */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">투자 규율 점수</p>
            <p className="mt-1 text-5xl font-extrabold tabular-nums tracking-tight">
              {row.totalScore}
            </p>
            {years !== null && (
              <p className="mt-1 text-xs text-muted-foreground">설립 {years}년차</p>
            )}
          </div>
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl font-extrabold text-white"
            style={{ backgroundColor: GRADE_COLOR[row.grade] ?? "var(--muted-foreground)" }}
          >
            {row.grade}
          </div>
        </div>

        {/* 자산 구간·수익률(연환산) — 035. 정확한 금액이 아닌 구간 라벨만. 미산출 시 행 생략. */}
        {(row.assetBucket || row.xirr !== null) && (
          <dl className="mt-3 flex flex-col gap-1 text-xs tabular-nums">
            {row.assetBucket && (
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">주식 자산</dt>
                <dd className="font-medium">{row.assetBucket}</dd>
              </div>
            )}
            {row.xirr !== null && (
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">수익률(연환산)</dt>
                <dd className="font-medium" style={{ color: changeColor(row.xirr) }}>
                  {signedPct(row.xirr)}
                </dd>
              </div>
            )}
          </dl>
        )}

        {/* 구성 비중 — 유형별(주식/ETF/원자재/코인/현금) %만(cards.tsx 자산 구성 패턴 재사용). */}
        {row.composition && row.composition.slices.length > 0 && (
          <div className="mt-4">
            <span className="flex h-2 w-full overflow-hidden rounded-full bg-secondary">
              {row.composition.slices.map((s, i) => (
                <span
                  key={s.label}
                  className={compositionShade(i)}
                  style={{ width: `${s.pct}%` }}
                />
              ))}
            </span>
            <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
              {row.composition.slices.map((s, i) => (
                <span key={s.label} className="inline-flex items-center gap-1.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${compositionShade(i)}`} />
                  {s.label} {s.pct}%
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="my-5 border-t border-border" />

        {/* 7개 지표 */}
        <div className="divide-y divide-border">
          {BASE_METRICS.map((m) => (
            <MetricRow
              key={m.key}
              label={m.label}
              description={m.description}
              score={row[m.key]}
              weight={Math.round(m.weight * 100)}
              insufficient={false}
            />
          ))}
          <MetricRow
            label="저레버리지"
            description="부채 없이 자기자본으로 운용하는지"
            score={row.leverageScore ?? 0}
            weight={Math.round(RANKING_WEIGHTS.lowLeverage * 100)}
            insufficient={row.leverageScore == null}
            insufficientLabel="산출 대기"
          />
          <MetricRow
            label="저비용"
            description="수수료·세금 마찰이 원금 대비 낮은지"
            score={row.costScore ?? 0}
            weight={Math.round(RANKING_WEIGHTS.lowCost * 100)}
            insufficient={row.costScore == null}
            insufficientLabel="산출 대기"
          />
        </div>

        <div className="my-5 border-t border-border" />

        {/* 연혁 */}
        <div>
          <p className="text-sm font-semibold">연혁</p>
          {timeline.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">연혁 준비 중</p>
          ) : (
            <ol className="mt-3 flex flex-col gap-3">
              {timeline.map((item, idx) => (
                <li key={`${item.date}-${idx}`} className="flex items-start gap-3">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.date}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
