import { cn } from "@/lib/utils";
import { brandLogo } from "@/lib/finance/brandColor";

/**
 * 종목/계좌 이니셜 원형 — **브랜드색 배경 + 이니셜**(디자인 §4-1, 목업과 동일 무드).
 * 색은 symbol(없으면 name)으로 결정: 큐레이트된 주요 종목은 실제 브랜드색,
 * 그 외는 해시 기반 차분한 고유색. 회색 이니셜의 휑함을 없앤다.
 * 순수 컴포넌트(서버 호환). 사이즈 통일(h-10/h-9/h-7 → size prop).
 */
const SIZE = {
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-10 w-10 text-base",
} as const;

export function Avatar({
  name,
  symbol,
  size = "lg",
  className,
}: {
  name: string;
  /** 색 결정용 종목코드/티커(있으면 큐레이트 브랜드색 우선). 없으면 name 으로. */
  symbol?: string;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const { bg, fg } = brandLogo(symbol, name);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-bold",
        SIZE[size],
        className,
      )}
      style={{ backgroundColor: bg, color: fg }}
    >
      {name.slice(0, 1)}
    </span>
  );
}
