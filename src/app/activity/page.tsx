import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { TimelineCard } from "@/components/dashboard/cards";
import { ActivityFeed } from "@/components/transactions/ActivityFeed";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";

export default async function ActivityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const portfolio = await getPortfolio(supabase);
  if (!portfolio) redirect("/onboarding");
  const holding = portfolio.holding;
  const timeline = computeDashboard(portfolio).timeline;

  return (
    <main className="flex min-h-dvh flex-col gap-5 p-6 pb-28">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">회사 연혁</h1>
        <Link
          href="/transactions"
          className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          거래 기록
        </Link>
      </header>
      {timeline.length > 0 && <TimelineCard timeline={timeline} />}
      <Suspense
        fallback={
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-2xl bg-card shadow-card"
              />
            ))}
          </div>
        }
      >
        <ActivityFeed holdingId={holding.id} mode={holding.mode} />
      </Suspense>
      <BottomTabBar />
    </main>
  );
}
