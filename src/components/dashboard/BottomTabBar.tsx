"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, PieChart, Plus, type LucideIcon } from "lucide-react";

/**
 * 하단 탭바 — **평시(resting) 화면에만**(대시보드·자산·현금·자산배분·리밸런싱·계좌·종목 등).
 * ⛔ "여정 중" 화면엔 넣지 않는다(이탈 방지, 디자인 §4): 온보딩·로그인 + **거래 입력(/transactions·/acquire)**.
 * 기록은 가운데 강조된 ＋ 버튼(토스식). 아이콘은 거래화면과 동일한 lucide 라인(이모지 금지).
 *
 * 구성은 코어 단순화 스펙 v1.1 §2 — 5탭(홈·검색·기록·랭킹·마이 버크셔)을 **2탭 + 기록**으로 축소.
 * 검색은 기록 위저드 내부 검색으로, 랭킹은 legacy 로 내린다(라우트 자체는 남겨둔다, §5.1).
 */
const TABS: {
  href: string;
  label: string;
  icon?: LucideIcon;
  action?: boolean;
  /** 활성 판정용 경로 접두사. 생략하면 href 하나만 본다. */
  match?: string[];
}[] = [
  {
    href: "/dashboard",
    label: "마이 버크셔",
    icon: Building2,
    // §22.2 — /dashboard·/growth·/networth·/holdings 는 하나로 병합될 화면들이라 함께 활성.
    match: ["/dashboard", "/growth", "/networth", "/holdings"],
  },
  { href: "/transactions", label: "기록", action: true },
  {
    href: "/rebalance",
    label: "자본배분",
    icon: PieChart,
    // §22.2 — /allocation + /rebalance 는 /allocate 로 통합 예정.
    match: ["/rebalance", "/allocation"],
  },
];

export function BottomTabBar() {
  const pathname = usePathname();
  return (
    // pb는 세이프에어리어(노치·홈 인디케이터) 대응 — layout.tsx의 viewportFit:"cover" 없이는
    // iOS에서 env(safe-area-inset-bottom)이 0으로 계산돼 무효화된다(둘이 한 세트).
    <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[480px] border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
      <ul className="flex items-center">
        {TABS.map((t) => {
          if (t.action) {
            return (
              <li key={t.href} className="flex flex-1 justify-center">
                <Link
                  href={t.href}
                  className="flex items-center justify-center py-1.5"
                  aria-label="기록"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_4px_12px_rgba(49,130,246,0.35)]">
                    <Plus size={24} strokeWidth={2.5} aria-hidden />
                  </span>
                </Link>
              </li>
            );
          }
          // 하위 경로(/rebalance/country 등)에서도 탭이 켜져 있어야 위치감이 유지된다.
          const active = (t.match ?? [t.href]).some(
            (p) => pathname === p || pathname.startsWith(`${p}/`),
          );
          const Icon = t.icon!;
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                className="flex flex-col items-center gap-1 py-2.5 text-xs font-medium"
                style={{
                  color: active ? "var(--primary)" : "var(--muted-foreground)",
                }}
              >
                <Icon size={22} strokeWidth={active ? 2.5 : 2} aria-hidden />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
