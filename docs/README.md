# 문서 안내 — 어디부터 읽을 것인가

> 최종 갱신: 2026-08-13

## 0. 신규 개발자 읽기 순서

1. **`enuf-core-simplification-spec-v1.1.md`** — 제품이 무엇이고 무엇을 안 하는지. 여기부터.
2. **`spec-vs-prd-reconciliation.md`** — 두 제품 문서가 충돌했던 지점과 결론. 왜 지금 모습인지.
3. 만지려는 영역의 스펙(아래 표)

---

## 1. 현행 스펙 — 코드와 일치해야 하는 문서

| 문서 | 다루는 것 | 핵심 코드 |
|---|---|---|
| `enuf-core-simplification-spec-v1.1.md` | 제품 범위 · legacy 격리 · 온보딩 · Allocate | `src/lib/allocate.ts` |
| `xirr-spec-v1.md` | 전체 수익률 · 연환산 잠금 규칙 | `src/lib/finance/{xirr,returns}.ts` |
| `expected-return-spec-v1.md` | 매수가 · 기대 CAGR · 배분 우선순위 | `src/lib/finance/expectedReturn.ts` |
| `fx-accuracy-spec-v1.md` | 환율 — 거래 환율 vs 시점 환율 | `src/lib/finance/fx.ts` |
| `spec-vs-prd-reconciliation.md` | 의사결정 기록(충돌 5건 결론) | — |

### 특히 조심할 곳 ★

- **연환산 잠금은 달력이 아니라 자본 가중 경과일** — `xirr-spec-v1.md` §4-1.
  달력으로 되돌리면 며칠치 수익이 수백 %로 표시된다(실제로 겪음).
  **벤치마크도 같은 상수·같은 함수를 써야 한다** — 갈리면 비교가 성립하지 않는다.
- **두 밸류에이션 모형이 공존한다** — 고든(`intrinsic.ts`)과 기간 종료 배수
  (`expectedReturn.ts`). 성장률·요구수익률의 **의미가 다르므로** 컬럼을 섞지 말 것
  (`growth_rate` vs `er_expected_growth`).
- **환율은 두 종류다** — "얼마 냈나"(`events.fx_rate`)와 "그때 얼마짜리였나"(시점 조회).
  `fx-accuracy-spec-v1.md` §1.
- **`prices.ts` → `fx.ts` 단방향** — 반대는 순환. 비슷한 파싱 코드를 합치려 들지 말 것.

---

## 2. 배경 문서 — 비전·역사(현행 구현과 다를 수 있음)

| 문서 | 성격 |
|---|---|
| `rational-capital-prd-v0.7.md` | 원래 비전. 상단 경고대로 무효 항목 다수 |
| `design-system-v2.md` · `design-strategy-v1.md` | UI 규칙 |
| `ttm-valuation-plan-v1.md` | TTM 펀더멘털 파이프라인 계획 |
| `lookthrough-financials-spec-v1.md` | 투시 재무제표(현재 legacy 격리) |
| `gamification-honest-roman-v1.md` | 랭킹·스트릭(현재 legacy 격리) |
| `etf-index-spec.md` · `toss-migration-spec-v1.md` · `api-design-spec-v1.md` | 영역별 |
| `user-rails-v1.md` · `performance-plan.md` · `roadmap-status.md` | 여정·성능·로드맵 |

`specs/` 디렉토리에는 기능 단위 작업 스펙(001~040)이 있다.

---

## 3. 지금 legacy 로 내려간 것

라우트·코드·DB 는 **살아 있고 링크만 끊겼다**(`enuf-core-simplification-spec-v1.1.md` §5.1).
물리 삭제는 Phase 6 — 의존성 분석 후.

```text
/ranking  /style  /lookthrough  /etf-portfolio  /friction
/report   /annual-report  /timeline  /index/*  /growth  /import
```

- 숨긴 코드의 **런타임 비용은 0** 이다(§5.2 실사). 유일한 예외였던 랭킹 백그라운드
  갱신은 `src/lib/config/legacy.ts` 의 스위치로 껐다.
- `/growth` 는 `CompanyTierCard` 등의 **유일한 사용처**라 라우트를 지우면 컴포넌트가
  함께 죽는다(§7.4.4).

---

## 4. 알려진 한계

| 항목 | 내용 |
|---|---|
| 실현손익 이력 | 이미 판 종목은 스냅샷에 없다. `/import` 직접 방문으로만 복원 |
| `toNativeEps` 오차 | 적재 시점 환율로 `₩` 환산된 값을 현재 환율로 되돌린다 |
| Phase 4 · 6 | 화면 통합·물리 삭제 미착수. 급하지 않은 이유는 §5.2 · §7.4 |
