import type { IndexSummary, ShillerCape } from "@/lib/finance/indexStats";
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
  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <p className="mb-4 text-sm font-semibold">현재 밸류에이션</p>
      <div className="grid grid-cols-2 gap-y-4">
        <Cell
          label="Trailing PER"
          value={summary?.trailingPE != null ? `${summary.trailingPE.toFixed(1)}배` : "—"}
        />
        <Cell
          label="Forward PER"
          value={summary?.forwardPE != null ? `${summary.forwardPE.toFixed(1)}배` : "—"}
        />
        <Cell
          label="PBR"
          value={summary?.pbr != null ? `${summary.pbr.toFixed(2)}배` : "—"}
        />
        <Cell
          label="ROE (상위10 가중평균)"
          value={summary?.roe != null ? pct(summary.roe) : "—"}
        />
        <Cell
          label="배당수익률"
          value={summary?.dividendYield != null ? pct(summary.dividendYield) : "—"}
        />
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
