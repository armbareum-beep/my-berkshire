import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { loadWatchlist } from "@/lib/watchlist";
import { loadSecurityNames } from "@/lib/securities";
import { getPrices } from "@/lib/finance/prices";
import { PRESET_QUOTES, isQuoteOnly } from "@/lib/finance/quotes";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { SearchEntry } from "@/components/stocks/SearchEntry";
import { money, signedMoney, signedPct, changeColor, type Currency } from "@/lib/format";

/**
 * 검색 + 관심종목 — 증권통식. 종목·지수·환율 시세를 **네이티브 단위**로(₩환산 안 함:
 * 지수 포인트·환율은 환산하면 의미 깨짐). 종목만 상세 진입, 지수·환율은 시세 전용.
 */
export default async function SearchPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const portfolio = await getPortfolio(supabase);
  if (!portfolio) redirect("/onboarding");

  const symbols = await loadWatchlist(supabase, portfolio.holding.id);
  // 종목명(DB)·시세(야후)는 둘 다 symbols 만 있으면 되므로 병렬 — 순차 왕복 제거.
  const presetName = new Map(PRESET_QUOTES.map((p) => [p.symbol, p.name]));
  // 네이티브 시세(환산 X) + 전일종가 + 통화/유형.
  const [names, { prices, previousCloses, currencies, instrumentTypes }] =
    await Promise.all([
      loadSecurityNames(supabase, symbols),
      getPrices(symbols),
    ]);

  /** 시세·변동 표시(종목=통화기호, 지수·환율=숫자). */
  function quoteText(sym: string) {
    const px = prices[sym] ?? null;
    if (px == null) return null;
    const prev = previousCloses[sym] ?? null;
    const chg = prev != null ? px - prev : null;
    const rate = prev != null && prev > 0 ? chg! / prev : null;
    const quoteOnly = isQuoteOnly(sym, instrumentTypes[sym]);
    const cur: Currency = currencies[sym] === "USD" ? "USD" : "KRW";
    const priceStr = quoteOnly
      ? px.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : money(px, cur);
    const chgStr =
      chg == null
        ? null
        : quoteOnly
          ? `${chg >= 0 ? "+" : ""}${chg.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
          : signedMoney(chg, cur);
    return { priceStr, chgStr, rate };
  }

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />

      <h1 className="text-xl font-extrabold tracking-tight">관심종목</h1>
      <SearchEntry watched={symbols} />

      <section className="mt-1">
        {symbols.length > 0 && (
          <p className="mb-2 text-sm font-semibold">담은 종목 ({symbols.length})</p>
        )}
        {symbols.length === 0 ? (
          <p className="rounded-xl bg-card p-4 text-sm text-muted-foreground shadow-card">
            검색해서 ★를 누르면 여기 담겨요. 종목·지수·환율(코스피·원달러 등) 모두
            매수 전에도 시세를 추적할 수 있어요.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {symbols.map((sym) => {
              const nm = names[sym] ?? presetName.get(sym) ?? sym;
              const q = quoteText(sym);
              const quoteOnly = isQuoteOnly(sym, instrumentTypes[sym]);
              const inner = (
                <>
                  <SymbolAvatar name={nm} symbol={sym} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-bold">{nm}</span>
                    <span className="text-sm text-muted-foreground">{sym}</span>
                  </span>
                  <span className="ml-auto flex flex-col items-end">
                    <span className="font-semibold tabular-nums">
                      {q ? q.priceStr : "시세 없음"}
                    </span>
                    {q?.chgStr && q.rate != null && (
                      <span
                        className="text-xs font-medium tabular-nums"
                        style={{ color: changeColor(q.rate) }}
                      >
                        {q.chgStr} · {signedPct(q.rate, 2)}
                      </span>
                    )}
                  </span>
                </>
              );
              const presetMeta = PRESET_QUOTES.find((p) => p.symbol === sym);
              const indexHref = presetMeta?.isIndex
                ? `/index/${encodeURIComponent(sym)}`
                : null;
              // 지수는 /index/[sym], 환율 등 quoteOnly는 시세 전용, 종목은 /stocks/[sym].
              return (
                <li key={sym}>
                  {quoteOnly && !indexHref ? (
                    <div className="flex items-center gap-3 rounded-xl bg-card p-3 shadow-card">
                      {inner}
                    </div>
                  ) : (
                    <Link
                      href={
                        indexHref ??
                        `/stocks/${encodeURIComponent(sym)}?name=${encodeURIComponent(nm)}${
                          instrumentTypes[sym] === "ETF" ? "&assetType=ETF" : ""
                        }`
                      }
                      scroll={false}
                      className="flex items-center gap-3 rounded-xl bg-card p-3 shadow-card transition active:scale-[0.99]"
                    >
                      {inner}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
