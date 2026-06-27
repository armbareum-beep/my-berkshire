# Feature Specification: ETF 국가 분류 + 자산구성 국가별 드릴다운

**Feature Branch**: `022-etf-country` + `025-etf-allocation-fix`  
**Created**: 2026-06-28  
**Status**: Shipped ✅  
**Merged**: 2026-06-28 (PR #28, #31)

## 배경 (Why)

두 가지 이슈:

1. **이슈 4** — S&P500 ETF(TIGER 미국S&P500 `360750` 등 KRX 상장 6자리 코드)가 자산 구성 화면에서 "한국"으로 분류됨. 심볼이 6자리 숫자라 `countryOf()`의 6자리=한국 휴리스틱에 걸림.

2. **이슈 5** — 홈 자산구성 카드에서 ETF를 열면 국가별 비중을 보고 싶음. 기존 구현은 ETF 개별 종목 이름만 나열했음.

---

## 구현 요약

### 1단계 — `underlyingCountry` 카탈로그 필드 도입 (PR #28)

`src/lib/finance/catalog.ts` — `CatalogItem`에 `underlyingCountry?: string` 추가:

```typescript
underlyingCountry?: string; // ETF 기초자산 국가. KRX 상장 미국 ETF의 국가 오분류 방지.
```

카탈로그 ETF 항목에 값 설정:
- S&P500·NASDAQ100 ETF → `"미국"` (TIGER/KODEX/ACE/KBSTAR/HANARO/ACE 등 전 상품)
- KOSPI200 ETF → `"한국"`
- CSI300·항셍테크 ETF → `"중국"`

`src/lib/securities.ts` — `countryOf()` 수정:
```typescript
export function countryOf(symbol: string): string {
  if (isCrypto(symbol)) return "기타";
  const cat = findCatalogItem(symbol);
  if (cat?.underlyingCountry) return cat.underlyingCountry; // 카탈로그 우선
  return /^\d{6}$/.test(symbol) ? "한국" : "미국";
}
```

### 2단계 — DB stale 값 수정 (PR #31)

`loadSecurityMeta()`에서 DB `country` 칼럼이 카탈로그보다 우선해 stale "한국"이 읽혔음.

`src/lib/securities.ts` 수정:
```typescript
// 수정 전
country: r?.country ?? countryOf(s),

// 수정 후 — 카탈로그 underlyingCountry가 DB 적재값을 덮어씀
country: findCatalogItem(s)?.underlyingCountry ?? r?.country ?? countryOf(s),
```

### 3단계 — 자산구성 카드 ETF 국가별 드릴다운 (PR #31)

**수정 전**: "미국 ETF" / "한국 ETF" 별도 섹션이 최상위에 분리 표시.

**수정 후**: "ETF" 하나를 탭하면 → 내부에 미국/한국/중국 비중 막대 집계.

`src/lib/dashboard.ts` — `AllocationSlice`에 `countryTag?: string` 추가.

`src/lib/allocation.ts` — `groupAllocationByTypeWithEtfCountry()` 변경:
- ETF를 단일 "ETF" 그룹으로 묶음 (이전: "미국 ETF"/"한국 ETF" 분리)
- 각 ETF slice에 `countryTag: m?.country` 태깅

`src/components/dashboard/cards.tsx` — `AllocationCard` ETF 분기:
```tsx
// ETF 섹션은 countryTag 기준 집계
const etfByCountry = isEtf
  ? [...g.slices.reduce((m, s) => {
      const key = s.countryTag ?? "기타";
      ...
    }).entries()]
    .sort((a, b) => b.value - a.value)
  : null;
```

---

## 주요 변경 파일

| 파일 | 변경 내용 |
|------|---------|
| `src/lib/finance/catalog.ts` | `CatalogItem.underlyingCountry` 필드 + ETF 값 입력 |
| `src/lib/securities.ts` | `countryOf()` 카탈로그 우선, `loadSecurityMeta()` stale DB 수정 |
| `src/lib/dashboard.ts` | `AllocationSlice.countryTag` 추가 |
| `src/lib/allocation.ts` | `groupAllocationByTypeWithEtfCountry()` 단일 ETF 그룹 + countryTag |
| `src/components/dashboard/cards.tsx` | ETF 섹션 국가별 집계 렌더링 |

---

## 설계 결정

- **`underlyingCountry` 카탈로그에만 관리**: DB에 별도 컬럼 없음. 카탈로그 항목 수정으로 즉시 반영.
- **DB 우선 → 카탈로그 우선 역전 이유**: 처음 매수 시 `securities` 테이블에 적재된 country 값이 수정 전 `countryOf()` 기준("한국")으로 들어감. 이후 카탈로그 수정해도 DB stale 값이 덮어써서 반영 안 됨. 카탈로그가 있을 때만 우선하는 방식으로 안전하게 해결.
- **ETF 개별 종목 → 국가 집계 이유**: 같은 지수를 여러 ETF로 분산 보유하면 개별 종목 나열은 중복 정보. "미국 노출 35%" 한 줄이 더 직관적.

---

## 새 ETF 추가 방법 (유지보수)

`src/lib/finance/catalog.ts`에 항목 추가:
```typescript
{
  symbol: "심볼코드",
  name: "ETF 이름",
  assetType: "ETF",
  ter: 0.001,            // 총보수(연, 소수)
  trackedIndex: "S&P500", // 추종 지수
  yahooProxy: "SPY",     // 한국 ETF는 Yahoo 구성 데이터 없으므로 미국 동일지수 ETF로 대체
  underlyingCountry: "미국", // 기초자산 국가 (자산구성 국가 분류용)
}
```

`underlyingCountry` 없으면 심볼 휴리스틱(6자리→한국, 알파벳→미국)으로 폴백.
