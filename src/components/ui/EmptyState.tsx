import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 빈 상태 공용 컴포넌트(디자인: 토스 톤 — "~없어요" + 다음 행동 안내, 비난·명령 금지).
 * 화면마다 카드 안/밖 양쪽에 쓰이므로 SectionCard로 감싸지 않는 독립 셸(순수 서버 컴포넌트).
 *
 * - `icon`: secondary 칩 안에 렌더. 없으면 칩 자체를 생략.
 * - `title`: "~없어요" 톤.
 * - `description`: "…하면 …돼요" 톤(비난·명령 금지).
 * - `cta`: 다음 행동 버튼(선택). 카드 내부에 셸 없이 쓰려면 `className="shadow-none p-0"` 등으로 오버라이드.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  cta,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  cta?: { label: string; href: string; scroll?: boolean };
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl bg-card p-8 text-center shadow-card", className)}>
      {Icon && (
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <Icon size={22} strokeWidth={1.5} aria-hidden />
        </div>
      )}
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      {cta && (
        <Link
          href={cta.href}
          scroll={cta.scroll}
          className="mt-4 inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}
