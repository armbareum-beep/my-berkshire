/**
 * 랭킹 프로필 시트 보유 종목 공시 — 종목명·심볼·비중 %만 담는 jsonb(v1, 038).
 * 034·035의 "종목명 구조적 비공개"를 038에서 부분 개정 — 상장(공시) 시 종목명과 비중 %는
 * 공개하되, 정확한 금액·수량은 계산 도중에만 쓰고 절대 저장하지 않는다(자산은 "구간"만
 * 공개되므로 %로는 실제 금액이 역산되지 않는다). rankingComposition.ts 와 같은 문법.
 */

export interface HoldingItemV1 {
  symbol: string;
  name: string;
  /** 반올림 정수 %(0~100, 분모=시세 있는 자산 합 — 종목 합계 100). 금액·수량은 저장하지 않는다. */
  pct: number;
}

export interface HoldingsV1 {
  v: 1;
  items: HoldingItemV1[];
}

/**
 * 종목별 보유수량×현재가의 비중 %만 반환 — 분모는 시세 있는 자산(주식·ETF·원자재·코인 등
 * positions 전체)의 합. 현금·실물자산은 분모에서 제외해 종목 합이 100이 되게 한다
 * (전체 자산 대비 비중은 자산 구성 도넛이 담당 — 여기는 "포트폴리오 안에서의 비중").
 * 시세 실패(priceAvailable=false)면 null. 전 종목 공개가 원칙이라 반올림 0%인 소액
 * 종목도 items에 유지한다(UI가 "1% 미만"으로 표시). 반올림 오차는 최대 비중 종목에
 * 몰아 합 100을 맞춘다. 정렬은 비중 내림차순.
 */
export function computeHoldingsPct(params: {
  positions: Record<string, number>;
  prices: Record<string, number>;
  names: Record<string, string>;
  priceAvailable: boolean;
}): HoldingsV1 | null {
  const { positions, prices, names, priceAvailable } = params;
  if (!priceAvailable) return null;

  const valued: { symbol: string; name: string; value: number }[] = [];
  for (const [symbol, qty] of Object.entries(positions)) {
    const price = prices[symbol];
    if (price == null) continue; // 시세 미확보 종목은 반영 안 함(방어적 — priceAvailable로 대부분 걸러짐)
    valued.push({ symbol, name: names[symbol] ?? symbol, value: qty * price });
  }
  const total = valued.reduce((s, x) => s + x.value, 0);
  if (valued.length === 0 || total <= 0) return null;

  valued.sort((a, b) => b.value - a.value);
  const items = valued.map((x) => ({
    symbol: x.symbol,
    name: x.name,
    pct: Math.round((x.value / total) * 100),
  }));
  // 반올림 오차는 최대 비중 종목에 몰아 합 100을 맞춘다.
  const sum = items.reduce((a, b) => a + b.pct, 0);
  if (sum !== 100) items[0].pct += 100 - sum;

  return { v: 1, items };
}

/** jsonb → HoldingsV1(방어적 파싱). 스키마 불일치·구버전(v≠1)이면 null. */
export function parseHoldingsV1(raw: unknown): HoldingsV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1 || !Array.isArray(o.items)) return null;

  const items = o.items.filter(
    (s): s is HoldingItemV1 =>
      !!s &&
      typeof s === "object" &&
      typeof (s as Record<string, unknown>).symbol === "string" &&
      typeof (s as Record<string, unknown>).name === "string" &&
      typeof (s as Record<string, unknown>).pct === "number",
  );
  return { v: 1, items };
}
