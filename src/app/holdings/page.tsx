import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { loadAccountGroups } from "@/lib/accounts";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { HoldingsBrowser } from "@/components/holdings/HoldingsBrowser";

/**
 * 보유 종목 — 오직 계좌·종목만 보는 전용 화면. 모든 계좌 × 모든 종목을 계좌별로,
 * 각 계좌는 자유롭게 접기/펴기(독립 토글). 데이터는 loadAccountGroups 재사용(새 쿼리 없음).
 * 계좌 관리(이름·유형·수수료 수정)는 /accounts.
 */
export default async function HoldingsPage() {
  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BackButton />
      <HoldingsContent />
      <BottomTabBar />
    </main>
  );
}

/**
 * 보유 종목 본문 — 페이지 크롬 없이 내용만.
 * 전체 페이지(`/holdings`)와 바텀시트(`@sheet/(.)holdings`)가 공유.
 */
export async function HoldingsContent() {
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
  const { holding } = portfolio;

  const displayCcy =
    cookieStore.get("display_ccy")?.value === "USD" ? "USD" : "KRW";
  const useUsd = displayCcy === "USD" && !!portfolio.usdKrw;
  const factor = useUsd ? 1 / (portfolio.usdKrw as number) : 1;

  const groups = await loadAccountGroups(supabase, {
    holdingId: holding.id,
    prices: portfolio.prices,
    names: portfolio.names,
    factor,
  });

  return (
    <>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">보유 종목</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          계좌별·전체 보기 · 평가액·수익률·수익금 정렬
        </p>
      </div>

      {groups.length === 0 ? (
        <section className="rounded-2xl bg-card p-6 text-center shadow-card">
          <p className="text-sm text-muted-foreground">
            아직 계좌·보유 종목이 없습니다.
          </p>
          <Link
            href="/transactions"
            className="mt-4 inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            첫 매수 기록하기
          </Link>
        </section>
      ) : (
        <HoldingsBrowser groups={groups} currency={displayCcy} />
      )}

      {/* 계좌 관리(이름·유형·수수료)는 별도 — 여기선 보기만. */}
      <Link
        href="/accounts"
        className="block rounded-2xl bg-card p-4 text-sm font-medium text-muted-foreground shadow-card transition active:scale-[0.99]"
      >
        계좌 관리 · 수수료 ›
      </Link>
    </>
  );
}
