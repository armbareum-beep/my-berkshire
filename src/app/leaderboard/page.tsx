import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { PercentileCard } from "@/components/returns/PercentileCard";
import { fetchAlphaPercentile } from "@/lib/perf/snapshot";
import { LiveTabPlaceholder } from "@/components/leaderboard/LiveTabPlaceholder";
import { LeaderboardTabs } from "@/components/leaderboard/LeaderboardTabs";

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [portfolio, params] = await Promise.all([
    getPortfolio(supabase),
    searchParams,
  ]);
  if (!portfolio) redirect("/onboarding");

  const { holding } = portfolio;
  const isLedger = holding.mode === "ledger";
  const tab = params.tab === "live" ? "live" : "challenge";

  // 내 스냅샷 (alpha 조회)
  const { data: mySnap } = await supabase
    .from("user_perf_snapshots")
    .select("alpha, benchmark_symbol, cumulative_return, days")
    .eq("holding_id", holding.id)
    .maybeSingle();

  const myAlpha = mySnap?.alpha != null ? Number(mySnap.alpha) : null;
  const benchmarkSymbol = mySnap?.benchmark_symbol ?? null;
  const benchmarkLabel =
    benchmarkSymbol === "^GSPC" ? "S&P 500" : benchmarkSymbol === "^KS11" ? "코스피" : "벤치마크";

  // 퍼센타일 + 리더보드 (챌린지 탭일 때만)
  const [percentileData, leaderboardRows] = tab === "live"
    ? [null, []]
    : await Promise.all([
        isLedger ? null : fetchAlphaPercentile(supabase, myAlpha, "challenge"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .rpc("get_alpha_leaderboard", { p_mode: "challenge", p_limit: 30 })
          .then((r: { data: unknown[] | null }) => r.data ?? []),
      ]);

  type Row = {
    rank: number;
    alpha_pct: number;
    cumulative_pct: number;
    benchmark_symbol: string | null;
    days: number;
    is_me: boolean;
  };

  const list: Row[] = (leaderboardRows as Record<string, unknown>[]).map((r) => ({
    rank: Number(r.rank),
    alpha_pct: Number(r.alpha_pct),
    cumulative_pct: Number(r.cumulative_pct),
    benchmark_symbol: r.benchmark_symbol as string | null,
    days: Number(r.days),
    is_me: Boolean(r.is_me),
  }));

  const myRow = isLedger ? null : list.find((r) => r.is_me);

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">챌린지</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {benchmarkLabel} 대비 알파 순위 · 익명
        </p>
      </div>

      {/* 탭 */}
      <LeaderboardTabs activeTab={tab} />

      {tab === "live" ? (
        <LiveTabPlaceholder />
      ) : (
        <>
          {/* 장부 모드 안내 */}
          {isLedger && (
            <div className="rounded-2xl border border-border bg-muted/40 p-4">
              <p className="text-sm font-medium mb-1">장부 모드로 운용 중</p>
              <p className="text-xs text-muted-foreground">
                챌린지 투자자 순위를 열람할 수 있어요.
                순위에 참여하려면 회사 설정에서 챌린지 모드로 전환하세요.
              </p>
            </div>
          )}

          {/* 내 순위 요약 (챌린지 모드일 때) */}
          {myRow && (
            <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4">
              <p className="text-xs text-muted-foreground mb-1">내 순위</p>
              <p className="text-lg font-bold">
                <span className="text-primary">{myRow.rank}위</span>
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  전체 {list.length}명+
                </span>
              </p>
              <p className="text-sm mt-0.5 tabular-nums">
                알파{" "}
                <span
                  className="font-bold"
                  style={{
                    color: myRow.alpha_pct >= 0 ? "var(--color-gain)" : "var(--color-loss)",
                  }}
                >
                  {myRow.alpha_pct >= 0 ? "+" : ""}{myRow.alpha_pct.toFixed(1)}%p
                </span>
                <span className="mx-2 text-muted-foreground">·</span>
                누적{" "}
                <span
                  style={{
                    color: myRow.cumulative_pct >= 0 ? "var(--color-gain)" : "var(--color-loss)",
                  }}
                >
                  {myRow.cumulative_pct >= 0 ? "+" : ""}{myRow.cumulative_pct.toFixed(1)}%
                </span>
              </p>
            </div>
          )}

          {/* 퍼센타일 카드 */}
          {!isLedger && myAlpha != null && (
            <PercentileCard
              alpha={myAlpha}
              days={mySnap?.days ?? 0}
              percentile={percentileData}
              mode={holding.mode}
              benchmarkLabel={benchmarkLabel}
            />
          )}

          {/* 순위 테이블 */}
          {list.length === 0 ? (
            <div className="rounded-2xl bg-card p-6 shadow-card">
              <p className="text-center text-sm text-muted-foreground">
                아직 순위 데이터가 없어요. 챌린지 모드로 운용을 시작하면 여기 표시돼요.
              </p>
            </div>
          ) : (
            <section className="rounded-2xl bg-card shadow-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-10">
                      순위
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                      알파
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                      누적
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                      운용
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row) => (
                    <tr
                      key={row.rank}
                      className={`border-b border-border last:border-0 ${
                        row.is_me && !isLedger ? "bg-primary/5" : ""
                      }`}
                    >
                      <td className="px-4 py-3.5 tabular-nums">
                        <span className="font-semibold text-muted-foreground">{row.rank}</span>
                        {row.is_me && !isLedger && (
                          <span className="ml-1.5 text-[10px] font-bold text-primary bg-primary/10 rounded px-1 py-0.5">
                            나
                          </span>
                        )}
                      </td>
                      <td
                        className="px-4 py-3.5 text-right tabular-nums font-bold"
                        style={{
                          color: row.alpha_pct >= 0 ? "var(--color-gain)" : "var(--color-loss)",
                        }}
                      >
                        {row.alpha_pct >= 0 ? "+" : ""}{row.alpha_pct.toFixed(1)}%p
                      </td>
                      <td
                        className="px-4 py-3.5 text-right tabular-nums"
                        style={{
                          color: row.cumulative_pct >= 0 ? "var(--color-gain)" : "var(--color-loss)",
                        }}
                      >
                        {row.cumulative_pct >= 0 ? "+" : ""}{row.cumulative_pct.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-muted-foreground">
                        {row.days.toLocaleString()}일
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <p className="text-center text-xs text-muted-foreground">
            모든 순위는 익명 · 상위 30명 표시 · {benchmarkLabel} 알파 기준
          </p>
        </>
      )}
    </main>
  );
}
