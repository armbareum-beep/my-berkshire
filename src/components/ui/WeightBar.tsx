import { cn } from "@/lib/utils";

/**
 * 비중·진행 막대(디자인 §4 "가는 라인") — 회색 트랙 + 단색 채움.
 * BreakdownCard·AllocationCard·StyleCard 의 중복 막대를 하나로. 순수 컴포넌트.
 * 색은 데이터 막대라 primary 단색(채도 면 아님). weight 0~1.
 */
export function WeightBar({
  weight,
  className,
  fillClassName = "bg-primary",
}: {
  weight: number;
  className?: string;
  fillClassName?: string;
}) {
  const w = Math.max(0, Math.min(1, weight));
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-secondary", className)}>
      <div
        className={cn("h-full rounded-full", fillClassName)}
        style={{ width: `${w * 100}%` }}
      />
    </div>
  );
}
