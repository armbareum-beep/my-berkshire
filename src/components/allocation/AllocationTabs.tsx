import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * 자산배분 렌즈 탭 — **한 진실을 네 각도로 본다.**
 *
 * 저장되는 건 종목별 평면 목표비중 하나뿐이고, 유형·국가·산업은 그걸 묶어서 보는
 * 렌즈다(`lib/targetLens.ts`). 그래서 탭이지 별개 화면이 아니다.
 *
 * 종목별이 맨 앞인 이유는 그게 **진실 그 자체**이기 때문이다 — 나머지 셋은 파생이다.
 */
const TABS = [
  { label: "종목별", href: "/allocation/stock", key: "stock" },
  { label: "유형별", href: "/allocation/type", key: "type" },
  { label: "국가별", href: "/allocation/country", key: "country" },
  { label: "산업별", href: "/allocation/sector", key: "sector" },
] as const;

export function AllocationTabs({ active }: { active: string }) {
  return (
    <nav className="flex gap-1 rounded-xl bg-secondary p-1">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            "flex-1 rounded-lg py-1.5 text-center text-sm font-semibold transition",
            active === t.key
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
