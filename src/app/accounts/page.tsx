import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio, activeEventRows } from "@/lib/portfolio";
import { loadAccountGroups } from "@/lib/accounts";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { AccountManager } from "@/components/accounts/AccountManager";
import { AccountRow } from "@/components/accounts/AccountRow";
import { DeleteAccountButton } from "@/components/accounts/DeleteAccountButton";
import { FeeRankCard } from "@/components/accounts/FeeRankCard";
import { type AccountType } from "@/lib/config/tax";
import {
  feeRank,
  annualCommission,
  savingsVsCheapest,
} from "@/lib/config/brokers";
import { todayKST } from "@/lib/date";

export default async function AccountsPage() {
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

  // 표시 통화 환산 계수(₩→표시통화) — 계좌별 평가액·종목 표시용.
  const displayCcy =
    cookieStore.get("display_ccy")?.value === "USD" ? "USD" : "KRW";
  const useUsd = displayCcy === "USD" && !!portfolio.usdKrw;
  const factor = useUsd ? 1 / (portfolio.usdKrw as number) : 1;

  // 계좌별 보유 종목 — 데이터/계산 재사용(새 쿼리 외 로직 없음).
  const [groups, accountsResult] = await Promise.all([
    loadAccountGroups(supabase, {
      holdingId: holding.id,
      prices: portfolio.prices,
      names: portfolio.names,
      factor,
    }),
    supabase
      .from("accounts")
      .select("id, name, account_type, commission_rate, broker, member_id")
      .eq("holding_id", holding.id)
      .order("created_at", { ascending: true }),
  ]);
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const accounts = accountsResult.data;

  // 컴퍼니(CEO) 목록 — 계좌 주인 선택용(2개 이상일 때 드롭다운).
  const { data: memberRows } = await supabase
    .from("members")
    .select("id, name, emoji")
    .eq("holding_id", holding.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  const members = memberRows ?? [];

  // 수수료 랭킹 — 올해 계좌별 거래대금(매수+매도 gross, ₩) × 계좌 수수료율
  const accountList = accounts ?? [];
  const year = todayKST().slice(0, 4);
  const { data: evRows } = accountList.length
    ? await supabase
        .from("events")
        .select("*")
        .in(
          "account_id",
          accountList.map((a) => a.id),
        )
    : { data: [] };
  const active = activeEventRows(evRows ?? []);
  let totalVolume = 0;
  let totalCommission = 0;
  let totalSavings = 0;
  for (const a of accountList) {
    const rate = Number(a.commission_rate);
    const vol = active
      .filter(
        (r) =>
          r.account_id === a.id &&
          (r.type === "BUY" || r.type === "SELL") &&
          r.date.startsWith(year) &&
          r.quantity,
      )
      .reduce((s, r) => s + Number(r.quantity) * Number(r.price_or_amount), 0);
    totalVolume += vol;
    totalCommission += annualCommission(vol, rate);
    totalSavings += savingsVsCheapest(vol, rate);
  }
  // 평균 수수료율: 거래 있으면 거래량 가중, 없으면 계좌 단순 평균
  const blendedRate =
    totalVolume > 0
      ? totalCommission / totalVolume
      : accountList.length
        ? accountList.reduce((s, a) => s + Number(a.commission_rate), 0) /
          accountList.length
        : 0;
  const rank = feeRank(blendedRate);

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">계좌</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          자회사(종목)를 담는 그릇. 유형이 세금을 좌우합니다.
        </p>
      </div>

      {accountList.length > 0 && (
        <FeeRankCard
          blendedRate={blendedRate}
          rankPct={rank.cheaperThanPct}
          rankLabel={rank.label}
          annualVolume={totalVolume}
          annualCommission={totalCommission}
          savings={totalSavings}
        />
      )}

      <ul className="flex flex-col gap-2">
        {accountList.map((a) => {
          const g = groupById.get(a.id);
          return (
            <AccountRow
              key={a.id}
              account={{
                id: a.id,
                name: a.name,
                accountType: a.account_type as AccountType,
                commissionRate: Number(a.commission_rate),
                broker: a.broker,
                memberId: a.member_id,
              }}
              members={members}
              holdingsCount={g?.holdings.length ?? 0}
              accountValue={g?.value}
              currency={displayCcy}
              deleteButton={accountList.length > 1 ? <DeleteAccountButton accountId={a.id} name={a.name} /> : undefined}
            />
          );
        })}
      </ul>

      <AccountManager members={members} />
    </main>
  );
}
