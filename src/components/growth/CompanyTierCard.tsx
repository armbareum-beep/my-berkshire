import { Check } from "lucide-react";
import { EmojiIcon } from "@/components/ui/EmojiIcon";
import { moneyCompact } from "@/lib/format";
import { COMPANY_TIERS, type CompanyTier } from "@/lib/finance/companyTier";

function fmtMonths(m: number): string {
  if (m <= 0) return "0개월";
  const years = Math.floor(m / 12);
  const months = m % 12;
  if (years === 0) return `${months}개월`;
  if (months === 0) return `${years}년`;
  return `${years}년 ${months}개월`;
}

/**
 * 기업 등급 카드 — 성장 허브 헤드라인.
 * 납입 원금 + 운용기간 이중 게이트(헌법 II).
 * 과거 기록을 입력할수록 운용기간이 늘어 레벨업 가능.
 */
export function CompanyTierCard({
  tier,
  invested,
  monthsActive,
}: {
  tier: CompanyTier;
  invested: number;
  monthsActive: number;
}) {
  const isTop = tier.nextLo === null;

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
            납입 {moneyCompact(invested)} · {fmtMonths(monthsActive)}
          </p>
        </div>
      </div>

      {!isTop ? (
        <div className="mt-4 flex flex-col gap-2.5">
          {/* 자본 진행 바 */}
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground tabular-nums">
              <span>납입 자본</span>
              <span>
                {tier.capitalProgress < 1
                  ? `${moneyCompact(Math.max(0, (tier.nextLo ?? 0) - invested))} 더`
                  : "충족 ✓"}
              </span>
            </div>
            <span className="block h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <span
                className="block h-1.5 rounded-full bg-primary transition-all"
                style={{ width: `${Math.round(tier.capitalProgress * 100)}%` }}
              />
            </span>
          </div>

          {/* 기간 진행 바 */}
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground tabular-nums">
              <span>운용 기간</span>
              <span>
                {tier.monthsProgress < 1
                  ? `${fmtMonths(Math.max(0, (tier.nextMinMonths ?? 0) - monthsActive))} 더`
                  : "충족 ✓"}
              </span>
            </div>
            <span className="block h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <span
                className="block h-1.5 rounded-full bg-primary transition-all"
                style={{ width: `${Math.round(tier.monthsProgress * 100)}%` }}
              />
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            목표 {moneyCompact(tier.nextLo ?? 0)} · {fmtMonths(tier.nextMinMonths ?? 0)} — 둘 다 충족하면 레벨업
          </p>
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">최고 등급에 도달했어요.</p>
      )}

      {/* 등급 사다리 */}
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
                {t.lo === 0 ? "시작" : `${moneyCompact(t.lo)} · ${fmtMonths(t.minMonths)}`}
                {achieved && <Check size={13} className="text-primary" />}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-[11px] text-muted-foreground">
        납입 자본과 운용 기간이 모두 충족되어야 다음 등급으로 올라갑니다.
      </p>
    </section>
  );
}
