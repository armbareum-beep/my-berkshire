import { getFxToKrw } from "@/lib/finance/fx";
import { getDailyKrwCloses } from "@/lib/finance/prices";
import { currencyMeta } from "@/lib/finance/currencies";
import { todayKST } from "@/lib/date";
import { signedPct, changeColor } from "@/lib/format";
import { Flag } from "@/components/ui/Flag";
import { PriceChart } from "@/components/stocks/PriceChart";

/** 통화별 보기 좋은 쌍 라벨. 없으면 통화명 사용. */
const PAIR_LABEL: Record<string, string> = {
  USD: "원/달러",
  JPY: "원/엔",
  EUR: "원/유로",
};

/** ₩ 환율 포맷(소수 2자리). */
function fmtRate(n: number): string {
  return `₩${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/**
 * 환율 상세 본문 — 페이지 크롬(BackButton·BottomTabBar) 없이 내용만.
 * 전체 페이지(`/fx/[code]`)와 바텀시트(`@sheet/(.)fx/[code]`)가 공유.
 * 시세 출처는 야후(`{CCY}KRW=X`) — 통화=KRW라 ₩환산 ×1이라 환율값 시계열 그대로.
 */
export async function FxDetailContent({ code }: { code: string }) {
  const meta = currencyMeta(code);
  const pair = `${code}KRW=X`;
  const today = todayKST();
  const oneYearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;

  const [fx, dailyRes, monthlyRes] = await Promise.all([
    getFxToKrw([code]),
    getDailyKrwCloses([pair], oneYearAgo, today),
    getDailyKrwCloses([pair], "1990-01-01", today, "1mo"),
  ]);

  const rate = fx[code] ?? null;
  const daily = dailyRes.series[pair] ?? [];
  const monthly = monthlyRes.series[pair] ?? [];

  // 일간 변동·52주 고저 — 일봉 시리즈에서 파생.
  const last = daily.at(-1)?.close ?? null;
  const prev = daily.at(-2)?.close ?? null;
  const changeAbs = last != null && prev != null ? last - prev : null;
  const changePct = changeAbs != null && prev ? changeAbs / prev : null;
  const closes = daily.map((b) => b.close);
  const high52 = closes.length ? Math.max(...closes) : null;
  const low52 = closes.length ? Math.min(...closes) : null;

  const label = PAIR_LABEL[code] ?? meta.name;

  return (
    <>
      <div className="flex items-center gap-2">
        <Flag code={code} className="h-6 w-[34px] shrink-0 rounded-[4px] object-cover" />
        <div>
          <p className="text-xl font-extrabold tracking-tight">{label}</p>
          <p className="text-sm text-muted-foreground">{meta.name} · {code}</p>
        </div>
      </div>

      {/* 현재 환율 + 일간 변동 */}
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <p className="text-sm text-muted-foreground">현재 환율</p>
        {rate != null ? (
          <>
            <p className="mt-1 text-3xl font-extrabold tabular-nums">
              1 {code} = {fmtRate(rate)}
            </p>
            {changeAbs != null && changePct != null && (
              <p
                className="mt-1 text-sm font-semibold tabular-nums"
                style={{ color: changeColor(changeAbs) }}
              >
                {changeAbs >= 0 ? "+" : "-"}
                {fmtRate(Math.abs(changeAbs))} ({signedPct(changePct)}) · 전일 대비
              </p>
            )}
          </>
        ) : (
          <p className="mt-1 text-lg font-semibold text-muted-foreground">정보 없음</p>
        )}
      </section>

      {/* 추이 차트 — 데이터 없으면 현재 환율은 유지하고 차트 자리만 대체 */}
      {daily.length >= 2 || monthly.length >= 2 ? (
        <PriceChart daily={daily} monthly={monthly} />
      ) : (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <p className="text-sm font-semibold">추이</p>
          <p className="mt-2 text-xs text-muted-foreground">
            추이 데이터를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.
          </p>
        </section>
      )}

      {/* 52주 고저 */}
      {(high52 != null || low52 != null) && (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <p className="mb-3 text-sm font-semibold">최근 1년</p>
          <div className="grid grid-cols-2 gap-y-4">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">최고</span>
              <span className="text-lg font-extrabold tabular-nums">
                {high52 != null ? fmtRate(high52) : "—"}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">최저</span>
              <span className="text-lg font-extrabold tabular-nums">
                {low52 != null ? fmtRate(low52) : "—"}
              </span>
            </div>
          </div>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        출처: 야후 파이낸스 · 참고용. 환전·외화 기록 시 이 환율로 ₩ 환산됩니다.
      </p>
    </>
  );
}
