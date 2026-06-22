# Phase 1 Contracts: 내부 인터페이스 (불변 계약)

이 프로젝트가 노출하는 "계약"은 외부 REST가 아니라 **UI↔데이터소스 seam의 lib 인터페이스**다. KIS 도입은 이 계약을 **바꾸지 않고** 내부 구현만 추가한다.

## C1. 검색 (`src/lib/finance/search.ts` — 불변)
```
searchSymbols(query: string, signal?: AbortSignal): Promise<SymbolSearchResult[]>
fetchQuotes(symbols: string[]): Promise<Record<string, number>>  // ₩
```
- 계약: 빈 질의 → `[]`. 실패 → throw 안 함(`[]`/`{}`).
- KIS 영향: `/api/search`·`/api/quote` 라우트 내부가 `FINANCE_SOURCE`로 분기. 응답 형태 동일.

## C2. 시세 (`src/lib/finance/prices.ts` — 시그니처 불변)
```
getPrices(symbols): Promise<PriceResult>
getKrwPrices(symbols): Promise<KrwPriceResult>
getDailyKrwCloses(symbols, from, to, interval?): Promise<DailyClosesResult>
getYearEndCloses(symbol, fromYear, toYear): Promise<Map<number, number>>
```
- KIS 영향: 내부에 `getPricesKis`/`getDailyClosesKis` 추가, 플래그 분기. 반환 shape 동일.

## C3. 환율 (`src/lib/finance/fx.ts` — 시그니처 불변)
```
getFxToKrw(currencies: string[]): Promise<Record<string, number>>
getUsdKrw(): Promise<number | null>
```
- KIS 영향: KIS 모드면 `price-detail.t_rate`에서 USD/KRW. KRW→1. KIS 미제공 통화는 폴백.

## C4. 신규 내부 모듈 (계약 외부 비노출)
- `src/lib/finance/kis/client.ts`: `kisToken()`(캐시), `kisFetch(path, { trId, params })`. 서버 전용.
- `src/lib/finance/kis/normalize.ts`: KIS JSON → `PriceResult`/`SymbolSearchResult`/FX. **순수함수**(fixture 단위테스트 대상).
- `src/lib/finance/source.ts`: `financeSource(): FinanceSource`.

## C5. 라우트 계약 (불변)
- `GET /api/search?q=` → `{ results: SymbolSearchResult[] }`
- `GET /api/quote?symbols=a,b` → `{ prices, previousCloses, currencies, available }`
- 소스 전환과 무관하게 동일 응답.

## 테스트 계약
- `normalize.ts` 단위테스트: KIS 샘플 JSON fixture → 기대 타입(키 없이 검증 가능).
- 회귀: `FINANCE_SOURCE` 미설정/`yahoo` → 기존 스냅샷 동일.
