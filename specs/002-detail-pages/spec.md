# Feature Specification: 종목·ETF·지수 상세 페이지

**Feature Branch**: `002-detail-pages`  
**Created**: 2026-06-22  
**Status**: Partial — ETF/지수 데이터 레이어 완료, UI 일부 미구현  
**Input**: 종목(주식·ETF), 지수(국내·해외) 각각의 상세 화면 — 밸류에이션·구성·차트. 나중에 앱으로 구현할 때의 설계도 포함.

---

## 배경 및 맥락

현재(웹):
- `/stocks/[symbol]` — 주식·ETF 공용 라우트. 한국 주식은 펀더멘털 표시, ETF/해외 종목은 "곧 공개됩니다" 링크로만 막혀 있음.
- 지수(^GSPC, ^KS11 등)는 검색 결과에서 클릭이 막혀 있고 상세 페이지 없음.

목표:
1. **ETF 상세** — 기존 `/stocks/[symbol]` 에서 ETF 감지 후 구성 지표 섹션 노출
2. **지수 상세** — 새 라우트 `/index/[symbol]` 에서 밸류에이션·차트·매크로 맥락
3. **한국 지수 PER/PBR** — Yahoo ETF 프록시 없음 → KRX 싱크 스크립트로 Supabase 캐시

앱 개발자 참고: 이 spec의 §Data Contracts 섹션이 REST API 설계 기준이 됨.

---

## User Scenarios & Testing

### User Story 1 — ETF 구성 지표 조회 (Priority: P1)

사용자가 보유한 ETF(예: KODEX S&P500 `379800`, SPY)의 상세 페이지에 들어가면 가중평균 PER·PBR·ROE·PSR, 섹터 배분, 상위 보유 종목 Top 10이 표시된다. Yahoo가 데이터를 제공하지 않는 한국 ETF는 "—"로 표시하되 오류는 없다.

**Why this priority**: 현재 ETF 상세 진입 자체가 막혀 있어 보유 ETF의 기본 정보를 볼 방법이 없다. 이 스토리만 구현해도 "ETF가 무엇에 투자하는지 확인" 독립 가치가 생긴다.

**Independent Test**: `SPY` 상세 페이지에서 PER·섹터·Top10이 렌더되는지 확인.

**Acceptance Scenarios**:

1. **Given** `/stocks/SPY`, **When** 페이지 로딩, **Then** 가중평균 PER/PBR/ROE/PSR·섹터 비중·Top10 종목(비중·링크)이 표시된다.
2. **Given** `/stocks/379800` (KODEX 200, 한국 ETF), **When** Yahoo에 topHoldings 없음, **Then** 지표는 "—"이고 오류 없이 페이지가 열린다.
3. **Given** ETF 상세, **When** 데이터 fetch 실패, **Then** "Yahoo Finance에서 데이터를 가져올 수 없어요" 문구만 표시, 페이지는 정상 렌더.
4. **Given** 한국 ETF에 benchmarkIndex가 매핑됨(`^KS11`), **When** 상세 페이지, **Then** "이 ETF의 벤치마크" 링크로 `/index/%5EKS11`으로 이동 가능.

---

### User Story 2 — 지수 상세 페이지 (Priority: P2)

사용자가 검색 결과에서 코스피·S&P500 같은 지수를 탭하면 `/index/[symbol]`로 진입한다. 밸류에이션(PER·PBR·배당·CAPE), 기간별 차트(1m~max), 섹터 구성, Top10 보유 종목이 표시된다.

**Why this priority**: 지수가 "지금 비싼가 싼가" 파악은 자산배분 판단의 기본. 현재는 지수를 탭해도 아무 페이지가 없다.

**Independent Test**: `/index/%5EGSPC`에서 PER·PBR·CAPE(S&P500 전용)·차트가 렌더되는지 확인.

**Acceptance Scenarios**:

1. **Given** 검색창에서 "코스피" 탭, **When** `^KS11` 결과 클릭, **Then** `/index/%5EKS11`로 이동하고 지수 차트가 뜬다.
2. **Given** `/index/%5EGSPC`, **When** 로딩, **Then** Trailing PER·Forward PER·PBR·배당·Shiller CAPE가 표시된다.
3. **Given** `/index/%5EKS11` (한국 지수), **When** KRX 캐시에 PER/PBR 있음, **Then** 해당 값 표시; 캐시 없으면 "—".
4. **Given** 지수 상세, **When** isSnp500=false, **Then** Shiller CAPE 셀은 노출되지 않는다.
5. **Given** S&P500 상세, **When** FRED API 실패, **Then** CAPE 셀만 "—"이고 나머지는 정상.

---

### User Story 3 — 한국 지수 PER/PBR (KRX 싱크) (Priority: P3)

관리자가 `npm run sync:krx-index` 를 실행(또는 Windows 스케줄러 자동)하면 KRX에서 코스피·코스닥 PER·PBR·PER·배당수익률을 가져와 Supabase `krx_index_stats_cache`에 저장한다. `/index/%5EKS11` 페이지에서 이 캐시를 읽어 표시한다.

**Why this priority**: Yahoo Finance는 한국 지수 밸류에이션 미제공. KRX 직접 접근이 유일한 경로지만 Playwright 세션이 필요해 스케줄 배치로 분리.

**Independent Test**: `npm run sync:krx-index` 실행 후 Supabase에서 `krx_index_stats_cache` 행 확인.

**Acceptance Scenarios**:

1. **Given** KRX 접속 가능, **When** 싱크 스크립트 실행, **Then** `^KS11`, `^KQ11` 두 행이 upsert됨.
2. **Given** 싱크 완료 후 `/index/%5EKS11`, **When** 로딩, **Then** PER·PBR 값이 "—" 대신 실제 수치로 표시됨.
3. **Given** KRX 접속 실패, **When** 싱크 실행, **Then** 기존 캐시 값 유지(덮어쓰기 안 함), exit code 1 + 에러 로그.

---

### User Story 4 — 버핏 인디케이터 (Priority: P4)

지수 상세 페이지에 국가별 시총/GDP 비율(버핏 인디케이터)이 가로 막대로 표시된다. World Bank 연간 데이터 기반, 7일 캐시.

**Acceptance Scenarios**:

1. **Given** `/index/%5EGSPC`, **When** 로딩, **Then** 미국·한국·일본·중국·영국 5개국 막대 표시. 100% 기준선 표시.
2. **Given** World Bank API 실패, **Then** 버핏 인디케이터 섹션 자체가 숨겨지고 다른 섹션에 영향 없음.

---

### Edge Cases

- ETF 심볼 6자리(한국): `379800` → `379800.KS` → `379800.KQ` 순 시도, 모두 실패면 `null`
- 지수 심볼에 `^` 포함: URL 인코딩 `%5E` ↔ 디코딩 `^` 정상 처리
- Yahoo crumb의 `/` 문자: `URLSearchParams`로 인코딩하면 `%2F`가 되어 Yahoo 거부 → 문자열 직접 연결
- ETF ROE: `topHoldings.equityHoldings.returnOnEquity` 대부분 undefined → 상위10 종목 `financialData` 병렬 조회 후 비중 가중평균
- `topHoldings.equityHoldings` 값은 역수(earnings yield) 형식 → `yieldToRatio(v) = 1/v` 변환 필요 (PE는 `summaryDetail.trailingPE` 사용, 이쪽은 배수 직접)
- Yahoo v7 API 2026년 차단 → v10 `quoteSummary` + crumb 인증 사용

---

## Requirements

### Functional Requirements

- **FR-001**: ETF 심볼(assetType="ETF" 또는 6자리+.KS/.KQ)일 때 `/stocks/[symbol]`에서 `EtfFundamentalsSection` 렌더
- **FR-002**: `EtfFundamentalsSection`은 가중평균 PER·PBR·ROE·PSR, 섹터 비중 바차트, 상위 보유 종목 Top10 링크를 포함
- **FR-003**: 지수 심볼(^로 시작)은 `/index/[symbol]` 라우트로 진입 — search/page.tsx 링크 분기
- **FR-004**: `/index/[symbol]`는 1y 일봉 차트 + 밸류에이션 카드 + 섹터 + Top10 + 버핏 인디케이터를 포함
- **FR-005**: `IndexValuation` 컴포넌트는 Trailing PER·Forward PER·PBR·ROE·배당·CAPE(SNP500 전용) 표시
- **FR-006**: CAPE는 FRED `fredgraph.csv?id=CAPE` 에서 가져오며 S&P500(`^GSPC`) 페이지에만 노출
- **FR-007**: `getIndexSummary(symbol)`은 지수 자체 데이터 + ETF 프록시(INDEX_ETF_PROXY 맵) 병합으로 PE/PBR 보완
- **FR-008**: 한국 지수(`^KS11`, `^KQ11`)는 `krx_index_stats_cache` 테이블에서 PER·PBR 읽기
- **FR-009**: `krx_index_stats_cache` 싱크는 `scripts/syncKrxIndexStats.ts` 스크립트, 기존 Playwright 패턴 사용
- **FR-010**: 모든 외부 fetch 실패는 `null` 반환, UI는 "—" 표시 — throw 금지
- **FR-011**: `catalog.ts` ETF 항목에 `etfMeta.benchmarkIndex` 필드로 지수 상세 연결
- **FR-012**: `quotes.ts` PRESET_QUOTES에 `isIndex: boolean` 추가 — 지수는 `/index/` 진입 허용

### Key Entities

- **EtfStats**: `equityHoldings(per/pbr/roe/psr)`, `holdings[]`, `sectors[]`, `dividendYield`
- **IndexSummary**: `trailingPE`, `forwardPE`, `pbr`, `roe`, `dividendYield`, `holdings[]`, `sectors[]`
- **ShillerCape**: `value`, `asOf(YYYY-MM)`
- **BuffettIndicatorItem**: `country`, `flag`, `ratio`, `marketCap`, `gdp`, `year`
- **KrxIndexStatsRow**: `symbol(^KS11|^KQ11)`, `per`, `pbr`, `dividend_yield`, `synced_at`

---

## Data Sources & Caching

| 소스 | 엔드포인트 | revalidate | 비고 |
|------|-----------|-----------|------|
| Yahoo v10 quoteSummary (ETF) | `query1.finance.yahoo.com/v10/finance/quoteSummary/{sym}?modules=topHoldings,summaryDetail` | 86400s | crumb 인증 필요 |
| Yahoo v10 quoteSummary (지수) | 위와 동일 + ETF 프록시 | 3600s | PE는 프록시 ETF에서 |
| Yahoo v10 financialData (ROE) | `modules=financialData` × 상위10 종목 병렬 | 86400s | `returnOnEquity` 소수형 |
| FRED CAPE | `fredgraph.csv?id=CAPE` | 86400s | 월 1회 업데이트 |
| World Bank 시총·GDP | `api.worldbank.org/v2/country/{iso2}/indicator/CM.MKT.LCAP.CD` | 604800s | 연간 데이터 |
| KRX (한국 지수 PER/PBR) | `data.krx.co.kr` BLD `MDCSTAT02801` | Playwright 배치 | 세션 필요, 일 1회 |

**INDEX_ETF_PROXY 맵:**
```
^GSPC → SPY   (S&P 500 → SPDR)
^IXIC → QQQ   (NASDAQ-100 → Invesco QQQ)
^DJI  → DIA   (다우 → SPDR Dow Jones)
^N225 → EWJ   (닛케이 → iShares Japan)
^HSI  → EWH   (항셍 → iShares Hong Kong)
^FTSE → EWU   (FTSE100 → iShares UK)
^KS11 → (없음, KRX 캐시 전용)
^KQ11 → (없음, KRX 캐시 전용)
```

---

## Data Contracts (앱 개발자용 API 설계 기준)

> 이 섹션은 웹이 아닌 **네이티브 앱**을 만들 때 백엔드 API 스펙으로 사용한다.  
> 현재 웹은 서버 컴포넌트에서 직접 fetch하지만, 앱은 아래 REST 엔드포인트를 호출한다.

### `GET /api/etf/{symbol}`
```jsonc
// Response 200
{
  "symbol": "SPY",
  "equityHoldings": {
    "per": 22.4,          // Trailing PER (배수)
    "pbr": 4.1,           // PBR (배수)
    "roe": 0.192,         // ROE (소수, 0.192 = 19.2%) — 상위10 비중 가중평균
    "psr": 2.8            // PSR (배수), null 가능
  },
  "holdings": [
    { "symbol": "AAPL", "name": "Apple Inc.", "weight": 0.067 },
    ...                   // 최대 10개, weight = 0~1
  ],
  "sectors": [
    { "name": "기술", "weight": 0.32 },
    ...                   // 내림차순 정렬
  ],
  "dividendYield": 0.013, // 소수(0.013 = 1.3%), null 가능
  "ter": 0.0009,          // 총보수(KRX 캐시), null 가능
  "benchmarkIndex": "^GSPC"  // catalog.etfMeta.benchmarkIndex, null 가능
}
// 데이터 없는 필드는 null (에러 아님)
// Response 404: 심볼 미인식
```

### `GET /api/index/{symbol}`
```jsonc
// symbol 예: %5EGSPC, %5EKS11 (URL인코딩된 ^GSPC, ^KS11)
// Response 200
{
  "symbol": "^GSPC",
  "name": "S&P 500",
  "country": "US",         // "KR" | "US" | "JP" | "GB" | "CN" | null
  "flag": "🇺🇸",
  "valuation": {
    "trailingPE": 22.4,
    "forwardPE": 19.8,
    "pbr": 4.1,
    "roe": 0.192,           // 상위10 비중 가중평균, null 가능
    "dividendYield": 0.013,
    "shillerCape": {        // S&P500 전용, 그 외 null
      "value": 34.2,
      "asOf": "2026-05"
    }
  },
  "holdings": [
    { "symbol": "AAPL", "name": "Apple Inc.", "weight": 0.067 },
    ...
  ],
  "sectors": [
    { "name": "기술", "weight": 0.32 },
    ...
  ],
  "proxyEtf": "SPY"         // 밸류에이션 데이터 소스, null 가능
}
```

### `GET /api/macro/buffett-indicator`
```jsonc
// Response 200
{
  "items": [
    {
      "country": "미국",
      "flag": "🇺🇸",
      "ratio": 1.96,        // 1.96 = 196%
      "marketCapUsd": 4.6e13,
      "gdpUsd": 2.35e13,
      "year": 2023
    },
    ...                     // 한국·일본·영국·중국 포함
  ],
  "cachedAt": "2026-06-22T00:00:00Z"
}
// World Bank 실패 시 items: []
```

### 앱 차트 데이터
ETF·지수 가격 차트는 기존 `GET /api/quotes?symbol=SPY&range=1y` 엔드포인트를 재사용 (spec 외 범위).

---

## UI 레이아웃 명세 (앱 참고)

### ETF 상세 (`/stocks/[symbol]` — ETF 분기)

```
┌─ 기존 가격·차트 섹션 (변경 없음) ──────────────────────┐
└────────────────────────────────────────────────────────┘

┌─ ETF 구성 지표 ────────────────────────────────────────┐
│  가중평균 PER  22.4배     가중평균 PBR   4.1배          │
│  가중평균 ROE  19.2%      배당수익률    1.3%            │
│  총보수(TER)   0.09%/년   PSR          2.8배            │
│                                                        │
│  출처: Yahoo Finance · 구성 종목 가중평균 · 참고용      │
└────────────────────────────────────────────────────────┘

┌─ 섹터 배분 ────────────────────────────────────────────┐
│  기술       ████████████░░░░  32%                      │
│  헬스케어   ████████░░░░░░░░  14%                      │
│  금융       ███████░░░░░░░░░  13%                      │
│  산업재     ██████░░░░░░░░░░  10%                      │
│  기타       ...                                        │
└────────────────────────────────────────────────────────┘

┌─ 상위 보유 종목 Top 10 ─────────────────────────────── ┐
│  [AAPL 아이콘]  Apple Inc.          AAPL   6.7%  →    │
│  [MSFT 아이콘]  Microsoft           MSFT   6.2%  →    │
│  ...                                                  │
│  출처: Yahoo Finance · 시점 따라 변동                  │
└────────────────────────────────────────────────────────┘

┌─ 내 포트폴리오 연관 지수 ──────────────────────────────┐
│  벤치마크: S&P 500 →  /index/%5EGSPC                  │
└────────────────────────────────────────────────────────┘
```

### 지수 상세 (`/index/[symbol]`)

```
┌─ 헤더 ─────────────────────────────────────────────────┐
│  🇺🇸  S&P 500  (^GSPC)                                 │
│  5,482.87   ▲ +12.3 (+0.22%)  2026.06.22              │
└────────────────────────────────────────────────────────┘

┌─ 차트 [1m | 3m | 6m | 1y | 5y | 10y | max] ───────────┐
│  (기간별 가격 차트)                                     │
└────────────────────────────────────────────────────────┘

┌─ 현재 밸류에이션 ──────────────────────────────────────┐
│  Trailing PER  22.4배    Forward PER   19.8배          │
│  PBR           4.1배     ROE(가중평균) 19.2%           │
│  배당수익률    1.3%      Shiller CAPE  34.2            │
│                          (2026-05, S&P500 전용)        │
│  출처: Yahoo Finance(SPY 프록시) · FRED · 참고용        │
└────────────────────────────────────────────────────────┘

┌─ 버핏 인디케이터 (시총/GDP) ──────────────────────────┐
│  🇺🇸 미국   196%  [████████████████░░░░]  2023년      │
│  🇯🇵 일본    95%  [█████████░░░░░░░░░░░░]             │
│  🇰🇷 한국    87%  [████████░░░░░░░░░░░░░]             │
│  🇬🇧 영국    99%  [█████████░░░░░░░░░░░░]             │
│  🇨🇳 중국    64%  [██████░░░░░░░░░░░░░░░]             │
│  ─────────────────────────────────────────────────────│
│  ↑ 100% = 시총이 GDP와 동일. 버핏이 "가장 좋아하는     │
│  밸류에이션 지표". 출처: World Bank · 연간(지연 가능)  │
└────────────────────────────────────────────────────────┘

┌─ 섹터 구성 ────────────────────────────────────────────┐
│  (ETF 상세와 동일 레이아웃, SPY/QQQ 프록시 데이터)     │
└────────────────────────────────────────────────────────┘

┌─ 상위 종목 Top 10 ─────────────────────────────────────┐
│  (ETF 상세와 동일)                                     │
└────────────────────────────────────────────────────────┘

┌─ 이 지수를 추종하는 내 ETF ────────────────────────────┐
│  KODEX 미국S&P500  379800  → /stocks/379800           │
│  TIGER 미국S&P500  360750  → /stocks/360750           │
└────────────────────────────────────────────────────────┘
```

**디자인 원칙(Constitution §IV)**:
- 거의 무채색 + 흰 카드 + 그림자
- 섹터 바차트: 단색(`bg-primary/N`), 그라데이션 금지
- 등락 색은 시세 등락에만 — 밸류에이션 수치에 색 강조 금지
- 빈 값은 "—", 절대 임의 값 금지

---

## 파일 구조

### 신규 파일
```
src/
  app/
    index/
      [symbol]/
        page.tsx              # 지수 상세 서버 컴포넌트
  components/
    etf/
      EtfFundamentalsSection.tsx   # ETF 구성 지표 + 섹터 + Top10
      EtfSectorChart.tsx           # 가로 바차트 (섹터)
      EtfHoldingsList.tsx          # Top10 링크 목록
    index/
      IndexValuation.tsx      # ✅ 완료 — PER/PBR/ROE/CAPE 카드
      BuffettIndicator.tsx    # 버핏 인디케이터 바차트
      EtfLinks.tsx            # 포트폴리오 연관 ETF 목록
  lib/
    finance/
      etfStats.ts             # ✅ 완료 — Yahoo quoteSummary 래퍼
      indexStats.ts           # ✅ 완료 — 지수 + ETF 프록시 + CAPE
      macroStats.ts           # World Bank 버핏 인디케이터
scripts/
  syncKrxIndexStats.ts        # KRX Playwright — 한국 지수 PER/PBR
  registerKrxIndexTask.ps1    # Windows 스케줄러 등록
supabase/
  migrations/
    20260623_krx_index_stats_cache.sql
```

### 수정 파일
```
src/
  app/
    stocks/[symbol]/page.tsx  # ETF 분기 추가 (886줄 else → isEtf 분기)
    search/page.tsx           # isIndex=true면 /index/[sym] 링크
  lib/
    finance/
      quotes.ts               # PresetQuote + isIndex 필드
      catalog.ts              # CatalogItem.etfMeta + benchmarkIndex
```

---

## 구현 순서 (의존성 순)

### Step 1 — DB 마이그레이션 *(미완)*
- `20260623_krx_index_stats_cache.sql` — `krx_index_stats_cache` 테이블

### Step 2 — KRX 한국 지수 싱크 *(미완)*
- `scripts/syncKrxIndexStats.ts` — Playwright + BLD `MDCSTAT02801`
- `npm run sync:krx-index` 스크립트 추가

### Step 3 — 데이터 레이어 확장 *(미완)*
- `macroStats.ts` — World Bank 버핏 인디케이터
- `indexStats.ts` — `krx_index_stats_cache` 읽기 추가

### Step 4 — catalog·quotes 메타 확장 *(미완)*
- `catalog.ts` — `CatalogItem.etfMeta.benchmarkIndex`
- `quotes.ts` — `PresetQuote.isIndex`

### Step 5 — ETF 컴포넌트 *(미완)*
- `EtfFundamentalsSection`, `EtfSectorChart`, `EtfHoldingsList`
- `stocks/[symbol]/page.tsx` — ETF 분기

### Step 6 — 지수 페이지 *(미완)*
- `src/app/index/[symbol]/page.tsx`
- `BuffettIndicator`, `EtfLinks`
- `search/page.tsx` — isIndex 링크 분기

---

## Supabase 스키마

```sql
-- 한국 지수 밸류에이션 캐시 (KRX Playwright 싱크)
create table krx_index_stats_cache (
  symbol          text primary key,   -- '^KS11' | '^KQ11'
  per             numeric,
  pbr             numeric,
  eps             numeric,            -- 주당순이익, nullable
  dividend_yield  numeric,            -- 배당수익률(소수), nullable
  listed_count    integer,            -- 상장 종목 수, nullable
  synced_at       timestamptz not null default now()
);
-- RLS 불필요 (공개 시장 데이터, 사용자 귀속 없음)
-- anon read 허용
alter table krx_index_stats_cache enable row level security;
create policy "anon_read" on krx_index_stats_cache for select using (true);
```

---

## Constitution Check

| 원칙 | 확인 |
|------|------|
| I. 스타일 중립 | PER/PBR/ROE에 "비쌈/쌈" 판단 색 강조 금지. 값만 표시. ✅ |
| II. 정직한 게이미피케이션 | 데이터 없으면 "—". 임의값 금지. Yahoo 실패 시 오류 없이 빈 상태. ✅ |
| III. 엔진 정확·화면 단순 | `yieldToRatio` 역수 변환, crumb 인코딩 버그 수정 등 계산 정확성 확보. ✅ |
| IV. 토스급 절제 | 섹터 단색 바, 무채색 카드, 그라데이션·과도한 색면 금지. ✅ |
| V. 단일 진실원천 | 밸류에이션은 외부 API 참고용. events 테이블 원장과 충돌 없음. ✅ |

---

## Success Criteria

- **SC-001**: `SPY` 상세에서 PER·섹터·Top10이 2초 내 렌더 (ISR 캐시 히트 기준)
- **SC-002**: `379800` 등 Yahoo topHoldings 없는 한국 ETF에서 JS 에러 없음
- **SC-003**: `^GSPC` → `/index/%5EGSPC` 진입, Shiller CAPE 포함 6개 지표 표시
- **SC-004**: `^KS11` 싱크 후 PER·PBR "—" → 실제 값으로 전환
- **SC-005**: World Bank 실패 시 버핏 인디케이터 섹션 숨김, 나머지 페이지 정상
- **SC-006**: TypeScript `npx tsc --noEmit` 에러 0개

## Assumptions

- Yahoo Finance v10 quoteSummary crumb 인증 방식이 현재 동작 중 (2026-06 확인)
- KRX `data.krx.co.kr` BLD `MDCSTAT02801`이 코스피·코스닥 PER/PBR 제공 (기존 TER 패턴 동일 방식)
- World Bank API 무료 키 불필요 (공개 엔드포인트)
- FRED `fredgraph.csv?id=CAPE` 무료 키 불필요
- 앱 개발 시 이 spec의 Data Contracts 섹션을 API 기준으로 사용
- 앱에서는 `/api/etf/{symbol}`, `/api/index/{symbol}` Route Handler를 별도 구현 (현재 웹은 서버 컴포넌트 직접 fetch)
