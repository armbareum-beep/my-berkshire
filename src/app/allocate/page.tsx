import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadAllocateData } from "@/lib/allocateData";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { AllocateRail } from "@/components/allocate/AllocateRail";

/**
 * `/allocate` — 자본배분 **레일**. 한 화면에서 한 번에 한 가지씩 묻는다.
 *
 * 직전 버전은 이 자리에 현금 카드·1순위 카드·순위 카드를 한꺼번에 쌓아두고, 정작 답
 * ("어디에 얼마")은 `/allocate/plan` 으로 한 화면 더 들어가야 나왔다. 지금은 세 단계가
 * 이 화면 안에서 이어진다 — 금액 → 배분 → 주수(`components/allocate/AllocateRail.tsx`).
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

  // ── 관문 2 — 목표비중이 없으면 나눌 근거가 없다 ──
  if (!data.hasTargets) {
    return (
      <Gate
        title="먼저 목표비중을 정해요"
        body="어떤 기업을 얼마나 들고 갈지 정해야 새 돈을 나눌 수 있어요. 한 종목만 정해도 시작할 수 있습니다."
        action={{ href: "/allocate/settings", label: "목표비중 정하기" }}
      />
    );
  }

  return (
    <AllocateRail
      rows={data.rows}
      currency={data.currency}
      investableCash={data.investableCash}
      investableCashSet={data.investableCashSet}
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
