import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadAllocateData } from "@/lib/allocateData";
import { rankRows } from "@/lib/allocateRanking";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { AllocateRanking } from "@/components/allocate/AllocateRanking";

/**
 * `/allocate/ranking` — 살 곳 순위 **조회**.
 *
 * 이 목록은 `/allocate` 첫 화면에 붙어 있었다. 거기서는 "지금 뭘 해야 하나"를 묻는 자리에
 * 훑어보는 목록이 같이 놓여 답이 흐려졌다 — 그래서 레일 밖으로 뺐다. 지우지는 않는다.
 * *금액을 넣기 전에* 무엇이 매력적인지 보고 싶은 건 별개의 일이고, 배분 계산과 달리
 * 투자금이 없어도 성립한다(`rankRows` 는 투자금 0으로 상태만 뽑는다).
 *
 * 여정이 아니라 조회라서 탭바를 남긴다(design-strategy §4).
 */
export default async function AllocateRankingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const cookieStore = await cookies();
  const displayCcy =
    cookieStore.get("display_ccy")?.value === "USD" ? "USD" : "KRW";
  const data = await loadAllocateData(supabase, displayCcy);
  if (!data) redirect("/onboarding");

  // 목표비중이 없으면 순위를 세울 근거도 없다 — 레일이 관문을 띄운다.
  if (!data.hasTargets) redirect("/allocate");

  const ranked = rankRows(data.rows);

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">살 곳 순위</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          지금 새 돈이 생기면 어디가 먼저인지만 봅니다.
        </p>
      </div>

      {data.priceAvailable ? (
        <AllocateRanking ranked={ranked} />
      ) : (
        <div className="rounded-2xl bg-card p-6 text-center shadow-card">
          <p className="text-sm text-muted-foreground">
            시세 갱신 필요 — 잠시 후 다시 시도하세요.
          </p>
        </div>
      )}
    </main>
  );
}
