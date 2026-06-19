/**
 * 미국채 10년물(10Y Treasury) — 내재가치 할인율의 기준(§12).
 *
 * 1차 출처 = 미 재무부 "Daily Treasury Par Yield Curve Rates"(키 불필요·공개 CSV).
 * FRED(DGS10)도 결국 여기서 받아간다. 인터페이스 seam: 소스 교체 시 이 파일만.
 *
 * 내재가치는 이 금리에 의존하므로, 화면엔 항상 "금리 + 기준일"을 노출해 가정을 드러낸다.
 */

const BASE =
  "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv";

export interface TreasuryRate {
  /** 10년물 금리(소수, 예: 0.0447 = 4.47%). */
  rate: number;
  /** 해당 금리의 기준일(YYYY-MM-DD). */
  asOf: string;
}

/** MM/DD/YYYY → YYYY-MM-DD. */
function usDate(s: string): string {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : s.trim();
}

/** Treasury CSV → 최신 10년물. 헤더로 "10 Yr" 컬럼을 찾아(컬럼 순서 변경에 안전). */
function parseLatestTenYear(text: string): TreasuryRate | null {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const header = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());
  const col = header.indexOf("10 Yr");
  if (col < 0) return null;
  // 행은 최신순(첫 데이터 행 = 가장 최근). 결측 대비 첫 유효값을 취함.
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    const pct = Number(cells[col]?.replace(/"/g, "").trim());
    if (Number.isFinite(pct) && pct > 0) {
      return { rate: pct / 100, asOf: usDate(cells[0] ?? "") };
    }
  }
  return null;
}

async function fetchYear(year: number): Promise<TreasuryRate | null> {
  const url =
    `${BASE}/${year}/all?type=daily_treasury_yield_curve` +
    `&field_tdr_date_value=${year}&page&_format=csv`;
  const res = await fetch(url, { next: { revalidate: 21600 } }); // 6시간 캐시
  if (!res.ok) return null;
  return parseLatestTenYear(await res.text());
}

/**
 * 미국채 10년물 최신값. 실패 시 null(화면은 "금리 연결 대기"로 graceful).
 * 연초 당해 데이터가 비어 있으면 전년도로 폴백.
 */
export async function getTenYearTreasury(
  year: number,
): Promise<TreasuryRate | null> {
  try {
    return (await fetchYear(year)) ?? (await fetchYear(year - 1));
  } catch {
    return null;
  }
}
