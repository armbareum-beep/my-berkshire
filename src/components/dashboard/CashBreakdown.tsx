import { Flag } from "@/components/ui/Flag";
import { nativeMoney, currencyMeta } from "@/lib/finance/currencies";

/**
 * 현금 통화별 분해(₩/$ 등) — 자산배분 도넛 상세의 "현금" 슬라이스 안에서
 * 통화별 네이티브 잔액을 보여준다(대시보드 CashCard 와 동일 표기).
 * 잔액 있는 통화만, ₩ 먼저.
 */
export function CashBreakdown({ pools }: { pools: Record<string, number> }) {
  const rows = Object.entries(pools)
    .filter(([, v]) => Math.abs(v) > 0.005)
    .sort((a, b) => (a[0] === "KRW" ? -1 : b[0] === "KRW" ? 1 : 0));
  if (rows.length === 0) return null;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map(([c, v]) => (
        <li key={c} className="flex items-center gap-3">
          <Flag code={c} />
          <span className="text-sm font-medium">{currencyMeta(c).name}</span>
          <span className="ml-auto font-bold tabular-nums">
            {nativeMoney(v, c)}
          </span>
        </li>
      ))}
    </ul>
  );
}
