import Link from "next/link";
import type { EtfStats } from "@/lib/finance/etfStats";
import type { CatalogItem } from "@/lib/finance/catalog";
import { getEtfIndexGroups } from "@/lib/finance/catalog";
import { WeightBar } from "@/components/ui/WeightBar";
import { pct } from "@/lib/format";

interface Props {
  stats: EtfStats | null;
  catalogItem: CatalogItem | undefined;
  divYield: number | null;
  isProxyData?: boolean;
  isKrxHoldings?: boolean;
}

function fmt(v: number | null, digits = 1, suffix = "배"): string {
  return v != null ? `${v.toFixed(digits)}${suffix}` : "—";
}

export function EtfFundamentalsSection({ stats, catalogItem, divYield, isProxyData, isKrxHoldings }: Props) {
  const eq = stats?.equityHoldings ?? null;
  const ter = catalogItem?.ter ?? null;
  const trackedIndex = catalogItem?.trackedIndex ?? null;

  const indexGroups = getEtfIndexGroups();
  const sameIndexGroup = trackedIndex
    ? indexGroups.find((g) => g.index === trackedIndex)
    : null;

  const sectors = stats?.sectors ?? [];
  const holdings = stats?.holdings ?? [];

  const hasMetrics = eq !== null && (eq.per !== null || eq.pbr !== null);
  const hasSectors = sectors.length > 0;
  const hasHoldings = holdings.length > 0;

  const noData = !hasMetrics && !hasSectors && !hasHoldings && ter === null;

  if (noData) {
    return (
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <p className="text-sm font-semibold">ETF 구성 지표</p>
        <p className="mt-2 text-sm text-muted-foreground">
          이 ETF의 구성 데이터를 아직 불러올 수 없습니다.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <p className="mb-4 text-sm font-semibold">ETF 구성 지표</p>

        <div className="grid grid-cols-2 gap-y-4">
          <MetricCell label="가중평균 PER" value={fmt(eq?.per ?? null)} />
          <MetricCell label="가중평균 PBR" value={fmt(eq?.pbr ?? null, 2)} />
          <MetricCell
            label="가중평균 ROE"
            value={eq?.roe != null ? pct(eq.roe) : "—"}
          />
          <MetricCell
            label="배당수익률"
            value={divYield != null ? pct(divYield) : "—"}
          />
          {ter != null && (
            <MetricCell label="총보수(TER)" value={`${(ter * 100).toFixed(2)}%/년`} />
          )}
        </div>

        {sameIndexGroup && sameIndexGroup.etfs.length > 1 && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              {trackedIndex} 추종 ETF 비용 비교
            </p>
            <ul className="flex flex-col gap-1.5">
              {sameIndexGroup.etfs.map((e) => (
                <li key={e.symbol} className="flex items-center justify-between text-xs">
                  <Link
                    href={`/stocks/${e.symbol}`}
                    className={`${e.symbol === catalogItem?.symbol ? "font-semibold text-foreground" : "text-muted-foreground"} transition active:opacity-70`}
                  >
                    {e.name}
                  </Link>
                  <span className={`tabular-nums ${e.symbol === catalogItem?.symbol ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                    {(e.ter * 100).toFixed(2)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-4 text-xs text-muted-foreground">
          출처: Yahoo Finance · 구성 종목 가중평균 · 참고용
          {isProxyData && catalogItem?.yahooProxy && (
            <> · {catalogItem.yahooProxy} 기준 (동일 지수 추종)</>
          )}
        </p>
      </section>

      {hasSectors && (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <p className="mb-3 text-sm font-semibold">섹터 배분</p>
          <ul className="flex flex-col gap-2.5">
            {sectors.slice(0, 8).map((s) => (
              <li key={s.name}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span>{s.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {pct(s.weight)}
                  </span>
                </div>
                <WeightBar weight={s.weight} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            출처: Yahoo Finance · 시점 따라 변동
          </p>
        </section>
      )}

      {hasHoldings && (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <p className="mb-3 text-sm font-semibold">PDF 구성종목 상위 10</p>
          <ul className="flex flex-col gap-2">
            {holdings.map((h) => (
              <li key={h.symbol} className="flex items-center justify-between text-sm">
                <Link
                  href={`/stocks/${h.symbol}`}
                  className="flex items-center gap-2 transition active:opacity-70"
                >
                  <span className="font-medium">{h.name || h.symbol}</span>
                  <span className="text-xs text-muted-foreground">{h.symbol}</span>
                </Link>
                <span className="tabular-nums text-muted-foreground">
                  {pct(h.weight)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            {isKrxHoldings ? "출처: KRX PDF · 전일 기준" : "출처: Yahoo Finance · 시점 따라 변동"}
          </p>
        </section>
      )}
    </>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-extrabold tabular-nums">{value}</span>
    </div>
  );
}
