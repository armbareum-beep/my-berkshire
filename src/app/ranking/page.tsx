import { redirect } from "next/navigation";
import { Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeBenchmark } from "@/lib/finance/benchmark";
import { computeRankingScore, toGrade } from "@/lib/ranking";
import { upsertRankingScore } from "@/lib/rankingSync";
import { buildPublicMilestones, parsePublicMilestones } from "@/lib/rankingMilestones";
import { computeCompositionPct, parseCompositionV1 } from "@/lib/rankingComposition";
import { loadSecurityMeta } from "@/lib/securities";
import { cashBalance } from "@/lib/finance/valuation";
import { loadLiabilities } from "@/lib/liabilities";
import { totalLiabilities } from "@/lib/finance/liabilities";
import { loadDrawdownEpisodes } from "@/lib/drawdownEpisodes";
import { todayKST } from "@/lib/date";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { ScoreCard } from "@/components/ranking/ScoreCard";
import { Leaderboard } from "@/components/ranking/Leaderboard";
import { IpoCard } from "@/components/ranking/IpoCard";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function RankingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const portfolio = await getPortfolio(supabase);
  if (!portfolio) redirect("/onboarding");

  const { holding, events, result, prices, positions } = portfolio;
  const today = todayKST();
  // 상장(IPO) 옵트인 게이트(036) — listed_at 없으면 리더보드는 안 보이고 상장 CTA만 노출.
  const listed = holding.listed_at != null;
  const hasTrades = events.length > 0;

  // 점수 프리뷰(미상장이어도 본인 ScoreCard를 보여주는 데 필요)에 쓰이는 벤치마크·부채는 항상 로드.
  const [benchmark, liabilities] = await Promise.all([
    computeBenchmark(
      { foundedAt: holding.founded_at, initialValuation: Number(holding.initial_valuation) },
      events,
      today,
      "KRW",
    ),
    loadLiabilities(supabase, holding.id),
  ]);
  const debtKrw = totalLiabilities(liabilities);

  const score = computeRankingScore(
    events,
    prices,
    holding.founded_at,
    result,
    benchmark,
    today,
    { initialValuation: Number(holding.initial_valuation), debtKrw },
  );

  // 리더보드 노출 대상 데이터(연혁·구성 비중)와 upsert·SELECT 는 상장 상태일 때만 필요.
  // 미상장이면 드로다운·종목 메타 로딩과 랭킹 저장·전체 조회를 통째로 생략(낭비 계산 제거).
  let leaderboard: {
    rank: number;
    holdingId: string;
    holdingName: string;
    totalScore: number;
    grade: string;
    isMe: boolean;
    foundedAt: string | null;
    scoreVersion: number;
    holdingPeriodScore: number;
    contrarianScore: number;
    marketScore: number;
    diversificationScore: number;
    depositScore: number;
    leverageScore: number | null;
    costScore: number | null;
    milestones: ReturnType<typeof parsePublicMilestones>;
    xirr: number | null;
    assetBucket: string | null;
    composition: ReturnType<typeof parseCompositionV1>;
  }[] = [];

  if (listed) {
    const [drawdownEpisodes, securityMeta] = await Promise.all([
      loadDrawdownEpisodes({
        supabase,
        holdingId: holding.id,
        portfolioRevision: holding.portfolio_revision,
        foundedAt: holding.founded_at,
        initialValuation: Number(holding.initial_valuation),
        events,
        today,
      }),
      loadSecurityMeta(supabase, Object.keys(positions)),
    ]);
    const milestones = buildPublicMilestones({ holding, events, drawdownEpisodes, today });
    const cash = Number(holding.initial_valuation) + cashBalance(events);
    const composition = computeCompositionPct({
      positions,
      prices,
      cash,
      meta: securityMeta,
      priceAvailable: result.status !== "price_unavailable",
    });

    // 현재 유저 점수 upsert — 표시 직전 갱신이므로 동기(await) 유지.
    await upsertRankingScore(supabase, portfolio, benchmark, today, {
      debtKrw,
      milestones,
      composition,
    });

    // 전체 리더보드 조회
    const { data: rows } = await supabase
      .from("ranking_scores")
      .select(
        "holding_id, holding_name, total_score, holding_period_score, contrarian_score, market_score, diversification_score, deposit_score, leverage_score, cost_score, score_version, founded_at, milestones, xirr, asset_bucket, composition, computed_at",
      )
      .order("total_score", { ascending: false });

    leaderboard = (rows ?? []).map((r, i) => ({
      rank: i + 1,
      holdingId: r.holding_id,
      holdingName: r.holding_name,
      totalScore: r.total_score,
      grade: toGrade(r.total_score),
      isMe: r.holding_id === holding.id,
      foundedAt: r.founded_at,
      scoreVersion: r.score_version,
      holdingPeriodScore: r.holding_period_score,
      contrarianScore: r.contrarian_score,
      marketScore: r.market_score,
      diversificationScore: r.diversification_score,
      depositScore: r.deposit_score,
      leverageScore: r.leverage_score,
      costScore: r.cost_score,
      milestones: parsePublicMilestones(r.milestones),
      xirr: r.xirr,
      assetBucket: r.asset_bucket,
      composition: parseCompositionV1(r.composition),
    }));
  }

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">랭킹</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          조작하기 어려운 7가지 규율 지표로 산출
        </p>
      </div>

      {listed ? (
        events.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="거래 기록이 없어요"
            description="매수·입금 기록을 남기면 점수가 산출돼요"
            cta={{ label: "거래 기록하기", href: "/transactions" }}
          />
        ) : (
          <>
            <Leaderboard rows={leaderboard} />
            <ScoreCard score={score} />
          </>
        )
      ) : (
        <>
          {hasTrades && <ScoreCard score={score} />}
          <IpoCard
            holdingId={holding.id}
            companyName={holding.name}
            foundedAt={holding.founded_at}
            foundingDeclared={holding.founding_declared}
            hasTrades={hasTrades}
          />
        </>
      )}
    </main>
  );
}
