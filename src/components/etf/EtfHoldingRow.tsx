import Link from "next/link";
import { moneyShort, pct } from "@/lib/format";

export function EtfHoldingRow({
  symbol,
  name,
  value,
  etfWeight,
  ter,
  isLast,
}: {
  symbol: string;
  name: string;
  value: number;
  etfWeight: number;
  ter: number | null;
  isLast: boolean;
}) {
  return (
    <Link
      href={`/stocks/${symbol}`}
      className={`flex items-center justify-between px-5 py-4 transition active:opacity-70 ${
        !isLast ? "border-b border-border" : ""
      }`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        {ter !== null && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            보수 {pct(ter, 2)}
          </p>
        )}
      </div>
      <div className="ml-3 shrink-0 text-right">
        <p className="text-sm tabular-nums">{moneyShort(value)}</p>
        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
          {pct(etfWeight)}
        </p>
      </div>
    </Link>
  );
}
