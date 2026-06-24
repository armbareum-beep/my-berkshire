import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPrimaryHolding } from "@/lib/holdings";
import { todayKST } from "@/lib/date";
import { getKrwPrices } from "@/lib/finance/prices";
import { getFxToKrw } from "@/lib/finance/fx";
import { CATALOG } from "@/lib/finance/catalog";
import { OnboardingRail } from "./OnboardingRail";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 가족 장부는 회사가 1개 — 이미 설립했으면 대시보드로.
  const holding = await getPrimaryHolding(supabase);
  if (holding) redirect("/dashboard");

  const { prices } = await getKrwPrices(CATALOG.map((c) => c.symbol));
  // USD 환율 — 첫 매수가 외국 종목이면 단가($) ↔ ₩ 환산에 사용(BuyWizard).
  const fxRates = await getFxToKrw(["USD"]);

  return (
    <OnboardingRail today={todayKST()} prices={prices} fxRates={fxRates} />
  );
}
