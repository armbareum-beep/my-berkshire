# Phase 1 Data Model: KIS 시세·검색 연동

기존 인터페이스 타입은 **불변**. 신규는 KIS 내부 정규화·종목마스터 인덱스뿐.

## 기존(불변) — 재확인
- `SymbolSearchResult { symbol, name, exchange, assetType?, ter? }` (`lib/finance/search.ts`)
- `PriceResult { prices, previousCloses, currencies, instrumentTypes, available }` (`lib/finance/prices.ts`)
- `KrwPriceResult`(= PriceResult + ₩환산 + usdKrw)
- `getFxToKrw(): Record<ccy, krwRate>` (`lib/finance/fx.ts`)
- `DailyClosesResult`(과거 종가)

## 신규 — 소스 설정
- **FinanceSource** = `"yahoo" | "kis"` (확장 여지: `"toss"`). `process.env.FINANCE_SOURCE`(기본 `yahoo`).

## 신규 — KIS 토큰 캐시(메모리)
- `KisToken { accessToken: string, expiresAt: number }` (모듈 스코프 1개). 만료 60초 전 갱신.

## 신규 — 종목마스터 인덱스 (검색용)
- DB 테이블 **`kis_security_master`**(또는 기존 `securities` 확장):
  - `symbol`(PK, 내부심볼: 국내 6자리/해외 티커)
  - `name_ko`(한글명), `name_en`(영문, 해외)
  - `exchange`(국내: KOSPI/KOSDAQ; 해외: NAS/NYS/AMS …)
  - `market`(`KR`|`US`)
  - `asset_type`(STOCK/ETF 등, 가능 시)
  - `source_date`, `fetched_at`
- 인덱스: `name_ko`(한글검색), `symbol`. 일 1회 동기화 스크립트(`scripts/syncKisMaster.ts`).
- **해외 EXCD 매핑**: 해외 현재가 호출에 필요한 거래소코드를 이 테이블에서 조회.

## 매핑 규칙
| 내부심볼 | KIS 시세 호출 | 비고 |
|---|---|---|
| `005930`(6자리) | 국내 `FID_INPUT_ISCD=005930`, `MRKT_DIV=J` | KS/KQ 후보 probing 불필요 |
| `AAPL` | 해외 `SYMB=AAPL`, `EXCD`=마스터 조회(NAS) | 마스터에서 거래소 |
| `^KS11`·`USDKRW=X`·`BTC-USD` | **KIS 미대상** → 기존 야후 경로 | `isQuoteOnly` 분기 |

## 검증 규칙(FR 매핑)
- 한글 검색(FR-001): `kis_security_master.name_ko ILIKE %q%` 매칭.
- 회귀 불변(FR-002/007): `FINANCE_SOURCE=yahoo`면 신규 코드 경로 미진입.
- 통화/₩환산(FR-003/004): 해외 `last`(USD)·`t_rate`로 환산.
- 폴백(FR-009): KIS 실패 시 빈 결과 또는 야후 폴백, throw 금지.
