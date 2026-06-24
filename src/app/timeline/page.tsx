import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { TimelineCard } from "@/components/dashboard/cards";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";

/**
 * 회사 연혁 — 설립·첫 매수·여정 마일스톤(통제 가능한 서사). 활동 내역(/activity)과 분리.
 */
export default async function TimelinePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const portfolio = await getPortfolio(supabase);
  if (!portfolio) redirect("/onboarding");
  const timeline = computeDashboard(portfolio).timeline;

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BackButton />
      <h1 className="text-2xl font-extrabold tracking-tight">회사 연혁</h1>
      {timeline.length > 0 ? (
        <TimelineCard timeline={timeline} />
      ) : (
        <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground shadow-card">
          아직 연혁이 없어요. 첫 거래를 기록하면 설립·매수·마일스톤이 여기 쌓입니다.
        </p>
      )}
      <BottomTabBar />
    </main>
  );
}
