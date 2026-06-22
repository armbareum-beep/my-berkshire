import Link from "next/link";
import { CATALOG } from "@/lib/finance/catalog";

interface Props {
  indexSymbol: string;
  indexName: string;
}

const INDEX_TO_TRACKED: Record<string, string> = {
  "^GSPC": "S&P500",
  "^IXIC": "NASDAQ100",
  "^KS11": "KOSPI200",
  "^KQ11": "KOSPI200",
};

export function EtfLinks({ indexSymbol, indexName }: Props) {
  const trackedName = INDEX_TO_TRACKED[indexSymbol];
  if (!trackedName) return null;

  const etfs = CATALOG.filter(
    (item) => item.assetType === "ETF" && item.trackedIndex === trackedName,
  );
  if (etfs.length === 0) return null;

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <p className="mb-3 text-sm font-semibold">{indexName} 추종 ETF</p>
      <ul className="flex flex-col gap-2">
        {etfs.map((etf) => (
          <li key={etf.symbol}>
            <Link
              href={`/stocks/${etf.symbol}`}
              className="flex items-center justify-between text-sm transition active:opacity-70"
            >
              <span className="font-medium">{etf.name}</span>
              <div className="flex items-center gap-3">
                {etf.ter != null && (
                  <span className="text-xs text-muted-foreground">
                    TER {(etf.ter * 100).toFixed(2)}%
                  </span>
                )}
                <span className="text-xs text-muted-foreground">{etf.symbol} ›</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
