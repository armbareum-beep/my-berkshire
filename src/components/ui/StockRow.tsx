import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { signedPct, changeColor } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * 단일 종목 행(디자인 §4-1) — 종목이 나오는 모든 곳 공통.
 *   [원형 아바타] 종목명(굵게) / 티커(작은 회색) ··· (값) 등락률(한국식 색)
 * 순수 컴포넌트(서버 호환). 화면별 제각각이던 행(이모지 원형·무아바타·티커 없음)을 이걸로 수렴.
 *
 * - `sub`: 종목명 아래 줄. 기본 = 티커(symbol). `null` 이면 숨김, ReactNode 면 커스텀(예: "10주 · 계좌").
 * - 우측: `right`(전체 커스텀) 우선. 없으면 `value`(굵은 값) + `changeRate`(등락색 %)로 표준 블록.
 * - 등락색은 **시세 변화에만**(여기 changeRate 가 곧 시세 등락) — inline changeColor OK.
 */
export function StockRow({
  symbol,
  name,
  href,
  sub,
  value,
  changeRate,
  right,
  avatarSize = "lg",
  className,
}: {
  symbol: string;
  name: string;
  href?: string;
  sub?: React.ReactNode | null;
  value?: React.ReactNode;
  changeRate?: number | null;
  right?: React.ReactNode;
  avatarSize?: "sm" | "md" | "lg";
  className?: string;
}) {
  const subLine = sub === null ? null : (sub ?? symbol);
  const rightBlock =
    right ??
    ((value != null || changeRate != null) && (
      <span className="ml-auto flex flex-col items-end">
        {value != null && (
          <span className="font-semibold tabular-nums">{value}</span>
        )}
        {changeRate != null && (
          <span
            className="text-sm font-medium tabular-nums"
            style={{ color: changeColor(changeRate) }}
          >
            {signedPct(changeRate)}
          </span>
        )}
      </span>
    ));

  const inner = (
    <div className="flex items-center gap-3">
      <Avatar name={name} symbol={symbol} size={avatarSize} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-bold">{name}</span>
        {subLine != null && (
          <span className="truncate text-sm text-muted-foreground tabular-nums">
            {subLine}
          </span>
        )}
      </span>
      {rightBlock}
    </div>
  );

  return href ? (
    <Link
      href={href}
      className={cn("block rounded-xl py-2 transition active:scale-[0.99]", className)}
    >
      {inner}
    </Link>
  ) : (
    <div className={cn("py-2", className)}>{inner}</div>
  );
}
