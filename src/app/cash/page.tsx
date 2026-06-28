import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { companyCashPools } from "@/lib/finance/valuation";
import { getFxRateInfo } from "@/lib/finance/fx";
import {
  CURRENCIES,
  currencyMeta,
  nativeMoney,
} from "@/lib/finance/currencies";
import { won, pct, changeColor } from "@/lib/format";
import { CountUp } from "@/components/ui/CountUp";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { Flag } from "@/components/ui/Flag";
import { Donut } from "@/components/dashboard/Donut";
import { donutColor } from "@/components/dashboard/donutPalette";

/**
 * 현금·외화 콘솔 — 현금비중 카드에서 진입.
 *  · 내 외화: 통화별 보유(국기·네이티브·₩가치·비중) + 원화/외화 비율 도넛.
 *  · 환율: 지원 통화의 현재 ₩ 환율(야후).
 * 금액은 ₩(기능통화) 기준. 외화 ₩가치는 현재 환율(평가 기준).
 */
export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <CashContent tab={tab} />
    </main>
  );
}

/**
 * 현금·외화 본문 — 페이지 크롬 없이 내용만.
 * 전체 페이지(`/cash`)와 바텀시트(`@sheet/(.)cash`)가 공유.
 */
export async function CashContent({ tab }: { tab?: string }) {
  const isFx = tab === "fx";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const portfolio = await getPortfolio(supabase);
  if (!portfolio) redirect("/onboarding");

  const pools = companyCashPools(
    portfolio.events,
    Number(portfolio.holding.initial_valuation),
  );
  const codes = [
    ...new Set([...CURRENCIES.map((c) => c.code), ...Object.keys(pools)]),
  ];
  const fxInfo = await getFxRateInfo(codes); // KRW=1, 실패 통화는 빠짐

  // 보유(잔액>0) 통화 → 현재 환율 ₩가치. ₩ 먼저, 그다음 ₩가치 큰 순.
  const held = Object.entries(pools)
    .filter(([, v]) => Math.abs(v) > 0.005)
    .map(([code, native]) => {
      const rate = fxInfo[code]?.rate ?? null;
      return { code, native, rate, krw: rate != null ? native * rate : null };
    })
    .sort((a, b) =>
      a.code === "KRW"
        ? -1
        : b.code === "KRW"
          ? 1
          : (b.krw ?? 0) - (a.krw ?? 0),
    );

  const totalKrw = held.reduce((s, h) => s + (h.krw ?? 0), 0);
  const krwVal = pools.KRW ?? 0;
  const krwWeight = totalKrw > 0 ? krwVal / totalKrw : 0;
  const foreignWeight = Math.max(0, 1 - krwWeight);

  const slices = held.map((h) => ({
    label: currencyMeta(h.code).name,
    weight: totalKrw > 0 ? (h.krw ?? 0) / totalKrw : 0,
    value: h.krw ?? 0,
  }));

  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">현금 · 외화</h1>

      {/* 탭: 내 외화 / 환율 */}
      <div className="flex w-fit gap-1 rounded-full bg-secondary p-1">
        <Link
          href="/cash"
          className={
            "rounded-full px-4 py-1.5 text-sm font-semibold " +
            (!isFx ? "bg-card shadow-sm" : "text-muted-foreground")
          }
        >
          내 외화
        </Link>
        <Link
          href="/cash?tab=fx"
          className={
            "rounded-full px-4 py-1.5 text-sm font-semibold " +
            (isFx ? "bg-card shadow-sm" : "text-muted-foreground")
          }
        >
          환율
        </Link>
      </div>

      {isFx ? (
        /* ── 환율 탭 ── */
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <ul className="flex flex-col gap-4">
            {CURRENCIES.filter((c) => c.code !== "KRW").map((c) => {
              const info = fxInfo[c.code] ?? null;
              return (
                <li key={c.code}>
                  <Link
                    href={`/fx/${c.code}`}
                    className="flex items-center gap-3 -mx-2 rounded-xl px-2 py-1 active:bg-secondary"
                  >
                    <Flag code={c.code} />
                    <span className="flex flex-col">
                      <span className="text-sm font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {c.code}
                      </span>
                    </span>
                    <span className="ml-auto flex flex-col items-end">
                      <span className="text-sm font-bold tabular-nums">
                        {info != null
                          ? `1 ${c.code} = ₩${info.rate.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                          : "정보 없음"}
                      </span>
                      {info?.changeAbs != null && (
                        <span
                          className="text-xs tabular-nums"
                          style={{ color: changeColor(info.changeAbs) }}
                        >
                          {info.changeAbs >= 0 ? "+" : ""}
                          {info.changeAbs.toLocaleString(undefined, { maximumFractionDigits: 2 })}원
                          {" "}({info.changePct != null ? (info.changePct >= 0 ? "+" : "") + pct(Math.abs(info.changePct)) : ""})
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground">›</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            야후 파이낸스 실시간 환율. 환전·외화 기록 시 이 환율로 ₩ 환산됩니다.
          </p>
        </section>
      ) : (
        /* ── 내 외화 탭 ── */
        <>
          <section className="rounded-2xl bg-card p-5 shadow-card">
            <p className="text-sm text-muted-foreground">총 현금</p>
            <CountUp
              value={totalKrw}
              format="money"
              currency="KRW"
              className="mt-1 block text-3xl font-extrabold"
            />
            <p className="mt-1 text-sm text-muted-foreground tabular-nums">
              원화 {pct(krwWeight)} · 외화 {pct(foreignWeight)}
            </p>

            {totalKrw > 0 && (
              <div className="mt-5 flex items-center gap-5">
                <Donut slices={slices} />
                <ul className="flex flex-1 flex-col gap-2.5">
                  {held.map((h, i) => (
                    <li key={h.code} className="flex items-center gap-2 text-sm">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: donutColor(i) }}
                      />
                      <span className="font-medium">
                        {currencyMeta(h.code).name}
                      </span>
                      <span className="ml-auto tabular-nums text-muted-foreground">
                        {totalKrw > 0
                          ? pct((h.krw ?? 0) / totalKrw)
                          : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* 통화별 보유 상세(국기·네이티브·₩가치·변동) */}
          <section className="rounded-2xl bg-card p-5 shadow-card">
            <p className="mb-3 text-sm font-semibold">통화별 보유</p>
            <ul className="flex flex-col gap-4">
              {held.map((h) => {
                const info = h.code !== "KRW" ? fxInfo[h.code] : undefined;
                return (
                  <li key={h.code} className="flex items-center gap-3">
                    <Flag code={h.code} />
                    <span className="flex flex-col">
                      <span className="text-sm font-medium">
                        {currencyMeta(h.code).name}
                      </span>
                      {h.code !== "KRW" && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {h.krw != null ? won(h.krw) : "환율 정보 없음"}
                        </span>
                      )}
                    </span>
                    <span className="ml-auto flex flex-col items-end">
                      <span className="font-bold tabular-nums">
                        {nativeMoney(h.native, h.code)}
                      </span>
                      {info?.changeAbs != null && (
                        <span
                          className="text-xs tabular-nums"
                          style={{ color: changeColor(info.changeAbs) }}
                        >
                          {info.changeAbs >= 0 ? "+" : ""}
                          {info.changeAbs.toLocaleString(undefined, { maximumFractionDigits: 2 })}원
                          {" "}({info.changePct != null ? (info.changePct >= 0 ? "+" : "") + pct(Math.abs(info.changePct)) : ""})
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* 액션: 외화 증자(달러 기본) / 환전 — 해당 거래 탭으로 바로 진입 */}
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/transactions?type=DEPOSIT&ccy=USD"
              className="flex h-12 items-center justify-center rounded-xl bg-secondary text-sm font-semibold text-secondary-foreground"
            >
              외화 증자
            </Link>
            <Link
              href="/transactions?type=EXCHANGE"
              className="flex h-12 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground"
            >
              환전하기
            </Link>
          </div>
        </>
      )}
    </>
  );
}
