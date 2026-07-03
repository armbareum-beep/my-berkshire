import { redirect } from "next/navigation";
import { History } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { TimelineCard } from "@/components/dashboard/cards";
import { EmptyState } from "@/components/ui/EmptyState";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { loadDrawdownEpisodes } from "@/lib/drawdownEpisodes";
import { drawdownMilestones } from "@/lib/finance/milestones";
import { todayKST } from "@/lib/date";

/**
 * 회사 연혁 — 설립·첫 매수·여정 마일스톤(통제 가능한 서사). 활동 내역(/activity)과 분리.
 * 드로다운 통과는 비동기 가격 시리즈가 필요해 computeDashboard(동기) 밖에서 페이지
 * 레벨에 merge 한다(design-notes.md 기능1).
 */
export default async function TimelinePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const portfolio = await getPortfolio(supabase);
  if (!portfolio) redirect("/onboarding");
  const { holding } = portfolio;

  const drawdownEpisodes = await loadDrawdownEpisodes({
    supabase,
    holdingId: holding.id,
    portfolioRevision: holding.portfolio_revision,
    foundedAt: holding.founded_at,
    initialValuation: Number(holding.initial_valuation),
    events: portfolio.events,
    today: todayKST(),
  });
  const timeline = [
    ...computeDashboard(portfolio).timeline,
    ...drawdownMilestones(drawdownEpisodes),
  ].sort((a, b) => (a.date < b.date ? -1 : 1));

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BackButton />
      <h1 className="text-2xl font-extrabold tracking-tight">회사 연혁</h1>
      {timeline.length > 0 ? (
        <TimelineCard timeline={timeline} />
      ) : (
        <EmptyState
          icon={History}
          title="아직 연혁이 없어요"
          description="첫 거래를 기록하면 설립·매수·마일스톤이 여기 쌓여요"
          cta={{ label: "거래 기록하기", href: "/transactions" }}
        />
      )}
      <BottomTabBar />
    </main>
  );
}
