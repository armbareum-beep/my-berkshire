import Link from "next/link";
import { money, signedMoney, signedPct, changeColor, type Currency } from "@/lib/format";
import {
  MANUAL_ASSET_KIND_LABEL,
  isSold,
  unrealizedGain,
  saleGain,
  assetReturn,
  type DivisionView,
} from "@/lib/finance/realAssets";

/**
 * 사업부 보유목록 카드 — 한 사업부(부동산/대체/사업)의 보유 자산 나열(주식 보유행처럼).
 * 자산별: 상단 금액(현재 평가/매도가) · 하단 번돈(자본손익 + 수익률 %). 임대수익은 제외(가격 상승만).
 * showTotalReturn=true 면 사업부 전체 수익률을 헤더에 표시(홈 — 비교 카드 없음).
 * /networth 는 위 "사업부별 누적수익률" 비교 카드가 전체를 담당하므로 false(개별만).
 */
export function DivisionCard({
  division,
  factor,
  currency,
  href,
  showTotalReturn = false,
  bare = false,
}: {
  division: DivisionView;
  factor: number;
  currency: Currency;
  href?: string;
  showTotalReturn?: boolean;
  /** 카드 틀/링크 없이 내용만 — 상위 카드(예: 통합 "실물 사업부")가 감쌀 때. */
  bare?: boolean;
}) {
  const { label, totals, assets } = division;
  const cv = (n: number) => n * factor;

  const inner = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{label}</p>
        {href && <span className="text-muted-foreground">›</span>}
      </div>

      {showTotalReturn && (
        <p
          className="mt-1 text-2xl font-extrabold tabular-nums"
          style={{ color: changeColor(totals.ret ?? 0) }}
        >
          {totals.ret != null ? signedPct(totals.ret) : "—"}
        </p>
      )}

      <ul className="mt-2 flex flex-col border-t border-border pt-1">
        {assets.map((a) => {
          const sold = isSold(a);
          const value = sold ? (a.salePrice ?? 0) : a.currentValue;
          const gain = sold ? saleGain(a) : unrealizedGain(a);
          const ret = assetReturn(a);
          return (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2">
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-bold">{a.name}</span>
                <span className="truncate text-sm text-muted-foreground">
                  {sold ? "매도됨" : MANUAL_ASSET_KIND_LABEL[a.kind]}
                </span>
              </span>
              <span className="flex flex-col items-end">
                <span className="font-semibold tabular-nums">
                  {money(cv(value), currency)}
                </span>
                {ret != null && (
                  <span
                    className="text-sm font-medium tabular-nums"
                    style={{ color: changeColor(gain) }}
                  >
                    {signedMoney(cv(gain), currency)} ({signedPct(ret)})
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );

  if (bare) {
    return <>{inner}</>;
  }
  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-2xl bg-card p-5 shadow-card transition active:scale-[0.99]"
      >
        {inner}
      </Link>
    );
  }
  return <section className="rounded-2xl bg-card p-5 shadow-card">{inner}</section>;
}
