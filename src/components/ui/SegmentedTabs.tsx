import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * 세그먼트 탭(디자인 §2·§4) — 회색 컨테이너 + 활성 탭만 흰 카드(그림자).
 * 솔리드 `bg-primary` 네비/필터 칩(여러 개가 색면이 됨)을 중립 세그먼트로 대체.
 * 솔리드 파랑은 화면당 메인 액션 1개에만 남긴다. `/cash` 의 검증된 패턴을 공용화.
 * 순수 컴포넌트(링크). active 한 개를 호출부가 지정.
 */
export function SegmentedTabs({
  tabs,
  className,
}: {
  tabs: { label: string; href: string; active: boolean }[];
  className?: string;
}) {
  return (
    <div className={cn("flex w-fit gap-1 rounded-full bg-secondary p-1", className)}>
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-semibold transition",
            t.active ? "bg-card shadow-sm" : "text-muted-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
