# ENUF / My Berkshire — Core Simplification & Allocate Refactor Spec v1.1

> 목적: 현재 구현된 ENUF를 **개인 지주회사 장부 + 자본배분 도구**로 단순화한다.
> 원칙: **데이터와 계산 엔진은 최대한 보존하고, 사용자에게 노출되는 개념과 화면을 줄인다.**
> 기준 시점: 2026-08-13
> 이전 버전: v1.0 (2026-08-13)

---

# 0. v1.1 변경 요약

v1.0의 방향은 유지한다. 아래 7가지만 **실제 코드베이스와 대조해 정정**했다.

| # | v1.0 | v1.1 | 이유 |
|---|---|---|---|
| A | §36에 새 `planInvestment` 의사코드 | **기존 `src/lib/rebalance.ts:26` 재사용 + cap 확장** | 기존 구현이 더 정확하다(§17-A) |
| B | soft_cap / hard_cap이 사실상 동일 동작 | **3단계로 분리** (soft=감액, hard=제외) | v1.0 코드는 hard_cap이 죽은 파라미터 |
| C | 목표비중 = 평면 1단계 | **현행 2단계 구조 명시 + 평면 환산 규칙** | 현행은 `category_targets` × `target_weights` 2층 |
| D | 신규 `target_allocations` 테이블 | **기존 `holdings.target_weights` jsonb 재사용** | 테이블 추가 불필요 |
| E | 온보딩 "매수일 필수 아님"만 서술 | **§9 스냅샷 시작 모델로 정식 규정** | 현행 온보딩이 매수일을 DEPOSIT으로 변환 중 |
| F | legacy 라우트를 `/legacy/*`로 물리 이동 | **라우트 유지 + 링크 제거 + 플래그** | `@sheet` 인터셉트 라우트가 짝으로 존재 |
| G | Phase 1 = My Berkshire 통합 | **Phase 1 = 하단탭 축소** | 가장 싸고 체감이 큰 변경을 먼저 |

가장 중요한 변경은 **E (§9 스냅샷 시작 모델)** 이다. 사용자 입력 노동을 가장 크게 줄인다.

---

# 1. 최종 제품 한 줄

> **내 자산을 하나의 지주회사처럼 관리하고, 새 돈이 생길 때 어디에 얼마나 투자할지 알려주는 앱.**

제품이 답해야 하는 질문은 딱 세 개다.

1. **나는 지금 무엇을 얼마나 가지고 있는가?**
2. **내 보유 기업에 중요한 변화가 생겼는가?**
3. **새 돈이 생기면 무엇을 얼마나 사야 하는가?**

이 세 질문에 직접 답하지 않는 기능은 메인에서 제거 · 하위 상세로 이동 · Legacy로 격리 · 삭제 후보로 분류한다.

---

# 2. 제품 구조

하단 네비게이션은 **2개 탭 + 중앙 기록 버튼**으로 단순화한다.

```text
[ My Berkshire ]     [ + ]     [ Allocate ]
```

현행(`src/components/dashboard/BottomTabBar.tsx:18`)은 5개다.

```text
홈 / 검색 / + 기록 / 랭킹 / 마이 버크셔
```

- `홈`(`/dashboard`) + `마이 버크셔`(`/growth`) → **My Berkshire** 하나로 병합
- `검색` → 제거 (기록 위저드 내부 검색으로 흡수, §31 주의사항 참조)
- `랭킹` → Legacy
- `+ 기록` → 유지

---

# 3. 핵심 철학

## 3.1 My Berkshire는 전체 자산이다

개별주 · ETF · 투자용 현금 · 일반 현금 · 부동산 · 기타 실물자산 · 사업자산 · 대출/부채를 모두 포함한다.
별도의 `Wealth` 메인 메뉴를 만들지 않는다.

> **My Berkshire = 사용자의 개인 지주회사 전체 대차대조표**

기존 `/networth`, `/real-estate`, 계좌, 현금, 부채는 My Berkshire의 하위 기능으로 재배치한다.

## 3.2 Allocate는 별도의 장부가 아니다

Allocate는 **My Berkshire의 기존 데이터를 읽어서 계산만 한다.** 별도의 보유수량·계좌·현금 장부를 만들지 않는다.

Single Source of Truth는 계속 기존 `events` 원장이다.

```text
events → positions / cash / assets / liabilities → My Berkshire → Allocate
```

---

# 4. 반드시 KEEP — Core Data / Engine

### 원장
`BUY` · `SELL` · `DIVIDEND` · `DEPOSIT` · `WITHDRAWAL` · `EXCHANGE` — 기존 `events` 단일 원장 구조 유지.

### 주식/ETF
종목 · 수량 · 평균매입가 · 계좌 · 평가액 · 실현손익 · 미실현손익 · 종목별 단순 수익률.

### 계좌
일반 · 해외 · ISA · 연금저축 · IRP · 기타 기존 타입. 계좌별 매수/매도 기록 유지.

### 수익률 엔진
`src/lib/finance/xirr.ts` 를 그대로 유지한다. **엔진은 수정하지 않는다** — §9의 변경은 전부 *입력 레이어*에서 일어난다.

### 실물자산 / 부채 / 공시 / 시세
부동산 · 수기자산 · 취득 · 매도 · 평가액 · 임대수익 / 대출잔액 · 금리 · 연결자산 · 상환 / DART · SEC EDGAR · 읽음상태 · 중요도 / 주식 · ETF · 환율.

---

# 5. LEGACY / HIDDEN

아래 기능은 **코드를 즉시 삭제하지 않는다.** v1 메인 제품에서 노출만 하지 않는다.

Ranking · Style · Look-through Financials · ETF Look-through · Friction · CFO Report · Annual Report · Timeline · 기업 등급 · 복리 스트릭 · 규율 점수 · 지수 상세 · 버핏지수 · 복잡한 벤치마크 분석 · 사업부 기여도 분석 · 내재가치 DNA · 오너이익 · RONTE / RNI / RMC · 고급 재무 플래그 · 과도한 차트 · 관심종목 발굴 · 일반 스크리너.

## 5.1 격리 방식 — v1.0에서 변경

v1.0은 `/legacy/*` 로 **물리 이동**을 제안했다. 이 코드베이스에서는 비용이 높다.

```text
src/app/@sheet/(.)lookthrough/page.tsx
src/app/@sheet/(.)style/page.tsx
src/app/@sheet/(.)report/page.tsx
src/app/@sheet/(.)index/[symbol]/page.tsx
```

legacy 대상 라우트 상당수가 **인터셉트 라우트와 짝으로 존재**한다. 이동하면 짝을 함께 옮겨야 하고 딥링크가 전부 깨진다.

### v1.1 격리 절차

1. **네비게이션·카드에서 진입 링크를 제거한다** ← 이것만으로 사용자에겐 사라진 것과 같다
2. 라우트 파일은 **그 자리에 둔다**
3. **살아 있는 백그라운드 작업이 있으면 스위치로 끈다** — `src/lib/config/legacy.ts`
4. 물리 이동·삭제는 **Phase 6**에서 의존성 분석과 함께 수행한다

## 5.2 "숨김"의 실제 비용 — 실사 (2026-08-12)

링크만 끊으면 정말 비용이 0인지 확인했다. **대부분 그렇지만 하나는 아니었다.**

| 기능 | 링크 끊은 뒤 상태 | 비용 |
|---|---|---|
| Timeline(연혁) | 순수 뷰. 데이터는 `computeDashboard` 가 이벤트에서 동기 계산 | **0** |
| Style / 규율 점수 | `/style` · `/growth` 방문 시에만 스냅샷 저장 → 방문 자체가 없음 | **0** |
| Look-through · CFO 리포트 · Annual Report | 해당 라우트 방문 시에만 계산 | **0** |
| 라우트 번들 | Next.js 라우트 단위 코드 스플리팅 | 홈 번들에 **영향 없음** |
| **Ranking** | **홈 방문마다 백그라운드 갱신이 계속 돌고 있었다** | **있음 → 껐다** |

### Ranking 만 살아 있던 이유

`src/app/dashboard/page.tsx` 가 홈 방문 때마다 `after()` 안에서 다음을 수행했다.

```text
loadDrawdownEpisodes → buildPublicMilestones → computeCompositionPct
→ computeHoldingsPct → upsertRankingScore(ranking_scores 쓰기)
```

아무도 볼 수 없는 리더보드를 위한 계산과 DB 쓰기다.
`holding.listed_at` 게이트가 있어 상장 선언 유저에게만 돌았고, `after()` 라 응답을
막지는 않았지만 서버 작업과 쓰기는 실재했다.

> 참고: 벤치마크(PME) 조회는 이 블록과 무관하다. 성과 카드(`PerformanceStreamed`)가
> 같은 프라미스를 쓰므로 랭킹을 꺼도 계속 돈다.

## 5.3 증권사 파일 가져오기(`/import`) — 홈에서 내림 (2026-08-13)

`/import` 는 증권사 거래내역 파일로 **과거 매매를 종목 단위로 복원**하는 기능이다
(`reconstructPosition` — "종목 정밀도 복원"). 규모는 화면·컴포넌트 약 1,400줄 + 액션.

### 왜 내리는가

§9 에서 확인한 대로 **전체 XIRR 은 외부 현금흐름만으로 결정된다.**

```text
시작 평가액 + 입금/출금 날짜·금액 + 현재 NAV  →  XIRR
```

개별 매매를 복원해도 이 값은 **바뀌지 않는다.** 그리고 평단가는 §7 의 스냅샷 온보딩에서
사용자가 직접 입력받으므로, 복원의 주 목적(평단가 교체)도 이미 다른 경로로 충족된다.

> 즉 1,400줄짜리 복원 흐름이 답하는 질문을, 숫자 몇 개 입력이 이미 답하고 있다.

### 무엇을 잃는가 (정직하게)

| 항목 | 영향 |
|---|---|
| 전체 XIRR | **없음** — 외부 현금흐름만 쓴다 |
| 평단가·평가손익 | **없음** — 스냅샷에서 직접 입력 |
| **이미 판 종목의 실현손익** | **잃는다** — 스냅샷은 현재 보유만 담는다 |
| 시작일 이전 자산 추이 | 잃는다 (§9.6 과 동일) |

실현손익 이력이 필요한 사용자는 `/import` 를 직접 방문하면 된다 — 라우트는 살아 있다.

### 처리

§5.1 격리 방식 그대로. **홈의 진입 카드만 제거하고 라우트·코드·액션은 남긴다.**
(`/ranking` 의 IpoCard 에도 링크가 있지만 랭킹 자체가 legacy 라 함께 가려진다.)

### 단, 과거 입출금 입력은 자리를 마련한다

가져오기를 내린다고 **과거 복원 자체를 막으면 안 된다.** XIRR 이 필요로 하는 유일한
과거 데이터가 입출금이기 때문이다(§9.1).

입력 기능은 이미 있다 — `+ 기록 → 입금/출금` 은 장부 모드에서 날짜를 지정할 수 있다.
없던 것은 **"여기서 하면 된다"는 안내**였다. §9.7 이 지정한 자리(성과 상세)에 카드를 둔다.

```text
홈 수익률 카드  →  /returns  →  "과거 성과도 복원할 수 있어요"
                                 → 과거 입금 넣기 / 과거 출금 넣기
```

카드는 현재 추적 시작일을 보여주고, **입출금 날짜·금액만 있으면 되고 매매 내역은
필요 없다**는 점을 명시한다. 설정이 아니라 성과 화면에 두는 이유는 맥락이다 —
자기 XIRR 을 보는 순간이 "이 숫자를 더 앞당기고 싶다"고 느끼는 순간이다.

---

### 결정 — 끈다 (부활 미정 아님, 부활 안 할 수도 있음)

```ts
// src/lib/config/legacy.ts
export const LEGACY_RANKING_SYNC: boolean = false;
```

끈 뒤에도 **`ranking_scores` 테이블과 기존 행은 그대로 둔다**(§23 삭제 금지).
`/ranking` 을 직접 방문하면 그 페이지에서는 여전히 자기 점수를 갱신한다 —
라우트는 살려두는 격리 방식(§5.1)과 일관된다.

되돌리려면 스위치 값 하나만 바꾸면 된다.

---

# 6. 지주회사 설립 기능

## 사용자에게는 제거한다

회사명 입력 · 설립일 선언 · CEO · 지배구조 · 설립 등기 UX를 온보딩에서 제거한다.
(현행: `src/app/onboarding/OnboardingRail.tsx` 의 J1 "회사의 이름을 새기세요" 단계)

## 내부 데이터 구조는 유지한다

`holdings` 테이블은 삭제하지 않는다. 회원가입 완료 시 서버에서 자동 생성한다.

```text
holding.name       = "My Berkshire"
holding.founded_at = 성과 추적 시작일 (§9)
```

사용자가 원하면 Settings에서 이름을 변경할 수 있다.

### 이유

`holdings` 에 다음이 전부 매달려 있다.

```text
founded_at · initial_capital · initial_valuation · target_weights
category_targets · active_plan · archived_plans · mode · portfolio_revision
```

그리고 `src/lib/finance/benchmark.ts:271` 이 `holding.foundedAt` 을 직접 참조한다.
DB 레이어를 제거하면 불필요한 대규모 리팩터링이 발생한다.

> **데이터 구조로서 Holding은 유지 / 사용자 기능으로서 "지주회사 설립"은 제거**

---

# 7. 온보딩 — 스냅샷 시작 (v1.0에서 대폭 개정)

## 7.1 원칙

> **과거 거래를 복원하지 않는다. 오늘의 상태만 입력한다.**

사용자가 입력하는 것은 **지금 가지고 있는 것**뿐이다.

### 주식/ETF

```text
종목      (필수)
수량      (필수)
계좌      (필수)
평균매입가 (선택 — 종목별 수익률 표시용)
매수일     ← 받지 않는다 (§9)
```

### 현금

```text
계좌 / 통화 / 금액
```

### 부동산/실물

```text
이름 / 현재 평가액 / 취득가(선택) / 대출 연결(선택)
```

### 대출

```text
이름 / 잔액 / 금리 / 연결 자산
```

## 7.2 성과 추적 시작점

온보딩 마지막에 **한 화면**으로 묻는다.

```text
성과 측정을 언제부터 시작할까요?

○ 오늘부터            ← 기본값. 아무것도 더 안 물어봄
○ 과거 시점부터        → 시작일 + 그날의 총 평가액 2개만 입력
```

"과거 시점부터"를 고르면:

```text
시작일          [ 2022-01-03 ]
그날 총 평가액   [ 100,000,000 ]

💡 계좌에 처음 입금한 날을 고르면 그날 평가액 = 입금액이라 정확합니다.
```

이후 입출금은 §9.3처럼 나중에 추가할 수 있다. **온보딩에서 강요하지 않는다.**

## 7.3 `initial_valuation` 산출 규칙

"오늘부터"를 고른 경우 사용자는 **평가액을 입력하지 않는다.** 서버가 계산한다.

```text
founded_at        = 오늘
initial_valuation = Σ(입력한 종목 수량 × 현재가, 표시통화 환산) + Σ(입력한 현금)
```

즉 온보딩 직후에는 `현재 평가액 == initial_valuation` 이므로 XIRR = 0%다. 정상이다.
이것이 `actions.ts:345` 의 `initial_valuation` 자동 증액 해킹이 필요 없어지는 이유다 —
설립자본이 애초에 포트폴리오 전체를 덮으므로 "현금 부족" 상황 자체가 발생하지 않는다.

"과거 시점부터"를 고른 경우에만 사용자 입력값을 그대로 쓴다.

> ⚠️ 부동산·대출은 `initial_valuation` 에 넣지 않는다.
> XIRR은 **투자 포트폴리오**의 수익률이지 순자산 증감률이 아니다 (§16.1과 동일한 분모).

---

# 7.4 `/growth` 해체 계획 (2026-08-12 실사)

`/growth`("마이 버크셔" 허브)는 Phase 4 에서 홈으로 흡수된다. 무엇을 옮기고 무엇을 내릴지
카드 단위로 실사했다.

## 결론 먼저

**7개 카드 중 6개가 이미 §5 의 LEGACY 목록에 있다.** 옮길 것은 사실상 하나뿐이다.

| # | 카드 | 컴포넌트 | §5 분류 | 처리 |
|---|---|---|---|---|
| 1 | 기업 등급 | `CompanyTierCard` | LEGACY "기업 등급" | 내림 |
| 2 | 복리 무중단 | `CompoundingStreakCard` | LEGACY "복리 스트릭" | 내림 |
| 3 | 내 지분 실적(투시 펀더멘털) | `LookThroughCard` | LEGACY "Look-through Financials" | 내림 |
| 3-a | └ **종목 배분 도넛** | `StockChartStreamed` | **비-legacy** | **홈으로 이동** ⭐ |
| 4 | ETF 포트폴리오 | `EtfSnapshotCard` | 비중=자산 / TER=비용 | 아래 참조 |
| 5 | 규율 점수 | `StyleCard` | LEGACY "Style · 규율 점수" | 내림 |
| 6 | 분기 리포트 · Annual Report | (인라인 섹션) | LEGACY "CFO Report · Annual Report" | 내림 |
| 7 | 마일스톤 타임라인 | `TimelineCard` | LEGACY "Timeline" | 내림 |

## 7.4.1 반드시 살릴 것 — 종목 배분 도넛

`src/app/growth/page.tsx:168` 의 `stockChart` 는 개별주(비ETF) 비중 도넛이다.
**투시(look-through)가 아니라 단순 배분 시각화**라 §5 의 legacy 사유에 해당하지 않는다.

가장 최근 작업 4개가 이 카드에 몰려 있다.

```text
6af497f  마이버크셔 '내 지분 실적' 카드에 ETF 배분 도넛 차트 통합
9d3261a  내 지분 실적 카드에 종목 배분 차트 추가 + 혼합형 ETF 분류 수정
f38ac43  도넛 차트 '기타' 조각 탭하면 구성 펼침
d95d940  내 지분 실적 표에서 금액(내 몫·보유) 제거
```

`/growth` 를 통째로 내리면 이 작업이 함께 묻힌다. **도넛만 떼어 홈으로 옮긴다.**

### 겹침 주의

홈에는 이미 `AllocationCard` 가 있다(`dashboard/page.tsx`).

| | 보여주는 것 | 형태 |
|---|---|---|
| 홈 `AllocationCard` | 국가별 → 탭하면 종목 드릴다운(유형별 탭) | 목록 |
| `/growth` 도넛 | 개별주 종목별 비중 | 도넛 |

**정보는 겹치고 표현이 다르다.** 두 가지 선택지가 있다.

```text
A. AllocationCard 안에 도넛을 넣는다   → 카드 1개 유지, 홈이 안 길어짐
B. 별도 "종목 배분" 카드로 홈에 둔다   → 구현 단순, 홈에 카드 1개 추가
```

A 를 권장한다 — 자산 구성이라는 같은 질문에 답하는 두 뷰를 한 카드에 두는 편이
§30 의 "홈 first paint" 기준에 맞는다.

## 7.4.2 ETF 카드 — 쪼개서 처리

`EtfSnapshotCard` 는 성격이 다른 두 정보를 한 카드에 담고 있다.

```text
ETF 이름 + 비중 목록   → 자산 구성. 홈 AllocationCard 의 드릴다운이 이미 같은 정보를 준다
가중평균 TER          → 보수(비용) 지표. §5 "Friction / 마찰비용" 과 같은 성격
```

따라서 **별도 이동 없이 카드 전체를 내린다.** 비중은 홈에 이미 있고, TER 은 legacy 다.
`/etf-portfolio` 라우트는 §5.1 대로 그대로 두고 링크만 끊는다.

## 7.4.3 종목 상세로 가는 것

투시 펀더멘털(연결 순이익·PER/PBR/ROE)은 **포트폴리오 합산 레벨에서는 내리지만**,
종목 단위 실적 요약은 §20 의 KEEP 목록("최근 실적 요약")에 이미 있다. 새로 옮길 것은 없다.

## 7.4.4 순서 — 완료 (2026-08-12)

```text
1) 종목 배분 도넛을 홈으로 이동          ✅  AllocationCard 에 chart 프로퍼티로 통합(A안)
2) 홈에서 /growth 진입 카드 제거          ✅  Phase 1 의 임시 연결 회수
3) /growth 라우트는 남긴다 — 링크만 끊음  ✅
```

### 구현 메모

`AllocationCard` 는 클라이언트 컴포넌트고 `StockChartStreamed` 는 섹터 backfill 때문에
서버 컴포넌트다. 그래서 도넛을 **`ReactNode` 프로퍼티로 주입**한다(`/growth` 가 쓰던 것과 같은 패턴).
`<Suspense>` 로 감싸 두었으므로 섹터 조회가 홈 first paint 를 막지 않는다.

카드 안에는 이제 두 개의 다른 뷰가 있다. 겹쳐 보이지만 답하는 질문이 다르다.

```text
카드 본문   국가별 막대 + 종목 배분 도넛(종목·섹터·지역·자산유형)  → 전체 구성
바텀시트    선택한 국가의 상위 8개 도넛 + 종목 목록                → 그 국가 안의 구성
```

### `/growth` 는 지금 링크가 없다 — 의도된 상태

§5.1 의 격리 방식대로 **라우트는 살아 있고 진입 링크만 없다.** 남은 6개 카드는 전부
§5 의 LEGACY 목록이라 노출하지 않는 것이 맞고, 살릴 가치가 있던 도넛은 홈으로 옮겨졌다.

라우트를 지우면 안 된다. `/growth` 는 다음 컴포넌트들의 **유일한 사용처**다.

```text
CompanyTierCard · CompoundingStreakCard · EtfSnapshotCard · LockedCard
```

(`StockChartStreamed` 는 이제 홈에서도 쓰므로 이 목록에서 빠진다.)
물리 삭제는 Phase 6 에서 의존성 분석과 함께 한다.

---

# 8. My Berkshire 화면

My Berkshire가 새로운 Home이다. 경로: `/` 또는 `/my-berkshire`.
기존 `/dashboard` · `/growth` · `/networth` · `/holdings` 의 핵심 정보를 합친다.

## 8.1 Hero

```text
My Berkshire

순자산
₩3,240,000,000

총자산      ₩4,100,000,000
부채         -₩860,000,000
```

선택적으로 `Since Inception XIRR 14.8%`. 데이터가 부족하면 정직하게 표시한다.

```text
성과 추적 시작: 2026-08-13
```

## 8.2 Asset Sections

### Marketable Securities

```text
META    평가액 180,000,000   비중 12.3%   수익률 +42.1%   새 공시 ●2
PLTR    평가액  82,000,000   비중  5.6%   수익률  -3.2%   새 공시 ●1
```

### Funds / ETF

```text
VOO · QQQ · BND ...
```

ETF는 분류만 다르게 한다. **기본 화면에서 look-through 하지 않는다.**

### Cash / Real Assets / Liabilities

```text
KRW · USD · 기타
아파트 A · 상가 B · 사업자산
주택담보대출 · 기타 대출
```

---

# 9. 수익률 — 스냅샷 시작 모델 (v1.1 핵심)

## 9.1 XIRR에 매매 날짜는 필요 없다

전체 포트폴리오 XIRR은 **money-weighted return**이다. 포트폴리오를 상자로 보면:

- 상자 **안에서** AAPL을 팔아 META를 사는 것 → 현금↔주식 교환. 상자 크기 불변
- 상자 **밖에서** 돈이 들어오고 나가는 것 → 이것만이 현금흐름

`src/lib/finance/xirr.ts:11` 이 이미 이 규칙을 명시하고 있다.

> 배당·매수·매도는 현금흐름에 직접 넣지 않는다(평가액=현금잔고 통해 반영, 이중계산 방지)

`benchmark.ts:178` 도 `DEPOSIT` / `WITHDRAWAL` 만 flow에 넣고 BUY/SELL은 무시한다.

> **엔진은 이미 옳다. 문제는 입력 레이어다.**

## 9.2 현행 온보딩의 문제

이 앱은 **보유종목의 매수를 그 매수일의 증자(DEPOSIT)로 변환한다.** `src/app/onboarding/actions.ts:109`:

```text
설립자본(t0 시드) = 현금만.
보유종목 자본은 각 "매수일"에 증자(DEPOSIT)로 투입한다.
```

그래서 매수일이 XIRR에 영향을 준다 — 엔진이 요구해서가 아니라 **입력 변환이 만들어낸 요구사항**이다.

### 이 변환이 실제로 일어나는 곳은 세 군데다

| 경로 | 위치 | 현재 사용 여부 |
|---|---|---|
| `foundCompany` 의 `stocks` 처리 | `onboarding/actions.ts:190` | **미사용** — `OnboardingRail.tsx:70` 이 `stocks: []`, `cash: 0` 으로 호출 |
| 온보딩 J4 → BuyWizard → `recordBuys` | `BuyWizard.tsx` + `transactions/actions.ts:461` | **사용 중.** 실제 보유종목 입력 경로 |
| 증권사 파일 가져오기 | `import/actions.ts:84` | 사용 중 |

> ⚠️ 온보딩에서 종목을 담는 실제 경로는 `foundCompany` 가 아니라 **BuyWizard** 다.
> `mode="ledger"` + `defaultFundingSource="deposit"` 조합이 거래일 입력을 요구하고,
> `recordBuys` 가 그 날짜에 종목별 DEPOSIT을 만든다.
> `foundCompany` 의 `stocks` 분기는 현재 도달하지 않는 코드다(Phase 6 정리 대상).

### 부작용

`onboarding/actions.ts:345` (`recordFirstBuy`):

```ts
if (availableCash < cost) {
  const bumped = Number(holding.initial_valuation) + (cost - availableCash);
  // 현금이 모자라면 설립자본을 몰래 부풀린다
}
```

매수 원가가 입력 현금을 초과하면 `initial_valuation` 을 자동 증액한다. 사용자가 모르는 보정이다.
(`recordFirstBuy` 는 `components/onboarding/BuyForm.tsx` 에서만 쓰인다.)

## 9.3 v1.1 채택 모델 — 스냅샷 시작

```text
founded_at        = 성과 추적 시작일
initial_valuation = 그 날짜의 포트폴리오 총 평가액
events            = 시작일 이후의 DEPOSIT / WITHDRAWAL 만
terminal value    = 현재 보유수량 × 현재가 (자동)
```

사용자가 입력하는 날짜는 **시작일 하나 + 입출금 날짜들**뿐이다.

### 예

```text
2022-01-03   시작 평가액    -100,000,000
2023-05-10   입금            -30,000,000
2024-08-20   출금            +10,000,000
TODAY        현재 평가액    +200,000,000
```

중간의 `AAPL 매도` · `META 매수` · `VOO 매도` 는 **전부 무관**하다.

### 입출금이 하나도 없으면

시작 평가액과 현재 평가액 2개로 끝난다. XIRR = CAGR.

## 9.4 정확도 규칙

| 항목 | 규칙 |
|---|---|
| **시작 평가액** | 추정 오차가 수익률에 그대로 남는다. **입금 직후 날짜를 시작일로 권장** (그날 평가액 = 입금액이라 오차 0) |
| **배당** | 계좌 안에 두면 → 아무 처리 불필요(내부). 은행으로 인출하면 → `WITHDRAWAL` |
| **여러 계좌** | 시작일을 하나로 통일하고, 그날 각 계좌 평가액의 **합**을 `initial_valuation` 에 넣는다 |
| **시작 이후 개설한 계좌** | 그 계좌에 넣은 돈은 `DEPOSIT` |
| **현물이전(타사 대체출고)** | 계좌 간 이동은 외부 흐름이 아니다. 기록하지 않는다 |
| **수수료·세금** | 상자 안에서 발생 → 별도 처리 불필요(평가액에 이미 반영) |

## 9.5 기존 사용자 — 마이그레이션 하지 않는다

이미 `매수일 → DEPOSIT` 모델로 데이터를 쌓은 사용자가 있다.
모델을 바꾸면 **그들의 XIRR 숫자가 바뀐다.**

```text
기존 사용자 데이터 → 그대로 둔다. 재계산하지 않는다.
신규 사용자        → 스냅샷 모델
```

### 플래그가 필요 없다

두 모델은 결국 **같은 형태의 데이터**를 남긴다.

```text
(founded_at, initial_valuation) + DEPOSIT/WITHDRAWAL 이벤트들
```

차이는 그 데이터를 *만드는 방법*뿐이고, `xirr.ts` 는 결과만 읽는다.
따라서 `holdings` 에 모델 구분 컬럼을 추가할 필요가 없고, 엔진 분기도 없으며,
**서버 액션(`recordBuys`)도 그대로 둔다.** 변경은 전부 클라이언트 입력 레이어에서 끝난다.

```text
BuyWizard      snapshot 프로퍼티 추가 → 거래일 UI 숨김, date = today
OnboardingRail J4 에서 snapshot 전달
```

`recordBuys` 는 계속 `date` 를 받는다. 스냅샷 모드는 **그 값을 오늘로 고정할 뿐**이므로
일반 기록 흐름(과거 거래 소급 입력)은 영향을 받지 않는다.

## 9.6 날짜를 안 받으면 잃는 것 (정직하게)

| 기능 | 영향 | 근거 |
|---|---|---|
| 전체 XIRR | **영향 없음** | `xirr.ts:11` |
| 기간 수익률(1Y/3Y) | **영향 없음** — 입출금 날짜만 사용 | `periodReturns.ts:49` |
| 벤치마크 PME | **영향 없음** — 입출금 날짜만 사용 | `benchmark.ts:178` |
| 종목별 단순 수익률 | **영향 없음** — 수량·평단가만 사용 | §10 |
| 실현손익 매칭 순서 | 영향 있음 — 날짜 정렬 필요 | `realized.ts:27` |
| 과거 자산 추이 차트 | 영향 있음 — 시작일 이전 구간이 안 그려짐 | `valueSeries.ts:68` |

즉 손실은 **"그래프가 시작일부터만 그려진다"** 수준이지, 수익률 숫자가 틀어지는 것이 아니다.

## 9.7 과거 복원은 나중에, 선택적으로

My Berkshire → Performance 상세에서:

```text
과거 성과도 복원하시겠어요?

[ 과거 입출금 직접 입력 ]     ← 매매 아님. 입출금만
[ 증권사 파일 가져오기 ]
```

시작일을 앞으로 당기고 그 시점 평가액과 그 사이 입출금만 추가하면 과거 수익률이 소급 계산된다.
**이때도 매매 기록은 필요 없다.**

---

# 10. 종목별 수익률

Portfolio라는 별도 메인 메뉴는 만들지 않는다. 종목별 손익은 My Berkshire 안에서 보여준다.

```text
(Current Value - Cost Basis) / Cost Basis
```

표시: 평가액 · 평균단가 · 수익률 · 평가손익 · 비중.

**개별 종목 XIRR은 기본 기능으로 만들지 않는다.** 상세 거래시점 복원이 필요해 복잡도를 높인다.

```text
종목별       → 단순 수익률
전체 지주회사 → XIRR
```

---

# 11. + 기록

가운데 `+` 버튼이 모든 장부 이벤트의 단일 입구다.

```text
주식/ETF     매수 · 매도 · 배당
현금         입금 · 출금 · 환전
부동산/실물   매수 · 매도 · 임대수익 · 평가액 수정
부채         대출 추가 · 대출 상환 · 조건 수정
```

매수/매도 입력 항목: 종목 · 수량 · 단가 · 날짜 · 계좌.
(인앱 매수는 실제로 그날 일어나므로 날짜가 자연스럽다. §9가 없애는 것은 **과거 소급 입력**의 날짜다.)

---

# 12. Allocate — 킬러 기능

경로: `/allocate`. 이 앱의 핵심 행동 기능이다.

> **새로운 돈이 생겼는데 무엇을 얼마나 살 것인가?**

## 12.1 v1 범위 — 밸류에이션을 넣지 않는다

제거: 예상 EPS CAGR · Terminal PER · DCF · 요구수익률 기반 적정가 · Bull/Base/Bear · 오너이익 · 안전마진 · valuation scoring.

사용자가 **이미 선택한** 자산의 목표비중 관리에만 집중한다.

## 12.2 대상 자산

```text
포함:   개별주 · ETF · (선택) 투자용 현금
제외:   부동산 · 일반 생활현금 · 대출 · 비유동 실물자산
```

부동산과 대출은 My Berkshire 순자산에는 포함되지만 Allocate 배분에는 포함하지 않는다.

---

# 13. 목표비중 (v1.0에서 개정)

## 13.1 현행 구조는 2단계다

`src/app/rebalance/page.tsx:39`:

```text
1단계(유형)      category_targets["assetType:*"]     예) 주식 60% / ETF 40%
2단계(유형 내)   target_weights                      예) 주식 안에서 META 40%
```

v1.0은 이를 평면 1단계로 가정했으나 현행 데이터는 2층이다.

## 13.2 v1.1 결정 — 평면으로 통일

Allocate는 **평면 목표비중**만 쓴다.

```text
BRK.B  20%
META   15%
PLTR   10%
VOO    25%
QQQ    20%
Cash   10%      ← 포함 여부는 §16
─────────────
합계  100%
```

### 기존 데이터 환산 규칙

```text
flat_weight(symbol) = category_targets[assetType(symbol)] × target_weights[symbol]
```

환산 후 합이 1이 아니면 정규화한다. 환산은 **읽기 시점 1회**, 저장은 평면으로 한다.

### 저장 위치 — 새 테이블 없음

v1.0의 신규 `target_allocations` 테이블은 **만들지 않는다.**
기존 `holdings.target_weights` jsonb를 평면 구조로 재사용한다.

```jsonc
{
  "META":  { "target": 0.15 },
  "PLTR":  { "target": 0.10, "hardCap": 0.14 },   // cap은 오버라이드할 때만
  "VOO":   { "target": 0.25 }
}
```

`soft_cap` / `hard_cap` 은 기본값이 `target × 1.25` / `target × 1.50` 이므로 **기본값일 때 저장하지 않는다.**

`category_targets` 는 삭제하지 않는다(legacy 리밸런싱 화면이 사용 중).

---

# 14. Concentration Guard (v1.0에서 개정)

한 종목이 계속 싸져서 목표보다 과도하게 비중이 커지는 문제를 막는다.

```text
기본값:  soft_cap = target × 1.25
         hard_cap = target × 1.50

예)      Target 10%  →  Soft Cap 12.5%  →  Hard Cap 15%
```

## 14.1 3단계 규칙

| 현재 비중 | 판정 | 계수 |
|---|---|---|
| `w ≤ target` | 정상 매수 대상 | `1.0` |
| `target < w < soft_cap` | 우선순위 하향 | `0.25` |
| `soft_cap ≤ w < hard_cap` | 강한 하향 (완전 배제 아님) | `0.05` |
| `w ≥ hard_cap` | 추가매수 금지 | `0` (제외) |

### v1.0 대비 무엇이 바뀌었나

v1.0 §36 코드는 soft_cap과 hard_cap 모두 `eligible = false` 로 처리했다.
결과가 동일하므로 **hard_cap이 죽은 파라미터**가 된다. 3단계라는 서술과도 모순이다.

v1.1은 soft 구간을 "배제"가 아닌 **감액**으로 정의해 두 파라미터가 실제로 다르게 동작하게 한다.

## 14.2 상승으로 커진 비중은 팔지 않는다

주가 상승으로 Target 또는 Hard Cap을 넘어간 경우 **자동 매도를 요구하지 않는다.**

> **상승으로 커진 승자는 유지할 수 있다. 단, 신규자금 추가투입은 제한한다.**

따라서 Allocate는 기본적으로 **buy-only rebalance**다. 매도 리밸런싱은 v1에서 제외한다.

---

# 15. 배분 로직 (v1.0 §36에서 개정)

## 15.1 기존 구현을 버리지 않는다

`src/lib/rebalance.ts:26` 에 이미 `planInvestment()` 이 있고, **v1.0 의사코드보다 정확하다.**

```ts
export function planInvestment(items: RebalItem[], invest: number): RebalAlloc[]
```

| 상황 | 기존 구현 | v1.0 의사코드 |
|---|---|---|
| 투자금 < 총부족분 | 부족분 비례 배분 | 동일 |
| 투자금 > 총부족분 | **부족분을 먼저 채우고, 남는 금액은 목표비중 비례로 배분** | gap 비율로 전액 소진 |
| 잔여금 | 자연스럽게 처리 | `remainingCash: 0` 고정 |

v1.0 의사코드는 항상 `remainingCash: 0` 을 반환하는데, 이는 v1.0 §17의
"잔여금은 현금으로 남긴다"와 **자기모순**이다.

> **결정: `planInvestment()` 을 유지하고 cap 규칙만 앞단에 얹는다.**

## 15.2 구현 — `src/lib/allocate.ts`

구현 완료. 계산식은 다음과 같다.

```text
V        = Σ(대상 자산 평가액)                  ← §16.1 분모
future   = V + 투자금
gap_i    = max(0, future × target_i − value_i)
weight_i = gap_i × priority_i × attractiveness_i
amount_i = min(투자금 × weight_i / Σweight, gap_i)   ← 부족분이 상한
잔여금    = 투자금 − Σamount
```

`priority_i` 는 §14.1 의 4단계 계수, `attractiveness_i` 는 §15.3 참조(기본 1.0).

### v1.1 초안에서 바뀐 점 — 잔여금 처리

초안은 `rebalance.ts:planInvestment` 을 그대로 감싸려 했으나, **잔여금 규칙이 다르다.**

| | 투자금 > 총부족분일 때 |
|---|---|
| `rebalance.ts` (기존 리밸런싱 화면) | 부족분을 채우고 **남는 돈도 목표비중 비례로 전액 배분** |
| `allocate.ts` (신규) | 부족분까지만 채우고 **남는 돈은 현금으로 남긴다** |

후자를 택한 이유는 PRD v0.3 §8 이다.

> 핵심은 항상 전액 투자하는 것이 아니다. **매력적인 기회가 부족하면 현금을 남긴다.**

목표를 이미 채운 종목에 돈을 더 밀어넣으면 목표비중을 스스로 깨뜨리게 된다.
따라서 각 칸의 배분액에 **부족분 상한**을 두었다.

기존 `/rebalance` 화면의 동작은 바꾸지 않았다 — `planInvestment` 은 그대로다.

## 15.3 밸류에이션 훅 — `attractiveness`

스펙(밸류에이션 제외)과 PRD(Expected CAGR 이 핵심)의 충돌을 미루기 위한 이음매다.

```text
미지정      → 1.0 → 순수 비중 기반 배분 (스펙 §12 동작)
Expected CAGR 연결 → 기대수익률이 높은 쪽에 더 많이 (PRD §6 동작)
0           → 후보에서 제외 ("요구수익률 미달")
```

가정을 입력하지 않은 종목과 입력한 종목이 **한 화면에 섞여도 계산이 성립한다.**
자세한 내용은 `docs/spec-vs-prd-reconciliation.md` §4.

## 15.4 실행단계에서 처리할 것

현재가 · 최소 거래단위 · 소수점 매매 가능 여부 · 원화/달러 환산 · 계좌 선택.

---

# 16. 분모와 통화 (v1.0 누락분 보완)

v1.0은 §17에서 `V = 현재 포트폴리오 가치` 라고만 했다. 모호하다.

## 16.1 분모 정의

```text
V = Allocate 대상 자산의 평가액 합
  = 개별주 + ETF + (현금 슬롯을 쓰는 경우) 투자 가능 현금

포함하지 않는다: 부동산 · 생활현금 · 대출 · 비유동 실물자산
```

My Berkshire 순자산(부동산·부채 포함)과 **다른 숫자**다. 화면에서 라벨을 구분한다.

```text
순자산            ₩3,240,000,000   ← My Berkshire Hero
투자 포트폴리오    ₩1,000,000,000   ← Allocate 기준
```

## 16.2 현금 처리 — 하나로 정한다

v1.0은 §13에서 "선택적", §14 예시에서는 `Cash 10%` 로 포함해 일관되지 않았다.

### v1.1 결정

```text
기본:   현금은 Allocate 대상에서 제외 (V에 미포함)
        → 입력한 투자금 전액을 주식/ETF에 배분
옵션:   "현금 목표비중" 을 켜면 현금이 하나의 슬롯으로 V에 포함
        → planInvestment 이 자동으로 "남길 현금" 을 계산
```

`rebalance.ts:24` 주석이 이미 이 설계를 예고하고 있다.
> 현금도 하나의 칸으로 넣으면 "남길 현금"이 된다

## 16.3 통화

목표비중은 **표시통화 환산 후** 계산한다. USD 종목은 환율 변동만으로 비중이 흔들리므로:

- 비중 계산 시점의 환율을 사용한다 (`src/lib/finance/fx.ts` 재사용)
- 계획 화면에 환율 기준 시각을 표시한다
- 환율 변동으로 인한 drift는 cap 판정에 그대로 반영한다 (별도 보정 없음)

## 16.4 투자 가능 현금

```text
전체 현금:       200,000,000원    ← My Berkshire
투자 가능 현금:   50,000,000원    ← Allocate 가 쓰는 금액
```

사용자가 지정한다. Allocate는 후자만 사용한다.

---

# 17. 계좌와 Allocate

Allocate는 먼저 **무엇을 얼마나 살지**만 결정한다. 그 다음 실행 단계에서 **어느 계좌에서 살지** 선택한다.

```text
META  20,000,000원 매수

계좌 선택:
○ 해외주식계좌   ○ 일반계좌   ○ ISA
```

**Allocate 엔진 안에 ISA/연금/세금 최적화를 처음부터 넣지 않는다.**
자산배분과 계좌 최적화를 동시에 풀면 복잡도가 급증한다.

```text
v1:  Asset Allocation → Account Selection   (2단계 분리)
```

---

# 18. Allocate → 거래 기록 연결

추천 결과에서 `[ 매수 기록하기 ]` → 기존 BUY 위저드(`src/components/transactions/wizard/BuyWizard.tsx`)로 이동.

prefill: 종목 · 추천 금액 · 현재가.
사용자 확인: 실제 수량 · 실제 체결가 · 계좌.

저장 후 기존 `events` 원장에 BUY 이벤트를 추가한다. **Allocate와 거래 장부 사이에 데이터 중복이 없다.**

---

# 19. 공시

공시는 별도 하단 탭으로 만들지 않는다. My Berkshire에 붙인다.

```text
PLTR   평가액 ₩82M   수익률 +21%   새 공시 ●2
```

또는 상단에 요약:

```text
내 기업 소식
PLTR 8-K
META 10-Q
```

최대 몇 건만 노출한다. 전체 공시 화면은 상세 링크로 유지한다.

---

# 20. 종목 상세

## KEEP
현재가 · 평가액 · 보유수량 · 평균단가 · 수익률 · 비중 · 최근 실적 요약 · 최근 공시.

## HIDE / LEGACY
내재가치 DNA · DCF · 오너이익 · 유지 CapEx 보정 · RNI / RONTE / RMC · 복잡한 펀더멘털 플래그 · 과거 PER 심화 분석.

> 종목 상세는 "내가 이 기업을 얼마나 가지고 있고 무슨 일이 생겼는가"에 집중한다.

---

# 21. 부동산

삭제하지 않는다. My Berkshire → Real Assets 아래에 둔다.

```text
아파트 A
현재가   1,300,000,000
취득가   1,000,000,000
대출       400,000,000
순자산     900,000,000
```

상세에서만: 임대수익 · LTV · cap rate · 국토부 실거래가 평가 · 금융 정합.

> 고급 부동산 기능은 **삭제가 아니라 Progressive Disclosure**로 숨긴다.

---

# 22. 라우트 리팩터링

## 22.1 최종 사용자-facing 경로

```text
/                My Berkshire
/allocate        신규 자본 배분
/record          + 기록
```

하위:

```text
/assets/stocks/[symbol]  ·  /assets/real-estate/[id]
/accounts  ·  /performance  ·  /disclosures  ·  /settings
```

## 22.2 MERGE

| 기존 | 이후 |
|---|---|
| `/dashboard` + `/growth` + `/networth` + `/holdings` | My Berkshire |
| `/allocation` + `/rebalance` | `/allocate` |
| `/transactions` | `+ 기록` |
| `/disclosures` | My Berkshire 하위 |

`/allocation/page.tsx` 는 6줄짜리 리다이렉트 스텁이므로 교체 비용이 낮다.

## 22.3 HIDE (§5.1 방식으로)

```text
/ranking  ·  /lookthrough  ·  /etf-portfolio  ·  /friction
/report   ·  /annual-report  ·  /style  ·  /timeline  ·  /index/*
```

## 22.4 계좌

하단 메인 메뉴에는 두지 않되 삭제하지 않는다. `My Berkshire → Accounts`.
계좌 생성/수정 · 계좌별 보유자산 · 계좌별 현금 · 거래 시 계좌 선택은 유지. 고급 수수료 랭킹은 숨긴다.

## 22.5 가족 / 컴퍼니

데이터 구조에 필요하면 유지한다. 기본 사용자는 `My Berkshire` 하나만 본다.
가족 구성원/컴퍼니별 분석은 Settings로 이동한다.

---

# 23. 삭제 금지 (v1.1 추가분 포함)

```text
events  ·  holdings  ·  accounts  ·  positions 계산  ·  XIRR 엔진
부동산 데이터  ·  부채 데이터  ·  공시 파이프라인  ·  DART / SEC
시세 데이터 소스  ·  거래 이벤트  ·  RLS / auth  ·  기존 사용자 데이터  ·  Supabase 테이블
```

## v1.1 추가 — 검색 인프라

```text
kis_security_master  (테이블)
/api/search          (라우트)
src/lib/finance/kisMaster.ts
```

**검색 탭을 제거해도 기록 위저드의 종목 검색이 이 경로에 의존한다.** 절대 삭제하지 않는다.

## v1.1 추가 — 순서 의존성

Ranking은 22개 파일 + `ranking_scores` 테이블 + cron + `holdings` 의 다음 컬럼에 걸쳐 있다.

```text
listed_at  ·  first_listed_at  ·  founding_declared  ·  listed_name
```

이 컬럼들은 §6(설립 UX 제거)과 얽혀 있다. **§6과 Ranking 숨김을 같은 Phase에서 처리한다.**

---

# 24. 삭제 후보 (v2 안정화 이후)

Ranking 전용 테이블/cron · Style 점수 엔진 · Look-through 전용 스냅샷 · CFO report 전용 데이터 ·
gamification 전용 상태 · 미사용 valuation UI · 미사용 index analytics.

**단, 의존성 분석 후 제거한다.**

---

# 25. 모듈 구조

```text
src/
  app/
    my-berkshire/  ·  allocate/  ·  record/
    assets/stocks/  ·  assets/real-estate/
    accounts/  ·  performance/  ·  settings/
  lib/
    ledger/  ·  portfolio/  ·  allocation/  ·  returns/
    disclosures/  ·  assets/  ·  accounts/
```

| 모듈 | 책임 |
|---|---|
| ledger | `events` 읽기/쓰기 |
| portfolio | 보유수량 · 원가 · 평가액 · 현금 · 순자산 |
| returns | XIRR 및 전체 수익률 |
| allocation | 목표비중 · 현재비중 · gap · 신규자금 배분 · cap 규칙 |
| disclosures | 보유종목 기준 DART/SEC 조회 |
| assets | 부동산 · 실물 · 부채 |

기존 `src/lib/*.ts` 평면 구조에서 점진 이동한다. **Phase 6 이전에는 이동하지 않는다.**

---

# 26. MVP 화면

## My Berkshire

```text
My Berkshire

₩3.24B
순자산

XIRR 14.8%

[ Marketable Securities ]   META · PLTR · VOO ...
[ Cash ]
[ Real Assets ]
[ Liabilities ]

내 기업 소식 ●3
```

## Allocate

```text
Allocate Capital

투자할 금액     [ 50,000,000 ]
투자 포트폴리오  ₩1,000,000,000

추천
META    18,000,000
VOO     15,000,000
BRK.B   10,000,000
PLTR     7,000,000

[ 매수 기록하기 ]
```

## +

```text
무엇을 기록할까요?

주식/ETF 매수 · 매도 · 배당
입금 · 출금 · 환전
부동산/실물 매수 · 매도 · 임대수익
대출 추가 · 대출 상환
```

---

# 27. 개발 순서 (v1.0에서 재배치)

v1.0은 Phase 1이 My Berkshire 통합이었다. 이는 **가장 무거운 작업**이다
(`src/app/dashboard/page.tsx` 1064줄). 초반 동력을 잃기 쉽다.

v1.1은 **싸고 체감이 큰 것 → 킬러 기능 → 무거운 통합** 순으로 재배치한다.

## Phase 0 — Freeze
현재 기능 추가 개발 중지.

## Phase 1 — 하단탭 축소 ⭐ 가장 저렴
- `BottomTabBar.tsx` 를 2탭 + `+` 로 변경
- 랭킹 · 검색 진입점 제거
- 기존 라우트는 **그대로 둔다**
- 영향 파일: 1~3개. 체감 변화의 절반을 여기서 얻는다

## Phase 2 — `/allocate` 신설 ⭐ 킬러 기능
- `src/lib/allocate.ts` 신규 (§15.2)
- 목표비중 평면 환산 (§13.2)
- `/allocation` · `/rebalance` 에서 목표비중 + 신규자금 배분만 추출
- 엔진은 이미 있으므로 화면 작업이 대부분

## Phase 3 — 온보딩 스냅샷 모델 ⭐ 입력 노동 제거
- `BuyWizard` 에 `snapshot` 프로퍼티 추가 — 거래일 UI를 숨기고 `date = today` 로 고정
- `OnboardingRail` J4 에서 `snapshot` 전달 + 안내 문구 수정
- **서버 액션·DB·엔진 변경 없음** (§9.5)
- **기존 사용자 데이터는 건드리지 않는다** (§9.5)

### Phase 3 후속 (별도 작업)
- 성과 시작점 선택 화면 — "오늘부터 / 과거 시점부터" (§7.2)
- `actions.ts:345` 의 `initial_valuation` 자동 증액 제거
- `foundCompany` 의 도달 불가 `stocks` 분기 정리 → Phase 6

## Phase 4 — My Berkshire 통합
- `/dashboard` + `/growth` + `/networth` + `/holdings` 병합
- 신규 라우트로 만들고 기존 경로는 리다이렉트 (롤백 가능하게)

## Phase 5 — 공시 통합 · Legacy 격리
- 공시 별도 탭 제거, unread signal 을 My Berkshire·종목 상세에 노출
- §5.1 방식으로 legacy 링크 제거

## Phase 6 — 코드 의존성 정리
dead imports · unused components · legacy hooks · legacy cron · legacy queries.
**여기서 처음으로 파일을 물리 이동한다.**

## Phase 7 — 인수인계 문서

```text
README.md  ·  PRODUCT-SCOPE.md  ·  DATA-MODEL.md
LEDGER-SPEC.md  ·  XIRR-SPEC.md  ·  ALLOCATION-SPEC.md  ·  LEGACY-MAP.md
```

---

# 28. KEEP / MERGE / HIDE 표

| 기존 기능 | 결정 | 새 위치 |
|---|---|---|
| Dashboard | MERGE | My Berkshire |
| Growth / 마이 버크셔 | MERGE | My Berkshire |
| Holdings | MERGE | My Berkshire |
| Net Worth | MERGE | My Berkshire |
| Accounts | KEEP | My Berkshire 하위 |
| Transactions | KEEP | + 기록 |
| Cash | KEEP | My Berkshire 하위 |
| Real Estate | KEEP | My Berkshire 하위 |
| Liabilities | KEEP | My Berkshire 하위 |
| Returns / XIRR | KEEP + SIMPLIFY | My Berkshire / Performance |
| Allocation | MERGE | Allocate |
| Rebalance | MERGE | Allocate |
| Disclosures | KEEP + EMBED | My Berkshire / 종목 상세 |
| Dividends | KEEP DATA | 종목/활동 하위 |
| Search (탭) | HIDE | 기록 위저드 내부 검색 |
| Search (인프라) | **KEEP — 삭제 금지** | `/api/search` · `kis_security_master` |
| Ranking | LEGACY | 숨김 |
| Style | LEGACY | 숨김 |
| Look-through | LEGACY | 숨김 |
| ETF Look-through | LEGACY | 숨김 |
| Friction | LEGACY | 숨김 |
| CFO Report | LEGACY | 숨김 |
| Annual Report | LEGACY | 숨김 |
| Timeline | LEGACY | 숨김 |
| Valuation DNA | LEGACY | 숨김 |
| Index analytics | LEGACY | 숨김 |
| Company setup UI | REMOVE | 자동 holding 생성 |
| Holding DB | KEEP | 내부 |
| Family/company DB | KEEP | 내부/Advanced |

---

# 29. 하지 말아야 할 것

1. DB 초기화
2. 새 Supabase 프로젝트
3. 기존 사용자 데이터 삭제
4. valuation을 Allocate v1에 섞기
5. 부동산까지 자동 비중배분
6. 계좌 세금 최적화를 Allocate v1에 넣기
7. 모든 Legacy 기능을 즉시 물리 삭제
8. **`xirr.ts` 수정** — 엔진은 옳다. 바꿀 것은 입력 레이어다 (v1.1 추가)
9. **기존 사용자의 XIRR 재계산** — 모델 변경은 신규 사용자에게만 (v1.1 추가)
10. **`planInvestment()` 을 v1.0 의사코드로 교체** — 기존 구현이 더 정확하다 (v1.1 추가)

---

# 30. 성공 기준

## 10초 테스트

사용자가 앱을 열고 10초 안에 (1) 내 순자산 (2) 내가 무엇을 얼마나 가지고 있는지 (3) 새 돈을 어디에 얼마 넣어야 하는지를 알 수 있어야 한다.

## 측정 가능한 수용 기준 (v1.1 추가)

| 항목 | 기준 |
|---|---|
| 하단 탭 개수 | 5 → **2 + 기록** |
| 홈 first paint 포함 항목 | 순자산 · 보유 목록 · 공시 배지 |
| Allocate 도달 | **탭 1회** |
| 배분 결과까지 | 금액 입력 후 **추가 입력 0회** |
| 온보딩 필수 입력 필드 | 종목당 **3개** (종목·수량·계좌) |
| 온보딩에서 요구하는 날짜 | **0개** (시작일은 기본 "오늘") |

---

# 31. 최종 원칙

> **My Berkshire는 기록한다.**
> **Allocate는 결정한다.**
> **Events는 진실을 보존한다.**
> **나머지는 필요할 때만 보여준다.**

이 앱의 킬러 기능은 **새로운 돈을 기존 포트폴리오의 목표비중과 집중도 제한에 맞춰 배분해주는 것**이다.
그러나 킬러 기능이 작동하려면 My Berkshire가 사용자의 자산 상태를 정확히 알고 있어야 한다.

```text
My Berkshire (Current State)
      ↓
Allocate (Next Action)
      ↓
+ Record (Execution)
      ↓
events (New State)
      ↓
My Berkshire
```

이 순환이 ENUF의 핵심 제품 경험이다.

그리고 이 순환에 **사용자가 기억해내야 하는 과거는 없다.**
