import Link from "next/link";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { pct } from "@/lib/format";
import { valuationApplies } from "@/lib/finance/expectedReturn";
import { groupRanked, type RankedRow } from "@/lib/allocateRanking";
import { STATUS_META } from "./statusMeta";

/**
 * 자본배분 순위 — PRD v0.3 §6.1·§11.
 *
 * 이 화면은 **보기만 한다.** 금액 입력·계산·설정은 전부 다른 화면으로 갔다
 * (`docs/design-strategy-v1.md` §4 "한 화면 한 가지 일").
 *
 * 순위 계산은 `src/lib/allocateRanking.ts` 가 한다.
 */

export function AllocateRanking({ ranked }: { ranked: RankedRow[] }) {
  // 순위에는 금액이 없다 — 통화가 필요한 곳은 다음 화면(`/allocate/plan`)뿐이다.
  const { stocks, others } = groupRanked(ranked);

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <p className="text-sm font-semibold">배분 순위</p>

      {stocks.length > 0 && others.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">개별주</p>
      )}
      <RankList rows={stocks} offset={0} />

      {others.length > 0 && (
        <>
          <p className="mt-4 text-xs text-muted-foreground">
            ETF · 기타 — 기대수익률 모형을 쓰지 않아요
          </p>
          <RankList rows={others} offset={stocks.length} />
        </>
      )}
    </section>
  );
}

/**
 * 순위 목록 한 덩어리. `offset` 은 앞 그룹의 개수 — 번호가 이어지게 한다
 * (그룹이 갈려도 전체에서 몇 번째인지가 배분 순서다).
 */
function RankList({ rows, offset }: { rows: RankedRow[]; offset: number }) {
  return (
      <ul className="mt-3 flex flex-col gap-0.5">
        {rows.map(({ row, leg }, i) => {
          const meta = STATUS_META[leg.status];
          const buyable = leg.status === "BUY" || leg.status === "STRETCH";
          return (
            <li key={row.key}>
              <Link
                href={`/stocks/${row.symbol}`}
                className={
                  "flex items-center gap-3 rounded-xl px-2 py-2.5 transition active:scale-[0.99] " +
                  (buyable ? "" : "opacity-60")
                }
              >
                <span className="w-4 shrink-0 text-center text-xs font-bold tabular-nums text-muted-foreground">
                  {offset + i + 1}
                </span>
                <SymbolAvatar symbol={row.symbol} name={row.label} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{row.label}</p>
                  <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                    {pct(leg.currentWeight)} → 목표 {pct(leg.targetWeight)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {row.expectedCagr != null ? (
                    <p className="text-sm font-bold tabular-nums">
                      {pct(row.expectedCagr)}
                    </p>
                  ) : valuationApplies(row.assetType) ? (
                    // 개별주인데 비어 있으면 "넣어야 하는데 안 넣은" 것이다.
                    <p className="text-xs text-muted-foreground">가정 없음</p>
                  ) : null}
                  <span
                    className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold ${meta.tone}`}
                  >
                    {meta.label}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
  );
}
