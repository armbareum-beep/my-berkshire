import { createClient } from "@/lib/supabase/server";
import { loadAccountGroups } from "@/lib/accounts";
import { getKrwPrices } from "@/lib/finance/prices";
import { loadSecurityNames } from "@/lib/securities";
import { HoldingStructureTree } from "@/components/structure/HoldingStructureTree";
import type { Database } from "@/lib/supabase/database.types";

type Holding = Database["public"]["Tables"]["holdings"]["Row"];

/**
 * 전체 지배구조 트리 — company 페이지의 무거운 부분(시세·이름·계좌그룹).
 * Suspense 경계로 분리해 헤더·회사목록(빠른 부분)이 이걸 기다리지 않게 한다.
 */
export async function CompanyStructures({
  companies,
  activeId,
  displayCcy,
}: {
  companies: Holding[];
  activeId: string;
  displayCcy: "KRW" | "USD";
}) {
  const supabase = await createClient();

  // 모든 회사의 종목을 한 번에 모아 공용 시세·이름 맵을 만든다.
  const companyIds = companies.map((company) => company.id);
  const { data: accountRefs } = companyIds.length
    ? await supabase
        .from("accounts")
        .select("id, holding_id")
        .in("holding_id", companyIds)
    : { data: [] };
  const accountIds = (accountRefs ?? []).map((account) => account.id);
  const { data: eventRefs } = accountIds.length
    ? await supabase.from("events").select("symbol").in("account_id", accountIds)
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

  const useUsd = displayCcy === "USD" && !!usdKrw;
  const factor = useUsd ? 1 / (usdKrw as number) : 1;

  const structures = await Promise.all(
    companies.map(async (company) => ({
      holding: company,
      groups: await loadAccountGroups(supabase, {
        holdingId: company.id,
        prices,
        names,
        factor,
      }),
    })),
  );

  return (
    <>
      {structures.map((structure) => (
        <HoldingStructureTree
          key={structure.holding.id}
          holding={structure.holding}
          groups={structure.groups}
          currency={displayCcy}
          active={structure.holding.id === activeId}
        />
      ))}
    </>
  );
}
