/**
 * 임시 종목 카탈로그 — STEP 3 온보딩/거래의 종목 선택용.
 * STEP 4에서 실제 종목 검색(토스증권식, 시세 API)으로 교체한다.
 * prices.ts 의 목업 시세와 종목코드가 일치해야 평가액이 산출된다.
 */
export interface CatalogItem {
  symbol: string;
  name: string;
  /** 자산유형(주식/ETF/코인) — 추천·검색 뱃지용. 6자리 코드만으론 주식/ETF 구분 불가라 명시. */
  assetType?: string;
  /**
   * ETF 총보수(연, 소수). 0.0007 = 0.07%. **참고용 공시값** — 운용사 수수료 인하로
   * 자주 바뀌므로 정확성 보장 안 함. 야후 미제공(quoteSummary crumb 필요) → 상수로 둔다.
   * 추후 KRX/운용사 소스로 자동화(펀더멘털·섹터 데이터 레이어에 묶음).
   */
  ter?: number;
  /** 추종 지수 — 동일지수 ETF 비용 비교 그룹핑용. ETF만 사용. */
  trackedIndex?: string;
}

// ETF는 같은 지수 내에서 **총보수 낮은 상품 위주**로 선별. ter 은 참고용(확인 필요).
export const CATALOG: CatalogItem[] = [
  { symbol: "005930", name: "삼성전자" },
  { symbol: "000660", name: "SK하이닉스" },
  { symbol: "035420", name: "NAVER" },
  { symbol: "AAPL", name: "Apple" },
  { symbol: "TSLA", name: "Tesla" },
  // ETF(야후 검증된 코드) — ter=총보수(참고용 공시값), trackedIndex=추종지수
  { symbol: "379800", name: "KODEX 미국S&P500", assetType: "ETF", ter: 0.0009, trackedIndex: "S&P500" },
  { symbol: "360750", name: "TIGER 미국S&P500", assetType: "ETF", ter: 0.0007, trackedIndex: "S&P500" },
  { symbol: "133690", name: "TIGER 미국나스닥100", assetType: "ETF", ter: 0.0007, trackedIndex: "NASDAQ100" },
  { symbol: "278530", name: "KODEX 200TR", assetType: "ETF", ter: 0.0005, trackedIndex: "KOSPI200" },
  { symbol: "069500", name: "KODEX 200", assetType: "ETF", ter: 0.0015, trackedIndex: "KOSPI200" },
  { symbol: "192090", name: "TIGER 차이나CSI300", assetType: "ETF", ter: 0.0019, trackedIndex: "CSI300" },
  { symbol: "371160", name: "TIGER 차이나항셍테크", assetType: "ETF", ter: 0.0049, trackedIndex: "항셍테크" },
  // 원자재(commodity) ETF — KRX 상장, ₩로 매수 가능. ter 참고용.
  { symbol: "411060", name: "ACE KRX금현물", assetType: "원자재", ter: 0.005 },
  { symbol: "144600", name: "KODEX 은선물(H)", assetType: "원자재", ter: 0.0068 },
  { symbol: "261220", name: "KODEX WTI원유선물(H)", assetType: "원자재", ter: 0.0035 },
  { symbol: "138910", name: "KODEX 구리선물(H)", assetType: "원자재", ter: 0.0068 },
  // 코인
  { symbol: "BTC-USD", name: "비트코인", assetType: "코인" },
  { symbol: "ETH-USD", name: "이더리움", assetType: "코인" },
  { symbol: "XRP-USD", name: "리플", assetType: "코인" },
  { symbol: "SOL-USD", name: "솔라나", assetType: "코인" },
];

/** 동일지수 ETF 비교 그룹. 보유 여부와 무관하게 전체 대안을 보여줌. */
export interface EtfIndexGroup {
  index: string;
  etfs: { symbol: string; name: string; ter: number }[];
}

/** trackedIndex가 있는 ETF를 지수별로 그룹핑해 TER 오름차순 정렬. */
export function getEtfIndexGroups(): EtfIndexGroup[] {
  const groupMap = new Map<string, { symbol: string; name: string; ter: number }[]>();
  for (const item of CATALOG) {
    if (!item.trackedIndex || item.ter == null) continue;
    const group = groupMap.get(item.trackedIndex) ?? [];
    group.push({ symbol: item.symbol, name: item.name, ter: item.ter });
    groupMap.set(item.trackedIndex, group);
  }
  return [...groupMap.entries()]
    .map(([index, etfs]) => ({
      index,
      etfs: etfs.sort((a, b) => a.ter - b.ter),
    }))
    .filter((group) => group.etfs.length > 1); // 비교 의미 있는 그룹만
}

export function findCatalogItem(symbol: string): CatalogItem | undefined {
  return CATALOG.find((c) => c.symbol === symbol);
}
