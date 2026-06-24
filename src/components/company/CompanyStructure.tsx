import { createClient } from "@/lib/supabase/server";
import { loadAccountGroups } from "@/lib/accounts";
import { getKrwPrices } from "@/lib/finance/prices";
import { loadSecurityNames } from "@/lib/securities";
import { HoldingStructureTree } from "@/components/structure/HoldingStructureTree";
import type { Database } from "@/lib/supabase/database.types";

type Holding = Database["public"]["Tables"]["holdings"]["Row"];

/**
 * 단일 지주회사 지배구조 트리(지주 → 계좌 → 자회사). 가족 장부는 회사가 1개라
 * 이 회사 하나만 그린다. 무거운 부분(시세·이름·계좌그룹)이라 Suspense 경계로 분리.
 */
export async function CompanyStructure({
  holding,
  displayCcy,
}: {
  holding: Holding;
  displayCcy: "KRW" | "USD";
}) {
  const supabase = await createClient();

  const { data: accountRefs } = await supabase
    .from("accounts")
    .select("id")
    .eq("holding_id", holding.id);
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

  const groups = await loadAccountGroups(supabase, {
    holdingId: holding.id,
    prices,
    names,
    factor,
  });

  return (
    <HoldingStructureTree
      holding={holding}
      groups={groups}
      currency={displayCcy}
      active
    />
  );
}
