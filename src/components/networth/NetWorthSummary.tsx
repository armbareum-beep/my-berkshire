import { money, pct, type Currency } from "@/lib/format";
import { CountUp } from "@/components/ui/CountUp";
import {
  equityMultiplier,
  leverageRatio,
  leverageVerdict,
  netWorth,
  type LeverageLevel,
} from "@/lib/finance/liabilities";

// 레버리지 등급 색 — 무차입·안전은 중립, 주의·위험은 경고 앰버(--warn).
// 등락 빨강/파랑은 시세에만 쓰므로 위험을 파랑(--fall)으로 칠하지 않는다(§색 규칙).
// 심각도는 emoji(🟡/🔴)와 굵기로 구분.
const LEVEL_STYLE: Record<LeverageLevel, string> = {
  none: "bg-secondary text-secondary-foreground",
  safe: "bg-secondary text-secondary-foreground",
  caution: "bg-warn-tint text-warn",
  danger: "bg-warn-tint text-warn",
};

/**
 * 순자산 요약 — 재무상태표의 바닥줄.
 *   순자산 = 총자산 − 총부채. 레버리지 등급(버핏式 코칭) 동반.
 * 금액은 ₩ 기준으로 받아 factor 로 표시 통화 환산. 비율은 통화 무관.
 */
export function NetWorthSummary({
  assetsKrw,
  debtKrw,
  annualInterestKrw,
  factor,
  currency,
  priceAvailable,
}: {
  assetsKrw: number | null; // 시세 실패 시 null
  debtKrw: number;
  annualInterestKrw: number;
  factor: number;
  currency: Currency;
  priceAvailable: boolean;
}) {
  const cv = (n: number) => n * factor;
  const hasDebt = debtKrw > 0;

  // 자산을 모르면(시세 실패) 순자산도 추정 불가 — 부채만 표시.
  if (!priceAvailable || assetsKrw === null) {
    return (
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <p className="text-sm text-muted-foreground">순자산</p>
        <p className="mt-1 text-lg font-bold text-muted-foreground">
          시세 갱신 필요
        </p>
        {hasDebt && (
          <p className="mt-2 text-sm text-muted-foreground">
            총부채 {money(cv(debtKrw), currency)}
          </p>
        )}
      </section>
    );
  }

  const nw = netWorth(assetsKrw, debtKrw);
  const verdict = leverageVerdict(assetsKrw, debtKrw);
  const ratio = leverageRatio(assetsKrw, debtKrw);
  const mult = equityMultiplier(assetsKrw, debtKrw); // 수익률 증폭 계수(자산÷순자산)

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <p className="text-sm text-muted-foreground">순자산</p>
      <CountUp
        value={cv(nw)}
        format="money"
        currency={currency}
        className="mt-1 block text-3xl font-extrabold tracking-tight"
      />

      {/* 자산 − 부채 분해 */}
      <div className="mt-3 flex items-center gap-2 text-sm tabular-nums">
        <span className="text-muted-foreground">
          총자산 {money(cv(assetsKrw), currency)}
        </span>
        {hasDebt && (
          <>
            <span className="text-muted-foreground">−</span>
            {/* 부채는 시세 변화가 아니므로 파랑(--fall) 금지 — 잉크로 강조만. */}
            <span className="font-medium text-foreground">
              부채 {money(cv(debtKrw), currency)}
            </span>
          </>
        )}
      </div>

      {/* 레버리지 등급(버핏式 코칭) */}
      <div
        className={
          "mt-4 rounded-xl px-4 py-3 text-sm " + LEVEL_STYLE[verdict.level]
        }
      >
        <p className="font-bold">
          {verdict.title}
          {hasDebt && Number.isFinite(ratio) && (
            <span className="ml-1.5 font-semibold">
              · 부채비율 {pct(ratio)}
            </span>
          )}
        </p>
        <p className="mt-0.5 leading-relaxed opacity-90">{verdict.message}</p>
        {/* 수익률 뻥튀기 = 레버리지 배수(자산÷순자산). 자기자본이 자산 변동에 몇 배 노출됐나. */}
        {hasDebt && mult !== null && mult > 1 && (
          <p className="mt-1.5 text-xs font-medium opacity-90">
            레버리지 {mult.toFixed(1)}배 · 자산이 1% 움직이면 순자산은 약{" "}
            {mult.toFixed(1)}% 움직여요 (이익도 손실도)
          </p>
        )}
        {hasDebt && mult === null && (
          <p className="mt-1.5 text-xs font-medium opacity-90">
            부채가 자산을 넘어섰어요 — 채무초과 상태예요.
          </p>
        )}
        {hasDebt && annualInterestKrw > 0 && (
          <p className="mt-1 text-xs opacity-80">
            연 이자 부담 약 {money(cv(annualInterestKrw), currency)}
          </p>
        )}
      </div>
    </section>
  );
}
