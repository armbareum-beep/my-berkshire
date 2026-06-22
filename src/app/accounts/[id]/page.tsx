import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { loadAccountGroups } from "@/lib/accounts";
import { ACCOUNT_TYPE_LABEL } from "@/lib/config/tax";
import { qtyUnit } from "@/lib/securities";
import { money, signedMoneyShort, pct, changeColor } from "@/lib/format";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";

/**
 * 계좌 상세 — 이 계좌(자회사 그릇)가 담은 종목 전체. 종목이 수십 개여도 한 화면에 쭉.
 * 데이터는 loadAccountGroups 재사용(새 쿼리 없음). 편집은 /accounts(목록)에서.
 */
export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const portfolio = await getPortfolio(supabase);
  if (!portfolio) redirect("/onboarding");
  const { holding } = portfolio;

  const displayCcy =
    (await cookies()).get("display_ccy")?.value === "USD" ? "USD" : "KRW";
  const useUsd = displayCcy === "USD" && !!portfolio.usdKrw;
  const factor = useUsd ? 1 / (portfolio.usdKrw as number) : 1;

  const groups = await loadAccountGroups(supabase, {
    holdingId: holding.id,
    prices: portfolio.prices,
    names: portfolio.names,
    factor,
  });
  const account = groups.find((g) => g.id === id);
  if (!account) notFound();

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BackButton />

      {/* 헤더 — 계좌 이름·유형·평가액 */}
      <header className="rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">
            {ACCOUNT_TYPE_LABEL[account.accountType]}
          </span>
          <div className="flex flex-col">
            <h1 className="text-xl font-extrabold tracking-tight">
              {account.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {ACCOUNT_TYPE_LABEL[account.accountType]} · 자회사{" "}
              {account.holdings.length}개
            </p>
          </div>
        </div>
        <p className="mt-4 text-3xl font-extrabold tabular-nums tracking-tight">
          {money(account.value, displayCcy)}
        </p>
        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          보유 종목 평가액
          {account.changeRate !== null && (
            <span
              className="text-sm font-semibold tabular-nums"
              style={{ color: changeColor(account.changeRate) }}
            >
              {signedMoneyShort(account.gain ?? 0, displayCcy)} (
              {pct(Math.abs(account.changeRate))})
            </span>
          )}
        </p>
      </header>

      {/* 보유 종목 — 이 계좌가 담은 자회사(종목) 전체 */}
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <p className="mb-3 text-sm font-semibold">보유 종목</p>
        {account.holdings.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            이 계좌에 보유 종목이 없습니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {account.holdings.map((h) => (
              <li key={h.symbol}>
                <Link
                  href={`/stocks/${h.symbol}`}
                  className="flex items-center gap-3 rounded-xl py-2 transition active:scale-[0.99]"
                >
                  <SymbolAvatar name={h.name} symbol={h.symbol} />
                  <span className="flex flex-col">
                    <span className="font-medium">{h.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {h.quantity.toLocaleString()}
                      {qtyUnit(h.symbol)}
                    </span>
                  </span>
                  <span className="ml-auto flex flex-col items-end">
                    <span className="font-semibold tabular-nums">
                      {money(h.value, displayCcy)}
                    </span>
                    {h.changeRate !== null && (
                      <span
                        className="text-sm font-medium tabular-nums"
                        style={{ color: changeColor(h.changeRate) }}
                      >
                        {signedMoneyShort(h.gain ?? 0, displayCcy)} (
                        {pct(Math.abs(h.changeRate))})
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 계좌 관리(이름·유형·수수료 수정)는 목록 페이지에서 */}
      <Link
        href="/accounts"
        className="block rounded-2xl bg-card p-4 text-sm font-medium text-muted-foreground shadow-card transition active:scale-[0.99]"
      >
        ‹ 계좌 관리 · 수수료
      </Link>

      <BottomTabBar />
    </main>
  );
}
