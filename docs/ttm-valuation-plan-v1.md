# TTM 펀더멘털·밸류에이션 도입 계획 v1

> 작성: 2026-06-19  
> 상태: 구현 전 계획  
> 대상: 종목 상세 밸류에이션 · 내재가치 · 투시재무제표 · 분기 추이  
> 원칙: **연간 데이터는 보존하고 TTM을 별도 기준으로 추가한다. 숫자를 조용히 혼합하지 않는다.**

---

## 0. 결론

현재 `getFundamentals()`는 DART `reprt_code=11011` 사업보고서 또는 SEC 10-K의 최신 연간 실적을 반환한다. 현재가와 직전 사업연도 실적을 결합하므로 사업보고서 발표 전후에 PER·PSR·FCF·내재가치가 최대 1년 가까이 뒤처질 수 있다.

다음 구조로 바꾼다.

1. **연간 시리즈는 그대로 유지**한다. CAGR·다년 추세·연도별 플래그·수기 D&A 입력은 연간 데이터만 사용한다.
2. **TTM을 별도 데이터 객체로 추가**한다. 손익·현금흐름은 최근 12개월, 재무상태·주식수는 최신 분기말 스냅샷을 사용한다.
3. 종목 상세의 기본 밸류에이션 기준은 **TTM 우선, 직전 FY 명시적 폴백**으로 바꾼다.
4. 현재 시점 투시재무제표도 TTM을 사용한다.
5. 과거 분기 투시 시계열은 해당 시점에 실제 공시된 자료만 사용한다. 미래 공시를 과거 시점에 끌어오는 look-ahead를 금지한다.

---

## 1. 현재 구조 감사

### 1-1. 데이터 수집

- 한국: [`src/lib/finance/dart.ts`](../src/lib/finance/dart.ts)
  - `fetchAllAccounts()`가 `reprt_code=11011`만 요청한다.
  - `getFundamentals()`는 `currentYear-1~-3` 중 최신 사업보고서를 선택한다.
  - `getFundamentalsSeries()`는 연도별 사업보고서만 반환한다.
  - 캐시 키는 `(symbol, year, fs_div)`라 분기·반기·TTM을 표현할 수 없다.
- 미국: [`src/lib/finance/edgar.ts`](../src/lib/finance/edgar.ts)
  - `10-K`, `fp=FY`, 약 1년 길이 fact만 선택한다.
  - 10-Q 및 YTD 누적 fact는 현재 사용하지 않는다.

### 1-2. 소비 지점

- 종목 상세: [`src/app/stocks/[symbol]/page.tsx`](../src/app/stocks/[symbol]/page.tsx)
  - 최신 연간 순이익·매출·자본과 현재가로 PER/PBR/PSR을 만든다.
  - `?fy=` 기본값은 최신 사업연도다.
  - 내재가치는 연간/다년 정규화 오너이익을 사용한다.
- 투시: [`src/lib/finance/lookThrough.ts`](../src/lib/finance/lookThrough.ts)
  - 현재 투시와 과거 분기 포인트 모두 연간 `getFundamentals()`를 사용한다.
  - 분기 차트가 실제 분기 실적 변화가 아니라 연간보고서 계단 + 보유수량/주가 변화에 가깝다.
- 펀더멘털 플래그: [`src/lib/finance/fundamentalFlags.ts`](../src/lib/finance/fundamentalFlags.ts)
  - 연간 시리즈의 전년 대비 변화가 전제다.
- 정규화: [`src/lib/finance/normalize.ts`](../src/lib/finance/normalize.ts)
  - 연도 또는 N년 평균만 이해한다.

---

## 2. 계산 규칙

### 2-1. 항목을 두 종류로 분리

**기간 합계(flow)** — TTM 계산 대상:

- 매출 `revenue`
- 영업이익 `operatingIncome`
- 순이익 `netIncome`
- 영업/투자/재무 현금흐름 `ocf/icf/ffcf`
- 이자비용 `interestExpense`
- CapEx `capex`
- D&A `dna`
- FCF `fcf`
- 오너이익 `ownerEarnings`

**시점 잔액(snapshot)** — 합산 금지, 최신 분기말 값 사용:

- 자산·부채·자본
- 무형자산·매출채권·재고·이익잉여금
- 유통주식수

이 구분은 코드 상수로 고정한다. snapshot 값을 네 분기 더하는 실수를 타입/테스트로 막는다.

### 2-2. TTM 공식

분기·반기 보고서가 누적 YTD 값을 제공한다는 전제에서:

```text
TTM flow = 직전 확정 FY + 최신 YTD - 전년동기 YTD
```

예시:

```text
2026 Q1 TTM = FY2025 + 2026 Q1 YTD - 2025 Q1 YTD
2026 H1 TTM = FY2025 + 2026 H1 YTD - 2025 H1 YTD
2026 Q3 TTM = FY2025 + 2026 Q3 YTD - 2025 Q3 YTD
FY2025 직후 = FY2025
```

규칙:

- 각 flow 항목은 세 구성값이 모두 있을 때만 TTM을 만든다.
- 일부 항목만 FY 값을 끼워 넣어 TTM처럼 표시하지 않는다.
- 음수 값은 정상값으로 보존한다. `0`도 결측으로 바꾸지 않는다.
- 수정공시가 여러 개면 `filedAt`이 가장 최신인 값을 사용한다.
- 12월 결산법인을 가정하지 않는다. `periodEnd`, 기간 길이, fiscal period로 조립한다.

### 2-3. 파생 비율

| 지표 | TTM 기준 |
|---|---|
| PER | 현재 시총 ÷ TTM 순이익 |
| PSR | 현재 시총 ÷ TTM 매출 |
| 영업이익률 | TTM 영업이익 ÷ TTM 매출 |
| 순이익률 | TTM 순이익 ÷ TTM 매출 |
| FCF 수익률 | TTM FCF ÷ 현재 시총 |
| PBR | 현재 시총 ÷ 최신 분기말 자본. 명칭은 TTM이 아니라 `최근 분기말` |
| 부채비율 | 최신 분기말 부채 ÷ 최신 분기말 자본 |
| ROE | TTM 순이익 ÷ 최근 12개월 평균 자본. 시작 자본 없으면 최신 자본 폴백 + 낮은 신뢰도 |
| EPS | TTM 순이익 ÷ 최신 유통주식수 |

### 2-4. 오너이익·내재가치

```text
TTM owner earnings = TTM 순이익 + TTM D&A - TTM 유지 CapEx
```

- 미국은 Company Facts에서 TTM D&A를 만들 수 있는 경우가 많다.
- 한국은 D&A가 본문에 없을 수 있다. D&A 또는 유지 CapEx가 없으면 TTM 오너이익을 만들지 않는다.
- 불완전한 TTM 오너이익에 직전 FY 수기값을 몰래 섞지 않는다.
- TTM 오너이익이 완성되면 내재가치 기본 기준으로 사용한다.
- 완성되지 않으면 기존 `연간/정규화 오너이익`을 유지하고 화면에 폴백 기준을 명시한다.

---

## 3. 데이터 모델

### 3-1. 공통 기간 타입 신설

신규 파일 권장: `src/lib/finance/fundamentalPeriods.ts`

```ts
type FundamentalSource = "DART" | "SEC";
type FiscalPeriod = "FY" | "Q1" | "H1" | "Q3";
type FundamentalBasis = "FY" | "YTD" | "TTM";

interface FundamentalPeriod {
  source: FundamentalSource;
  symbol: string;
  fiscalYear: number;
  fiscalPeriod: FiscalPeriod;
  basis: "FY" | "YTD";
  periodStart: string | null;
  periodEnd: string;
  filedAt: string;
  filingId: string;
  fsDiv: "연결" | "개별";
  data: Fundamentals;
}

interface TtmFundamentals extends Fundamentals {
  basis: "TTM";
  periodEnd: string;
  latestFiledAt: string;
  components: {
    annual: string;
    currentYtd: string | null;
    priorYtd: string | null;
  };
  completeness: Record<string, boolean>;
}
```

기존 `Fundamentals.year`는 연간 시리즈 호환을 위해 유지한다. TTM을 연간 배열 안에 넣지 않는다.

### 3-2. API 경계

기존 함수 의미를 갑자기 바꾸지 않는다.

```ts
getFundamentals()        // 기존: 최신 연간, 호환 유지
getFundamentalsSeries()  // 기존: 연간 시리즈, 호환 유지

getTtmFundamentals(symbol, asOfDate, supabase)
getLatestFundamentalSet(symbol, asOfDate, supabase)
// -> { ttm, latestAnnual, annualSeries?, fallbackReason }
```

`asOfDate`를 필수로 받아 현재 화면과 과거 분기 복원에 같은 함수를 사용한다.

---

## 4. 한국 DART 수집

### 4-1. 보고서 코드

```ts
const REPORT_CODES = {
  FY: "11011",
  H1: "11012",
  Q1: "11013",
  Q3: "11014",
} as const;
```

### 4-2. 추출기 변경

`fetchAllAccounts(corp, year, fsDiv)`를 다음 형태로 확장한다.

```ts
fetchAllAccounts(corp, fiscalYear, fiscalPeriod, fsDiv)
```

추출 규칙:

- BS: `thstrm_amount` 최신 시점 잔액.
- IS/CI: 누적 필드(`thstrm_add_amount`) 우선, 보고서별 실제 응답 fixture로 검증.
- CF: 누적 YTD 필드 사용. 계정별 부호를 정규화한 뒤 TTM 조립.
- CFS 우선·OFS 폴백은 세 구성 보고서 전체에서 동일하게 유지한다.
- 연결 FY + 개별 YTD처럼 fsDiv가 섞이면 TTM 생성 실패로 처리한다.
- 발행주식수도 최신 report code와 period end를 따라간다.

### 4-3. 가용 기간 선택

1. `asOfDate` 이전에 제출된 정기공시만 후보로 둔다.
2. 가장 최신 FY를 찾는다.
3. 그 FY 이후의 최신 Q1/H1/Q3를 찾는다.
4. 같은 fiscal period의 전년 YTD를 찾는다.
5. 세 구성요소가 있으면 TTM, 없으면 최신 FY + `fallbackReason`.

---

## 5. 미국 SEC 수집

### 5-1. Company Facts 정규화

`Fact`에 다음 필드를 보존한다.

```ts
interface Fact {
  start?: string;
  end: string;
  val: number;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  accn?: string;
  frame?: string;
}
```

선택 규칙:

- FY: `10-K/10-K-A`, 약 1년 기간.
- YTD: `10-Q/10-Q-A`, 동일 fiscal period의 누적 기간.
- 같은 concept/start/end가 중복되면 최신 `filed`/`accn` 우선.
- `frame`에 의존하지 않는다. 비표준 결산월 기업도 start/end 기간으로 판별한다.
- instant fact는 latest period end의 마지막 제출값을 쓴다.
- USD→KRW 환산 규칙은 기존과 동일하게 유지하되, 환율 기준을 메타데이터에 명시한다.

### 5-2. TTM 조립

DART와 동일한 순수 함수 `composeTtm(annual, currentYtd, priorYtd, latestSnapshot)`를 사용한다. 공급자별 코드는 기간 정규화까지만 담당하고 계산 규칙은 공유한다.

---

## 6. 캐시·마이그레이션

현재 `fundamentals_cache(symbol, year, fs_div)`는 연간 데이터용으로 보존한다.

신규 테이블 권장:

```sql
create table fundamentals_period_cache (
  symbol         text not null,
  source         text not null,
  fiscal_year    integer not null,
  fiscal_period  text not null,
  period_end     date not null,
  fs_div         text not null,
  filing_id      text not null,
  filed_at       date not null,
  data            jsonb not null,
  fetched_at      timestamptz not null default now(),
  primary key (symbol, source, fiscal_period, period_end, fs_div)
);
```

정책:

- 인증 사용자 공용 읽기/쓰기 정책은 기존 `fundamentals_cache`와 동일.
- TTM 결과 자체는 저장하지 않고 캐시된 기간 데이터에서 파생한다.
- 최신 FY/YTD는 24시간 후 재검증해 수정공시를 반영한다.
- 오래된 확정 기간은 장기 캐시한다.
- 현재 lookthrough의 다종목 호출은 동시성 제한을 둔다. warm path는 DB 읽기만 발생해야 한다.

`calculation_snapshots`는 holding별 파생 결과 캐시이므로, TTM 투시 전체 결과를 저장할 때만 사용한다. 원천 공시 기간 캐시와 섞지 않는다.

---

## 7. 화면 적용

### 7-1. 종목 상세

- 기준 선택 첫 항목에 `TTM` 추가.
- TTM이 완성되면 기본 선택을 TTM으로 설정.
- URL은 `?fy=TTM`으로 공유 가능하게 유지.
- 카드 상단에 `TTM · 2026-03-31 기준`과 최신 공시일 표시.
- PER/PSR/마진/FCF는 TTM, PBR/부채비율은 `최근 분기말` 라벨.
- TTM 불가 시 `2025 FY 기준 · TTM 구성 자료 부족`을 명시.
- 연간 추세 차트·CAGR·연도별 수기 입력 패널에는 TTM을 넣지 않는다.

### 7-2. 내재가치

- TTM 오너이익 완성 시 `TTM 오너이익`을 기본 basis로 사용.
- 불완전하면 기존 정규화 basis를 유지하고 이유를 표시.
- 할인율·성장률 가정 로직은 변경하지 않는다.
- 안전마진 카드에 사용한 실적 basis를 항상 노출한다.

### 7-3. 현재 투시재무제표

- `computeLookThrough()`는 `getTtmFundamentals()` 우선.
- 종목별 period end가 다를 수 있으므로 `asOfNote`에 범위를 표시.
- leg별로 `TTM`, `FY fallback`, `공시 없음` 상태를 표시.
- 투시 PER/PSR/ROE/마진은 TTM flow + 최신 snapshot으로 계산.

### 7-4. 과거 분기 투시

- 각 `q.end`를 `asOfDate`로 전달한다.
- `filedAt <= q.end`인 공시만 사용한다.
- 해당 분기 당시 TTM이 없으면 당시 최신 FY로 폴백한다.
- 캐시 키를 `(symbol, asOfDate)` 또는 실제 구성 filing ID 묶음으로 변경한다.
- 이 단계가 끝나야 분기 차트가 실제 펀더멘털 변화 차트가 된다.

### 7-5. 펀더멘털 플래그

- 1차 릴리스에서는 기존 연간 플래그를 유지한다.
- TTM을 연간 배열에 끼워 넣지 않는다.
- 2차에서 `현재 TTM vs 전년동기 TTM` 전용 플래그를 별도 추가한다.

---

## 8. 구현 단계

### P0 — fixture·순수 계산 코어

- [ ] DART FY/Q1/H1/Q3 실제 응답 fixture 확보(CFS/OFS 각 1개 이상).
- [ ] SEC 10-K/10-Q Company Facts fixture 확보(12월/비12월 결산 각 1개).
- [ ] flow/snapshot 필드 분리 상수.
- [ ] `composeTtm()` 순수 함수와 테스트.
- [ ] `FundamentalPeriod`, `TtmFundamentals` 타입.

### P1 — DART 기간 수집

- [ ] report code 파라미터화.
- [ ] statement별 누적값 추출.
- [ ] 수정공시·연결/개별 일관성 처리.
- [ ] 최신 기간 선택과 `asOfDate` 필터.
- [ ] 기간 캐시 마이그레이션 및 타입 갱신.

### P2 — SEC 기간 수집

- [ ] Fact의 `fy/fp/filed/accn` 보존.
- [ ] 10-K/10-Q 중복·수정공시 정규화.
- [ ] 비12월 결산 TTM 조립.
- [ ] DART와 공용 `composeTtm()` 사용.

### P3 — 종목 상세 적용

- [ ] 연간 시리즈와 TTM 병렬 로드.
- [ ] `?fy=TTM` 및 기본 선택 변경.
- [ ] TTM 배수·마진·현금흐름 적용.
- [ ] snapshot 지표 라벨 분리.
- [ ] TTM 오너이익 완성/폴백 표시.

### P4 — 현재 투시 적용

- [ ] `computeLookThrough()` TTM 우선.
- [ ] leg별 basis·period end 메타데이터.
- [ ] 혼합 공시시점 안내.
- [ ] warm-cache 성능 측정.

### P5 — 과거 분기 투시·플래그

- [ ] `computeLookThroughSeries()` point-in-time 공시 선택.
- [ ] look-ahead 제거 회귀 테스트.
- [ ] 전년동기 TTM 플래그 추가 여부 결정.

---

## 9. 테스트 계획

### 순수 계산

- [ ] FY만 있을 때 TTM=FY.
- [ ] Q1/H1/Q3 각각 `FY + current YTD - prior YTD`.
- [ ] 음수 순이익·현금흐름 보존.
- [ ] `0`과 `null` 구분.
- [ ] snapshot은 최신값만 사용하고 합산하지 않음.
- [ ] 구성 항목 하나가 없으면 해당 TTM metric은 null.
- [ ] ROE 평균자본 및 fallback.

### 공급자 정규화

- [ ] DART `thstrm_amount`/`thstrm_add_amount` statement별 선택.
- [ ] CFS 우선, 세 기간 중 fsDiv 혼합 금지.
- [ ] SEC 10-Q YTD와 독립 분기 fact 혼동 방지.
- [ ] 10-K/A·10-Q/A 최신 제출 우선.
- [ ] 비12월 결산 기업.
- [ ] 최신 분기 보고서가 아직 없을 때 FY 폴백.

### 시점 정확성

- [ ] `filedAt > asOfDate` 공시는 과거 포인트에서 제외.
- [ ] 보고기간 종료 후 공시 전 구간은 직전 공시 사용.
- [ ] 수정공시는 수정 제출일 이후 포인트에만 반영.

### 회귀

- [ ] 기존 연간 series 순서·값 불변.
- [ ] CAGR·연간 플래그 불변.
- [ ] 현재가·XIRR·포트폴리오 계산 불변.
- [ ] DART/SEC 실패 시 화면이 FY 기준으로 정상 렌더.

---

## 10. 성능 게이트

- warm cache 종목 상세: 외부 공시 호출 0회.
- DART cold path: 선택된 fsDiv 기준 FY/current YTD/prior YTD만 요청.
- SEC cold path: Company Facts 1회.
- lookthrough 다종목: 제한된 동시성 + 기간 캐시 재사용.
- 기존 종목 상세 TTFB 대비 warm path +150ms 이내를 목표.
- TTM 로딩이 실패해도 연간 화면 전체를 블로킹하지 않고 FY를 먼저 표시할 수 있게 Suspense 경계를 검토.

---

## 11. 롤아웃

1. **Shadow:** UI 변경 없이 TTM을 계산하고 FY 대비 차이·결측률만 개발 로그로 확인.
2. **Opt-in:** 종목 상세에 TTM 탭을 노출하되 기본은 기존 FY.
3. **Default:** 커버리지와 fixture 검증 후 TTM을 기본 선택으로 전환.
4. **Look-through:** 현재 투시에 적용.
5. **Historical:** point-in-time 분기 투시 적용.

롤백은 TTM 기본 선택만 끄고 기존 `getFundamentals()` 연간 경로로 즉시 돌아갈 수 있어야 한다.

---

## 12. 완료 조건

- 종목 상세의 flow 기반 밸류에이션이 TTM을 기본 사용한다.
- snapshot 지표를 TTM이라고 잘못 표기하지 않는다.
- 모든 카드에 basis와 period end가 보인다.
- TTM 불완전 시 FY 폴백 이유가 보인다.
- 현재 투시가 TTM 기준으로 합산된다.
- 과거 투시에서 미래 공시 look-ahead가 없다.
- 연간 추세·CAGR·기존 플래그 값이 변하지 않는다.
- 타입체크·린트·단위 테스트·프로덕션 빌드가 통과한다.

---

## 13. 의도적 제외

- 분기 실적 예측·컨센서스·가이던스.
- 미공시 분기의 추정 보간.
- TTM과 FY 값의 조용한 혼합.
- TTM을 연간 CAGR 시리즈의 한 해처럼 취급.
- 현재 TTM 도입과 ETF 구성종목 투시를 한 작업으로 묶기.

