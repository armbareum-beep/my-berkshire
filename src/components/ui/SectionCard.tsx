import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * 단일 카드 표면(디자인 §4·§7) — 흰 카드가 **그림자로** 떠 있는 토스 무드.
 * 테두리·ring 으로 분리하지 않는다(spec 위반). 화면별 수동 `rounded-2xl bg-card shadow-card`
 * 복제를 이 하나로 수렴. 순수 컴포넌트(서버 호환).
 *
 * - `title`: 좌상단 라벨. `action`(우상단 커스텀) 또는 `href`(우상단 ›) 동반 가능.
 * - `href`: footer 없으면 카드 전체가 링크. footer 있으면 제목행만 링크(링크 중첩 방지).
 * - `footer`: 상단 구분선 + 하단 액션 행.
 */
export function SectionCard({
  title,
  href,
  action,
  footer,
  padding = "lg",
  className,
  scroll = true,
  children,
}: {
  title?: string;
  href?: string;
  /** 우상단 커스텀(있으면 href › 대신 이걸 표시 — 예: 토글·"전체 보기 ›"). */
  action?: React.ReactNode;
  footer?: React.ReactNode;
  padding?: "lg" | "sm";
  className?: string;
  /** false 면 내비 시 스크롤 위치 보존(바텀시트 진입 카드용 — 배경 스크롤 유지). */
  scroll?: boolean;
  children: React.ReactNode;
}) {
  const surface = cn(
    "rounded-2xl bg-card shadow-card",
    padding === "lg" ? "p-5" : "p-4",
    className,
  );

  const right = action ?? (href ? <span className="text-muted-foreground">›</span> : null);
  const titleRow = title ? (
    <div className="mb-3 flex items-center justify-between gap-2">
      <p className="text-sm font-semibold">{title}</p>
      {right}
    </div>
  ) : null;

  // footer 가 있으면 카드 전체를 링크로 감싸지 않는다(footer 내부 Link 중첩 방지).
  if (footer) {
    return (
      <section className={surface}>
        {title &&
          (href && !action ? (
            <Link
              href={href}
              scroll={scroll}
              className="mb-3 flex items-center justify-between gap-2 transition active:opacity-70"
            >
              <p className="text-sm font-semibold">{title}</p>
              <span className="text-muted-foreground">›</span>
            </Link>
          ) : (
            titleRow
          ))}
        {children}
        <div className="mt-4 border-t border-border pt-3">{footer}</div>
      </section>
    );
  }

  const inner = (
    <>
      {titleRow}
      {children}
    </>
  );
  // href 가 있고 우상단 action 이 없으면 카드 전체 링크.
  return href && !action ? (
    <Link href={href} scroll={scroll} className={cn(surface, "block transition active:scale-[0.99]")}>
      {inner}
    </Link>
  ) : (
    <section className={surface}>{inner}</section>
  );
}
