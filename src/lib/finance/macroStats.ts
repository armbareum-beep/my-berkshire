/**
 * 국가별 시총/GDP (버핏 인디케이터) + 미국 기업이익/GDP 역대 추이.
 * World Bank API + FRED API (모두 키 불필요). 실패 시 빈 값 반환(throw 금지).
 */

export interface BuffettIndicatorItem {
  country: string;
  flag: string;
  ratio: number;
  marketCap: number;
  gdp: number;
  year: number;
}

export interface CorporateProfitPoint {
  date: string;
  ratio: number;
}

export interface UsCorporateProfitRatio {
  ratio: number;
  corporateProfit: number;
  gdp: number;
  asOf: string;
  series: CorporateProfitPoint[];
}

const COUNTRIES = [
  { iso2: "US", name: "미국", flag: "🇺🇸" },
  { iso2: "KR", name: "한국", flag: "🇰🇷" },
  { iso2: "JP", name: "일본", flag: "🇯🇵" },
  { iso2: "CN", name: "중국", flag: "🇨🇳" },
  { iso2: "GB", name: "영국", flag: "🇬🇧" },
] as const;

async function fetchWorldBankIndicator(
  iso2: string,
  indicator: string,
): Promise<{ value: number; year: number } | null> {
  const url = `https://api.worldbank.org/v2/country/${iso2}/indicator/${indicator}?format=json&mrv=5&per_page=5`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 604800 },
    });
    if (!res.ok) return null;

    const json = await res.json();
    const rows: unknown[] = Array.isArray(json) ? (json[1] ?? []) : [];

    for (const row of rows) {
      if (typeof row !== "object" || row === null) continue;
      const obj = row as Record<string, unknown>;
      const val = obj.value;
      const date = obj.date;
      if (typeof val === "number" && val > 0 && typeof date === "string") {
        return { value: val, year: parseInt(date, 10) };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function getBuffettIndicator(): Promise<BuffettIndicatorItem[]> {
  const results = await Promise.allSettled(
    COUNTRIES.map(async ({ iso2, name, flag }) => {
      const [mktCap, gdp] = await Promise.all([
        fetchWorldBankIndicator(iso2, "CM.MKT.LCAP.CD"),
        fetchWorldBankIndicator(iso2, "NY.GDP.MKTP.CD"),
      ]);
      if (!mktCap || !gdp) return null;
      return {
        country: name,
        flag,
        ratio: mktCap.value / gdp.value,
        marketCap: mktCap.value,
        gdp: gdp.value,
        year: Math.min(mktCap.year, gdp.year),
      } satisfies BuffettIndicatorItem;
    }),
  );

  return results.flatMap((r) =>
    r.status === "fulfilled" && r.value !== null ? [r.value] : [],
  );
}

/** FRED CSV → 날짜-값 맵. 값이 "."(결측)인 행은 건너뜀. */
async function fetchFredSeries(seriesId: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const res = await fetch(
      `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        next: { revalidate: 86400 },
      },
    );
    if (!res.ok) return map;

    const text = await res.text();
    const lines = text.trim().split("\n");
    for (let i = 1; i < lines.length; i++) {
      const [date, rawVal] = lines[i].split(",");
      if (!date || !rawVal) continue;
      const value = parseFloat(rawVal.trim());
      if (!isNaN(value) && value > 0) map.set(date.trim(), value);
    }
  } catch {
    // 실패 시 빈 맵 반환
  }
  return map;
}

/**
 * 미국 기업이익/GDP — FRED CP(세후법인이익) / GDP. 1990년 이후 분기별 시계열 포함.
 * CP·GDP 모두 Billions USD, Seasonally Adjusted Annual Rate.
 */
export async function getUsCorporateProfitRatio(): Promise<UsCorporateProfitRatio | null> {
  const [cpMap, gdpMap] = await Promise.all([
    fetchFredSeries("CP"),
    fetchFredSeries("GDP"),
  ]);

  if (cpMap.size === 0 || gdpMap.size === 0) return null;

  // 두 시리즈 공통 날짜 교집합, 1990년 이후
  const series: CorporateProfitPoint[] = [];
  for (const [date, cp] of cpMap.entries()) {
    if (date < "1990-01-01") continue;
    const gdp = gdpMap.get(date);
    if (!gdp) continue;
    series.push({ date, ratio: cp / gdp });
  }
  series.sort((a, b) => a.date.localeCompare(b.date));

  if (series.length === 0) return null;

  const latest = series[series.length - 1];
  const cp = cpMap.get(latest.date)!;
  const gdp = gdpMap.get(latest.date)!;

  return {
    ratio: latest.ratio,
    corporateProfit: cp,
    gdp,
    asOf: latest.date,
    series,
  };
}
