import { after } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { computeStyle } from "@/lib/style";
import { loadLiabilities } from "@/lib/liabilities";
import { totalLiabilities } from "@/lib/finance/liabilities";
import { parsePlan, planProgress } from "@/lib/plan";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { StyleDetail } from "@/components/style/StyleDetail";
import { loadSecurityMeta } from "@/lib/securities";
import {
  loadPreviousStyleSnapshot,
  saveStyleSnapshot,
  toStyleHistorySnapshot,
} from "@/lib/styleHistory";
import { todayKST } from "@/lib/date";

/**
 * 운용 스타일 · 투자 규율 점수 상세 — 홈 StyleCard › 에서 진입.
 *  · 점수 = 스타일 중립(저비용·저레버리지·계획준수). 가치·성장 모두 공정.
 *  · 스타일 = 우열 없는 거울(아키타입 + 프로파일).
 */
export default async function StylePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [portfolio, cookieStore] = await Promise.all([
    getPortfolio(supabase),
    cookies(),
  ]);
  if (!portfolio) redirect("/onboarding");

  const displayCcy =
    cookieStore.get("display_ccy")?.value === "USD" ? "USD" : "KRW";
  const data = computeDashboard(portfolio, displayCcy);

  // 부채(저레버리지) + 계획 준수율(계획준수) — 규율 점수 입력.
  const today = todayKST();
  const [liabilities, securityMeta, previousStyle] = await Promise.all([
    loadLiabilities(supabase, portfolio.holding.id),
    loadSecurityMeta(supabase, data.allocation.map((item) => item.symbol)),
    loadPreviousStyleSnapshot(supabase, portfolio.holding.id, today),
  ]);
  const debtKrw = totalLiabilities(liabilities);
  const plan = parsePlan(portfolio.holding.active_plan);
  const planProg = plan ? planProgress(plan, portfolio.events) : null;
  const planAdherence =
    planProg && planProg.total > 0 ? planProg.doneCount / planProg.total : null;

  const style = computeStyle(
    portfolio,
    data,
    debtKrw,
    planAdherence,
    securityMeta,
  );
  if (!style.insufficient) {
    const snapshot = toStyleHistorySnapshot(style, today);
    after(() =>
      saveStyleSnapshot(
        supabase,
        portfolio.holding.id,
        portfolio.holding.portfolio_revision,
        snapshot,
      ),
    );
  }

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <h1 className="text-2xl font-extrabold tracking-tight">
        운용 스타일 · 규율 점수
      </h1>
      <StyleDetail style={style} previousStyle={previousStyle} />
    </main>
  );
}
