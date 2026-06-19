import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { findCatalogItem } from "@/lib/finance/catalog";
import {
  getDisclosurePage,
} from "@/lib/finance/dart";
import { getDisclosuresUS } from "@/lib/finance/edgar";
import {
  prepareDisclosureFeed,
  type DisclosurePriority,
} from "@/lib/finance/disclosureFeed";
import { todayKST } from "@/lib/date";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { DisclosureList } from "@/components/disclosures/DisclosureList";

/**
 * 종목 공시 전체 — 중요·참고·전체 필터 + 페이지네이션. 최근 3년.
 * 종목 상세 "최근 공시 → 전체 보기"에서 진입.
 */
export default async function StockDisclosuresPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const { symbol } = await params;
  const { filter: rawFilter, page: pageStr } = await searchParams;
  const filter: DisclosurePriority | "all" =
    rawFilter === "reference" || rawFilter === "all"
      ? rawFilter
      : "important";
  const page = Math.max(1, Number(pageStr) || 1);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const portfolio = await getPortfolio(supabase);
  if (!portfolio) redirect("/onboarding");

  const name =
    portfolio.names[symbol] ?? findCatalogItem(symbol)?.name ?? symbol;

  const today = todayKST();
  const fromDate = `${Number(today.slice(0, 4)) - 3}${today.slice(4)}`;
  const isKorean = /^\d{6}$/.test(symbol);
  const pageCount = 20;
  let result;
  if (isKorean && filter === "all") {
    result = await getDisclosurePage(symbol, {
      page,
      pageCount,
      fromDate,
      toDate: today,
    });
  } else if (isKorean) {
    const first = await getDisclosurePage(symbol, {
      page: 1,
      pageCount: 100,
      fromDate,
      toDate: today,
    });
    const pagesToRead = Math.min(first.totalPages, 5);
    const rest = await Promise.all(
      Array.from({ length: Math.max(0, pagesToRead - 1) }, (_, index) =>
        getDisclosurePage(symbol, {
          page: index + 2,
          pageCount: 100,
          fromDate,
          toDate: today,
        }),
      ),
    );
    const filtered = prepareDisclosureFeed([
      ...first.items,
      ...rest.flatMap((item) => item.items),
    ]).filter((item) => item.priority === filter);
    result = {
      items: filtered.slice((page - 1) * pageCount, page * pageCount),
      page,
      totalPages: Math.ceil(filtered.length / pageCount),
      total: filtered.length,
    };
  } else {
    const filtered = prepareDisclosureFeed(
      await getDisclosuresUS(symbol, fromDate, today, 500),
    ).filter((item) => filter === "all" || item.priority === filter);
    result = {
      items: filtered.slice((page - 1) * pageCount, page * pageCount),
      page,
      totalPages: Math.ceil(filtered.length / pageCount),
      total: filtered.length,
    };
  }

  const base = `/stocks/${symbol}/disclosures`;
  const filters: { key: "important" | "reference" | "all"; label: string }[] = [
    { key: "important", label: "중요" },
    { key: "reference", label: "참고" },
    { key: "all", label: "전체" },
  ];

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <h1 className="text-2xl font-extrabold tracking-tight">{name} 공시</h1>

      {/* 사용자 관점 필터 — DART 원본 대분류는 내부에서만 사용. */}
      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <Link
            key={item.key}
            href={item.key === "important" ? base : `${base}?filter=${item.key}`}
            className={
              "rounded-full px-3 py-1.5 text-sm font-semibold " +
              (item.key === filter
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground")
            }
          >
            {item.label}
          </Link>
        ))}
      </div>

      {result.items.length === 0 ? (
        <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground shadow-card">
          이 조건의 공시가 없어요.
        </p>
      ) : (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <p className="mb-3 text-xs text-muted-foreground">
            최근 3년 · 총 {result.total.toLocaleString()}건
          </p>
          <DisclosureList items={result.items} />
        </section>
      )}

      {/* 페이지네이션 */}
      {result.totalPages > 1 && (
        <div className="flex items-center justify-between">
          {page > 1 ? (
            <Link
              href={`${base}?filter=${filter}&page=${page - 1}`}
              className="rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground"
            >
              ‹ 이전
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground tabular-nums">
            {page} / {result.totalPages}
          </span>
          {page < result.totalPages ? (
            <Link
              href={`${base}?filter=${filter}&page=${page + 1}`}
              className="rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground"
            >
              다음 ›
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}

      <p className="px-1 text-xs text-muted-foreground">
        출처: {isKorean ? "금융감독원 DART" : "미국 SEC EDGAR"}. 중요도와 힌트는
        규칙 기반 분류(단정 아님) — 판단은 원문을 확인하고 본인이.
      </p>
    </main>
  );
}
