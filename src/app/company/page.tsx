import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveHolding } from "@/lib/holdings";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { CompanyStructure } from "@/components/company/CompanyStructure";
import { CompanyMembers } from "@/components/company/CompanyMembers";
import { ListingSection } from "@/components/company/ListingSection";
import { renameActiveCompany } from "./actions";

/**
 * 회사 정보 — 헤더 회사명 탭의 목적지. 가족 장부는 회사가 1개로 고정이라
 * 회사 목록·전환·삭제·추가 없이 단일 회사 정보만 본다.
 *  · 회사명 변경·설립일
 *  · 지배구조도(지주 → 계좌 → 자회사, ⑦ 로망)
 */
export default async function CompanyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [holding, cookieStore] = await Promise.all([
    getActiveHolding(supabase),
    cookies(),
  ]);
  if (!holding) redirect("/onboarding");

  const displayCcy =
    cookieStore.get("display_ccy")?.value === "USD" ? "USD" : "KRW";

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BackButton />
      <h1 className="text-2xl font-extrabold tracking-tight">회사 정보</h1>

      {/* 회사 정보 */}
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <p className="text-xs font-semibold text-primary">현재 운영 중</p>
        <form action={renameActiveCompany} className="mt-2 flex gap-2">
          <input
            name="name"
            defaultValue={holding.name}
            required
            maxLength={40}
            aria-label="회사명"
            className="min-w-0 flex-1 rounded-xl bg-secondary px-3 py-2 text-lg font-extrabold outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="submit"
            className="shrink-0 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition active:scale-[0.98]"
          >
            수정 완료
          </button>
        </form>
        <p className="mt-1 text-sm text-muted-foreground">
          설립 {holding.founded_at}
        </p>
      </section>

      {/* 상장(IPO, 036) */}
      <ListingSection
        listedAt={holding.listed_at}
        firstListedAt={holding.first_listed_at}
        listedName={holding.listed_name}
        companyName={holding.name}
      />

      {/* 컴퍼니(CEO) */}
      <div className="mt-2">
        <h2 className="text-lg font-extrabold tracking-tight">컴퍼니</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          가족 한 사람의 계좌 묶음 = 하나의 컴퍼니. 토글로 합산에서 빼면 그 컴퍼니
          수익률을 가늠할 수 있습니다. (토글은 주식 계좌 기준 — 부동산·부채는 가족 공유로
          그대로 남습니다.)
        </p>
      </div>
      <Suspense
        fallback={
          <div className="h-28 animate-pulse rounded-2xl bg-card shadow-card" />
        }
      >
        <CompanyMembers holdingId={holding.id} displayCcy={displayCcy} />
      </Suspense>

      {/* 지배구조도 */}
      <div className="mt-2">
        <h2 className="text-lg font-extrabold tracking-tight">지배구조</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          지주회사 → 컴퍼니 → 계좌 → 자회사 구조를 봅니다.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="h-28 animate-pulse rounded-2xl bg-card shadow-card" />
        }
      >
        <CompanyStructure holding={holding} displayCcy={displayCcy} />
      </Suspense>

      <BottomTabBar />
    </main>
  );
}
