# ETF 상세 · 지수 상세 페이지 스펙 v1

## 0. 현황 파악

### stocks/[symbol]/page.tsx (현재)

탭 3개: `overview` | `analysis` | `records` (`?view=` 쿼리로 전환).

| 탭 | 표시 내용 |
|---|---|
| 개요 | 가격카드·차트·핵심지표(PER/PBR/ROE/이익성장률)·사업요약·최근공시 |
| 기업 분석 | PeriodSelector(TTM·FY)·재무요약·밸류에이션·수익성·오너이익·내재가치·자본배분효율·재무제표 |
| 내 기록 | 거래내역 |

**ETF 분기**: `view === "analysis"` 안에서 `fundamentals === null`이면 `<Link href="/soon">` (1022줄). 이 else 분기가 ETF 전용 섹션으로 교체될 지점.

**catalog.ts 현재**: `trackedIndex` 필드 이미 있음(계획의 `benchmarkIndex`와 동일 역할). `getEtfIndexGroups()` 함수도 있음.

---

## §1. 데이터 소스 — Yahoo quoteSummary (교체 인터페이스)

### 1-1. 교체 전략

`prices.ts` 패턴과 동일: **인터페이스는 고정, 내부 fetch 구현만 교체**.

```
내부 함수: fetchFromYahoo(symbol) → ETF/지수 데이터
토스 API 승인 시: fetchFromToss(symbol) 로만 교체
호출 측(page.tsx, 컴포넌트): 변경 없음
```

### 1-2. Yahoo quoteSummary 엔드포인트

```
GET https://query1.finance.yahoo.com/v10/finance/quoteSummary/{yahooSymbol}
  ?modules=topHoldings,summaryDetail,defaultKeyStatistics
  User-Agent: Mozilla/5.0
```

- 한국 ETF `379800` → `.KS` / `.KQ` 후보 순서 시도 (prices.ts의 `toYahooCandidates()` 동일)
- 지수 `^GSPC` → 그대로
- revalidate: **86400** (ETF), **3600** (지수 PER/PBR)

### 1-3. 응답 필드 매핑

**ETF (topHoldings)**
```
topHoldings.equityHoldings.priceToEarnings.raw  → per
topHoldings.equityHoldings.priceToBook.raw       → pbr
topHoldings.equityHoldings.returnOnEquity.raw    → roe  (자주 없음)
topHoldings.equityHoldings.priceToSales.raw      → psr

topHoldings.holdings[].symbol         → 종목 심볼
topHoldings.holdings[].holdingName    → 종목명
topHoldings.holdings[].holdingPercent.raw → 비중(0~1)

topHoldings.sectorWeightings[]        → [{ technology: 0.32 }, ...]
summaryDetail.dividendYield.raw       → 배당수익률
```

**지수 (summaryDetail + defaultKeyStatistics)**
```
summaryDetail.trailingPE.raw    → 후행 PER
summaryDetail.forwardPE.raw     → 선행 PER
summaryDetail.priceToBook.raw   → PBR (일부 지수만)
summaryDetail.dividendYield.raw → 배당수익률
```

**한국 ETF 한계**: Yahoo가 `topHoldings`를 제공하지 않는 경우 많음 → `null` 반환, UI `"—"` 표시. throw 금지.

---

## §2. 신규 파일: `src/lib/finance/etfStats.ts`

```ts
export interface EtfEquityHoldings {
  per: number | null;
  pbr: number | null;
  roe: number | null;
  psr: number | null;
}

export interface EtfHolding {
  symbol:  string;
  name:    string;
  weight:  number; // 0~1
}

export interface EtfSector {
  name:   string; // 한국어 ("기술", "헬스케어", ...)
  weight: number; // 0~1
}

export interface EtfStats {
  equityHoldings: EtfEquityHoldings;
  holdings:       EtfHolding[];  // top 10
  sectors:        EtfSector[];
  dividendYield:  number | null;
}

// 섹터 영→한 매핑 (내부 상수)
const SECTOR_KO: Record<string, string> = {
  technology: "기술", healthcare: "헬스케어",
  financial_services: "금융", consumer_cyclical: "임의소비재",
  industrials: "산업재", communication_services: "커뮤니케이션",
  consumer_defensive: "필수소비재", energy: "에너지",
  basic_materials: "소재", real_estate: "부동산",
  utilities: "유틸리티",
};

// 6자리 → .KS 시도, 실패 시 .KQ (prices.ts와 동일)
async function fetchFromYahoo(yahooSym: string): Promise<EtfStats | null>

export async function getEtfStats(symbol: string): Promise<EtfStats | null>
// next: { revalidate: 86400 }
// 실패 시 null 반환 (throw 금지)
```

---

## §3. ETF 상세 UI — stocks/[symbol]/page.tsx 수정

### 3-1. ETF 감지 및 데이터 fetch

```ts
// 기존 import에 추가
import { getEtfStats } from "@/lib/finance/etfStats";

// ETF 여부 (catalog 또는 Yahoo instrumentType)
const catalogItem = findCatalogItem(symbol);
const isEtf = catalogItem?.assetType === "ETF" || catalogItem?.assetType === "원자재";

// 기존 Promise.all 블록에 병렬 추가
const etfStatsPromise = isEtf ? getEtfStats(symbol) : Promise.resolve(null);
// ... 기존 await 이후:
const etfStats = await etfStatsPromise;
```

### 3-2. else 분기 교체 (1022줄)

```tsx
// 현재 (교체 대상):
) : (
  <Link href="/soon?t=기본지표(PER·ROE)·펀더멘털" ...>
    해외 종목 펀더멘털은 곧 공개됩니다.
  </Link>
)}

// 교체 후:
) : isEtf ? (
  <EtfFundamentalsSection
    stats={etfStats}
    catalogItem={catalogItem}
    divYield={divYield}   // 기존 계산값 재사용
    symbol={symbol}
    portfolio={portfolio}
  />
) : (
  <Link href="/soon?t=기본지표(PER·ROE)·펀더멘털" ...>
    해외 종목 펀더멘털은 곧 공개됩니다.
  </Link>
)}
```

### 3-3. 개요 탭 핵심 지표 카드 — ETF 분기

534줄 `view === "overview" && fundamentals &&` 조건 이후, ETF는 fundamentals가 없으므로:

```tsx
{view === "overview" && (fundamentals || isEtf) && (
  <section ...>
    {fundamentals ? (
      // 기존 PER/PBR/ROE/이익성장률 4칸
    ) : (
      // ETF: 가중평균 PER/PBR/ROE/배당수익률
      <div className="mt-4 grid grid-cols-2 gap-y-4">
        <Metric k="PER(가중)" v={etfStats?.equityHoldings.per != null ? `${etfStats.equityHoldings.per.toFixed(1)}배` : "—"} hint="구성 종목 가중평균 PER" />
        <Metric k="PBR(가중)" v={etfStats?.equityHoldings.pbr != null ? `${etfStats.equityHoldings.pbr.toFixed(2)}배` : "—"} hint="구성 종목 가중평균 PBR" />
        <Metric k="ROE(가중)" v={etfStats?.equityHoldings.roe != null ? pct(etfStats.equityHoldings.roe) : "—"} hint="구성 종목 가중평균 ROE" />
        <Metric k="배당수익률" v={divYield != null ? pct(divYield, 2) : "—"} hint="최근 12개월 배당 ÷ 현재가" />
      </div>
    )}
  </section>
)}
```

---

## §4. 신규 컴포넌트: `src/components/etf/EtfFundamentalsSection.tsx`

**UI 레이아웃 (기업 분석 탭 안)**:

```
┌─ ETF 구성 지표 ─────────────────────────────────────┐
│  PER(가중평균)  18.5배    PBR(가중평균)  3.2배      │
│  ROE(가중평균)  —         PSR(가중평균)  2.1배      │
│  배당수익률     1.3%      TER(총보수)    0.09%/년   │
│  출처: Yahoo Finance · 구성 종목 가중평균 · 참고용   │
└─────────────────────────────────────────────────────┘

┌─ 동일 지수 ETF 비교 ────────────────────────────────┐
│  (trackedIndex가 있을 때만. getEtfIndexGroups() 사용)│
│  TIGER 미국S&P500  360750  0.07%/년 ← 더 낮음      │
│  KODEX 미국S&P500  379800  0.09%/년 ← 현재 종목    │
└─────────────────────────────────────────────────────┘

┌─ 섹터 배분 ─────────────────────────────────────────┐
│  기술     ████████████ 32%                           │
│  헬스케어 ████████ 13%                               │
│  금융     ████████ 13%                               │
│  (데이터 없으면 섹션 숨김)                            │
└─────────────────────────────────────────────────────┘

┌─ 상위 보유 종목 Top 10 ──────────────────────────────┐
│  Apple     AAPL  6.7%  → /stocks/AAPL (보유시 링크) │
│  Microsoft MSFT  6.2%                                │
│  ...                                                  │
│  출처: Yahoo Finance · 시점 따라 변동                 │
│  (데이터 없으면 섹션 숨김)                             │
└──────────────────────────────────────────────────────┘
```

**props**:
```ts
interface Props {
  stats: EtfStats | null;
  catalogItem: CatalogItem | undefined;
  divYield: number | null;
  symbol: string;
  portfolio: Portfolio; // 보유 종목 링크 결정용
}
```

**섹터 차트**: Recharts `BarChart` horizontal — `allocation` 페이지의 색상 팔레트 참고.  
**TER 폴백 우선순위**: `catalogItem.ter` (수동 입력, 항상 신뢰).  
**PER/PBR/ROE 폴백 순서**: Yahoo `equityHoldings` → 없으면 `"—"` (수동 폴백 없음, 데이터 없으면 솔직히 표시).

---

## §5. 지수 상세 페이지

### 5-1. 신규 라우트: `src/app/index/[symbol]/page.tsx`

지원 심볼: `PRESET_QUOTES`에서 `symbol.startsWith("^")` 인 것들 (`^KS11`, `^KQ11`, `^GSPC`, `^IXIC`, `^DJI`). 환율(`=X`)과 원자재(`GC=F`, `BTC-USD`)는 해당 없음.

**데이터 로딩 (병렬)**:
```ts
const [priceData, indexSummary, macroData] = await Promise.all([
  getDailyKrwCloses([symbol], oneYearAgo, today),
  getIndexSummary(symbol),     // §6
  getBuffettIndicator(),       // §7
]);
// 장기 월봉은 별도 Suspense (느린 구간)
const monthlyPromise = getDailyKrwCloses([symbol], "1990-01-01", today, "1mo");
```

**페이지 섹션 순서**:
1. 헤더 (지수명, 국가 뱃지, 현재값, 전일 대비 %)
2. 가격 차트 (기본 범위 `5y`, PriceChart 재사용 — Suspense)
3. 현재 밸류에이션 카드 (`IndexValuation`)
4. 매크로 맥락 — 버핏 인디케이터 (`BuffettIndicator`)
5. 섹터 구성 (Yahoo topHoldings 있는 지수만)
6. 상위 구성 종목 Top 10 (Yahoo topHoldings 있는 지수만)
7. 내 포트폴리오 연관 ETF (`EtfLinks`)

### 5-2. 신규 파일: `src/lib/finance/indexStats.ts`

```ts
export interface IndexSummary {
  trailingPE:    number | null;
  forwardPE:     number | null;
  pbr:           number | null;
  dividendYield: number | null;
  holdings: Array<{ symbol: string; name: string; weight: number }>;
  sectors:  Array<{ name: string; weight: number }>;
}

async function fetchFromYahoo(symbol: string): Promise<IndexSummary>
// symbol: "^GSPC" — 변환 없음
// next: { revalidate: 3600 }

export async function getIndexSummary(symbol: string): Promise<IndexSummary>
// 실패 시 빈 IndexSummary (null 필드) 반환
```

**CAPE (S&P 500 전용)**:
```ts
// FRED API — 무료, 키 불필요
// https://fred.stlouisfed.org/graph/fredgraph.csv?id=CAPE
// revalidate: 86400 (하루 1회 업데이트)
export async function getShillerCape(): Promise<{ value: number; asOf: string } | null>
```

---

## §6. 신규 파일: `src/lib/finance/macroStats.ts` — 버핏 인디케이터

### 6-1. 데이터 소스: World Bank API (무료)

```
# 시장 시총 (현재 USD)
GET https://api.worldbank.org/v2/country/{iso2}/indicator/CM.MKT.LCAP.CD
  ?format=json&mrv=5&per_page=5

# GDP (현재 USD)
GET https://api.worldbank.org/v2/country/{iso2}/indicator/NY.GDP.MKTP.CD
  ?format=json&mrv=5&per_page=5
```

revalidate: **604800** (7일 — 연간 데이터)

### 6-2. 지원 국가

```ts
const COUNTRIES = [
  { iso2: "US", name: "미국",   flag: "🇺🇸" },
  { iso2: "KR", name: "한국",   flag: "🇰🇷" },
  { iso2: "JP", name: "일본",   flag: "🇯🇵" },
  { iso2: "CN", name: "중국",   flag: "🇨🇳" },
  { iso2: "GB", name: "영국",   flag: "🇬🇧" },
];
```

### 6-3. 반환 타입

```ts
export interface BuffettIndicatorItem {
  country:   string;  // "미국"
  flag:      string;  // "🇺🇸"
  ratio:     number;  // 1.96 → 196%
  marketCap: number;  // USD
  gdp:       number;  // USD
  year:      number;  // 데이터 기준연도
}

export async function getBuffettIndicator(): Promise<BuffettIndicatorItem[]>
// 실패 시 [] 반환 (절대 throw 금지)
// 국가별 개별 실패는 해당 국가만 제외, 나머지 반환
```

---

## §7. 신규 컴포넌트

### `src/components/index/IndexValuation.tsx`
```
┌─ 현재 밸류에이션 ─────────────────────────────────┐
│  Trailing PER  22.4배   Forward PER  19.8배       │
│  PBR           4.1배    배당수익률   1.3%          │
│  Shiller CAPE  34.2     (^GSPC만 표시)             │
│  출처: Yahoo Finance · 참고용                       │
└────────────────────────────────────────────────────┘
```
props: `{ summary: IndexSummary; cape?: { value: number; asOf: string } | null; symbol: string }`

### `src/components/index/BuffettIndicator.tsx`
```
┌─ 국가별 시총/GDP (버핏 인디케이터) ──────────────┐
│  🇺🇸 미국  196%  ████████████░░  2023년          │
│  🇯🇵 일본   95%  █████████░░░░░                  │
│  🇰🇷 한국   87%  ████████░░░░░░                  │
│  🇨🇳 중국   64%  ██████░░░░░░░░                  │
│  🇬🇧 영국   99%  █████████░░░░░                  │
│                                                    │
│  100% 초과 = 시총 > GDP. 버핏의 선호 지표.         │
│  출처: World Bank · 연간 데이터 (수개월 지연)       │
└────────────────────────────────────────────────────┘
```
구현: Recharts `BarChart` horizontal, `100%`에 `ReferenceLine` (점선).  
props: `{ data: BuffettIndicatorItem[] }`  
`data.length === 0` → 섹션 전체 숨김.

### `src/components/index/EtfLinks.tsx`
```
┌─ 이 지수를 추종하는 내 ETF ───────────────────────┐
│  KODEX 미국S&P500  379800  → /stocks/379800       │
│  TIGER 미국S&P500  360750                          │
└────────────────────────────────────────────────────┘
```
`catalog.ts`의 `trackedIndex`가 현재 지수와 일치하는 보유 항목 필터.  
보유 중인 것만 표시 (portfolio.positions 활용).  
없으면 섹션 숨김.

---

## §8. quotes.ts 변경 — 지수 상세 진입 허용

```ts
export interface PresetQuote {
  symbol:   string;
  name:     string;
  /** true면 /index/[symbol] 상세 진입 허용 */
  isIndex?: boolean;
}

export const PRESET_QUOTES: PresetQuote[] = [
  { symbol: "^KS11",    name: "코스피",    isIndex: true  },
  { symbol: "^KQ11",    name: "코스닥",    isIndex: true  },
  { symbol: "^GSPC",    name: "S&P 500",   isIndex: true  },
  { symbol: "^IXIC",    name: "나스닥",    isIndex: true  },
  { symbol: "^DJI",     name: "다우",      isIndex: true  },
  { symbol: "USDKRW=X", name: "원/달러"  },
  { symbol: "JPYKRW=X", name: "원/엔"    },
  { symbol: "GC=F",     name: "금"        },
  { symbol: "BTC-USD",  name: "비트코인(USD)" },
];

// isQuoteOnly() 유지 (변경 없음)
```

---

## §9. search/page.tsx 변경 — 지수 링크 연결

101-115줄 링크 분기에 지수 상세 링크 추가:

```tsx
const presetMeta = PRESET_QUOTES.find(p => p.symbol === sym);
const href = presetMeta?.isIndex
  ? `/index/${encodeURIComponent(sym)}`
  : quoteOnly
    ? null
    : `/stocks/${encodeURIComponent(sym)}?name=${encodeURIComponent(nm)}`;

{href ? (
  <Link href={href} className="flex items-center gap-3 rounded-xl bg-card p-3 shadow-card transition active:scale-[0.99]">
    {inner}
  </Link>
) : (
  <div className="flex items-center gap-3 rounded-xl bg-card p-3 shadow-card">
    {inner}
  </div>
)}
```

---

## §10. 구현 순서

```
Step 1  src/lib/finance/etfStats.ts          (§2)
Step 2  src/lib/finance/indexStats.ts         (§5-2)
Step 3  src/lib/finance/macroStats.ts         (§6)
Step 4  catalog.ts trackedIndex 기존 활용 확인 (이미 있음 — 변경 없음)
Step 5  quotes.ts isIndex 추가               (§8)
Step 6  src/components/etf/EtfFundamentalsSection.tsx  (§4)
Step 7  stocks/[symbol]/page.tsx 수정        (§3)
Step 8  src/components/index/IndexValuation.tsx        (§7)
Step 9  src/components/index/BuffettIndicator.tsx      (§7)
Step 10 src/components/index/EtfLinks.tsx              (§7)
Step 11 src/app/index/[symbol]/page.tsx               (§5-1)
Step 12 search/page.tsx 링크 연결            (§9)
```

---

## §11. 캐싱 전략

| 소스 | next.revalidate | 이유 |
|------|----------------|------|
| Yahoo ETF topHoldings | 86400s | ETF 구성 일 1회 변경 |
| Yahoo 지수 quoteSummary | 3600s | PER은 시세 따라 변함 |
| FRED Shiller CAPE | 86400s | 월 1회 업데이트 |
| World Bank GDP/시총 | 604800s (7일) | 연간 데이터 |

모든 외부 fetch: **실패 시 null/[] 반환, throw 금지**.

---

## §12. 검증 체크리스트

- [ ] `AAPL` 주식 상세: 개요/기업분석/내기록 탭 기존 동작 유지
- [ ] `379800` (KODEX S&P500): 기업분석 탭 → EtfFundamentalsSection 렌더, Yahoo 데이터 없으면 `"—"`
- [ ] `SPY`: 기업분석 탭 → PER/PBR/섹터/Top10 정상 표시
- [ ] `379800` 개요 탭: 핵심 지표 카드에 ETF 가중평균 PER/PBR/ROE 표시
- [ ] `379800` 기업분석 탭: 동일지수 ETF(TIGER S&P500)와 TER 비교 표시
- [ ] `^GSPC`: search 관심종목 목록에서 클릭 → `/index/%5EGSPC` 진입
- [ ] `/index/^GSPC`: 차트·IndexValuation·BuffettIndicator 렌더
- [ ] BuffettIndicator: World Bank API 실패 시 섹션 전체 숨김 (오류 없음)
- [ ] CAPE: `^GSPC`에만 표시, `^KS11`에는 숨김
- [ ] `EtfLinks`: `^GSPC` 지수 상세에서 보유 중인 S&P500 ETF 목록 표시
- [ ] TypeScript 검사 통과
- [ ] production build 통과
