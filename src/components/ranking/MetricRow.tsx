interface MetricRowProps {
  label: string;
  description: string;
  score: number;
  weight: number;
  insufficient: boolean;
  /** insufficient=true 일 때 표시할 문구. 기본 "데이터 부족"(예: 랭커 프로필의 구버전 행은 "산출 대기"). */
  insufficientLabel?: string;
}

export function MetricRow({
  label,
  description,
  score,
  weight,
  insufficient,
  insufficientLabel = "데이터 부족",
}: MetricRowProps) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {insufficient ? (
            <span className="text-xs text-muted-foreground">{insufficientLabel}</span>
          ) : (
            <span className="text-sm font-bold tabular-nums" style={{ color: scoreColor(score) }}>
              {score}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">가중 {weight}%</span>
        </div>
      </div>
      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        {!insufficient && (
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${score}%`,
              backgroundColor: scoreColor(score),
            }}
          />
        )}
      </div>
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= 70) return "var(--primary)";
  if (score >= 40) return "var(--muted-foreground)";
  return "hsl(0 72% 51%)";
}
