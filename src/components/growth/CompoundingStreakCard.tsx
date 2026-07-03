import Link from "next/link";
import { Flame } from "lucide-react";
import type { CompoundingStreak } from "@/lib/finance/compoundingStreak";

/**
 * 복리 무중단 카드 — 성장 허브 상시 노출.
 * `data.compoundingStreak`(이미 계산됨)를 그대로 받아 렌더링만 한다 — 새 계산 없음.
 * 계산 로직(compoundingStreak.ts)은 보류 영역이라 여기서는 절대 손대지 않는다.
 * `/report`(분기 결산)의 복리 무중단 상세와 같은 원본 값을 공유한다.
 */
export function CompoundingStreakCard({
  streak,
}: {
  streak: CompoundingStreak;
}) {
  return (
    <Link
      href="/report"
      scroll={false}
      className="block rounded-2xl bg-card p-5 shadow-card transition active:scale-[0.99]"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">복리 무중단</p>
        <span className="text-muted-foreground">›</span>
      </div>

      {streak.isEmpty ? (
        <p className="mt-2 text-sm text-muted-foreground">
          첫 자본을 넣으면 복리 시계가 시작돼요
        </p>
      ) : (
        <>
          <p className="mt-2 flex items-center gap-1.5 text-lg font-extrabold tracking-tight tabular-nums">
            복리 무중단{" "}
            {streak.unit === "month" ? `${streak.months}개월` : `${streak.days}일`}
            {streak.bonusRecentDeposit && (
              <Flame size={16} className="text-warn" aria-hidden />
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            소비성 인출 없이 복리를 지켜온 기간
          </p>
        </>
      )}
    </Link>
  );
}
