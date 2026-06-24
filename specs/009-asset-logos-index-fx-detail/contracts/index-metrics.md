# Contract: 지수 지표 셀 (User Story 2)

지수 상세 밸류에이션 영역의 표시 계약.

## 지표 셀 집합 (Forward PER 제거 후)

| 셀 | 출처 | 한국 지수(^KS11/^KQ11) | 미국/기타 지수 |
|----|------|------------------------|----------------|
| Trailing PER | KRX 캐시 > ETF 프록시 > 지수 | KRX `per` | 프록시 `trailingPE` |
| PBR | KRX 캐시 > 프록시 > 지수 | KRX `pbr` | 프록시 `priceToBook` |
| ROE(상위10 가중) | 보유종목 가중 | (보유 없으면 unavailable) | 프록시 holdings |
| 배당수익률 | KRX 캐시 > 프록시 > 지수 | KRX `dividend_yield` | 프록시 dividendYield |
| ~~Forward PER~~ | **제거** | — | — |
| Shiller CAPE | FRED(S&P500 전용) | 해당 없음 | S&P500만 |

## 셀 상태 계약

```text
status = value | unavailable | pending
```
- **value**: 값 존재 → 포맷 표시(예: `12.3배`, `2.1%`).
- **pending**("데이터 준비 중"): 한국 지수인데 `getKrxIndexStats()`가 null(캐시 미충전). 일시적 상태로 구분(FR-010) — 영구 빈칸 아님.
- **unavailable**("정보 없음"): 출처상 본질적 결측(FR-009).
- 영역 전체가 비어 보이면 안 됨 — 셀은 항상 라벨+상태 표기.

## 코드 변경점

- `components/index/IndexValuation.tsx`: Forward PER `<Cell>` 제거. 각 셀 `"—"` 대신 status 기반 텍스트("정보 없음"/"데이터 준비 중") 또는 값.
- `lib/finance/indexStats.ts`:
  - `IndexSummary.forwardPE` 제거.
  - `fetchQuoteSummary`의 `forwardPE` 페치/반환 제거(`:109`,`:162`).
  - 한국 지수에서 KRX 캐시 부재를 표시단이 식별할 수 있도록 신호 노출(예: `krxAvailable: boolean` 또는 셀 status 계산을 페이지/컴포넌트에서 수행).
- **운영 절차**(코드 아님): 구현 검증 시 `krx_index_stats_cache` 행·`synced_at` 확인. 비었으면 `npm run sync:krx-index` 1회 실행. 출처 있는 PER/PBR/배당이 값으로 표시되는지 확인(SC-003).

## 불변식 / 헌장

- 없는 값(Forward PE 등)을 만들지 않는다(헌장 II). 표기로만 처리.
- 등락색·강조는 시세 등락에만(헌장 IV) — 지표 셀은 무채색.

## 테스트

- 셀 상태 매핑 순수 함수: (한국지수, krx=null) → pending; (값 있음) → value; (미국지수, 프록시 null) → unavailable.
- Forward PER 셀이 렌더 트리에 없음(스냅샷/단언).
