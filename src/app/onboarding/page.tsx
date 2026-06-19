import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPrimaryHolding } from "@/lib/holdings";
import { todayKST } from "@/lib/date";
import { getKrwPrices } from "@/lib/finance/prices";
import { CATALOG } from "@/lib/finance/catalog";
import { OnboardingRail } from "./OnboardingRail";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const creatingAnother = (await searchParams).new === "1";
  // 기존 사용자는 명시적으로 새 회사 설립을 시작할 때만 레일에 재진입한다.
  const holding = await getPrimaryHolding(supabase);
  if (holding && !creatingAnother) redirect("/dashboard");

  const { prices } = await getKrwPrices(CATALOG.map((c) => c.symbol));

  return (
    <OnboardingRail
      today={todayKST()}
      prices={prices}
      additionalCompany={creatingAnother}
    />
  );
}
