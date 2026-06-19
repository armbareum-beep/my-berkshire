import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadAccountGroups } from "@/lib/accounts";
import { getKrwPrices } from "@/lib/finance/prices";
import { getActiveHolding } from "@/lib/holdings";
import { loadSecurityNames } from "@/lib/securities";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { HoldingStructureTree } from "@/components/structure/HoldingStructureTree";
import { Check, Plus } from "lucide-react";
import { renameActiveCompany, switchCompany } from "./actions";

/**
 * 회사 정보 — 헤더 회사명 탭의 목적지(user-rails §145, 회장이 회사를 관리하는 진입점).
 *  · 회사 정보(이름·설립일·모드)
 *  · 지배구조도(지주 → 계좌 → 자회사, ⑦ 로망)
 *  · 회사명 변경·활성 회사 전환·새 회사 설립
 */
export default async function CompanyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [holding, companiesResult, cookieStore] = await Promise.all([
    getActiveHolding(supabase),
    supabase
      .from("holdings")
      .select("*")
      .order("created_at", { ascending: true }),
    cookies(),
  ]);
  if (!holding) redirect("/onboarding");

  const allCompanies = companiesResult.data ?? [];

  // 모든 회사의 종목을 한 번에 모아 공용 시세·이름 맵을 만든다.
  const companyIds = allCompanies.map((company) => company.id);
  const { data: accountRefs } = companyIds.length
    ? await supabase
        .from("accounts")
        .select("id, holding_id")
        .in("holding_id", companyIds)
    : { data: [] };
  const accountIds = (accountRefs ?? []).map((account) => account.id);
  const { data: eventRefs } = accountIds.length
    ? await supabase
        .from("events")
        .select("symbol")
        .in("account_id", accountIds)
    : { data: [] };
  const symbols = [
    ...new Set(
      (eventRefs ?? [])
        .map((event) => event.symbol)
        .filter((symbol): symbol is string => !!symbol),
    ),
  ];
  const [{ prices, usdKrw }, names] = await Promise.all([
    getKrwPrices(symbols),
    loadSecurityNames(supabase, symbols),
  ]);

  const displayCcy =
    cookieStore.get("display_ccy")?.value === "USD" ? "USD" : "KRW";
  const useUsd = displayCcy === "USD" && !!usdKrw;
  const factor = useUsd ? 1 / (usdKrw as number) : 1;

  const structures = await Promise.all(
    allCompanies.map(async (company) => ({
      holding: company,
      groups: await loadAccountGroups(supabase, {
        holdingId: company.id,
        prices,
        names,
        factor,
      }),
    })),
  );

  const modeLabel = holding.mode === "challenge" ? "챌린지" : "장부";

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BackButton />
      <h1 className="text-2xl font-extrabold tracking-tight">회사 정보</h1>

      {/* 활성 회사 정보 */}
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <p className="text-xs font-semibold text-primary">현재 운영 중</p>
        <form action={renameActiveCompany} className="mt-2 flex gap-2">
          <input
            name="name"
            defaultValue={holding.name}
            required
            maxLength={40}
            aria-label="회사명"
            className="min-w-0 flex-1 rounded-xl bg-secondary px-3 py-2 text-lg font-extrabold outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="submit"
            className="shrink-0 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition active:scale-[0.98]"
          >
            수정 완료
          </button>
        </form>
        <p className="mt-1 text-sm text-muted-foreground">
          설립 {holding.founded_at} · {modeLabel}
        </p>
      </section>

      <section className="rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">내 투자회사들</h2>
          <span className="text-xs text-muted-foreground">
            {allCompanies.length}개
          </span>
        </div>
        <div className="mt-3 divide-y divide-border">
          {allCompanies.map((company) => {
            const active = company.id === holding.id;
            const action = switchCompany.bind(null, company.id);
            return (
              <form action={action} key={company.id}>
                <button
                  type="submit"
                  disabled={active}
                  className="flex w-full items-center justify-between gap-3 py-3 text-left transition active:scale-[0.99] disabled:cursor-default"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {company.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {company.founded_at} · {company.mode === "challenge" ? "챌린지" : "장부"}
                    </span>
                  </span>
                  {active ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
                      <Check size={15} strokeWidth={1.75} /> 활성
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-foreground">
                      전환
                    </span>
                  )}
                </button>
              </form>
            );
          })}
        </div>
        <Link
          href="/onboarding?new=1"
          className="mt-3 flex h-11 items-center justify-center gap-2 rounded-xl bg-secondary text-sm font-semibold transition active:scale-[0.98]"
        >
          <Plus size={17} strokeWidth={1.75} /> 새 회사 설립
        </Link>
      </section>

      <div className="mt-2">
        <h2 className="text-lg font-extrabold tracking-tight">전체 지배구조</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          운영 중인 모든 투자회사의 계좌와 자회사를 함께 봅니다.
        </p>
      </div>
      {structures.map((structure) => (
        <HoldingStructureTree
          key={structure.holding.id}
          holding={structure.holding}
          groups={structure.groups}
          currency={displayCcy}
          active={structure.holding.id === holding.id}
        />
      ))}

      <BottomTabBar />
    </main>
  );
}
