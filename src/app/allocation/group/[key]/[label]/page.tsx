import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { loadClassifiedMeta } from "@/lib/classifiedMeta";
import { readTargets } from "@/lib/targetWeights";
import { isCashKey } from "@/lib/targetLens";
import { tagLabel, type TagKey } from "@/lib/allocation";
import { pct } from "@/lib/format";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import {
  AllocationLevel,
  type LevelRow,
} from "@/components/allocation/AllocationLevel";

/**
 * `/allocation/group/[key]/[label]` — **유형을 가로지르는** 한 묶음. 지금은 국가만(`KEYS`).
 *
 * ## 왜 유형 아래가 아니라 따로인가
 *
 * 국가·산업은 이미 `/allocation/financial/주식?by=country` 에서 볼 수 있었다. 그런데 그건
 * **주식 안에서의** 국가 비중이다. "내 자산의 몇 %가 미국인가"를 물으면 미국 ETF 가 빠져
 * 답이 틀린다. 계층이 `유형 → 국가` 라서 국가가 유형을 가로지를 수 없었던 것이다.
 *
 * 이 화면이 그 자리다 — 미국 주식과 미국 ETF 가 한 목록에 선다. 레일 1단계의 국가·산업
 * 탭에서 줄을 누르면 여기로 온다.
 *
 * ## 여기서 고치는 건 **종목 하나**뿐이다
 *
 * "미국 60%" 는 **레일 1단계 국가 탭**에서 민다. 여기에 묶음 입력칸을 또 두면 같은 값을
 * 두 화면에서 정하게 되고, 어느 쪽이 진짜인지 헷갈린다 — *"비중 바꾸는 곳이 너무 많다."*
 *
 * 그래서 역할을 나눈다. **묶음은 1단계, 그 안의 종목은 여기.** 1단계에서 미국을 60% 로
 * 밀면 구성 종목이 비례로 따라가고, 그 비율을 손보고 싶을 때 이 화면으로 온다.
 *
 * ## 두 개의 분모가 한 화면에 있다
 *
 * · 목록 비중 = **이 묶음 안에서**(이 화면의 100%)
 * · 목표비중 = **배분 대상 증권 대비**(현금 제외) — 저장·엔진이 쓰는 기준
 */
/**
 * 열려 있는 축.
 *
 * 산업은 닫았다 — 여기로 오는 유일한 길이 레일 1단계의 산업 탭이었는데 그 탭을 뺐다
 * (ETF 가 전부 미분류라 쓸모가 없었다). **문이 없는 화면은 두지 않는다.** 산업 축을
 * 되살릴 때 이 줄을 같이 되돌리면 된다.
 *
 * 유형은 자기 계층 화면(`/allocation/financial/[type]`)이 따로 있다 — 같은 목록을 두
 * 주소로 열면 어느 쪽이 진짜인지 헷갈린다.
 */
const KEYS: Record<string, { key: TagKey; noun: string }> = {
  country: { key: "country", noun: "국가" },
};

export default async function GroupAllocationPage({
  params,
}: {
  params: Promise<{ key: string; label: string }>;
}) {
  const { key: rawKey, label: rawLabel } = await params;
  const lens = KEYS[rawKey];
  if (!lens) notFound();
  const label = decodeURIComponent(rawLabel);

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

  const displayCcy =
    cookieStore.get("display_ccy")?.value === "USD" ? "USD" : "KRW";
  const data = computeDashboard(portfolio, displayCcy);
  const meta = await loadClassifiedMeta(
    supabase,
    data.allocation.map((a) => a.symbol),
  );

  const targets = readTargets(
    portfolio.holding.target_weights,
    (portfolio.holding.category_targets ?? {}) as Record<string, number>,
    data.allocation.map((a) => ({
      symbol: a.symbol,
      assetType: meta[a.symbol]?.assetType ?? "주식",
    })),
  );

  const mine = data.allocation.filter(
    (a) => tagLabel(meta[a.symbol], lens.key) === label,
  );
  const groupValue = mine.reduce((s, a) => s + a.value, 0);
  const financial = data.allocation.reduce((s, a) => s + a.value, 0);
  // 목표의 분모 — 엔진과 같아야 한다(**배분 대상 증권만**, 현금·실물자산 제외).
  const invested = financial;

  // 미보유 목표 종목도 넣는다 — 빼면 저장된 값이 보이지도 지워지지도 않는다(#70).
  const heldSet = new Set(data.allocation.map((a) => a.symbol));
  const orphans = Object.keys(targets).filter(
    (s) => !heldSet.has(s) && !isCashKey(s),
  );
  const orphanMeta =
    orphans.length > 0 ? await loadClassifiedMeta(supabase, orphans) : {};
  const orphansHere = orphans.filter(
    (s) => tagLabel(orphanMeta[s], lens.key) === label,
  );

  const rows: LevelRow[] = [
    ...mine.map((a) => ({
      key: a.symbol,
      label: a.name,
      value: a.value,
      weight: groupValue > 0 ? a.value / groupValue : 0,
      target: targets[a.symbol]?.target ?? 0,
      href: `/stocks/${a.symbol}`,
      symbol: a.symbol,
      // 유형을 가로지르는 목록이라 유형을 꼬리표로 붙인다 — 안 그러면 미국 주식과
      // 미국 ETF 가 구분 없이 섞여 보인다.
      badge: meta[a.symbol]?.assetType ?? "주식",
    })),
    ...orphansHere.map((sym) => ({
      key: sym,
      label: orphanMeta[sym]?.name ?? sym,
      value: 0,
      weight: 0,
      target: targets[sym]?.target ?? 0,
      href: `/stocks/${sym}`,
      symbol: sym,
      badge: "미보유",
    })),
  ].sort((a, b) => b.value - a.value || (b.target ?? 0) - (a.target ?? 0));

  const groupTarget = rows.reduce((s, r) => s + (r.target ?? 0), 0);

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />

      <AllocationLevel
        title={label}
        parentNote={`${lens.noun} · 증권의 ${pct(invested > 0 ? groupValue / invested : 0)} · 목표 ${pct(groupTarget)}`}
        value={groupValue}
        currency={data.currency}
        rows={rows}
        emptyText={`${label}에 담긴 게 없어요.`}
      />

      <p className="px-2 text-xs leading-relaxed text-muted-foreground">
        목록의 비중은 <b>{label} 안에서</b>, 목표비중은 <b>증권 대비</b>예요(현금 제외).
        {label} 전체를 몇 %로 들고 갈지는 <b>자본배분 1단계의 {lens.noun} 탭</b>에서
        정하고(다른 축은 안 움직여요), 여기서는 그 안의 종목끼리 비율을 손봐요. 여기서
        한 종목을 올리면 <b>{label} 합도 그만큼 커지고 현금이 줄어요.</b>
      </p>
    </main>
  );
}
