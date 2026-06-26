# Phase 1 UI Contract: 부동산 사업부 지표 strip

이 기능의 외부 계약은 **상세 화면 표시**다(공개 API·엔드포인트 없음). 표시 규칙을 계약으로 명문화.

## 위치

`/real-estate` → `ManualAssetsSection` → 각 사업부 헤더 블록 바로 아래.
적용 조건: `division.key === "REAL_ESTATE" && division.totals.debt > 0`. 그 외(대출 0·부동산 외 사업부)에는 **렌더하지 않는다**.

## 표시 항목 (한 strip, 가로 나열)

| 라벨 | 값 | 포맷 | 산출 불가 시 |
|------|-----|------|--------------|
| 자산수익률 | `totals.ret` | `signedPct` + `changeColor` | "—" |
| 실투자금 수익률 | `totals.ownCapitalReturn` | `signedPct` + `changeColor` | "—" |
| 순자산 | `totals.netEquity` | `money(cv(·), currency)` | (항상 값 있음) |
| LTV | `totals.ltv` | `pct` | "—" |

- `cv` = factor 환산(₩/$ 토글), `currency`는 컴포넌트 스코프 기존 값 사용.
- 자산수익률과 실투자금 수익률은 **나란히**(좌→우) 배치해 레버리지 효과 대비.
- 톤: 기존 대출 추정이자 줄과 동일한 muted/secondary 스타일. 신규 색·솔리드 면 금지(원칙 IV).

## 불변 (회귀 금지)

- 홈 `DivisionCard`(통합 "실물 사업부" 카드)는 변경하지 않는다 — 기존 자산수익률 한 줄만.
- 자산별 행·임대/대출/매도 버튼·보정 UI 등 기존 표시는 그대로.
- 주식 XIRR·총자산 누적수익률·`BusinessReturnsCard` 표시값 불변.

## 수용 기준 매핑

- spec US1 #1 → 자산수익률·실투자금 수익률 나란히, 후자 증폭.
- spec US1 #2 → 임대 0 거주용도 실투자금 수익률 값 표시("—" 아님).
- spec US1 #3·#4 / FR-006 → 대출 0·부동산 외 미표시.
- spec US2 #1 → 순자산·LTV 정확.
- spec US2 #2 / FR-008 → 과레버리지 시 순자산 음수, 실투자금 수익률 "—".
