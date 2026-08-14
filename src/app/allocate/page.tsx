import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadAllocateData, type AllocateRow } from "@/lib/allocateData";
import { ASSET_TYPE_ORDER } from "@/lib/allocation";
import { isUntaggedLabel } from "@/lib/targetLens";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { AllocateRail } from "@/components/allocate/AllocateRail";
import type { LensRows } from "@/components/allocate/TargetLensPanel";
import type { TypeTargetRow } from "@/components/allocate/TypeTargetList";

/**
 * `/allocate` — 자본배분 **레일**. 한 화면에서 한 번에 한 가지씩 묻는다.
 *
 * 직전 버전은 이 자리에 현금 카드·1순위 카드·순위 카드를 한꺼번에 쌓아두고, 정작 답
 * ("어디에 얼마")은 `/allocate/plan` 으로 한 화면 더 들어가야 나왔다. 지금은 다섯 단계가
 * 이 화면 안에서 이어진다 — 목표 → 금액 → 묶음 → 배분 → 주수
 * (`components/allocate/AllocateRail.tsx`).
 *
 * 1단계에서 정할 목표는 **세 각도**로 만들어 넘긴다(유형·국가·산업). 셋 다 분모가 투자자산
 * 이라 어느 탭을 봐도 합이 100% 다 — 축만 바뀌고 진실은 하나다(`lib/targetLens.ts`).
 * 세 축 모두 그 자리에서 밀 수 있고, 밀면 구성 종목의 평면 목표가 비례로 따라간다.
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
  // 산업 렌즈를 1단계에서 쓰므로 태그를 채워 온다(멱등 — 처음 한 번만 실제로 일한다).
  const data = await loadAllocateData(supabase, displayCcy, {
    withSectors: true,
  });
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

  // ── 1단계에서 볼 목표 — 세 각도 ──
  // 분모는 **투자자산**(배분 대상 + 현금)이다. 목표비중의 정의와 같은 기준이라
  // 어느 렌즈로 봐도 이 화면의 합이 곧 100% 가 된다(§16.2 — 안 채운 나머지가 현금).
  // 아래 헬퍼가 중첩 함수라 `data` 의 non-null 좁힘이 안 따라온다 — 먼저 꺼내 둔다.
  const allRows = data.rows;
  const invested = allRows.reduce((s, r) => s + r.value, 0);
  const cash = Math.max(0, data.cash);
  const investable = invested + cash;
  const w = (v: number) => (investable > 0 ? v / investable : 0);
  const targetSum = allRows.reduce((s, r) => s + r.target, 0);

  /**
   * 한 렌즈의 줄들. 현금은 늘 마지막에 붙는다 — 어느 축으로 묶어도 현금은 **목표를 안
   * 채운 나머지**이고, 빼면 합이 100% 가 아니게 되어 "얼마 남았나"를 읽을 수 없다.
   */
  function lensRowsFor(
    tag: (r: AllocateRow) => string,
    href: (label: string) => string,
    /** 라벨 정렬 — 없으면 평가액 내림차순. */
    order?: readonly string[],
  ): TypeTargetRow[] {
    const groups = new Map<string, { value: number; target: number }>();
    for (const r of allRows) {
      const label = tag(r);
      const cur = groups.get(label) ?? { value: 0, target: 0 };
      cur.value += r.value;
      cur.target += r.target;
      groups.set(label, cur);
    }

    const labels = order
      ? [
          ...order.filter((t) => groups.has(t)),
          ...[...groups.keys()].filter((t) => !order.includes(t)),
        ]
      : [...groups.keys()].sort(
          (a, b) => groups.get(b)!.value - groups.get(a)!.value,
        );

    return [
      ...labels.map((label) => ({
        label,
        value: groups.get(label)!.value,
        current: w(groups.get(label)!.value),
        target: groups.get(label)!.target,
        // 기타·미분류만 못 민다 — 구성이 유동적이라 묶음으로 밀면 엉뚱한 종목이
        // 딸려간다(`setGroupTarget` 도 서버에서 같은 이유로 거부한다).
        readOnly: isUntaggedLabel(label),
        note: isUntaggedLabel(label)
          ? "구성이 자주 바뀌어 묶음으로는 못 정해요 — 줄을 눌러 종목별로 정해주세요."
          : undefined,
        href: href(label),
      })),
      // 현금은 어느 렌즈에서도 직접 정하지 않는다 — 목표를 안 채운 나머지가 곧
      // 현금이라 정의상 결과값이다(§16.2).
      {
        label: "현금",
        value: cash,
        current: w(cash),
        target: Math.max(0, 1 - targetSum),
        readOnly: true,
        note: "다른 곳의 목표를 안 채운 나머지가 현금이에요.",
        href: "/allocation/cash",
      },
    ];
  }

  const lensRows: LensRows = {
    assetType: lensRowsFor(
      (r) => r.assetType,
      (t) => `/allocation/financial/${encodeURIComponent(t)}`,
      ASSET_TYPE_ORDER,
    ),
    country: lensRowsFor(
      (r) => r.country,
      (l) => `/allocation/group/country/${encodeURIComponent(l)}`,
    ),
    sector: lensRowsFor(
      (r) => r.sector,
      (l) => `/allocation/group/sector/${encodeURIComponent(l)}`,
    ),
  };

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
      lensRows={lensRows}
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
