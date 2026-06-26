# 로드맵 구현 현황 감사 (2026-06-19)

> [PRD v0.7](./rational-capital-prd-v0.7.md) 각 항목을 실제 코드와 대조한 결과. ✅ 구현 / ◐ 부분 / ✗ 없음.
> 목적: "다 했나?" 헷갈리지 않게 V1/V2/V3 남은 일을 한눈에. 코드 변경 시 갱신.
>
> **핵심 요지:** "MVP"라기엔 이미 V1/V2 상당수가 구현됨(투시재무제표·펀더멘털플래그·내재가치·공시피드·리밸런싱·멀티계좌 등). 남은 건 좁혀진 **V1 목록**.

---

## ✅ 이미 구현됨 (v0 코어 + V1/V2 당겨 만든 것)

| 항목 | 근거(파일) |
|---|---|
| PME 엔진(동일현금흐름 벤치마크, 다지수) | [benchmark.ts](../src/lib/finance/benchmark.ts) `computeBenchmarkFor`·`benchmarkValueOn` |
| 운영모드 ledger/challenge | [transactions/actions.ts](../src/app/transactions/actions.ts) `mode==="ledger"?date:today` |
| 시세 피드 Yahoo (Toss seam) | [prices.ts](../src/lib/finance/prices.ts) `fetchOne` 교체점 |
| 멀티계좌 CRUD + 계좌별 수수료율 | [accounts/actions.ts](../src/app/accounts/actions.ts), [fees.ts](../src/lib/finance/fees.ts) |
| 순자산 분리(부채·수기자산 CRUD, XIRR 제외) | [networth/page.tsx](../src/app/networth/page.tsx), [realAssets.ts](../src/lib/finance/realAssets.ts) |
| 리밸런싱(목표비중·드리프트·플랜) | [rebalance/](../src/app/rebalance/), [rebalance.ts](../src/lib/rebalance.ts) `planInvestment` |
| 자산배분 3탭(종목/국가/산업)+유형별 | [allocation/](../src/app/allocation/), [allocation.ts](../src/lib/allocation.ts) |
| 종목 기본지표(PER/PBR/PSR/ROE/이자보상…) | [stocks/[symbol]/page.tsx](../src/app/stocks/[symbol]/page.tsx) |
| 내재가치 평가(오너이익·안전마진·자본배분 RONTE/RNI/RMC) | [intrinsic.ts](../src/lib/finance/intrinsic.ts), DnaYearPanel |
| 투시재무제표(DART+EDGAR, 온라인 파생) | [lookThrough.ts](../src/lib/finance/lookThrough.ts), [lookthrough/](../src/app/lookthrough/) |
| 펀더멘털 플래그(재무 6룰 + 공시 22힌트) | [fundamentalFlags.ts](../src/lib/finance/fundamentalFlags.ts), [dart.ts](../src/lib/finance/dart.ts) `HINT_RULES` |
| 공시피드(종목별 목록 + 홈 신호 알림) | [stocks/[symbol]/disclosures/](../src/app/stocks/[symbol]/disclosures/), [homeSignal.ts](../src/lib/finance/homeSignal.ts) |
| 마찰비용 기본(누적비용·드래그·TER 표시) | [dashboard.ts](../src/lib/dashboard.ts) `friction`/`drag`, [catalog.ts](../src/lib/finance/catalog.ts) `ter` |
| 결산 스트릭 🔥 | [quarterClose.ts](../src/lib/finance/quarterClose.ts) `reportStreak` |
| 설립기념일 축하 | [celebration.ts](../src/lib/celebration.ts) `anniversary` |
| ~~거장 13F 열람(정적)~~ **[제거됨]** | ~~legends.ts, LegendExplorer~~ — 2026-06-27 코드·DB 전체 삭제. spec/018 CANCELLED 참조. |
| CFO 리포트(룰기반 코멘트) | [quarterClose.ts](../src/lib/finance/quarterClose.ts) `buildComment`, [report/](../src/app/report/) |
| 자산 가리기 토글 | MaskProvider |
| 배당 캘린더(미래/과거 구분·연도 네비) | [dividends/](../src/app/dividends/), DividendView |
| 멀티 회사(생성·전환·격리) | [holdings.ts](../src/lib/holdings.ts) `getActiveHolding`, [company/](../src/app/company/) |

---

## V1 — 남은 실제 갭

| 항목 | 상태 | 비고 |
|---|---|---|
| **연차보고서**(ENUF Annual Report) | ✅ | `/annual-report`. 설립 1년 잠금·직전 1년 XIRR·투시·베스트/워스트·CFO총평·인쇄/PDF 저장 |
| **사업부 기여도**(leave-one-out XIRR) | ✅ | `/returns#contribution`. 복수 사업부 체크 제외·외부현금흐름 유지·XIRR 즉시 재계산 |
| **백분위 공유 카드**(상위 X%+히스토그램+공유) | ✅ | `/returns` 하단 "전체 순위" 카드. user_perf_snapshots 스냅샷 → get_xirr_percentile/histogram(security definer). 유저 1명일 땐 "비교할 유저 부족" 안내, 2명+부터 순위 표시 |
| 투자스타일 칭호 multi-axis | ✅ | 행동 기반 7축 점수·주 성향 1개·보조 성향 2개·근거·행동 불일치 인사이트 |
| 기업 등급 사다리(규모·연수) | 제외 | 개인투자자를 낮은 단계로 두는 위계가 "투자엔 여러 길이 있다"는 철학과 충돌해 의도적으로 구현하지 않음 |
| ISA/연금/해외 세금 + 세액공제 트래킹 | ✅ | `tax.ts` TaxCreditConfig 추가. `/friction` 하단 "절세계좌 세액공제 현황" 섹션. 계좌유형별 연간 납입액·한도·예상 공제액 표시 |
| 마찰비용 심화(ETF TER 누적₩·회전율·상세화면) | ✅ | `/friction`. 실제비용 유형·계좌·월별 집계, 회전율, ETF TER 연간·누적 추정 |
| ETF 실질부담비용 순위 | ✗ | 동일지수 ETF 비용 비교 섹션은 사용자 요청으로 제거. catalog에 trackedIndex·getEtfIndexGroups() 코드는 남아 있음. 재도입 시 friction 또는 검색에 추가 |
| 계좌별 자산배분 | ✅ | `/holdings` 계좌별·전체 보기 + 대시보드 `AccountGroups`. `/allocation` 탭 중복 구현은 하지 않음 |
| 리그/순위 UI | ✅ | `/leaderboard`. 연환산 XIRR 익명 순위. get_xirr_leaderboard(security definer), 내 행 "나" 배지 강조, 상위 30명 표시 |
| ~~레전드 PME 비교(거장과 동일현금흐름)~~ **[제거됨]** | ✗ | 거장 13F 열람 자체가 2026-06-27 제거됨. 재도입 금지. |

---

## V2 — 비전/심화

| 항목 | 상태 | 비고 |
|---|---|---|
| TTM 펀더멘털·밸류에이션 | ◐ 계획 | [TTM 도입 계획](./ttm-valuation-plan-v1.md). 연간 시리즈 보존 + TTM 별도 경로, 종목상세·투시 기본 기준 전환 |
| ETF 구성종목 투시 분해 | ✗ | lookThrough `etf_pending` |
| 통합 공시 연대기 피드 + "내 사업부 소식 ●3" 카운트 배너 | ✅ | `/disclosures`. DART+SEC 통합, 중요·참고·전체 분류, 읽음 처리, 홈 미확인 배지 |
| 사업부 MVP(분기 투시이익 1위) | ✅ | `/lookthrough` 상단 MVP 카드. 현재 공시 기준 netIncomeMine 1위 종목. 순이익 음수면 숨김 |
| 올해의 결정 | ✗ | PRD §10 보조 |
| 부동산 실거래가 평가(국토부) | ✗ | 수기 입력만, 자동 평가 없음 |
| Family Holding(가족 합산) | ✗ | |
| ~~거장 13F 자동 파이프(SEC EDGAR, CUSIP→티커)~~ **[구현 후 제거됨]** | ~~✗~~ **삭제** | 2026-06-27 전체 구현 완료(10개 거장 동기화 성공) 후 앱 색깔·데이터 정확도 문제로 의도적 제거. spec/018 CANCELLED 참조. 재도입 금지. |

---

## V3 — 후순위

| 항목 | 상태 | 비고 |
|---|---|---|
| 라이브 증권사 연동(진짜 순위) | ✗ | mode "live"는 스키마에만(고스트 타입) |
| CFO 리포트 AI 서사화 | ✗ | 현재 룰기반 4패턴. AI 호출 없음 |
| AI 공시 요약("이번 분기 핵심 3줄") | ✗ | |
| 데이터수집 Phase 2~4(OCR·증권사 파서·마이데이터) | ✗ | 현재 수동 입력만 |

---

## 추천 우선순위 (V1)
1. 백분위 공유 카드 — 바이럴이나 유저 분포 필요 → 뒤로.

---

## 토스 API 연결 시 할 일

| 항목 | 현재 | 교체 후 |
|---|---|---|
| 미국 ETF TER | Yahoo crumb 방식 시도 → 현재 막혀 있음. [yahooCrumb.ts](../src/lib/finance/yahooCrumb.ts) | 토스 API에서 ETF 총보수 제공 시 `fetchEtfTer()` 교체 |
| 한국 ETF TER | KRX 데이터 포털 JS 세션 필요 → 서버사이드 불가. [krxEtf.ts](../src/lib/finance/krxEtf.ts) 빈 맵 폴백. catalog.ts에 수동 등록된 ETF만 표시됨 | 자동화는 KRX Open API(openapi.krx.co.kr) 키 등록 또는 토스 API |
| 시세 피드 | Yahoo v8/chart `fetchOne()` | [prices.ts](../src/lib/finance/prices.ts) `fetchOne` 교체점에 토스 구현 |
| 종목 검색 | Yahoo search 프록시 | [api/search/route.ts](../src/app/api/search/route.ts) fetch 부분만 교체 |
