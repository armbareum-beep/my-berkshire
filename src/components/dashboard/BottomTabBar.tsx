"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Building2, Plus, Trophy, type LucideIcon } from "lucide-react";

/**
 * 하단 탭바 — **평시(resting) 화면에만**(대시보드·자산·챌린지·현금·자산배분·리밸런싱·계좌·종목 등).
 * ⛔ "여정 중" 화면엔 넣지 않는다(이탈 방지, 디자인 §4): 온보딩·로그인 + **거래 입력(/transactions·/acquire)**.
 * 기록은 가운데 강조된 ＋ 버튼(토스식). 아이콘은 거래화면과 동일한 lucide 라인(이모지 금지).
 */
const TABS: {
  href: string;
  label: string;
  icon?: LucideIcon;
  action?: boolean;
}[] = [
  { href: "/dashboard", label: "홈", icon: Home },
  { href: "/search", label: "검색", icon: Search },
  { href: "/transactions", label: "기록", action: true },
  { href: "/ranking", label: "랭킹", icon: Trophy },
  { href: "/growth", label: "마이 버크셔", icon: Building2 },
];

export function BottomTabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[480px] border-t border-border bg-card">
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
          const active = pathname === t.href;
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
