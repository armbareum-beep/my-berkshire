import { RANKING_WEIGHTS, type RankingScore } from "@/lib/ranking";
import { MetricRow } from "./MetricRow";

const METRICS = [
  {
    key: "holdingPeriod" as const,
    insufficientKey: "holdingPeriodInsufficient" as const,
    label: "보유기간 가중 수익률",
    description: "오래 들고 있을수록 수익률을 더 크게 인정",
    weight: RANKING_WEIGHTS.holdingPeriod,
  },
  {
    key: "contrarian" as const,
    insufficientKey: "contrarianInsufficient" as const,
    label: "역발상 매수율",
    description: "하락 중인 보유 종목을 추가매수한 비율",
    weight: RANKING_WEIGHTS.contrarian,
  },
  {
    key: "marketOutperformance" as const,
    insufficientKey: "marketInsufficient" as const,
    label: "시장 대비 성과",
    description: "같은 돈을 코스피에 넣었을 때보다 얼마나 잘했는지",
    weight: RANKING_WEIGHTS.marketOutperformance,
  },
  {
    key: "diversification" as const,
    insufficientKey: "diversificationInsufficient" as const,
    label: "분산도 일관성",
    description: "지금만이 아니라 과거 내내 분산되어 있었는지",
    weight: RANKING_WEIGHTS.diversification,
  },
  {
    key: "deposit" as const,
    insufficientKey: "depositInsufficient" as const,
    label: "적립 일관성",
    description: "매달 꾸준히 돈을 넣었는지",
    weight: RANKING_WEIGHTS.deposit,
  },
  {
    key: "lowLeverage" as const,
    insufficientKey: "leverageInsufficient" as const,
    label: "저레버리지",
    description: "부채 없이 자기자본으로 운용하는지",
    weight: RANKING_WEIGHTS.lowLeverage,
  },
  {
    key: "lowCost" as const,
    insufficientKey: "costInsufficient" as const,
    label: "저비용",
    description: "수수료·세금 마찰이 원금 대비 낮은지",
    weight: RANKING_WEIGHTS.lowCost,
  },
] as const;

export const GRADE_COLOR: Record<string, string> = {
  S: "var(--primary)",
  "A+": "var(--primary)",
  A: "var(--primary)",
  "B+": "var(--muted-foreground)",
  B: "var(--muted-foreground)",
  C: "hsl(0 72% 51%)",
};

export function ScoreCard({ score }: { score: RankingScore }) {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card">
      {/* 헤더: 총점 + 등급 */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">투자 규율 점수</p>
          <p className="mt-1 text-5xl font-extrabold tabular-nums tracking-tight">
            {score.total}
          </p>
        </div>
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-extrabold text-white"
          style={{ backgroundColor: GRADE_COLOR[score.grade] ?? "var(--muted-foreground)" }}
        >
          {score.grade}
        </div>
      </div>

      {/* 구분선 */}
      <div className="my-5 border-t border-border" />

      {/* 지표 목록 */}
      <div className="divide-y divide-border">
        {METRICS.map((m) => (
          <MetricRow
            key={m.key}
            label={m.label}
            description={m.description}
            score={score[m.key]}
            weight={Math.round(m.weight * 100)}
            insufficient={score[m.insufficientKey]}
          />
        ))}
      </div>
    </div>
  );
}
