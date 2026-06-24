import { Check } from "lucide-react";
import { EmojiIcon } from "@/components/ui/EmojiIcon";
import { moneyCompact } from "@/lib/format";
import { COMPANY_TIERS, type CompanyTier } from "@/lib/finance/companyTier";

/**
 * 기업 등급 카드 — 성장 허브 헤드라인.
 * 등급/진행바는 **납입 원금(invested)** 기준(평가액 아님, 헌법 II). 시장 등락엔 반응하지 않는다.
 */
export function CompanyTierCard({
  tier,
  invested,
}: {
  tier: CompanyTier;
  invested: number;
}) {
  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">기업 등급</p>
        <span className="text-xs text-muted-foreground tabular-nums">
          {tier.index + 1} / {tier.total}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <EmojiIcon emoji={tier.emoji} size={30} className="text-primary" />
        <div className="min-w-0">
          <p className="text-lg font-extrabold tracking-tight">{tier.label}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            운용 규모(납입) {moneyCompact(invested)}
          </p>
        </div>
      </div>

      {tier.nextLo !== null ? (
        <div className="mt-4">
          <span className="block h-2 w-full overflow-hidden rounded-full bg-secondary">
            <span
              className="block h-2 rounded-full bg-primary"
              style={{ width: `${Math.round(tier.progress * 100)}%` }}
            />
          </span>
          <p className="mt-2 text-xs text-muted-foreground tabular-nums">
            다음 등급까지 {moneyCompact(Math.max(0, tier.nextLo - invested))} · 목표{" "}
            {moneyCompact(tier.nextLo)}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">최고 등급에 도달했어요.</p>
      )}

      {/* 등급 사다리 — 5단계 전체. 달성/현재/예정 구분. */}
      <ul className="mt-4 flex flex-col gap-1 border-t border-border pt-3">
        {COMPANY_TIERS.map((t, i) => {
          const current = i === tier.index;
          const achieved = i < tier.index;
          return (
            <li
              key={t.label}
              className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 ${
                current ? "bg-accent" : ""
              }`}
            >
              <EmojiIcon
                emoji={t.emoji}
                size={16}
                className={
                  current
                    ? "text-primary"
                    : achieved
                      ? "text-foreground"
                      : "text-muted-foreground/50"
                }
              />
              <span
                className={`text-sm ${
                  current
                    ? "font-bold text-foreground"
                    : achieved
                      ? "text-foreground"
                      : "text-muted-foreground"
                }`}
              >
                {t.label}
              </span>
              <span className="ml-auto flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                {t.lo === 0 ? "시작" : `${moneyCompact(t.lo)}+`}
                {achieved && <Check size={13} className="text-primary" />}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-[11px] text-muted-foreground">
        등급은 시장 평가액이 아니라 납입한 자본·시간으로만 오릅니다.
      </p>
    </section>
  );
}
