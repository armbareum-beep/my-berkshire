# 스펙 v1.1 ↔ Capital Allocator PRD v0.3 — 충돌 정리와 통합안

> 작성: 2026-08-12
> 대상 문서
> - `docs/enuf-core-simplification-spec-v1.1.md` (이하 **스펙**)
> - Capital Allocator Pivot PRD v0.3 (이하 **PRD**)
> - `docs/rational-capital-prd-v0.7.md` (이하 **구 PRD** — 현재 앱을 만든 원래 비전)

---

# 0. 세 문서의 관계

```text
구 PRD v0.7   "개인 지주회사 OS"      → 지금의 기능 과잉을 만든 원본 비전
    ↓
스펙 v1.1     "덜어내기"              → 노출을 줄이고 Allocate 를 중심축으로
PRD v0.3      "축을 갈아끼우기"        → Allocator 자체가 제품. 밸류에이션이 핵심
```

스펙과 PRD는 **문제 진단이 같다.**

| | 스펙 | PRD |
|---|---|---|
| 진단 | "기능이 너무 많다" | "모든 기능이 메인처럼 보인다" |
| DB | 초기화 금지 | 초기화 금지 |
| 기존 엔진 | 보존 — 계산 엔진 | 보존 — "Allocator의 회계 엔진" |
| 삭제 | 하지 않음. 숨김/재배치 | 하지 않음. 3층 재배치 |

**차이는 "그래서 무엇을 메인으로 세우는가"에서 갈린다.**

---

# 1. 완전히 합의하는 것 — 즉시 구현 가능

두 문서 모두 다음을 요구한다. 여기엔 판단이 필요 없다.

| 항목 | 스펙 | PRD |
|---|---|---|
| 목표비중(Target Weight) | §14 | §3.2 |
| Soft Cap = 목표 × 1.25 | §14 | §3.2 |
| Hard Cap = 목표 × 1.50 | §14 | §3.2 |
| 상승으로 커진 승자는 팔지 않는다 | §14.2 | §7 |
| 물타기로 Hard Cap 도달 시 매수 중단 | §14.1 | §7 |
| buy-only 리밸런싱(자동 매도 없음) | §14.2 | §7 |
| 신규 자금 배분 계산 | §15 | §8 |
| 기회가 없으면 현금을 남긴다 | §16.2 | §8 |
| 투자 가능 현금 개념 분리 | §16.4 | §8 |
| Ranking(게이미피케이션)·Style·Look-through·Friction·Report·Timeline 숨김 | §5 | §14 |
| 종목 발굴·스크리너 만들지 않음 | §5 | §14 |

> **캡 규칙과 신규자금 배분은 두 문서가 글자 단위로 일치한다.** 이 부분은 지금 만들면 된다.

---

# 2. 정면 충돌 — 결정이 필요한 것

## 2.1 밸류에이션 — **PRD 쪽으로 채택** (2026-08-13)

> 결론부터: **PRD 를 따랐다.** 기대수익률 모형을 구현하고 `/allocate` 배분에 연결했다.
> 상세 스펙은 `docs/expected-return-spec-v1.md`.
>
> 스펙 §12 의 "v1 에서는 밸류에이션을 넣지 않는다"는 **무효**다. 다만 §15.3 의
> `attractiveness` 훅 설계 덕분에 **가정을 넣지 않은 종목은 여전히 순수 비중 기반**으로
> 동작한다 — 두 문서의 동작이 한 화면에 공존한다.

아래는 결정 당시의 충돌 기록(보존).

### 원래 충돌

### 스펙 §12

> v1에서는 **밸류에이션을 넣지 않는다.**
> 제거: 예상 EPS CAGR · Terminal PER · DCF · 요구수익률 기반 적정가 · 안전마진

### PRD §4, §5, §18

> Buy Price = Current EPS × (1 + CAGR)^Y × Terminal PER ÷ (1 + Required Return)^Y
> **홈 화면의 핵심 숫자는 Expected CAGR이다.**
> MVP 13개 중 7개가 밸류에이션 항목

**정반대다.** 스펙이 "복잡도를 낮추려 뺀 것"이 PRD에서는 "제품의 차별점"이다.

PRD §19가 그 차이를 직접 말한다.

```text
일반 앱:        "PLTR이 오늘 5% 하락했습니다."
Rational Capital: "요구수익률 12% 기준 매수가는 $149. 현재 $158이므로 기다립니다."
```

이 경험은 밸류에이션 없이는 만들 수 없다.

### 배분 우선순위도 달라진다

| | 1순위 정렬 기준 | 캡의 역할 |
|---|---|---|
| 스펙 §15 | **목표비중 부족분(gap)** | gap 을 깎는 계수 |
| PRD §6 | **Expected CAGR** | CAGR 순위에서 탈락시키는 필터 |

같은 포트폴리오에 같은 돈을 넣어도 **결과가 다르다.**

---

## 2.2 홈 화면

| | 홈 | 첫 화면의 큰 숫자 |
|---|---|---|
| 스펙 §8 | My Berkshire (대차대조표) | **순자산** ₩3.24B + XIRR |
| PRD §11 | Allocator | **Available Capital** + 오늘의 1순위 종목 |

## 2.3 XIRR의 위치

| | |
|---|---|
| 스펙 §8.1 | My Berkshire Hero 에 노출 (`Since Inception XIRR 14.8%`) |
| PRD §13 | **TWR·XIRR·CAGR·벤치마크·MDD 전부 Advanced 로 후퇴** |

> ⚠️ 이 충돌은 이미 작업한 코드에 영향이 있다. 다만 **온보딩 스냅샷 작업(PR #56)은 어느 쪽에서도 유효하다.**
> 스펙에서는 "XIRR에 매수일이 불필요"해서, PRD에서는 "XIRR 자체가 뒤로 가서" 매수일을 물을 이유가 없다.

## 2.4 자산 범위

| | 부동산·부채·실물자산 |
|---|---|
| 스펙 §3.1 | **포함.** "개인 지주회사 전체 대차대조표"가 제품 정의 |
| PRD | **언급 없음.** 상장주식 자본배분만 다룸 |

## 2.5 데이터 모델

| | |
|---|---|
| 스펙 §13.2 | 신규 테이블 없음. `holdings.target_weights` jsonb 재사용 |
| PRD §15 | 신규 5개 — `investment_universe` · `valuation_assumptions` · `allocation_rules` · `valuation_snapshots` · `allocation_recommendations` |

---

# 3. 코드베이스 실사 — PRD 기준 무엇이 이미 있는가

PRD §18 의 MVP 13개를 현재 코드와 대조했다.

| # | MVP 항목 | 상태 | 근거 |
|---|---|---|---|
| 1 | Approved Universe | **부분** — `watchlist` 테이블 존재, status(APPROVED/WATCH) 없음 | `src/lib/watchlist.ts` |
| 2 | 현재 가격 | **있음** | `src/lib/finance/prices.ts`, KIS/Yahoo |
| 3 | EPS / FCF | **있음** — TTM 파이프라인까지 | `fundamentals_cache`, `docs/ttm-valuation-plan-v1.md` |
| 4 | Expected Growth | **부분** — `valuation_assumptions.growth_rate` 는 고든 영구성장률(g<1), EPS CAGR 아님 | `20260616260000_per_year_fundamentals.sql` |
| 5 | Terminal Multiple | **없음** — 컬럼 자체가 없다 | 위 마이그레이션 |
| 6 | Required Return | **있음** — `valuation_assumptions.discount_rate` | 위 마이그레이션 |
| 7 | Dynamic Buy Price | **없음** — 현재는 고든식 `오너이익/(r−g)` | `src/lib/finance/intrinsic.ts` |
| 8 | Expected CAGR | **없음** | — |
| 9 | Current Weight | **있음** | `src/lib/dashboard.ts` |
| 10 | Target Weight | **있음** (2층 구조) | `src/app/rebalance/page.tsx:39` |
| 11 | Soft / Hard Cap | **없음** | — |
| 12 | Buy Ranking | **없음** | — |
| 13 | 신규 현금 배분 | **있음** — 부족분 비례 배분 엔진 | `src/lib/rebalance.ts:26` |

## 요약

```text
있음:      2 · 3 · 6 · 9 · 10 · 13     (6개)
부분:      1 · 4                        (2개)
없어야 할 것: 5 · 7 · 8 · 11 · 12       (5개)
```

**PRD MVP의 절반 가까이가 이미 구현되어 있다.** 없는 5개 중 4개(5·7·8·12)가 밸류에이션 계열이고, 나머지 1개(11 캡)는 두 문서가 합의하는 항목이다.

### 중요한 차이 — 밸류에이션 모델이 다르다

현재 `intrinsic.ts` 는 **고든 성장 모형**이다.

```text
내재가치 = 오너이익 / (할인율 − 성장률)      ← 영구 성장, 기간 개념 없음
```

PRD 는 **기간 종료 배수 모형**이다.

```text
Buy Price = EPS × (1+g)^Y × TerminalPER ÷ (1+RR)^Y   ← Y년 후 매도 가정
```

`growth_rate` 컬럼의 **의미가 다르다**(영구 g vs 향후 Y년 EPS CAGR). 재사용하면 조용히 틀린 숫자가 나온다.
PRD 로 간다면 컬럼을 재사용하지 말고 **새 컬럼으로 분리**해야 한다.

---

# 4. 통합안 — 무엇을 먼저 만들 것인가

두 문서의 충돌은 **"동시에 결정할 필요가 없다"**는 점에서 풀린다.

## 4.1 핵심 관찰

PRD §6 의 배분 로직은 두 단계다.

```text
1) Approved Universe 를 Expected CAGR 로 정렬     ← 밸류에이션 필요
2) 비중 필터(Target / Soft / Hard)로 걸러냄        ← 두 문서 합의
```

스펙 §15 의 배분 로직도 같은 뼈대다.

```text
1) 목표비중 부족분(gap)으로 우선순위               ← 밸류에이션 불필요
2) 비중 필터(Target / Soft / Hard)로 걸러냄        ← 두 문서 합의
```

> **2단계는 동일하다. 1단계의 정렬 신호만 다르다.**

## 4.2 제안 — 정렬 신호를 교체 가능하게 만든다

```ts
score_i = gap_i × weightPriority_i × attractiveness_i
```

| 항목 | 출처 | 밸류에이션 없을 때 |
|---|---|---|
| `gap_i` | 목표비중 부족분 (스펙 §15) | 그대로 |
| `weightPriority_i` | Soft/Hard Cap 계수 (합의) | 그대로 |
| `attractiveness_i` | Expected CAGR 기반 (PRD §5) | **1.0 (중립)** |

`attractiveness` 를 종목별 옵션으로 두면:

- 가정을 입력하지 않은 종목 → 스펙의 동작(비중 기반 배분)
- 가정을 입력한 종목 → PRD의 동작(기대수익률 반영)
- **같은 화면에서 섞여도 계산이 성립한다**

밸류에이션은 "켜고 끄는 레이어"가 되고, 어느 문서를 최종 채택하든 이 엔진은 버려지지 않는다.

## 4.3 홈 화면 — 결정됨 (2026-08-12)

통합안이 미루지 못하는 유일한 결정이었다.

> **홈은 자산(대차대조표)이다.** PRD 의 "Allocator 를 홈으로" 는 채택하지 않는다.

따라 오는 것들:

| 항목 | 결정 |
|---|---|
| 홈 | 자산 — 순자산·보유·현금·부동산·부채 (스펙 §8) |
| Allocate | 홈이 아닌 **두 번째 탭** (현행 구조 유지) |
| XIRR | 홈에 남긴다 (스펙 §8.1). PRD §13 의 Advanced 후퇴는 미채택 |
| 자산 범위 | 부동산·부채 **포함** (스펙 §3.1). PRD 의 상장주식 한정은 미채택 |
| 밸류에이션 | 여전히 미결 — `attractiveness` 훅으로 계속 분리 |

즉 **§2.2 · §2.3 · §2.4 충돌은 스펙 쪽으로 해소**됐다.

## 4.4 최종 상태 (2026-08-13)

| # | 충돌 | 결론 |
|---|---|---|
| §2.1 | 밸류에이션 | **PRD 채택** — 기대수익률 구현 + `attractiveness` 훅 |
| §2.2 | 홈 화면 | 스펙 — 자산(대차대조표) |
| §2.3 | XIRR 위치 | 스펙 — 홈에 존치 |
| §2.4 | 자산 범위 | 스펙 — 부동산·부채 포함 |
| §2.5 | 데이터 모델 | 절충 — 새 테이블 0개, `valuation_assumptions` 에 `er_*` 컬럼만 추가 |

**다섯 충돌이 모두 정리됐다.** 이 문서는 이제 의사결정 기록으로만 남는다.

---

# 5. 권고 순서

## 즉시 (합의 구간만)
1. **`/allocate` 신설** — 평면 목표비중 + Soft/Hard Cap + 신규자금 배분
   - `src/lib/rebalance.ts:26` 재사용, `attractiveness` 훅을 비워둔 채 1.0 고정
   - PRD MVP 11·12·13 이 여기서 채워진다
2. `holdings.target_weights` 에 cap 오버라이드 저장 (스펙 §13.2)

## 홈 결정 후
3. 홈 화면 확정 → My Berkshire 통합(스펙 Phase 4) 또는 Allocator 홈(PRD Phase 2)

## 밸류에이션 채택 시에만
4. `valuation_assumptions` 에 `terminal_multiple` · `holding_years` · `base_metric` · `expected_eps_cagr` 추가
   - 기존 `growth_rate`(고든 영구성장률)와 **의미가 다르므로 별도 컬럼**
5. Dynamic Buy Price + Expected CAGR 계산 (PRD §4·§5)
6. `attractiveness` 훅에 연결 → Buy Ranking

## 하지 않을 것 (두 문서 공통)
- DB 초기화 · 기존 데이터 삭제 · 계산 엔진 폐기 · 전체 기능 동시 이전
