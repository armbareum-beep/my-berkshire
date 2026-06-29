# 016 — 자산배분 국가별·유형별 분리 뷰

## 문제

1. **주식 구성** 카드가 한국 주식·미국 주식을 한 통에 표시 → 국가별 비중 파악 불가
2. **국가별** 뷰에 ETF와 개별 주식이 혼재 → ETF 추종국 비중을 따로 보기 어려움
3. **`countryOf()`** 폴백이 "나머지=미국"이라 일본·유럽·중국 개별 주식이 전부 미국으로 잘못 분류됨

## 해결 방향

신규 라우트·DB 컬럼 없이, 기존 `countryOf()` / `underlyingCountry` / `BreakdownCard`를 재활용해 표시 계층만 분리.

## 변경 범위

### 0. `src/lib/securities.ts` — `countryOf()` 통화 기반 추론

```
CCY_TO_COUNTRY: USD→미국, JPY→일본, EUR→유럽, HKD→홍콩, GBP→영국, CNY→중국, AUD→호주, CAD→캐나다, INR→인도
countryOf(symbol, currency?)
  → catalog.underlyingCountry 우선 (ETF)
  → 6자리 → 한국
  → currency 폴백 → CCY_TO_COUNTRY
  → "기타"  (미국 가정 제거)
```

`loadSecurityMetaCached`에서 `countryOf(s, r?.currency)` 로 호출.
`upsertSecurities`에서도 동일하게 적용(신규 매수 시 country 올바르게 저장).

### 1. `src/lib/allocation.ts` — `groupTypeByCountry()` 추가

특정 자산유형 내에서 국가별 `AllocationGroup[]` 반환. 주식 구성 카드 분리에 사용.

### 2. `src/app/allocation/page.tsx` — 카드 재구성

- "주식 구성" 단일 카드 → 국가별 카드 N개 ("한국 주식 구성", "미국 주식 구성" 등)  
  href: `/allocation/sleeve/주식?country=한국` 등
- ETF 구성 위에 "ETF 국가별" 카드 추가 (underlyingCountry 기준 비중)  
  href: `/allocation/country`

### 3. `src/app/allocation/sleeve/[type]/page.tsx` — 주식 국가 서브섹션

`type === "주식"`일 때 holdings 목록을 국가 서브섹션으로 나눔.  
`?country=` 쿼리 파라미터로 해당 국가만 필터링 지원.

### 4. `src/app/allocation/[tag]/page.tsx` — country 드릴다운 서브그룹

각 국가 카테고리 items 안에서 "주식" / "ETF" 서브헤더 추가.

## 검증

- 한국 주식 + 미국 주식 보유 시 → 별도 구성 카드 2개
- CSI300 ETF 보유 시 → "ETF 국가별"에 중국 비중 표시
- 일본 주식(JPY) 보유 시 → "일본 주식 구성" 카드 (미국 오분류 없음)
- ETF만 보유 시 주식 카드 미표시, 주식만 보유 시 ETF 카드 미표시
