# Allocate 재설계 v1 — 한 화면 한 가지 일

> 작성: 2026-08-13
> 선행 문서: `enuf-core-simplification-spec-v1.1.md` §12~§17 · `spec-vs-prd-reconciliation.md` · `design-strategy-v1.md`
> 결정 사항: 목표비중 **평면 전환 + 레거시 편집 화면 은퇴** · 홈은 자산 유지(Allocate는 2번째 탭)

---

## 0. 왜 다시 하는가

사용자 피드백 세 가지: **화면이 복잡하고 산만하다 · 목표비중 설정이 어렵다 · 직관적이지 않다.**

기능을 하나씩 옳게 만들었지만 **한 화면에 계속 쌓았다.** 2026-08-13 하루에만 `/allocate` 에
내 허들 카드와 기대수익률 순위 섹션이 추가되면서 카드가 4개로 늘었다.

### 이 repo 자신의 체크리스트로 채점

`design-strategy-v1.md` §4·§7 기준:

| 기준 | 현재 `/allocate` | |
|---|---|---|
| 최상단에 가장 중요한 **단일 숫자** | 제목 + 칩 2개 | ❌ |
| **한 화면 한 가지 일** | 허들 설정 · 배분 계산 · 순위 조회 | ❌ |
| 메인 액션 **화면당 1개** | 난이도 바꾸기 / 금액 입력 / 매수 기록하기 | ❌ |
| 카피는 한국어 평서형 | BUY · BUY+ · LOW · WAIT · BLOCKED · FILLED | ❌ |

### "직관적이지 않다"의 정체

1. **원인과 결과가 같은 위계로 나란히 있다.** 설정(허들)과 계산 결과(배분·순위)가 똑같이
   생긴 카드로 쌓여 있어 무엇이 무엇을 바꾸는지 안 보인다.
2. **한 화면에 금융 용어가 10개 넘는다.** Soft/Hard Cap · 기대 CAGR · 요구수익률 · 한도 ·
   매수가 + 영어 상태 배지 5종.
3. **원인을 고치려면 화면을 나가야 한다.** 배분이 마음에 안 들 때 바꿔야 할 것은
   목표비중인데 그건 다른 화면(그것도 레거시 2층 구조)에 있다.

### 뿌리 원인 — 스펙에 있는데 안 만든 것

`enuf-core-simplification-spec-v1.1.md` §13.2 는 이미 결론을 냈다.

> Allocate는 **평면 목표비중**만 쓴다. 환산은 **읽기 시점 1회**, **저장은 평면으로 한다.**
> 기존 `holdings.target_weights` jsonb 를 `{"META": {"target": 0.15}}` 형태로 재사용한다.

현재 구현은 **읽기 환산(`flattenTargets`)만 있고 쓰기가 없다.** 그래서 목표비중을 고치려면
레거시 2층 화면(`/rebalance` 의 유형 목표 × 유형 내 종목)으로 나가야 한다. 사용자가 말한
"예전 버전인데 비중설정하는거"가 정확히 이것이다.

같이 빠진 것: **투자 가능 현금**(§16.4) · **현금 목표비중 옵션**(§16.2).

---

## 1. 목표 상태

```text
┌ /allocate ─────────────────┐   보기 전용. 한 가지 일: "지금 어디에 넣을까"
│  투자 가능 현금             │
│  ₩50,000,000               │   ← 히어로 숫자
│                            │
│  오늘의 1순위  META         │
│  기대 17.2% · 7% → 10%      │
│  [ 자본 배분하기 ]          │   ← 단일 메인 액션
│  ─────────────────────     │
│  1 META   17.2%  7%→10%    │
│  2 BRK.B  13.8%  9%→10%    │
│  3 NVDA   15.5%  한도 초과  │
└────────────────────────────┘
        │                    ╲
        ▼                     ╲
┌ /allocate/plan ─────┐    ┌ /allocate/settings ──────┐
│ 금액 → 결과 → 실행   │    │ 목표비중(평면) · 후보     │
│ 탭바 없음(레일)      │    │ 허들 · 투자 가능 현금     │
└─────────────────────┘    └──────────────────────────┘
```

화면 수는 그대로(3개)지만 **역할이 갈린다** — 보기 / 실행 / 설정.

---

## 2. 단계

### Phase 1 — 평면 목표비중 (뿌리)

**신규 `src/lib/targetWeights.ts`** (순수 함수 + 테스트). 새 테이블·마이그레이션 없음.

- `readTargets(holding)` — 저장 형식 둘 다 지원.
  - 평면(`{"META":{"target":0.15}}`) 이면 그대로.
  - 레거시(숫자 맵 + `category_targets`)면 기존 `flattenTargets`(`src/lib/allocate.ts:186`)로
    **읽기 시점 1회 환산**. 저장은 건드리지 않는다(사용자가 저장할 때 평면으로 넘어간다).
- `writeTargets(map)` — 평면으로 직렬화. `soft/hardCap` 은 기본 배수(1.25/1.50)와 다를 때만 저장.
- `normalize(map)` — 합 1 정규화. 기존 `flattenTargets` 의 정규화 규칙을 재사용.

**서버 액션** `src/app/allocate/actions.ts` 에 `setTargetWeight(symbol, weight)` 추가.
`holdings.category_targets` 는 **삭제하지 않는다** — `/allocation/[tag]` 조회 화면이 쓴다.

### Phase 2 — `/allocate` 재설계

`src/app/allocate/page.tsx` · `src/components/allocate/AllocatePanel.tsx`

- **히어로**: 투자 가능 현금(§16.4). `holdings.investable_cash` 컬럼 신규(마이그레이션 1건).
  미지정이면 보유 현금 전액으로 폴백.
- **오늘의 1순위 카드** + 단일 메인 액션 `[자본 배분하기]` → `/allocate/plan`.
- **랭킹 리스트**: `design-strategy-v1.md` §4-1 종목 행 패턴(원형 로고 / 이름·티커 / 우측 숫자).
- **이 화면에서 제거**: `HurdleCard`(→ settings), 투자금 입력·추천 배분(→ plan), 긴 각주.
- **용어 한국어화** (`STATUS_META` 재작성):

| 현재 | 바꿀 것 |
|---|---|
| BUY | 살 수 있음 |
| BUY+ (STRETCH) | 더 살 수 있음 |
| LOW (TRIM_PRIORITY) | 우선순위 낮음 |
| WAIT | 기다림 |
| BLOCKED | 한도 초과 |
| FILLED | 목표 채움 |

엔진의 `AllocateStatus` 타입 값은 바꾸지 않는다 — 표시 문자열만 바꾼다.

### Phase 3 — `/allocate/plan` (배분 여정)

신규 `src/app/allocate/plan/page.tsx`. **탭바 없음**(design-strategy §4 레일 원칙).

금액 입력 → 결과 → `[매수 기록하기]`. 계산은 기존 `planAllocation`(`src/lib/allocate.ts:124`)
을 그대로 쓴다 — **엔진은 손대지 않는다.**

결과 각 줄에 **"왜 이 금액인가"** 한 줄을 붙인다(예: "목표 10%까지 3%p 부족").
지금 각주로 밀려 있던 설명을 해당 줄로 옮기는 것.

### Phase 4 — `/allocate/settings` (설정 한 곳)

기존 `/allocate/universe` 를 확장·흡수. 한 화면에 네 가지를 탭이 아니라 섹션으로:

1. **목표비중** — 종목당 한 줄, 숫자 하나. 합계와 잔여를 상단에 고정 표시.
2. **후보** — 기존 `UniversePanel` 의 산업별 토글 그대로 재사용.
3. **내 허들** — 기존 `HurdleCard` 이동.
4. **투자 가능 현금** — §16.4.

### Phase 5 — 레거시 편집 은퇴

- `/rebalance` 의 **종목별 편집**(`SleeveRebalanceEditor` 2층 입력)을 은퇴하고
  `/allocate/settings` 로 안내.
- `/rebalance/[tag]`(국가별·산업별 목표) 도 같이 은퇴 — 평면 전환과 충돌한다.
- **`/allocation/[tag]` 는 유지한다.** 이건 편집이 아니라 **현재 배분 조회(도넛)** 라 중복이 아니다.
- `BottomTabBar` 의 `match` 배열에서 `/rebalance` 제거.

---

## 3. 손대지 않는 것

- 배분 엔진 `src/lib/allocate.ts` 의 계산 로직(캡·상한·매력도). 표시 문자열만 바뀐다.
- `src/lib/finance/expectedReturn.ts` · `hurdle.ts` · `universe.ts` — 전부 재사용.
- 거래 원장 · 계좌 · 홈(자산) 화면.
- DB 데이터. 마이그레이션은 `holdings.investable_cash` 컬럼 1건뿐.

---

## 4. 검증

- **단위**: `targetWeights.test.ts` 신규(레거시 2층 → 평면 환산, 정규화, 캡 기본값 생략).
  기존 423개 테스트는 그대로 통과해야 한다(엔진 미변경).
- **정적**: `npx tsc --noEmit` · `npx eslint src` · `npx next build`.
- **수동 시나리오** (프리뷰에서):
  1. 목표비중이 레거시 2층으로만 있는 상태에서 `/allocate` 가 예전과 같은 배분을 내는가(환산 호환).
  2. `/allocate/settings` 에서 종목 목표비중을 바꾸면 평면으로 저장되고 `/allocate` 랭킹이 즉시 바뀌는가.
  3. 투자 가능 현금을 지정하면 히어로 숫자와 `/allocate/plan` 기본값에 반영되는가.
  4. 화면당 카드 수와 메인 액션 수를 §7 체크리스트로 재채점.
- **마이그레이션**: 적용 전 `information_schema` 로 대상 프로젝트(`cfzairdystqguatvcggc`) 확인,
  적용 후 컬럼·제약 검증. 사용자 확인 후 적용(CLAUDE.md).

---

## 5. 순서와 쪼개기

Phase 1 → 2 → 3 → 4 → 5 순서로 **PR 을 나눈다.** Phase 1 은 화면 변화가 없어 단독 머지 가능하고,
Phase 5 는 앞의 넷이 다 있어야 안전하다. 한 PR 에 몰면 이번처럼 "쌓기"가 반복된다.
