/**
 * KIS 종목마스터 파서 — 순수함수(네트워크·DB 무관, 단위테스트 대상).
 *
 * 포맷(공식 koreainvestment/open-trading-api 기준, cp949 디코딩 후 텍스트 입력):
 *  - 국내 .mst: 고정폭. 각 행 part1 = line[0 : len-228].
 *      단축코드 = part1[0:9].trimEnd(), 표준코드 = part1[9:21], 한글명 = part1[21:].trim()
 *  - 해외 .cod: 탭 구분. col4=Symbol, col6=한글명, col7=영문명, col2=거래소, col8=증권유형(2:주식,3:ETF)
 */

export interface KisMasterRow {
  symbol: string;
  name_ko: string;
  name_en: string | null;
  exchange: string | null;
  market: "KR" | "US";
  asset_type: string | null;
}

/** 국내 종목마스터 텍스트 → 6자리 종목 행. exchange 는 "KOSPI" | "KOSDAQ". */
export function parseDomesticMaster(
  text: string,
  exchange: "KOSPI" | "KOSDAQ",
): KisMasterRow[] {
  const rows: KisMasterRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.length <= 228) continue;
    const part1 = line.slice(0, line.length - 228);
    const symbol = part1.slice(0, 9).trimEnd();
    if (!/^\d{6}$/.test(symbol)) continue; // 주식·ETF·ETN·REIT(6자리)만, F-펀드 등 제외
    const nameKo = part1.slice(21).trim();
    if (!nameKo) continue;
    rows.push({
      symbol,
      name_ko: nameKo,
      name_en: null,
      exchange,
      market: "KR",
      asset_type: null,
    });
  }
  return rows;
}

/** 해외 증권유형 코드 → 자산유형 라벨. */
function overseasAssetType(code: string | undefined): string | null {
  if (code === "2") return "STOCK";
  if (code === "3") return "ETF";
  if (code === "1") return "INDEX";
  if (code === "4") return "WARRANT";
  return null;
}

/** 해외 종목마스터(.cod) 텍스트 → 종목 행. */
export function parseOverseasMaster(text: string): KisMasterRow[] {
  const rows: KisMasterRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const cols = line.split("\t");
    if (cols.length < 10) continue;
    const symbol = cols[4]?.trim();
    if (!symbol || symbol === "Symbol") continue; // 헤더/빈행 방어
    const nameKo = cols[6]?.trim() || "";
    const nameEn = cols[7]?.trim() || "";
    if (!nameKo && !nameEn) continue;
    rows.push({
      symbol,
      name_ko: nameKo || nameEn,
      name_en: nameEn || null,
      exchange: cols[2]?.trim() || null,
      market: "US",
      asset_type: overseasAssetType(cols[8]?.trim()),
    });
  }
  return rows;
}
