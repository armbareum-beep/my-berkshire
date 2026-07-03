# 033 설계 노트 — 게이미피케이션 강화 (구현 선행 검토본)

> 이 문서는 spec.md(요구사항)의 구현 설계 선행 검토본이다. 2026-07-03 코드 전수 탐색 후 작성된 초안을 보존한 것으로, `/speckit.plan` 단계의 입력으로 쓴다. 요구사항의 진실원천은 spec.md.

## 배경

`docs/gamification-honest-roman-v1.md`(이 스펙의 헌법)가 명시한 **③ 정직한 축하**·**① 인내 streak**·**⑥ 서사 마일스톤**을 실제 코드로 착지시킨다. 이미 구현된 축하 정책(`src/lib/celebration.ts`)은 설립 N주년·계획 완수만 다루고 있어, 헌법이 §2·§4에서 못박은 "**드로다운을 안 팔고 통과 — 인내(통제 가능한 행동)를 축하**"가 아직 비어 있다. 하락장을 이탈 사유가 아니라 충성 사유로 뒤집는 유일한 장치이자 이 스펙의 기함이다.

나머지 3건(복리 무중단 노출·회장님 호칭·연혁 영구화/등급업)은 이미 계산되어 있거나 결정된 로직을 화면·카피·연혁에 "노출"하는 저비용 작업이다.

전부 **신규 외부 의존 0**, 대부분 **신규 DB 테이블 0**(예외: 기능4의 `archived_plans` 컬럼 1개).

---

## 기능 1 — 드로다운 인내 마일스톤 + 축하 (기함)

### 목적

헌법 §2·§4: "이번 분기 −12%. 하지만 당신은 한 주도 팔지 않았습니다." 숫자(낙폭)는 정직하게 보이고, 그 위에 통제 가능했던 행동(안 팖)을 얹는다. 드로다운이 게이미피케이션 대상이 되는 **유일한 예외**(다른 모든 시장 결과는 `CELEBRATION_DENYLIST`로 금지)이며, 예외가 성립하는 이유는 축하 대상이 "낙폭"이 아니라 "그 구간 동안 팔지 않은 결정"이기 때문이다.

### 데이터 소스 (신규 가격 fetch 0)

`loadPortfolioValueSeries`가 이미 캐시해 둔 일별 ₩ 종가(`closes`)와 `events`를 재사용해, `buildValueSeries(seed, events, closes, today, maxPoints)`를 **maxPoints를 충분히 크게(다운샘플 없이 전체 해상도)** 주어 재호출한다. 종가는 스냅샷에서 이미 메모리에 있으므로 이 재호출은 순수 CPU 연산이며 네트워크 호출이 없다.

### 알고리즘 — 흐름조정 TWR(Time-Weighted Return) 체인

`ValuePoint { date, value, invested }`에서 `invested`의 일별 증분을 그날의 순자본흐름 `f_t`로 본다(증자·인출 포함, 매매·배당은 `invested`에 영향 없음 — `valueSeries.ts` 정의 그대로).

```
f_t = invested_t − invested_{t-1}
r_t = (value_t − f_t − value_{t-1}) / value_{t-1}     // value_{t-1} > 0 일 때만
index_t = index_{t-1} × (1 + r_t),  index_0 = 1
```

이렇게 하면 **인출만으로 생기는 가짜 드로다운**(자본을 빼서 `value`가 줄어드는 것)이 `r_t` 계산에서 상쇄되어 제거된다 — 증자 유입도 마찬가지로 "그날 갑자기 수익률이 급등"하는 왜곡을 없앤다.

**초기 잔고 하한 가드**: `value_{t-1} < 10,000`(1만원)인 구간은 체인을 시작하지 않는다(0으로 나누기 방지 + 설립 직후 소액 구간의 % 왜곡 방지). 최초로 `value_{t-1} ≥ 10,000`이 되는 시점부터 `index` 체인을 시작한다.

### 에피소드 판정

`index_t` 시리즈에 러닝 피크 `peak_t = max(index_0..t)`를 유지하고 `drawdown_t = index_t / peak_t − 1`로 낙폭을 계산한다.

- **시작(start)**: `drawdown_t`가 처음 −10%를 하회하는 시점. 그 직전 피크일을 `peakDate`로 기록.
- **최심(trough)**: 시작 이후 `drawdown_t`가 최소가 되는 시점. `depth = min(drawdown_t)`.
- **회복(recovery)**: 시작 이후 `index_t`가 다시 `peak_t`(시작 시점 피크값) 이상으로 돌아온 최초 시점. **오늘까지 회복하지 못했으면 `recoveryDate = null`**(미회복·진행 중).
- **버킷 스냅**: `bucket = 10 × floor(|depth| × 100 / 10)`, 10~50 범위로 스냅(예: −23% → 20, −52% → 50 상한 — 50 초과 낙폭도 50으로 표기. 더 깊은 버킷은 두지 않는다, 극단 사례로 간주).
- **통과(passed)**: `recoveryDate`가 존재하고, `[peakDate, recoveryDate]` 창 안에 **SELL 이벤트가 0건**일 때만 `true`. 하나라도 SELL이 있으면 그 에피소드는 축하·연혁 대상에서 제외(팔았으므로 "통과"가 아님).
- 회복 이후 러닝 피크는 다시 그 지점부터 갱신되며, 이후 재차 −10% 하회 시 **새 에피소드**로 취급(다중 에피소드).
- 한 에피소드당 마일스톤/축하는 **1건만**(도중에 여러 버킷을 지나도 최심 버킷 하나로 통합).

### 신규 파일

- `src/lib/finance/drawdown.ts` — 순수 엔진.
  ```ts
  export interface DrawdownEpisode {
    peakDate: string;
    startDate: string;
    troughDate: string;
    depth: number;              // 음수, 예: -0.234
    bucket: number;              // 10|20|30|40|50
    recoveryDate: string | null; // 미회복이면 null
    passed: boolean;
  }
  export function computeDrawdownEpisodes(
    points: ValuePoint[],
    events: InvestmentEvent[],
    minBalance = 10_000,
  ): DrawdownEpisode[]
  ```
  + `drawdown.test.ts`.
- `src/lib/drawdownEpisodes.ts` — 로더. `loadPortfolioValueSeries`가 반환한 `closes`(캐시)로 전체 해상도 `ValuePoint[]`를 재구성해 `computeDrawdownEpisodes`에 넘긴다. **새 `calculation_snapshots` kind 없음 — 매 호출 결정적 재계산.**

### 연혁 연동

`src/lib/finance/milestones.ts`에 추가:
```ts
export function drawdownMilestones(episodes: DrawdownEpisode[]): Milestone[]
```
`passed` 에피소드만, `date = recoveryDate`, `label = "−{bucket}% 하락 구간을 매도 없이 통과"`. `/timeline`(회사 연혁)과 `growth/page.tsx`의 `TimelineCard`에서 기존 `data.timeline`(동기 계산)과 **페이지 레벨에서 merge + 재정렬**한다 — 드로다운 판정은 비동기 가격 시리즈가 필요해 `computeDashboard` 내부(동기)에 넣을 수 없기 때문.

### 축하 배선

`celebration.ts`의 `CelebrationOpts`에 `drawdownPassages: { recoveryDate: string; bucket: number }[]` 추가(= 위 에피소드에서 `passed` 것만 뽑은 얕은 목록). `computeCelebrations` 내부에서 각 항목을:
- key: `` `dd-pass:${recoveryDate}:${bucket}` ``
- 창: 기존 `ANNIVERSARY_WINDOW_DAYS`와 동일하게 **14일**(회복일로부터)
- 문구: 행동만 언급. 예 `"−{bucket}% 구간, 한 주도 팔지 않고 통과했어요"` (숫자를 부풀리거나 시장 톤을 넣지 않는다)
- href: `/timeline`

배선 위치: `dashboard/page.tsx`의 `HomeSignalsStreamed`(이미 Suspense 경계 안, `computeCelebrations` 호출부) — `loadDrawdownEpisodes`를 이 컴포넌트 안에서 호출해 `drawdownPassages`를 만들어 넘긴다.

### 엣지케이스

- **진행 중 미회복 에피소드**: 마일스톤·축하 없음. "진행 중" 표시 자체도 만들지 않는다(정직 원칙 — 아직 결과를 모르는 것을 미리 칭찬/경고하지 않음). 회복 시점에만 사후 인정.
- **다중 에피소드**: 각각 독립 판정. 한 에피소드의 `passed` 여부가 다른 에피소드에 영향 없음.
- **과거 시세 조정으로 에피소드가 미세 이동**: 종가 소스(`getDailyKrwCloses`)가 과거 값을 나중에 조정하면, 다음 재계산 때 에피소드 경계(시작일·최심일·버킷)가 살짝 달라질 수 있다 — **결정적 재계산의 수용된 특성**(저장하지 않으므로 항상 최신 데이터 기준 재판정).
- **이벤트 소프트삭제 시 재판정**: 별도 처리 불필요 — `events`는 항상 `activeEventRows`로 소프트삭제(`deleted_at`)·취소(`reverses_event_id`) 필터링된 것만 흘러들어온다(기존 단일 진실원천). 삭제·정정 후 재방문 시 자동으로 재판정된다.
- **에피소드 창 안 SELL 판정 범위**: `[peakDate, recoveryDate]`(양끝 포함) — 회복일 당일 매도도 통과 실격으로 본다(보수적 판정).

### 검증 계획 (합성 시리즈 단위테스트)

1. **V자 회복**: 피크 → −15% → 회복, 창 안 SELL 없음 → 에피소드 1건 `passed=true`, `bucket=10`.
2. **도중 매도**: 피크 → −25% → 창 안에서 SELL → 회복 → `passed=false`(마일스톤·축하 없음).
3. **인출로 인한 가짜 하락**: 큰 WITHDRAWAL 직후 `value` 급락하지만 흐름조정 `r_t`는 0에 가까움 → 에피소드 미발생(또는 −10% 미만).
4. **미회복 진행 중**: 시리즈 끝(`today`)까지 회복 안 됨 → `recoveryDate=null`, 연혁·축하 0건.
5. **다중 에피소드**: 두 번의 독립된 하락-회복 사이클, 하나는 `passed`, 하나는 도중 매도로 `not passed` → 정확히 1건만 마일스톤 생성.
6. **초기 잔고 하한 가드**: 설립 직후 소액 구간(`value < 1만원`)에서 체인이 시작되지 않아 인위적 급등락이 없음을 확인.

---

## 기능 2 — 복리 무중단 카운터 홈(그로스) 노출

### 구현

`src/components/growth/CompoundingStreakCard.tsx` 신규. `growth/page.tsx`가 이미 `computeDashboard`로 계산해 둔 `data.compoundingStreak`(`CompoundingStreak` 타입, `010-compounding-streak` 기 구현)를 그대로 받아 렌더링만 한다 — **새 계산 없음**. 배치는 `CompanyTierCard` 바로 아래(현재 growth 페이지에는 이 카드가 없다 — 신규 노출 지점).

- 표시: "복리 무중단 N개월"(1개월 미만은 "N일"), 최근 추가 투입 시 Flame 아이콘 보너스.
- `/report`(분기 결산의 복리 무중단 상세)로 연결.
- 빈 상태(자본 투입 이력 없음, `startDate === null`): 죄책감 유발 없는 중립 카피(기존 `EMPTY` 상태 규칙 §`compoundingStreak.ts` 준수).

### 가드레일

`src/lib/finance/compoundingStreak.ts`의 계산 로직과 현금흐름 부호 패턴은 **CFO 리포트 고도화와 함께 보류 중인 영역**(`cfo-report-deferred`) — **절대 무수정**. 이 기능은 이미 계산된 값을 화면에 얹는 것뿐이다.

---

## 기능 3 — "회장님" 호칭 통일 (카피만)

기존 "주주" 프레이밍을 지주회사 회장 로망(헌법 §3, ⑦)에 맞춰 "회장님"으로 정렬한다. **문구만 교체, 로직 무수정.**

| 파일 | 현재 | 변경 |
|---|---|---|
| `src/app/report/ReportContent.tsx` | `<h1>{holding.name} 경영 리포트</h1>` 단독, 부제 없음 | `<h1>` 아래 "회장님" 호칭이 들어간 부제 1줄 추가(예: "회장님, 이번 분기 실적을 보고드립니다") |
| `src/components/report/QuarterReportView.tsx` | 히어로 첫 줄 `{report.label} · 진행 중 ({report.days}일째)` | 같은 자리에 "회장님" 호칭을 포함한 인사 1줄로 교체(예: "회장님, {report.label} {report.days}일째 진행 중입니다") |
| `src/components/report/AnnualReportView.tsx` | 섹션 제목 "주주에게 보내는 숫자" | "회장님께 보고드리는 숫자"로 교체. 헤더 소절(`{report.label} · 제{report.edition}기`)에도 회장님 톤 반영 검토 |
| `src/app/annual-report/page.tsx` | 잠금 카드 "🔒 첫 연차보고서를 준비 중입니다" | "회장님" 호칭을 반영한 잠금 카피로 교체(예: "회장님의 첫 연차보고서를 준비 중입니다") |

정확한 문구는 구현 시점의 톤 다듬기 재량이나, **"주주" 단어는 위 4개 지점에서 전부 제거**하고 "회장님"으로 대체하는 것이 판정 기준이다.

### 가드레일

`buildComment`/`cfoComment`(CFO 총평 생성 로직) — **무수정**. CFO 리포트 고도화는 별도 보류 영역(`cfo-report-deferred`)이며 이 기능은 정적 레이블·인사말 문구만 건드린다.

---

## 기능 4 — 축하의 연혁 영구화 + 등급업 축하 배선

### (a) N주년 — 연혁 소급 생성

현재 `celebration.ts`의 `anniversary()`는 "가장 최근 지난 주년" **하나만** 계산해 홈 배너(14일 창)에 쓴다. 연혁(`/timeline`)에는 아직 하나도 안 남는다.

`journeyMilestones` 시그니처를 확장한다:
```ts
export function journeyMilestones(
  events: InvestmentEvent[],
  seed: { foundedAt: string; initialValuation: number },
  nameOf: (symbol: string) => string,
  today: string,
  archivedPlans: RebalancePlan[],
): Milestone[]
```
`today`를 기준으로 설립일부터 **지난 주년을 전부**(celebration.ts의 `anniversary()`와 동일한 월-일 비교 규칙 재사용) 순회하며 `{date: 주년일, label: "설립 N주년"}`을 push한다. **저장 불필요** — 매 호출 시 `foundedAt`·`today`에서 결정적으로 재생성.

### (a) 계획 완수 — 연혁 + 마이그레이션

**신규 마이그레이션 1건**: `holdings.archived_plans jsonb not null default '[]'` — 완료(또는 교체/취소)된 리밸런싱 계획을 최대 20개까지 보관하는 배열.

`src/app/rebalance/actions.ts`의 `saveRebalancePlan`·`clearRebalancePlan`이 **`active_plan`을 덮어쓰거나 지우기 직전**, 현재 `active_plan`을 `parsePlan`으로 파싱해 성공하면(완수 여부와 무관하게) `archived_plans`에 append한다. 20개 초과 시 가장 오래된 것부터 제거(FIFO cap).

`src/lib/plan.ts`에 추가:
```ts
export function planCompletionDate(
  plan: RebalancePlan,
  events: InvestmentEvent[],
): string | null
```
각 leg별로 `events`(날짜순 BUY 누적)를 따라가며 `baseBought + shares`에 처음 도달한 날짜를 구하고, 모든 leg가 도달했으면 그중 **가장 늦은 날짜**(전부 체결된 시점)를 반환. 하나라도 미도달이면 `null`(미완수 상태로 아카이브된 계획).

`journeyMilestones`가 `archivedPlans`를 순회하며 `planCompletionDate`가 `null`이 아닌 것만 `{date: completionDate, label: "자본배분 계획 완수"}`로 push. **완수일은 저장하지 않고 매번 `events`에서 재판정**(결정적).

`database.types.ts`에 `holdings.archived_plans` 컬럼 반영(재생성).

### (b) 등급업 — 축하 배선

`src/lib/style.ts`에 등급 서열 export:
```ts
export function gradeRank(label: string): number
// "과매매 주의" < "성장하는 투자가" < "규율 있는 장기투자가" < "자본배분의 달인"
```

`src/lib/styleHistory.ts`의 `StyleHistorySnapshot`에 옵셔널 필드 추가:
```ts
score?: number;
gradeLabel?: string;
```
**`VERSION = "v1"` 그대로 유지**(v2로 올리면 기존 스냅샷과의 분기 비교가 끊긴다 — 옵셔널 필드 추가는 하위호환이라 버전업 불필요). `toStyleHistorySnapshot`이 `style.score`·`style.grade?.label`을 채워 넣도록 확장.

신규 로더:
```ts
export async function loadLatestStyleSnapshot(
  supabase: SupabaseClient<Database>,
  holdingId: string,
  before?: string, // as_of_date < before. 없으면 전체 최신 1건.
): Promise<StyleHistorySnapshot | null>
```
`loadPreviousStyleSnapshot`(분기 시작 이전 커트라인 고정)과 달리 임의 커트라인으로 "최신 1건"을 가져오는 범용 조회.

**배선**:
- `growth/page.tsx`에도 `/style` 페이지와 동일한 `after(() => saveStyleSnapshot(...))` 패턴을 추가한다 — 방문만으로 스냅샷이 쌓여 분기 경계에 갇히지 않고 등급 변화가 더 자주 기록된다.
- `dashboard/page.tsx`의 `HomeSignalsStreamed`에서 (computeStyle 재계산 없이) `loadLatestStyleSnapshot`을 두 번 호출한다: 최신 1건(`latest`) → `latest.asOfDate` 이전 중 최신 1건(`previous`). 둘 다 `gradeLabel`이 있고 `gradeRank(latest.gradeLabel) > gradeRank(previous.gradeLabel)`이면 `computeCelebrations`에 `gradeUp: { label: latest.gradeLabel }`을 전달, `celebration.ts`가 key `` `grade-up:${quarterLabel}` ``(같은 분기엔 1회)로 축하를 만든다. **가벼운 DB 읽기 2건뿐, `computeStyle` 재계산 없음.**

### 엣지케이스

- **콜드스타트**: 과거(이 기능 배포 이전) 스냅샷엔 `gradeLabel`이 없다. `previous.gradeLabel`이 없으면 비교 불가 → **그 분기엔 등급업 신호를 만들지 않는다.** 이후 두 번째 스냅샷부터 정상 비교 시작. **의도된 동작**.
- **완수했지만 아직 활성인 계획**: `archived_plans`는 계획이 새로 저장되거나 지워질 때만 채워진다. 완수된 계획이 여전히 `active_plan`으로 남아 있으면 사용자가 다음 계획을 시작하거나 지우기 전까지 연혁에 나타나지 않는다 — 설계상 허용된 지연.
- **N주년 재계산**: 설립일·오늘 날짜만으로 결정적이라 저장 불일치 걱정 없음.

---

## 전역 가드레일 (스펙 전체에 적용)

- **`CELEBRATION_DENYLIST` 불변·불위반** — 평가액 상승·초록색 하루·XIRR 숫자·종목 급등은 이 스펙의 어떤 기능도 축하 트리거로 쓰지 않는다. 드로다운 인내조차 "낙폭"이 아니라 "안 판 결정"을 축하한다.
- **스타일 중립** — 가치·성장 재단 금지. 등급업(4b)도 규율 점수(저비용·저레버리지·계획준수)만 반영하며 매매 스타일과 무관.
- **보류 영역 불가침** — CFO 리포트 고도화(`cfoComment`/`buildComment`), 현금흐름 부호 패턴(`compoundingStreak.ts` 내부 로직) 무수정.
- **XIRR·90일 게이트·랭킹(032) 채점 로직 불변** — 이 스펙은 새 엔진(드로다운) 추가와 기존 값 노출/연혁화일 뿐, 기존 채점 공식을 건드리지 않는다.
- **신규 DB 테이블 없음** — 예외는 `holdings.archived_plans` 컬럼 1개뿐(기능4). 드로다운·N주년·등급업은 전부 결정적 재계산이거나 기존 `calculation_snapshots`(style-history) 재사용.

---

## DB 변경

| 마이그레이션 | 내용 |
|---|---|
| `supabase/migrations/<적용시점>_holdings_archived_plans.sql` (신규) | `alter table holdings add column archived_plans jsonb not null default '[]'` |

---

## 파일 목록

| 파일 | 변경 |
|---|---|
| `src/lib/finance/drawdown.ts` | 신규 — 드로다운 에피소드 엔진 |
| `src/lib/finance/drawdown.test.ts` | 신규 |
| `src/lib/drawdownEpisodes.ts` | 신규 — 로더(캐시된 종가 재사용, fetch 0) |
| `src/lib/finance/milestones.ts` | 수정 — `drawdownMilestones`, `journeyMilestones` 시그니처 확장(today·archivedPlans) |
| `src/lib/celebration.ts` | 수정 — `drawdownPassages`, `gradeUp` opts 추가 |
| `src/lib/plan.ts` | 수정 — `planCompletionDate` 추가 |
| `src/app/rebalance/actions.ts` | 수정 — `saveRebalancePlan`/`clearRebalancePlan`에 아카이브 로직 |
| `src/lib/style.ts` | 수정 — `gradeRank` export |
| `src/lib/styleHistory.ts` | 수정 — `score`/`gradeLabel` 옵셔널 필드, `loadLatestStyleSnapshot` 신설(VERSION "v1" 유지) |
| `src/app/growth/page.tsx` | 수정 — `CompoundingStreakCard` 배치, 드로다운 연혁 merge, `after(saveStyleSnapshot)` 배선 |
| `src/app/timeline/page.tsx` | 수정 — 드로다운·N주년·계획완수 연혁 merge |
| `src/app/dashboard/page.tsx` | 수정 — `HomeSignalsStreamed`에 드로다운·등급업 축하 배선 |
| `src/components/growth/CompoundingStreakCard.tsx` | 신규 |
| `src/app/report/ReportContent.tsx` | 수정 — 카피만(회장님 부제) |
| `src/components/report/QuarterReportView.tsx` | 수정 — 카피만(히어로 인사) |
| `src/components/report/AnnualReportView.tsx` | 수정 — 카피만("주주"→"회장님") |
| `src/app/annual-report/page.tsx` | 수정 — 카피만(잠금 문구) |
| `supabase/migrations/<적용시점>_holdings_archived_plans.sql` | 신규 |
| `src/lib/supabase/database.types.ts` | 재생성 |
