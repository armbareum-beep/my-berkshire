import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeBenchmark } from "@/lib/finance/benchmark";
import { computeRankingScore } from "@/lib/ranking";
import { todayKST } from "@/lib/date";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { ScoreCard } from "@/components/ranking/ScoreCard";
import { Leaderboard } from "@/components/ranking/Leaderboard";

export default async function RankingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const portfolio = await getPortfolio(supabase);
  if (!portfolio) redirect("/onboarding");

  const { holding, events, result, prices } = portfolio;
  const today = todayKST();

  const [benchmark] = await Promise.all([
    computeBenchmark(
      { foundedAt: holding.founded_at, initialValuation: Number(holding.initial_valuation) },
      events,
      today,
      "KRW",
    ),
  ]);

  const score = computeRankingScore(
    events,
    prices,
    holding.founded_at,
    result,
    benchmark,
    today,
  );

  // 현재 유저 점수 upsert
  if (events.length > 0) {
    await supabase.from("ranking_scores").upsert(
      {
        holding_id: holding.id,
        holding_name: holding.name,
        total_score: score.total,
        holding_period_score: score.holdingPeriod,
        contrarian_score: score.contrarian,
        market_score: score.marketOutperformance,
        diversification_score: score.diversification,
        deposit_score: score.deposit,
        computed_at: new Date().toISOString(),
      },
      { onConflict: "holding_id" },
    );
  }

  // 전체 리더보드 조회
  const { data: rows } = await supabase
    .from("ranking_scores")
    .select("holding_id, holding_name, total_score, computed_at")
    .order("total_score", { ascending: false });

  const leaderboard = (rows ?? []).map((r, i) => ({
    rank: i + 1,
    holdingId: r.holding_id,
    holdingName: r.holding_name,
    totalScore: r.total_score,
    isMe: r.holding_id === holding.id,
  }));

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">랭킹</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          조작하기 어려운 5가지 규율 지표로 산출
        </p>
      </div>

      {events.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center shadow-card">
          <p className="text-sm font-semibold">거래 기록이 없어요</p>
          <p className="mt-1 text-xs text-muted-foreground">
            매수·입금 기록을 추가하면 점수가 산출됩니다
          </p>
        </div>
      ) : (
        <>
          <Leaderboard rows={leaderboard} />
          <ScoreCard score={score} />
        </>
      )}
    </main>
  );
}
