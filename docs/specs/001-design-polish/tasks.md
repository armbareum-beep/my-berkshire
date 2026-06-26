# Tasks 001 — 디자인 폴리시 패스 (실행 목록)

> `plan.md`의 단계(P0~P4)별 체크박스. 각 항목 = 1 커밋 단위 권장. `[파일:라인]`은 2026-06-17 감사 기준(이주 중 이동 가능).
> 게이트: 각 Phase 끝 `tsc`+`eslint` 클린 + 해당 화면 스크린샷. 데이터·계산 경로 불변(표현만).

---

## P0 — 프리미티브 (토대) ✅ 완료 (2026-06-17)

- [x] **T0.1 `SectionCard` 신설** — `src/components/ui/SectionCard.tsx`. `rounded-2xl bg-card shadow-card` + 제목행(`title`/`href`/`action`) + 선택 `footer` + `padding`. shadcn `ui/card.tsx`는 건드리지 않음(import 0건).
- [x] **T0.2 `CardShell`을 `SectionCard`로 재구현** — `cards.tsx`의 CardShell이 SectionCard 래퍼로(시그니처 유지, @deprecated 표기). 대시보드 다수 자동 수렴.
- [x] **T0.3 `Avatar` 신설 + `SymbolAvatar` 위임** — `src/components/ui/Avatar.tsx`(size sm/md/lg). `SymbolAvatar`(SymbolPicker.tsx)가 Avatar에 위임, 기본 lg=기존 h-10 유지.
- [x] **T0.4 `StockRow` 신설** — `src/components/ui/StockRow.tsx`. `[Avatar] 종목명/티커 ··· 값/등락(한국식 색)`. `sub`(기본 티커)·`value`/`changeRate` 표준 우측 + `right` 오버라이드 슬롯.
- [x] **T0.5 `CountUp` 신설** — `src/components/ui/CountUp.tsx`(client). `value`+`format`+`tabular-nums`, `prefers-reduced-motion`이면 즉시 최종값. rAF ease-out cubic ~700ms.
- [x] **T0.6 `WeightBar` 신설** — `src/components/ui/WeightBar.tsx`. `bg-secondary` 트랙 + `bg-primary` 채움.
- [x] **T0.7 `SegmentedTabs` 신설** — `src/components/ui/SegmentedTabs.tsx`. `/cash` 패턴 공용화.
- 검증: `tsc --noEmit` 클린 · `eslint` 클린.

## P1 — 색 시맨틱 교정 (정확성 우선) ✅ 완료 (2026-06-17)

- [x] **T1.1 FinancialHealth ✓/✗ 역전 수정** — ✓=`text-foreground`(잉크), ✗=`text-warn`, —=muted. (역전된 rise빨강/fall파랑 제거)
- [x] **T1.2 NetWorthSummary 위험 박스 → warn** — LEVEL_STYLE caution·danger = `bg-warn-tint text-warn`. 부채 금액 `text-[var(--fall)]` → `text-foreground`.
- [x] **T1.3 종목상세 경고색 → warn** — 저신뢰·미입력 ⚠ `text-[var(--fall)]` → `text-warn`(2곳).
- [x] **T1.4 StyleDetail 경고/히어로 색** — TONE 맵 제거(히어로 항상 `bg-card`), 경고 배너 `bg-warn-tint text-warn`.
- [x] **T1.5 QuarterReportView hint 색** — hintColor warn→`--warn`, good→`--foreground`. (+`pct` 미사용 import 정리)
- [x] **T1.6 HomeSignalBanner 색** — warn 톤 `bg-warn-tint text-warn`.
- [x] **T1.7 차트 그라데이션 제거** — ValueTrendChart·BenchmarkChart·**PriceChart**(추가 발견)의 `<Area>`+`linearGradient` → `<Line strokeWidth={2}>`. Area import 제거. grep `linearGradient` 0건.
- [x] **T1.8 도넛 팔레트 토널화** — `donutPalette.ts` 7색 채도 → 토스블루+쿨그레이 명도 8단계(--chart-* 계열).
- [x] **T1.9 인라인 색 → 유틸/시맨틱** — DisclosureList hintColor(=QuarterReport와 동일 교정), FinancialHealth 플래그 warn(fall→warn), 리밸런싱 합계검증(rise→warn ×2), 관심★ 토글(rise→primary ×2), health 상태점(rise→primary), ManualAssets 손익→`changeColor`. (LegendExplorer는 2026-06-27 삭제됨 — 13F 기능 전체 제거)
- [x] **T1.10 `changeColor` 0 처리** — `format.ts` 0=중립(muted), >0 rise, <0 fall.
- 검증: `tsc` 클린 · `eslint`(변경분) 클린 · grep 게이트(linearGradient 0 · 비-시세 rise/fall 잔여는 전부 정당[changeColor·손익·증감방향]).
- 비고: `SearchModal.tsx:34` setState-in-effect 는 **기존 lint 에러**(검색 디바운스, 색 수정과 무관) — 범위 밖이라 보존.

## P2 — 화면 이주 (수동 카드/행 → 프리미티브) ✅ 핵심 완료 (2026-06-17)

> 원칙 조정: 이미 spec에 맞는 표면(`rounded-2xl bg-card shadow-card`)은 회귀 위험만 큰 churn이라 *그대로 둠*. **실제 위반·가시 효과**(파란 면·종목행 비일관·솔리드 칩)에 집중.

- [x] **T2.1** HoldingsCard·RecentActivityCard·CardShell → `SectionCard`. **PlanCard 헤더 `bg-primary` 면 → 흰 표면 + `WeightBar`**(완료 ✓ rise색도 잉크로).
- [x] **T2.2** 대시보드 보유종목 → `StockRow`, 최근활동 아바타 통일.
- [x] **T2.5** 수익률: 미실현 → `StockRow`(아바타·티커 추가), 실현 이모지 원형 → `SymbolAvatar`.
- [x] **T2.6** 배당: DividendYields → `StockRow`, DividendView 아바타 prepend(예상 배지 보존).
- [x] **T2.7** 연혁 ActivityList → 종목 아바타 통일(현금 이벤트=행동명 이니셜).
- [x] **T2.9** 종목상세 내재가치 블록 `bg-primary/5 border-primary/30` → `bg-secondary`(파랑은 라벨만).
- [x] **T2.10** 리밸런싱 종목/국가/산업 솔리드 파랑 칩 → 중립 `SegmentedTabs`. (Link 미사용 정리)
- [x] **T2.4** 자산배분 상세 행 → `StockRow`(티커 자동).
- [x] **T2.11** 종목상세 거래내역 가격/수량 `tabular-nums`.
- [~] **T2.3 networth 행 / T2.8 lookthrough·style·report 카드** — 보류: 부채·수기자산은 symbol 없어 StockRow 비대상이고 `bg-secondary` 행은 spec 틴트 허용 범위. 카드 표면은 이미 준수. churn 회피.
- 검증: `tsc` 클린 · `eslint`(변경분) 클린.

### (구 P2 원본 목록 — 참고)

> 순서: 대시보드 → 자산/순자산 → 분석 → 플로우. 그룹별 커밋.

- [ ] **T2.1 대시보드 카드 이주** — `dashboard/cards.tsx`(71·113·149·210·281·355·542·592) 수동 표면 → SectionCard. PlanCard 헤더 `bg-primary` 채움 → 흰 표면+점(`PlanCard.tsx:45`).
- [ ] **T2.2 대시보드 종목/활동 행 → StockRow** — HoldingsCard(`cards.tsx:553`)·RecentActivityCard(`605`)·AccountGroups(`91`)·HoldingStructureTree(`77`).
- [ ] **T2.3 networth 이주** — `LiabilitiesSection`·`ManualAssetsSection` 행 `rounded-xl bg-secondary` 필 → StockRow/행 패턴. NetWorthSummary 카드 SectionCard화.
- [ ] **T2.4 자산배분 이주** — `allocation/page.tsx`·`[tag]`·`stock` 카드 SectionCard, 종목행 → StockRow(티커·등락 추가). 빈상태 CTA(T4.3과 함께).
- [ ] **T2.5 수익률 이주** — `returns/page.tsx:229-303` 이모지 원형/무아바타 행 → StockRow. 배당행 `bg-accent` 원 → 중립.
- [ ] **T2.6 배당 이주** — `dividends/DividendView.tsx:136`·`DividendYields.tsx:62` → StockRow(아바타+티커).
- [ ] **T2.7 연혁 이주** — `transactions/ActivityList.tsx:139-154` → StockRow `feed` variant("인수 · 삼성전자 10주 · 2일 전").
- [ ] **T2.8 lookthrough/style/report 카드 이주** — SectionCard화. lookthrough 상태칩 `bg-accent`→중립(`page.tsx:260`). StyleDetail/Portfolio 틴트 블록 정리.
- [ ] **T2.9 내재가치 블록 탈색** — `stocks/[symbol]/page.tsx:605`. `bg-primary/5 border-primary/30` → `bg-secondary`/흰 표면, primary는 라벨 텍스트만.
- [ ] **T2.10 필터/네비 칩 → SegmentedTabs** — `rebalance/page.tsx:84`·`[tag]:126-145`·자산배분 탭·공시 필터칩. 솔리드 `bg-primary` 다중 → 중립 세그먼트(메인 액션만 솔리드).
- [ ] **T2.11 비-tabular 숫자 교정** — `stocks/[symbol]/page.tsx:908`(거래내역 가격/수량) 등 `tabular-nums` 누락 추가.

## P3 — 딜라이트 (모션) ✅ 완료 (2026-06-17)

- [x] **T3.1 히어로 CountUp 적용** — 대시보드 순자산 + networth 순자산·종목 평가액/현재가·returns 누적손익·lookthrough 투시순이익·style 점수·report 분기수익률·dividends 연배당·cash 총현금·trend 평가액. `CountUp` 에 `style`(색 히어로) + `moneyCompact`/`wonCompact` 포맷 키 추가(직렬화 가능 prop만 — 서버 컴포넌트 호환). 색 있는 히어로는 style로 등락색 유지. `prefers-reduced-motion` 즉시표시.
- [x] **T3.2 도넛 터치 인터랙션** — `Donut.tsx` `onClick` 추가 → 탭하면 중앙 라벨이 그 조각으로 갱신(모바일 PWA). (recharts 이 버전엔 `activeIndex` prop 없음 → 조각 확대는 데스크탑 호버 유지, 터치는 중앙라벨 갱신으로.)
- [~] **T3.3 누름 반응** — 대부분 컴포넌트가 이미 `active:scale`/`transition` 보유. `<details>` grid-rows 전환·TransactionFlow 미세 칩 피드백 sweep 은 저우선이라 보류.
- 검증: `tsc` 클린 · `eslint` 클린 · 테스트 33/33.

## P4 — 플로우 · 카피 · 위생 ✅ 핵심 완료 (2026-06-17)

- [x] **T4.1 거래 플로우 탭바 제거** — `/transactions`·`/acquire`에서 `<BottomTabBar/>` + import 제거(이탈 방지, §4). ← 실제 UX 버그 수정
- [x] **T4.2 BottomTabBar 주석 수정** — "여정 중 화면(거래 입력·온보딩·로그인) 제외"로 교정(재발 방지).
- [x] **T4.3 빈화면 CTA** — ActivityList(첫 거래 기록하기)·allocation(첫 매수 기록하기) 빈 상태에 액션 링크.
- [x] **T4.4 인앱 확인** — `window.confirm` 3곳(LiabilitiesSection·ManualAssetsSection·ActivityList 삭제/취소) → **sonner 액션 토스트**(토스 무드 유지).
- [x] **T4.5 금지어/동사 일치** — AccountRow 버튼 "저장"→"수정 완료"(토스트와 동사 일치, 금지어 제거).
- [~] **T4.6 검색결과 현재가** — 보류: 결과마다 시세 fetch 필요(별도 데이터 작업). 현재도 로고+티커는 표시돼 오선택 위험은 낮음.
- [~] **T4.7 토큰 위생(dark:)** — 보류: 라이트 단일 앱이라 `dark:`는 **절대 매치 안 되는 무해한 죽은 클래스**. shadcn 변이 문자열 수술 리스크 > 가치.
- 검증: `tsc` 클린 · `eslint`(변경분) 클린 · **`next build` 전 페이지 통과**.

---

## 진행 게이트 (Definition of Done)
- 자동: `tsc --noEmit` 클린 · `eslint`(변경 파일) 클린 · grep 게이트(비-시세 rise/fall 0 · `linearGradient` 0 · "저장" 버튼 0 · `window.confirm` 0).
- 수동: 대시보드·순자산·종목상세·자산배분·수익률 **§7 5점 통과**(스크린샷). reduced-motion 동작 확인.
- 회귀: 히어로 값·등락 방향·계산 불변.
