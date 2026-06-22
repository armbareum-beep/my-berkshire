/**
 * 종목·계좌 로고 색 — 목업의 "브랜드색 원형 + 흰 이니셜"을 실제 제품에 이식.
 * 회사당 **고유색 1개**(=그 회사의 실제 색)라, 거래종류에 임의 색을 칠하던
 * 6색 카테고리 방식과 다르다(그건 촌스러움). 회색 이니셜의 휑함을 없애는 핵심.
 *
 * 2단:
 *  1) 큐레이트 — 주요 종목·증권사는 실제 브랜드색(채도 높게, 목업과 동일 무드).
 *  2) 폴백 — 미등록 종목은 심볼/이름 해시 → HSL 중간톤(채도 낮춰 차분·무지개 회피).
 * 텍스트색은 배경 명도로 자동(밝으면 잉크, 어두우면 흰색).
 */

export interface Logo {
  bg: string;
  fg: string;
}

const WHITE = "#ffffff";
const INK = "#191f28";

/** 키: 심볼(코드/티커) 또는 정규화된 이름. 값: 브랜드 hex(6자리). */
const CURATED: Record<string, string> = {
  // ── 한국 대형주 ──
  "005930": "#1428A0", 삼성전자: "#1428A0",
  "000660": "#D7000F", sk하이닉스: "#D7000F",
  "005380": "#002C5F", 현대차: "#002C5F",
  "035420": "#03C75A", naver: "#03C75A", 네이버: "#03C75A",
  "035720": "#FFCD00", 카카오: "#FFCD00",
  "066570": "#A50034", lg전자: "#A50034",
  "051910": "#A50034", lg화학: "#A50034",
  "005490": "#0067AC", posco홀딩스: "#0067AC", 포스코홀딩스: "#0067AC",
  "207940": "#1428A0", 삼성바이오로직스: "#1428A0",
  "068270": "#0F4C81", 셀트리온: "#0F4C81",
  "105560": "#FFB000", kb금융: "#FFB000",
  "055550": "#0046AD", 신한지주: "#0046AD",
  "000270": "#05141F", 기아: "#05141F",
  "373220": "#7D4698", lg에너지솔루션: "#7D4698",
  // ── 증권사·계좌 ──
  kb증권: "#FFB800", 키움증권: "#D7000F", 토스증권: "#3182F6",
  미래에셋증권: "#FF6B00", 삼성증권: "#1428A0", 한국투자증권: "#003C71",
  // ── 미국 ──
  aapl: "#1D1D1F", apple: "#1D1D1F", 애플: "#1D1D1F",
  msft: "#00A4EF", microsoft: "#00A4EF", 마이크로소프트: "#00A4EF",
  googl: "#4285F4", goog: "#4285F4", alphabet: "#4285F4", 구글: "#4285F4",
  amzn: "#FF9900", amazon: "#FF9900", 아마존: "#FF9900",
  tsla: "#E82127", tesla: "#E82127", 테슬라: "#E82127",
  nvda: "#76B900", nvidia: "#76B900", 엔비디아: "#76B900",
  meta: "#0866FF", 메타: "#0866FF",
  nflx: "#E50914", netflix: "#E50914", 넷플릭스: "#E50914",
  ko: "#F40009", 코카콜라: "#F40009",
  v: "#1A1F71", visa: "#1A1F71",
  jpm: "#117ACA",
  "brk.b": "#1F3A5F", "brk-b": "#1F3A5F", 버크셔해서웨이: "#1F3A5F",
  // ── 코인 ──
  btc: "#F7931A", "btc-usd": "#F7931A", 비트코인: "#F7931A",
  eth: "#627EEA", "eth-usd": "#627EEA", 이더리움: "#627EEA",
};

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

function curatedLookup(symbol?: string, name?: string): string | null {
  if (symbol) {
    if (CURATED[symbol]) return CURATED[symbol];
    const ns = norm(symbol);
    if (CURATED[ns]) return CURATED[ns];
  }
  if (name && CURATED[norm(name)]) return CURATED[norm(name)];
  return null;
}

/** 결정적 문자열 해시(djb2 변형) — 같은 종목은 항상 같은 색. */
function hashHue(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** 배경 명도로 텍스트색 결정(밝은 배경=잉크, 어두운 배경=흰색). hex 6자리 기준. */
function fgFor(hex: string): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.62 ? INK : WHITE;
}

/** KRX ETF 운용사 브랜드 맵 (ETF명 첫 단어 → 운용사 약칭 + 브랜드색) */
const ETF_BRANDS: Record<string, { label: string; bg: string }> = {
  KODEX:      { label: "삼성", bg: "#1428A0" },
  TIGER:      { label: "미래", bg: "#E8380D" },
  KBSTAR:     { label: "KB",   bg: "#FFBC00" },
  RISE:       { label: "KB",   bg: "#FFBC00" },
  ACE:        { label: "ACE",  bg: "#003C71" },
  "1Q":       { label: "1Q",   bg: "#003C71" },
  SOL:        { label: "신한", bg: "#0046AD" },
  KOSEF:      { label: "키움", bg: "#D7000F" },
  HANARO:     { label: "NH",   bg: "#009A44" },
  ARIRANG:    { label: "한화", bg: "#FF6600" },
  PLUS:       { label: "한화", bg: "#FF6600" },
  FOCUS:      { label: "교보", bg: "#005BAB" },
  TIMEFOLIO:  { label: "TF",   bg: "#1A1A2E" },
  WOORI:      { label: "우리", bg: "#0069B4" },
  MASTER:     { label: "마스터", bg: "#444444" },
  TREX:       { label: "대신", bg: "#CF2027" },
  SMART:      { label: "스마트", bg: "#2E5EAA" },
};

/** ETF명에서 운용사 브랜드 추출. 6자리 코드 ETF만 적용. */
function etfBrand(symbol?: string, name?: string): { label: string; bg: string } | null {
  if (!symbol || !/^\d{6}$/.test(symbol)) return null;
  if (!name) return null;
  const brand = name.split(/[\s\d]/)[0].toUpperCase();
  return ETF_BRANDS[brand] ?? null;
}

/** 종목/계좌 로고 색 + 표시 레이블. ETF는 운용사 약칭, 그 외는 이름 첫 글자. */
export function brandLogoLabel(symbol?: string, name?: string): Logo & { label: string } {
  const etf = etfBrand(symbol, name);
  if (etf) return { bg: etf.bg, fg: fgFor(etf.bg), label: etf.label };
  const curated = curatedLookup(symbol, name);
  const bg = curated ?? `hsl(${hashHue(norm(symbol || name || "?"))} 38% 47%)`;
  return { bg, fg: fgFor(bg), label: (name ?? symbol ?? "?").slice(0, 1) };
}

/** 종목/계좌 로고 색 1쌍(배경·글자). symbol 우선, 없으면 name 으로. */
export function brandLogo(symbol?: string, name?: string): Logo {
  const { bg, fg } = brandLogoLabel(symbol, name);
  return { bg, fg };
}
