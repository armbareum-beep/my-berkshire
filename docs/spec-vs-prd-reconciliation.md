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

## 2.1 밸류에이션 (가장 큰 충돌)

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
| 1 | Approved Universe | ~~부분~~ → **있음** (2026-08-13) — `watchlist.status` 추가, `/allocate/universe` | `src/lib/universe.ts` |
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

즉 **§2.2 · §2.3 · §2.4 충돌은 스펙 쪽으로 해소**됐고, 남은 충돌은 §2.1(밸류에이션)과
§2.5(데이터 모델)뿐이다. 이 둘은 훅 덕분에 지금 결정하지 않아도 된다.

---

# 5. 권고 순서

## 즉시 (합의 구간만)
1. **`/allocate` 신설** — 평면 목표비중 + Soft/Hard Cap + 신규자금 배분
   - `src/lib/rebalance.ts:26` 재사용, `attractiveness` 훅을 비워둔 채 1.0 고정
   - PRD MVP 11·12·13 이 여기서 채워진다
2. `holdings.target_weights` 에 cap 오버라이드 저장 (스펙 §13.2)

## 홈 결정 후
3. 홈 화면 확정 → My Berkshire 통합(스펙 Phase 4) 또는 Allocator 홈(PRD Phase 2)

## 밸류에이션 — 채택됨 (2026-08-13)
4. ✅ `valuation_assumptions` 에 `er_*` 컬럼 추가 (`20260813010000_expected_return_assumptions.sql`)
   - 기존 `growth_rate`(고든 영구성장률)와 **의미가 다르므로 별도 컬럼**
5. ✅ Dynamic Buy Price + Expected CAGR 계산 (PRD §4·§5) — `src/lib/finance/expectedReturn.ts`
6. ✅ `attractiveness` 훅 연결 + Buy Ranking (PRD §6.1·§11) — `/allocate`

### 6.1 밸류에이션이 비중을 움직이는 두 경로

§4.2 의 통합안은 `attractiveness` 하나만 열어뒀는데, 그것만으로는 **순서**만 바뀐다.
매수 상한이 늘 목표비중이라 기대수익률이 아무리 높아도 목표비중을 넘겨 살 수 없었다.

그래서 PRD §6.2("목표비중 초과 시 요구수익률 12% → 15%")를 상한 규칙으로 구현했다.

| 경로 | 무엇을 바꾸나 | 어디에 |
|---|---|---|
| `attractiveness` | 후보 사이의 배분 **순서**(가중치) | `expectedReturn.ts:attractivenessFromCagr` |
| 매수 상한(`ceiling`) | 목표비중 → Soft Cap 까지 **한도 확장** | `allocate.ts:ceilingOf` |

```text
기대 CAGR < 요구수익률          → 후보 제외 (attractiveness 0)
요구수익률 ~ 요구+3%p           → 목표비중까지만 매수
요구+3%p 이상                   → Soft Cap 까지 매수 (STRETCH)
Soft Cap ~ Hard Cap             → 감액 (기존 규칙 유지)
Hard Cap 이상                   → 차단. 밸류에이션으로도 뚫리지 않는다
```

가정을 넣지 않은 종목은 상한이 목표비중 그대로라 **스펙 §15 의 동작이 보존된다.**

### 6.2 요구수익률 = 난이도 (게이미피케이션)

요구수익률을 "난이도 설정"으로 프레이밍한다(`src/lib/hurdle.ts`, `/allocate` 의 **내 허들**).
관대 8% / 표준 12% / 엄격 15% + 직접 입력. 올리면 통과 종목이 줄고 현금이 늘어난다.

`docs/gamification-honest-roman-v1.md` §2 의 축하 매트릭스 통과 여부:

| | 판정 |
|---|---|
| 허들을 **정하는 것** | ✅ 결정(통제 가능) — 축하·연출 대상 |
| 허들을 못 넘겨 **안 사는 것** | ✅ 인내(통제 가능) |
| 허들을 **넘긴 종목이 생긴 것** | ❌ 주가 하락의 결과일 수 있음 — 시장발이라 축하하지 않는다 |

그래서 `hurdle.ts` 는 난이도를 **표시만** 하고 어떤 축하 신호도 만들지 않는다.
통과 현황("N종목 중 M종목 통과")도 0이면 0으로 정직하게 보여준다.

우선순위는 **종목별 > 전사 기본값 > 코드 기본값 12%** — 전사 설정이 개별 판단을 덮지 않는다.

### 6.3 Approved Universe — 후보를 사람이 고른다 (PRD §3.1)

그동안 자본배분 후보는 **보유 종목으로 고정**이었다. 아직 한 주도 없는 기업은 후보에
넣을 수 없었고(= 첫 매수를 계획할 수 없었고), 정리하기로 한 보유 종목을 뺄 수도 없었다.
둘 다 "기업 선택은 인간의 영역"이라는 PRD 전제와 어긋난다.

신규 테이블(`investment_universe`) 대신 기존 `watchlist` 에 `status` 를 얹었다(스펙 §13.2).

```text
보유 O · 행 없음   → APPROVED   (지금까지의 동작 보존)
보유 O · WATCH     → 후보 제외   (명시적으로 뺀 것)
보유 X · APPROVED  → 후보 포함   (아직 안 샀지만 사고 싶은 기업)
보유 X · 행 없음   → 후보 아님
```

`/allocate/universe` 에서 **산업(섹터)별로 묶어** 고른다 — 어디에 쏠려 있는지 사람이 보고
판단하라는 것이지, 앱이 기업의 질을 평가하는 게 아니다. 미보유 후보도 `/rebalance` 에
평가액 0 으로 나타나 목표비중을 정할 수 있다(목표비중이 없으면 후보로 넣은 의미가 없다).

## 하지 않을 것 (두 문서 공통)
- DB 초기화 · 기존 데이터 삭제 · 계산 엔진 폐기 · 전체 기능 동시 이전
