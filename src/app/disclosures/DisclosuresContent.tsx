import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { getPortfolioDisclosureFeed } from "@/lib/finance/disclosureFeed";
import { loadDismissed } from "@/lib/finance/homeSignal";
import { todayKST } from "@/lib/date";
import { DisclosureFeed } from "@/components/disclosures/DisclosureFeed";

export type DisclosureFilter = "important" | "reference" | "all";

function shiftDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}

/**
 * 내 지분 공시 본문 — 페이지 크롬 없이 내용만.
 * 전체 페이지(`/disclosures`)와 바텀시트(`@sheet/(.)disclosures`)가 공유.
 * @param filter 우선순위 필터(시트는 기본 "important", 전체 페이지는 ?filter 쿼리)
 */
export async function DisclosuresContent({
  filter = "important",
}: {
  filter?: DisclosureFilter;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const portfolio = await getPortfolio(supabase);
  if (!portfolio) redirect("/onboarding");
  const today = todayKST();
  const symbols = Object.entries(portfolio.positions)
    .filter(([, quantity]) => quantity > 0)
    .map(([symbol]) => symbol);
  const [feed, dismissed] = await Promise.all([
    getPortfolioDisclosureFeed(symbols, shiftDate(today, -180), today),
    loadDismissed(supabase, portfolio.holding.id),
  ]);
  const counts = {
    important: feed.filter((item) => item.priority === "important").length,
    reference: feed.filter((item) => item.priority === "reference").length,
    all: feed.length,
  };
  const shown =
    filter === "all" ? feed : feed.filter((item) => item.priority === filter);
  const tabs: { key: DisclosureFilter; label: string }[] = [
    { key: "important", label: "중요" },
    { key: "reference", label: "참고" },
    { key: "all", label: "전체" },
  ];

  return (
    <>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">내 지분 공시</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          최근 180일 · 중요한 변화부터 확인합니다.
        </p>
      </div>
      <nav className="flex gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.key === "important" ? "/disclosures" : `/disclosures?filter=${tab.key}`}
            scroll={false}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
              filter === tab.key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            {tab.label} {counts[tab.key]}
          </Link>
        ))}
      </nav>
      <DisclosureFeed items={shown} initialReadKeys={[...dismissed]} />
      <p className="px-1 text-xs leading-5 text-muted-foreground">
        중요도는 공시 제목과 제출 양식에 따른 규칙 기반 분류입니다. 투자 판단이나
        요약이 아니며 최종 내용은 DART·SEC 원문에서 확인하세요.
      </p>
    </>
  );
}
