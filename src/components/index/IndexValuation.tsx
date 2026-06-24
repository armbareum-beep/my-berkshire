import type { IndexSummary, ShillerCape } from "@/lib/finance/indexStats";
import { metricStatus, statusText } from "@/lib/finance/indexMetrics";
import { pct } from "@/lib/format";

interface Props {
  summary: IndexSummary | null;
  cape: ShillerCape | null;
  isSnp500: boolean;
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-extrabold tabular-nums">{value}</span>
    </div>
  );
}

export function IndexValuation({ summary, cape, isSnp500 }: Props) {
  const ctx = {
    isKoreaIndex: summary?.isKoreaIndex ?? false,
    krxAvailable: summary?.krxAvailable ?? false,
  };

  // (값, KRX 출처 여부) — PER·PBR·배당은 한국 지수에서 KRX 캐시 전용, ROE 는 보유종목 가중.
  const cell = (label: string, value: number | null, fmt: (v: number) => string, krxSourced: boolean) => {
    const status = metricStatus(value ?? null, ctx, krxSourced);
    return (
      <Cell
        key={label}
        label={label}
        value={status === "value" && value != null ? fmt(value) : statusText(status)}
      />
    );
  };

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <p className="mb-4 text-sm font-semibold">현재 밸류에이션</p>
      <div className="grid grid-cols-2 gap-y-4">
        {cell("Trailing PER", summary?.trailingPE ?? null, (v) => `${v.toFixed(1)}배`, true)}
        {cell("PBR", summary?.pbr ?? null, (v) => `${v.toFixed(2)}배`, true)}
        {cell("ROE (PBR÷PER)", summary?.roe ?? null, (v) => pct(v), true)}
        {cell("배당수익률", summary?.dividendYield ?? null, (v) => pct(v), true)}
        {isSnp500 && cape != null && (
          <Cell
            label={`Shiller CAPE (${cape.asOf.slice(0, 7)})`}
            value={cape.value.toFixed(1)}
          />
        )}
      </div>
      {!summary && !cape && (
        <p className="mt-3 text-xs text-muted-foreground">
          Yahoo Finance에서 밸류에이션 데이터를 가져올 수 없어요.
        </p>
      )}
      {(summary || cape) && (
        <p className="mt-4 text-xs text-muted-foreground">
          출처: Yahoo Finance{isSnp500 && cape ? " · FRED(Shiller CAPE)" : ""} · 참고용
        </p>
      )}
    </section>
  );
}
