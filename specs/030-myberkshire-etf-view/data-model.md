# Data Model: 마이버크셔 ETF 투자자 뷰

## 신규 데이터 구조 (코드 내부)

### EtfPortfolioStats
```ts
interface EtfPortfolioSlice {
  symbol: string;
  name: string;
  weight: number;   // 전체 포트폴리오 대비 비중 (0~1)
  ter: number | null; // 연간 총보수율 (0.0012 = 0.12%). null이면 데이터 없음
}

interface EtfPortfolioStats {
  slices: EtfPortfolioSlice[];  // 보유 ETF 목록
  weightedAvgTer: number | null; // TER 가중평균 (null이면 모두 데이터 없음)
  terCoverage: number;  // TER 데이터 있는 ETF 비중 합 (0~1)
}
```

### 보유 분류 (growth/page.tsx 내부)
```ts
const etfAllocations = data.allocation.filter(
  a => secMeta[a.symbol]?.assetType === "ETF"
);
const stockAllocations = data.allocation.filter(
  a => secMeta[a.symbol]?.assetType !== "ETF"
);
const hasEtf = etfAllocations.length > 0;
const hasStock = stockAllocations.length > 0;
```

## 기존 데이터 재사용

| 데이터 | 출처 | 이미 growth page에? |
|--------|------|---------------------|
| `data.allocation` (AllocationSlice[]) | `computeDashboard()` | ✅ |
| `secMeta[symbol].assetType` | `loadSecurityMeta()` | ✅ |
| TER per symbol | `fetchKrxEtfTers(etfSymbols, supabase)` | ❌ 신규 호출 |

## DB 변경 없음

`etf_ter_cache` 테이블은 기존 그대로 사용. 스키마 변경 없음.
