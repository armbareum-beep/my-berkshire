import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Coins,
  ArrowDownToLine,
  ArrowUpFromLine,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EventType } from "@/lib/finance/valuation";

/**
 * 거래 유형 아이콘 — 모노톤 라인(디자인: 색은 변화·액션에만, 아이콘은 무채색).
 * 입력화면 허브와 활동 리스트가 같은 아이콘을 공유(드리프트 방지). 이모지 금지.
 */
export const EVENT_ICON: Record<EventType, LucideIcon> = {
  BUY: ArrowDownLeft, // 자산 유입
  SELL: ArrowUpRight, // 자산 유출
  DIVIDEND: Coins, // 현금 수익
  DEPOSIT: ArrowDownToLine, // 회사에 현금 넣기(증자)
  WITHDRAWAL: ArrowUpFromLine, // 회사에서 현금 빼기(인출)
  EXCHANGE: ArrowLeftRight, // 통화 교환
};

const CHIP = {
  md: "h-9 w-9",
  lg: "h-11 w-11",
} as const;
const GLYPH = { md: 18, lg: 22 } as const;

const TINT: Record<EventType, string> = {
  BUY: "bg-red-50 text-red-500 border border-red-100/30",
  SELL: "bg-blue-50 text-blue-500 border border-blue-100/30",
  DIVIDEND: "bg-amber-50 text-amber-600 border border-amber-100/30",
  DEPOSIT: "bg-emerald-50 text-emerald-600 border border-emerald-100/30",
  WITHDRAWAL: "bg-slate-100 text-slate-600 border border-slate-200/30",
  EXCHANGE: "bg-purple-50 text-purple-600 border border-purple-100/30",
};

/**
 * 아이콘 칩 — 거래 종류에 맞는 은은한 파스텔 틴트 배경 칩 또는 기존 모노톤 칩(기본값).
 * 활동 행(md)·허브 카드(lg) 공용.
 */
export function IconChip({
  icon: Icon,
  size = "md",
  type,
  className,
}: {
  icon: LucideIcon;
  size?: keyof typeof CHIP;
  type?: EventType;
  className?: string;
}) {
  const tintClass = type ? TINT[type] : "bg-secondary text-secondary-foreground";
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full transition-colors",
        tintClass,
        CHIP[size],
        className,
      )}
    >
      <Icon size={GLYPH[size]} strokeWidth={1.5} aria-hidden />
    </span>
  );
}
