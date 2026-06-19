# Plan 001 — 디자인 폴리시 패스 (구현 접근)

> `spec.md`의 요구사항(R1~R9)을 **어떻게** 구현할지. 실행 단위 목록은 `tasks.md`.
> 원칙: **컴포넌트 레이어를 세워 일관성을 구조로 강제** → 화면을 그 위로 이주 → 딜라이트. 화면별 산발 수정이 아니라, 공용 프리미티브 한 벌이 §7을 자동 보장하게 만든다.

## 0. 전략

감사 결론: 토큰(globals.css)은 옳으나 **컴포넌트 레이어가 비거나 깨져** 화면마다 표면·행·색을 문자열로 재구현 중. 따라서:

1. **Foundation 먼저** — 빠진/깨진 프리미티브(Card·StockRow·CountUp·WeightBar·color 규칙)를 세운다. 한 곳 고치면 N개 화면이 따라옴.
2. **색 정합성** — 시세색/경고색 오용은 *정확성* 문제(역전된 ✓/✗). 프리미티브 위에서 일괄 교정.
3. **이주** — 수동 카드·종목행을 프리미티브로 치환.
4. **딜라이트** — 카운트업·도넛 인터랙션·차트 라인화·모션.
5. **카피·플로우** — 빈화면 CTA·탭바 위치·확인 다이얼로그·금지어.

각 단계 끝에 `tsc`+`eslint` 클린 + 핵심 화면 스크린샷 확인. **한 번에 다 바꾸지 않고 단계별 커밋**(회귀 추적).

## 1. 새/수정 프리미티브 (R1·R2·R6)

`src/components/ui/`에 공용 레이어를 둔다. 각 컴포넌트는 순수 표시(서버 호환), 토큰만 사용.

### 1-1. `SectionCard` (R1) — 카드 단일화
- 현재 `ui/card.tsx`(shadcn)는 `ring-1 ring-foreground/10`+`rounded-xl`이고 **import 0건**. spec 위반 + 죽은 코드.
- **결정:** `ui/card.tsx`를 spec에 맞게 고치기보다, 앱 실사용 패턴(`rounded-2xl bg-card p-5 shadow-card` + 제목행 + 선택적 `›`/href + 선택적 footer)을 담은 `SectionCard`를 신설. shadcn `Card`는 외부 의존 없으니 건드리지 않거나 `SectionCard`가 내부에서 감싸도록.
- API(안): `<SectionCard title? href? action? footer? padding="lg|sm">children</SectionCard>`. 제목행(`mb-3 flex justify-between` + muted `›`)을 흡수.
- 치환 대상(수동 복제): `dashboard/cards.tsx`(CardShell 및 71/113/149/210/281/355/542/592), `BreakdownCard`, `HoldingStructureTree`, `StyleCard`, `LookThroughCard`, `AccountGroups`, 그리고 각 page.tsx의 인라인 `<section className="rounded-2xl bg-card p-5 shadow-card">`.
- *주의:* `CardShell`이 이미 추상화 지점 → 우선 `CardShell`을 `SectionCard`로 재구현하면 대시보드 다수가 한 번에 따라온다.

### 1-2. `StockRow` (R6) — 종목행 단일화 (§4-1)
- 캐논: `[SymbolAvatar] 종목명(굵게) / 티커(작은 회색) ··· (현재가) 등락률(한국식 색)`.
- variant: `feed`(연혁: 행동 라벨+시간), `holding`(평가액+등락), `search`(현재가+등락, 매수 결정용), `compact`.
- 치환: `returns/page.tsx`(이모지 원형/무아바타 행 229·286), `dividends/DividendView`·`DividendYields`(무아바타), `transactions/ActivityList`(무아바타 연혁), `allocation/[tag]`·`allocation/stock`(티커 없음), `SymbolSearch`(현재가·등락 추가), `dashboard/HoldingsCard`·`AccountGroups`·`HoldingStructureTree`(기존 행 흡수).
- `SymbolAvatar`(SymbolPicker.tsx)를 사이즈 prop 가진 `Avatar`로 정리(현재 h-10/h-9/h-7 제각각).
- *예외(치환 안 함):* `CompanyMetricsTable`(비교 표 — 의도적 테이블), 공시/문서 링크 행.

### 1-3. `CountUp` (R2) — 히어로 모션
- 신규 `ui/CountUp.tsx`(client). props: `value`, `format(n)=>string`, `tabular-nums` 유지, `prefers-reduced-motion`이면 즉시 최종값.
- 적용: 대시보드 순자산(cards.tsx:166), networth 순자산, 종목 평가액/현재가, returns 누적손익, lookthrough 투시순이익, style 점수, report 분기수익률, dividends 연배당/총, cash 총현금, trend 평가액.
- 구현: `requestAnimationFrame` ease-out, 약 600~800ms, 통화·부호 포맷은 기존 `format.ts` 함수 주입.

### 1-4. `WeightBar` / `Pill` (정리)
- `WeightBar`: `h-1.5 rounded-full bg-secondary` + `bg-primary` 채움(BreakdownCard·AllocationCard·StyleCard 중복) 단일화.
- 네비/필터 칩: `/cash`의 세그먼트 패턴(`bg-secondary` 컨테이너 + active `bg-card shadow-sm`)을 공용 `SegmentedTabs`로 → rebalance·allocation·필터 칩의 솔리드 `bg-primary` 다중 사용을 대체(R4).

## 2. 색 시맨틱 규칙 (R3·R4·R5)

**규칙 (코드 주석·리뷰 게이트로 고정):**
- `--rise`(#F04452 빨강) / `--fall`(#3182F6 파랑) = **시세 등락에만**. `changeColor()`·`text-rise`/`text-fall`만 이 맥락에서.
- 경고·위험·주의·"확인거리" = `--warn`(앰버) + `--warn-tint`. (PortfolioFlags가 이미 올바른 참조.)
- 통과/중립/상태 = `text-foreground`/`text-muted-foreground`. 아이콘 체크는 잉크 또는 앰버.
- 솔리드 `bg-primary` 면 = 화면당 메인 액션 1개. 그 외 파랑은 점·텍스트·8% 틴트(`--accent`)까지만.

**교정 지점:** FinancialHealth ✓/✗(역전 — ✓=잉크, ✗=warn), NetWorthSummary danger(→warn), 종목상세 저신뢰·미입력 ⚠(→warn), StyleDetail 경고 배너+히어로 틴트(→warn / 흰 표면), QuarterReportView hintColor warn(→warn), HomeSignalBanner(→warn-tint), lookthrough 상태칩·FeeRankCard 배너·rebalance 필터칩(→중립).

**차트(R5):** `ValueTrendChart`·`BenchmarkChart`의 `<Area>`+`linearGradient` 제거 → 단색 가는 `<Line strokeWidth={2}>`. 도넛 팔레트(`donutPalette.ts` 7색 채도)는 토널(단일 색조 명도 단계)+포인트로 재정의.

**유틸 게이트:** `style={{color: var(--fall)}}` 인라인 → `text-rise/fall/warn` 유틸. grep으로 비-시세 사용 0건 확인.

## 3. 탭바·플로우·카피 (R7·R8)

- **R7:** `BottomTabBar`를 `/transactions`·`/acquire`에서 제거. `BottomTabBar.tsx` 상단 주석을 spec(§4)과 일치하게 수정(근본 원인 — "거래 입력 등 여정 중 화면 제외"). 평시 화면엔 유지.
- **R8:** 빈/에러 상태에 다음 행동 CTA 추가(allocation·disclosures·activity·soon — 대시보드 빈 보유 카드의 "첫 매수 기록하기" 패턴 재사용). `window.confirm`(networth `LiabilitiesSection`·`ManualAssetsSection`, `ActivityList`) → 인앱 확인(sonner action 또는 간단한 확인 시트). `AccountRow` 버튼 "저장"→"수정 완료"(토스트와 동사 일치, 금지어 제거).

## 4. 토큰 위생 (R9)

- `ui/card.tsx`·`button.tsx`·`input.tsx`의 죽은 `dark:` 클래스 제거(라이트 단일).
- 컨트롤 라운드 스케일 정리(카드 2xl / 컨트롤 xl·full).
- 도넛 `onMouseEnter`만 → `onClick`/터치 대응(모바일 PWA).
- 이모지 아이콘(BottomTabBar·각 카드·DividendView 등) → lucide로 점진 일원화(이미 의존성). *대량이라 별도 저우선 작업으로.*

## 5. 단계 / 순서 (phasing)

| Phase | 내용 | 요구사항 | 검증 |
|---|---|---|---|
| **P0** | 프리미티브 신설: `SectionCard`·`StockRow`/`Avatar`·`CountUp`·`WeightBar`·`SegmentedTabs` | R1·R2·R6 토대 | 단위 렌더·tsc·eslint |
| **P1** | 색 시맨틱 교정(역전 ✓/✗·경고 앰버·차트 그라데이션 제거·도넛 팔레트) | R3·R5 | grep 게이트·스크린샷 |
| **P2** | 화면 이주: 수동 카드→SectionCard, 행→StockRow (대시보드→자산→분석 순) | R1·R6·R4 | 화면별 스크린샷·회귀 |
| **P3** | 딜라이트: 히어로 CountUp 적용·도넛 터치 인터랙션·세그먼트 탭 | R2·R4 | 모션 확인(reduced-motion) |
| **P4** | 플로우·카피: 탭바 제거·빈화면 CTA·인앱 확인·금지어·토큰 위생 | R7·R8·R9 | 플로우 워크스루 |

## 6. 리스크 / 완화

- **광범위 회귀(다수 화면 이주):** 단계별·화면 그룹별 커밋. 각 커밋 후 `tsc`+`eslint`+해당 화면 스크린샷. 계산·데이터 경로는 손대지 않음(표현만).
- **CountUp 성능/SSR:** client 컴포넌트로 분리, 서버 페이지에서 값만 주입. reduced-motion 즉시 표시.
- **도넛 팔레트 변경 가독성:** 카테고리 다수일 때 토널만으론 구분 약화 가능 → 명도 단계 + 라벨/리딩으로 보완(색에만 의존 안 함).
- **shadcn `Card` 비건드림:** 외부 import 0건이라 안전. 신규 `SectionCard`로 분리해 충돌 회피.

## 7. 검증 방법

- 게이트(자동): `npx tsc --noEmit`, `npx eslint`(변경 파일), 색 grep(비-시세 rise/fall 0건·linearGradient 0건·"저장" 버튼 0건·window.confirm 0건).
- 게이트(수동): 핵심 5화면(대시보드·자산/networth·종목상세·자산배분·수익률) §7 5점 통과를 스크린샷으로. `run`/`verify` 스킬로 로컬 구동.
- 기능 회귀 없음(히어로 숫자 값·등락 방향·계산 불변).
