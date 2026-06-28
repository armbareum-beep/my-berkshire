# 027 · 환율 전날대비 변동금·변동율 표시

## 상태
구현 완료 · PR #33 머지 (2026-06-28)

## 변경 내용

### 데이터
- `FxRateInfo` 타입 추가: `{ rate, prev, changeAbs, changePct }`
- `getFxRateInfo()` 함수 추가 — Yahoo Finance 동일 URL(`{CCY}KRW=X`) 응답의 `meta.chartPreviousClose` 활용, 추가 API 요청 없음
- 기존 `getFxToKrw()` 유지 (하위 호환)

### 홈화면 CashCard
- 외화 행 아래 변동금·변동율 표시 (`+3.2원 (+0.21%)`, `changeColor` 적용)
- `CashCard`에 `fxInfo?` prop 추가
- `dashboard/page.tsx`에서 `getFxRateInfo` 페치 후 전달

### /cash 페이지
- 환율 탭: 각 통화 `1 USD = ₩1,511` 아래 변동 표시
- 통화별 보유 섹션: 외화 잔액 행 아래 변동 표시
- `getFxToKrw` → `getFxRateInfo` 교체

## 변경 파일
- `src/lib/finance/fx.ts`
- `src/components/dashboard/cards.tsx`
- `src/app/dashboard/page.tsx`
- `src/app/cash/page.tsx`
