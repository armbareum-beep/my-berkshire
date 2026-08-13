import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadAllocateData } from "@/lib/allocateData";
import { money, pct } from "@/lib/format";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { rankRows } from "@/lib/allocateRanking";
import { AllocateRanking } from "@/components/allocate/AllocateRanking";

/**
 * `/allocate` — **보기 전용** 화면. 한 가지 질문에만 답한다.
 *
 * > 지금 새 돈이 생기면 어디에 넣어야 하는가?
 *
 * PRD v0.3 §11 의 구성을 따른다 — 투자 가능 현금(히어로) · 오늘의 1순위 · 배분 순위.
 * 금액 입력과 계산은 `/allocate/plan`, 설정은 `/allocate/settings` 로 갈라져 있다
 * (`docs/allocate-redesign-v1.md`).
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

  const ranked = rankRows(data.rows);
  const top = ranked.find(
    (r) => r.leg.status === "BUY" || r.leg.status === "STRETCH",
  );

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />

      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">자본배분</h1>
        <Link
          href="/allocate/settings"
          className="mt-1 shrink-0 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold transition active:scale-[0.97]"
        >
          설정
        </Link>
      </div>

      {/* ── 히어로 — 이 화면에서 가장 중요한 단일 숫자(design-strategy §4) ── */}
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <p className="text-sm text-muted-foreground">투자 가능 현금</p>
        <p className="mt-1 text-3xl font-extrabold tabular-nums">
          {money(data.investableCash, data.currency)}
        </p>
        {!data.investableCashSet && (
          <p className="mt-1 text-xs text-muted-foreground">
            보유 현금 전액이에요. 설정에서 따로 정할 수 있어요.
          </p>
        )}
      </section>

      {!data.priceAvailable ? (
        <div className="rounded-2xl bg-card p-6 text-center shadow-card">
          <p className="text-sm text-muted-foreground">
            시세 갱신 필요 — 잠시 후 다시 시도하세요.
          </p>
        </div>
      ) : !data.hasTargets ? (
        <div className="rounded-2xl bg-card p-6 text-center shadow-card">
          <p className="text-sm font-semibold">목표비중이 아직 없어요</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            어떤 종목을 얼마나 들고 갈지 정해야 새 돈을 나눌 수 있어요.
          </p>
          <Link
            href="/allocate/settings"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition active:scale-[0.98]"
          >
            목표비중 정하기
          </Link>
        </div>
      ) : (
        <>
          {/* ── 오늘의 1순위 + 단일 메인 액션 (PRD §11) ── */}
          <section className="rounded-2xl bg-card p-5 shadow-card">
            <p className="text-sm text-muted-foreground">오늘의 1순위</p>
            {top ? (
              <>
                <div className="mt-3 flex items-center gap-3">
                  <SymbolAvatar
                    symbol={top.row.symbol}
                    name={top.row.label}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-bold">{top.row.label}</p>
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      {pct(top.leg.currentWeight)} → 목표{" "}
                      {pct(top.leg.targetWeight)}
                      {top.row.expectedCagr != null &&
                        ` · 기대 ${pct(top.row.expectedCagr)}`}
                    </p>
                  </div>
                </div>
                <Link
                  href="/allocate/plan"
                  className="mt-5 flex h-13 w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground transition active:scale-[0.98]"
                >
                  자본 배분하기
                </Link>
              </>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                지금은 살 곳이 없어요. 전부 목표를 채웠거나 한도에 걸려 있습니다 —
                이럴 땐 현금으로 두는 게 맞습니다.
              </p>
            )}
          </section>

          <AllocateRanking ranked={ranked} />
        </>
      )}
    </main>
  );
}
