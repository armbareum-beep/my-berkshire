import { PiggyBank, ThumbsUp } from "lucide-react";
import { won } from "@/lib/format";
import { cheapestBroker } from "@/lib/config/brokers";

/**
 * 수수료 랭킹 — 게이미피케이션(가치투자=비용 최소화). 새 입력 없이 계좌 수수료율 + 실제 거래량에서 파생.
 *  · 등급: 내 평균 수수료율이 주요 증권사 중 얼마나 저렴한지(상위 %).
 *  · 절약액: 올해 거래량 기준 최저 수수료 증권사로 바꿨을 때 연 절약(₩).
 */
export function FeeRankCard({
  blendedRate,
  rankPct,
  rankLabel,
  annualVolume,
  annualCommission,
  savings,
}: {
  /** 평균 수수료율(소수). */
  blendedRate: number;
  /** 주요 증권사 중 상위 %(저렴할수록 높음). */
  rankPct: number;
  rankLabel: string;
  /** 올해 거래대금(₩, 매수+매도 gross). */
  annualVolume: number;
  /** 올해 위탁수수료(₩, 추정). */
  annualCommission: number;
  /** 최저 수수료 대비 연 절약 가능액(₩). */
  savings: number;
}) {
  const pctStr = `${Math.round(blendedRate * 100 * 10000) / 10000}%`;
  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">수수료 랭킹</p>
        <span className="text-xs text-muted-foreground">평균 {pctStr}</span>
      </div>
      <p className="mt-2 text-2xl font-extrabold tracking-tight">{rankLabel}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">
        주요 증권사 중 저렴한 편 상위 {rankPct}%
      </p>

      {annualVolume > 0 ? (
        <dl className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">올해 거래대금</dt>
            <dd className="font-medium tabular-nums">{won(annualVolume)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">올해 위탁수수료</dt>
            <dd className="font-medium tabular-nums">{won(annualCommission)}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-4 border-t border-border pt-3 text-sm text-muted-foreground">
          올해 거래가 쌓이면 절약 가능액이 보여요.
        </p>
      )}

      {savings > 0 ? (
        <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2.5 text-sm font-medium text-accent-foreground">
          <PiggyBank size={16} className="shrink-0" />
          <span>{cheapestBroker().name}로 바꾸면 올해 거래 기준 연 {won(savings)} 절약</span>
        </p>
      ) : annualVolume > 0 ? (
        <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-secondary px-3 py-2.5 text-sm font-medium text-secondary-foreground">
          <ThumbsUp size={16} className="shrink-0" />
          <span>이미 최저 수준이에요. 비용 누수 없음.</span>
        </p>
      ) : null}
    </section>
  );
}
