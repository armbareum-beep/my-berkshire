import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadAllocateData } from "@/lib/allocateData";
import { ASSET_TYPE_ORDER } from "@/lib/allocation";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { AllocateRail } from "@/components/allocate/AllocateRail";
import type { TypeTargetRow } from "@/components/allocate/TypeTargetList";

/**
 * `/allocate` — 자본배분 **레일**. 한 화면에서 한 번에 한 가지씩 묻는다.
 *
 * 직전 버전은 이 자리에 현금 카드·1순위 카드·순위 카드를 한꺼번에 쌓아두고, 정작 답
 * ("어디에 얼마")은 `/allocate/plan` 으로 한 화면 더 들어가야 나왔다. 지금은 세 단계가
 * 이 화면 안에서 이어진다 — 목표 → 금액 → 배분 → 주수(`components/allocate/AllocateRail.tsx`).
 *
 * 이 서버 컴포넌트가 하는 일은 데이터 적재와 **못 넘어가는 관문 두 개**뿐이다. 관문도
 * 카드를 늘어놓지 않고 "지금 할 일 하나 + 버튼 하나"로 낸다(`docs/user-rails-v1.md` §3
 * "빈 화면 = 명령").
 */
export default async function AllocatePage() {
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

  // ── 관문 1 — 시세가 없으면 비중을 계산할 수 없다 ──
  if (!data.priceAvailable) {
    return (
      <Gate
        title="시세를 불러오지 못했어요"
        body="현재가가 있어야 비중을 계산할 수 있어요. 잠시 후 다시 열어 주세요."
      />
    );
  }

  // 목표비중 관문은 없앴다 — 레일 **1단계가 곧 목표 정하기**라, 관문을 세우면
  // 같은 일을 하는 화면을 하나 더 지나가게 하는 셈이다.

  // ── 1단계에서 정할 유형별 목표 ──
  // 분모는 **투자자산**(배분 대상 + 현금)이다. 목표비중의 정의와 같은 기준이라
  // 이 화면의 합이 곧 100% 가 된다(§16.2 — 안 채운 나머지가 현금).
  const byType = new Map<string, { value: number; target: number }>();
  for (const r of data.rows) {
    const cur = byType.get(r.assetType) ?? { value: 0, target: 0 };
    cur.value += r.value;
    cur.target += r.target;
    byType.set(r.assetType, cur);
  }
  const invested = data.rows.reduce((s, r) => s + r.value, 0);
  const cash = Math.max(0, data.cash);
  const investable = invested + cash;
  const w = (v: number) => (investable > 0 ? v / investable : 0);
  const targetSum = data.rows.reduce((s, r) => s + r.target, 0);

  const typeRows: TypeTargetRow[] = [
    ...ASSET_TYPE_ORDER.filter((t) => byType.has(t)).map((t) => ({
      label: t as string,
      value: byType.get(t)!.value,
      current: w(byType.get(t)!.value),
      target: byType.get(t)!.target,
      href: `/allocation/financial/${encodeURIComponent(t)}`,
    })),
    ...[...byType.keys()]
      .filter((t) => !ASSET_TYPE_ORDER.includes(t as (typeof ASSET_TYPE_ORDER)[number]))
      .map((t) => ({
        label: t,
        value: byType.get(t)!.value,
        current: w(byType.get(t)!.value),
        target: byType.get(t)!.target,
        href: `/allocation/financial/${encodeURIComponent(t)}`,
      })),
    // 현금은 직접 정하지 않는다 — 목표를 안 채운 나머지가 곧 현금이다(§16.2).
    {
      label: "현금",
      value: cash,
      current: w(cash),
      target: Math.max(0, 1 - targetSum),
      readOnly: true,
      href: "/allocation/cash",
    },
  ];

  return (
    <AllocateRail
      rows={data.rows}
      currency={data.currency}
      investableCash={data.investableCash}
      investableCashSet={data.investableCashSet}
      cash={cash}
      house={data.house}
      passing={data.passing}
      judged={data.judged}
      typeRows={typeRows}
    />
  );
}

/** 레일에 들어가기 전 관문 — 한 문장과 버튼 하나. 탭바는 남긴다(아직 평시 화면). */
function Gate({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <main className="flex min-h-dvh flex-col justify-center gap-4 p-6 pb-28">
      <BottomTabBar />
      <div className="rounded-2xl bg-card p-6 text-center shadow-card">
        <p className="text-lg font-bold tracking-tight">{title}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {body}
        </p>
        {action && (
          <Link
            href={action.href}
            className="mt-5 inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground transition active:scale-[0.98]"
          >
            {action.label}
          </Link>
        )}
      </div>
    </main>
  );
}
