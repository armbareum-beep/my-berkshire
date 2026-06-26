---
description: "Task list for 018-13f-auto-pipeline — CANCELLED"
---

# ⛔ Tasks: 거장 13F 자동 파이프 [CANCELLED]

> **이 기능은 2026-06-27 구현 완료 후 의도적으로 제거되었습니다.**  
> 이 tasks.md의 태스크는 이미 완료·삭제 처리된 내역이며, 재구현하지 말 것.  
> 제거 이유 및 삭제된 파일 목록은 [spec.md](./spec.md)의 CANCELLED 블록 참조.

**Input**: Design documents from `/specs/018-13f-auto-pipeline/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/sync-pipeline.md](./contracts/sync-pipeline.md)

**Tests**: 변화 분류 순수 함수(`classifyChange`)에 단위 테스트 1건 포함(계산 변경). 나머지는 quickstart.md 수동 검증.

**Organization**: 태스크는 user story별로 묶여 각 스토리를 독립적으로 구현·검증·배포할 수 있다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 가능(다른 파일, 미완 의존 없음)
- **[Story]**: US1/US2/US3 — spec.md user story 매핑

## Path Conventions

Next.js App Router, 저장소 루트 `src/` 단일 트리. 스크립트는 `scripts/`, 마이그레이션은 `supabase/migrations/`.

---

## Phase 1: Setup

**Purpose**: 사전 확인. 신규 의존·DB 없음.

- [x] T001 이 repo의 Next 변형 컨벤션 확인: `node_modules/next/dist/docs/` 서버 컴포넌트 패턴 한 번 훑고, [src/lib/finance/edgar.ts](../../src/lib/finance/edgar.ts)·[src/lib/finance/legends.ts](../../src/lib/finance/legends.ts)·[src/components/benchmark/LegendExplorer.tsx](../../src/components/benchmark/LegendExplorer.tsx) 기존 구조 파악(코드 변경 없음).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 모든 스토리를 막는 선행 DB 작업.

**⚠️ CRITICAL**: DB 마이그레이션이 완료돼야 US1·US2·US3 구현 착수 가능.

- [x] T002 `supabase/migrations/YYYYMMDDHHMMSS_legend_13f_pipeline.sql` 작성 — `legend_registry`(id·key·name·firm·cik_str·logo_key·long_return·last_synced_at), `legend_13f_snapshots`(id·legend_id·filing_year·filing_quarter·filed_at·accession_number·total_value_usd·holding_count·synced_at, UNIQUE(legend_id,filing_year,filing_quarter)), `legend_13f_holdings`(id·snapshot_id·cusip·ticker·issuer_name·shares_held·market_value_usd·investment_discretion·weight, UNIQUE(snapshot_id,cusip)), `cusip_ticker_cache`(cusip PK·ticker·issuer_name·exchange·last_verified_at) 테이블 생성. RLS: 모두 공개 SELECT·service_role 쓰기. 초기 INSERT: buffett/0001067983, ark/0001819062, ackman/0000875588.
- [x] T003 마이그레이션 적용(`npx supabase db push`) + TypeScript 타입 재생성(`npx supabase gen types typescript --local > src/lib/supabase/database.types.ts`). 타입 재생성 후 tsc 오류 없는지 확인.
- [x] T004 [P] [src/lib/finance/edgar.ts](../../src/lib/finance/edgar.ts)에 `fetch13fLatest(cikStr: string): Promise<{ accessionNumber: string; filingYear: number; filingQuarter: number; filedAt: string } | null>` 추가 — `https://data.sec.gov/submissions/CIK{cikStr}.json` 호출, `filings.recent.form[]`에서 `"13F-HR"` 인덱스 찾아 accessionNumber·date·reportDate 반환. 없으면 null. 의존: T003.

**Checkpoint**: 마이그레이션 적용 완료, edgar.ts 함수 추가 완료 → US1·US2·US3 병렬 착수 가능.

---

## Phase 3: User Story 1 — 거장 포트폴리오가 항상 최신이다 (Priority: P1) 🎯 MVP

**Goal**: 하드코딩 정적 데이터 → DB 기반 최신 분기 데이터 전환. `npm run sync:13f` 실행으로 EDGAR 수집.

**Independent Test**: `npm run sync:13f` 실행 → `/allocation` 화면 거장 선택 → 기준일이 직전 분기 이내, 종목 수가 최신 13F와 일치([quickstart.md](./quickstart.md) US1).

### Implementation for User Story 1

- [x] T005 [P] [US1] [src/lib/finance/legends.ts](../../src/lib/finance/legends.ts) — `Legend` 인터페이스에 `cikStr: string`, `latestSnapshot: { year: number; quarter: number; filedAt: string } | null`, `lastSyncedAt: Date | null` 추가. `LegendHolding` 인터페이스에 `cusip: string`, `sharesHeld: number`, `marketValueUsd: number`, `change: 'new' | 'added' | 'reduced' | 'exited' | 'unchanged'` 추가. 기존 상수(`LEGENDS`)는 하드코딩 유지(폴백용).
- [x] T006 [US1] [src/lib/finance/legends.ts](../../src/lib/finance/legends.ts) — `fetchLegendsFromDb(supabase: SupabaseClient): Promise<Legend[]>` 추가 — `legend_registry` LEFT JOIN `legend_13f_snapshots`(최신 분기, ORDER BY filing_year DESC, filing_quarter DESC LIMIT 1) LEFT JOIN `legend_13f_holdings` 조회. DB 실패 시 하드코딩 `LEGENDS` 폴백(FR-007). 의존: T003, T005.
- [x] T007 [US1] `scripts/sync13fHoldings.ts` 신규 작성 — ① `legend_registry` 전체 조회(service_role) ② 거장별 `fetch13fLatest(cikStr)` 호출 ③ `legend_13f_snapshots`에 동일 (legend_id, filing_year, filing_quarter) 이미 있으면 스킵 ④ `https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/infotable.xml` 다운로드·파싱(nameOfIssuer·cusip·value·sshPrnamt·investmentDiscretion) ⑤ CUSIP 배치 → `cusip_ticker_cache` 조회 → 미캐시 항목만 `POST https://api.openfigi.com/v3/mapping` 배치 호출(최대 100개/요청) → 결과 캐시 저장 ⑥ weight 계산(종목 시가/총 시가) ⑦ `legend_13f_snapshots` INSERT(ON CONFLICT DO NOTHING), `legend_13f_holdings` INSERT ⑧ `legend_registry.last_synced_at` 갱신 ⑨ 거장별 try/catch — 실패 시 스킵+로그, 나머지 계속. 의존: T002, T003, T004.
- [x] T008 [P] [US1] `package.json` — `"sync:13f": "tsx scripts/sync13fHoldings.ts"` 스크립트 추가. 의존: T007.
- [x] T009 [US1] [src/app/allocation/page.tsx](../../src/app/allocation/page.tsx) — 하드코딩 `LEGENDS` import 대신 `fetchLegendsFromDb(supabase)` 서버사이드 호출로 교체. supabase 클라이언트는 동일 파일의 기존 인스턴스 재사용. 의존: T006.
- [x] T010 [US1] [src/components/benchmark/LegendExplorer.tsx](../../src/components/benchmark/LegendExplorer.tsx) — 거장 선택 화면 하단에 기준일 표시(`"2025 Q1 · 제출 YYYY-MM-DD"` 형식). `latestSnapshot null` 시 "데이터 없음" 표시(FR-005). 의존: T005.

**Checkpoint**: `npm run sync:13f` 후 거장 화면에 최신 분기 데이터 + 기준일 표시. US1 독립 배포 가능(MVP).

---

## Phase 4: User Story 2 — 거장이 이번 분기 뭘 샀고 팔았는지 본다 (Priority: P2)

**Goal**: 분기 변화(신규·추가·축소·청산) 분류 + 매수/매도 탭에 배지 표시.

**Independent Test**: 거장 선택 → 매수 탭에 신규·추가, 매도 탭에 축소·청산 항목 표시. 전 분기 없을 때 "이전 분기 데이터 없음" 안내([quickstart.md](./quickstart.md) US2).

### Implementation for User Story 2

- [x] T011 [P] [US2] [src/lib/finance/legends.ts](../../src/lib/finance/legends.ts) — `classifyChange(prevShares: number | null, curShares: number): 'new' | 'added' | 'reduced' | 'exited' | 'unchanged'` 순수 함수 추가(prevShares null→'new', curShares 0→'exited', 증가→'added', 감소→'reduced', 동일→'unchanged'). [src/lib/finance/legends.test.ts](../../src/lib/finance/legends.test.ts) 신규 — 경계값 5케이스 단언(null/0/증가/감소/동일). 의존: T005.
- [x] T012 [US2] [src/lib/finance/legends.ts](../../src/lib/finance/legends.ts) — `fetchLegendsFromDb` 수정: 이전 분기 스냅샷도 함께 조회하여 각 holding의 `change` 필드를 `classifyChange(prevShares, curShares)`로 채움. 전 분기 스냅샷 없으면 모든 항목 `'new'` 처리. 의존: T006, T011.
- [x] T013 [US2] [src/components/benchmark/LegendExplorer.tsx](../../src/components/benchmark/LegendExplorer.tsx) — 매수 탭 필터를 `change === 'new' || change === 'added'`로, 매도 탭을 `change === 'reduced' || change === 'exited'`로 교체. 기존 `prevWeight` 기반 로직 제거. 각 항목에 변화 배지('신규'·'추가'·'축소'·'청산') 표시. 의존: T010, T012.
- [x] T014 [US2] [src/components/benchmark/LegendExplorer.tsx](../../src/components/benchmark/LegendExplorer.tsx) — 최초 스냅샷이거나 전 분기 데이터 없는 경우 포트폴리오 탭 상단에 "이전 분기 데이터가 없어 변화를 비교할 수 없습니다" 안내 표시. 매수/매도 탭에는 "전 분기 없음" 메시지. 의존: T013.

**Checkpoint**: 분기 변화 분류·표시 완료. US1·US2 독립 동작.

---

## Phase 5: User Story 3 — 여러 거장 전환 + 자동 Cron (Priority: P3)

**Goal**: Vercel Cron으로 분기별 자동 수집. 거장 전환 시 개별 기준일 + 수집 실패 안내.

**Independent Test**: 여러 거장 전환 → 각각 다른 기준일 표시. Cron 엔드포인트 직접 호출 → `{ ok: true }` 반환([quickstart.md](./quickstart.md) US3).

### Implementation for User Story 3

- [x] T015 [P] [US3] `src/app/api/cron/sync-13f/route.ts` 신규 — GET 핸들러. `Authorization: Bearer ${process.env.CRON_SECRET}` 검증(없으면 403). sync 로직(T007과 동일 핵심 로직 모듈로 공유) 호출. 항상 HTTP 200 반환(Vercel 재시도 방지). 응답: `{ ok: boolean; legends: number; newSnapshots: number; durationMs: number }`. 의존: T007.
- [x] T016 [P] [US3] `vercel.json` — `"crons"` 배열에 `{ "path": "/api/cron/sync-13f", "schedule": "0 9 16 2,5,8,11 *" }` 추가(2·5·8·11월 16일 UTC 09:00). 기존 `regions: ["icn1"]` 유지. 의존: T015.
- [x] T017 [US3] [src/components/benchmark/LegendExplorer.tsx](../../src/components/benchmark/LegendExplorer.tsx) — 거장 아바타 전환 시 선택된 거장의 `lastSyncedAt`을 별도 표시. `lastSyncedAt null` → "마지막 업데이트 실패" 안내(이전 데이터는 정상 표시, FR-007). 의존: T013.

**Checkpoint**: 자동 Cron 설정, 거장별 업데이트 날짜·실패 안내 완료.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 품질 게이트·회귀 확인.

- [x] T018 [P] 변경 파일 `npx tsc --noEmit` 클린 확인 — edgar.ts·legends.ts·LegendExplorer.tsx·allocation/page.tsx·sync-13f/route.ts·sync13fHoldings.ts 전부.
- [x] T019 [P] 변경 파일 `npx eslint` 클린 확인(EXIT=0).
- [ ] T020 [quickstart.md](./quickstart.md) 수동 검증: `npm run sync:13f` 실행 → US1(기준일 표시·종목 최신) → US2(매수/매도 탭 변화 배지) → US3(여러 거장 전환·기준일 개별·Cron route 직접 호출) → 회귀(내 보유 배지·도넛 차트·기존 유형/국가/산업 탭). `run`/`verify` 스킬로 실제 앱 구동·스크린샷.

---

## Dependencies & Execution Order

### Phase Dependencies
- **Setup(Phase 1)**: 즉시 시작.
- **Foundational(Phase 2)**: Phase 1 후. **T002→T003→T004 순서 권장(DB 타입 재생성 후 edgar.ts 작성).**
- **US1(Phase 3)**: Foundational 완료 후. T005·T006 병렬 → T007(T004·T005 의존) → T008·T009·T010.
- **US2(Phase 4)**: US1 완료 권장(fetchLegendsFromDb 수정). T011 독립, T012→T013→T014 순.
- **US3(Phase 5)**: T007 완료 후. T015·T016 병렬.
- **Polish(Phase 6)**: 원하는 스토리 완료 후.

### User Story Dependencies
- **US1(P1)**: 독립. Foundational 후 바로 착수.
- **US2(P2)**: US1 fetchLegendsFromDb 로직 공유. T011(classifyChange)은 US1과 독립 착수 가능.
- **US3(P3)**: T007(sync 스크립트) 완료 후 T015 착수. T016은 T015 후.

### Parallel Opportunities
- **T004·T005 [P]**: edgar.ts·legends.ts 다른 파일 → 동시 진행 가능.
- **T008 [P]**: package.json만, 독립.
- **T011 [P]**: 순수 함수 + 테스트, 독립.
- **T015·T016 [P]**: 다른 파일(route.ts·vercel.json), 동시 진행 가능.
- **T018·T019 [P]**: 품질 게이트 병렬.
- 팀 분담 시: 개발자 A=US1(T005·T006·T007·T009·T010), 개발자 B=US2(T011·T012·T013·T014) 동시.

---

## Parallel Example: User Story 1

```bash
# Foundational 완료 후 US1 병렬 시작 가능:
Task: "legends.ts 인터페이스 확장"          # T005 [P]
Task: "fetch13fLatest edgar.ts 추가"        # T004 [P] (Phase 2에서 이미 시작)

# T005 완료 후:
Task: "fetchLegendsFromDb 추가"             # T006
Task: "sync13fHoldings.ts 스크립트 작성"   # T007 (T004, T005 의존)

# T006·T007 완료 후:
Task: "package.json sync:13f 추가"          # T008 [P]
Task: "allocation/page.tsx DB 호출 교체"    # T009
Task: "LegendExplorer 기준일 표시"          # T010
```

---

## Implementation Strategy

### MVP First (User Story 1)
1. Phase 1 Setup → Phase 2 Foundational.
2. US1(T005–T010) 완료 → `npm run sync:13f` 실행 → 화면에서 최신 분기 확인.
3. **STOP & VALIDATE**: quickstart.md US1 검증.
4. 데모 가능(정적 데이터 탈피 = 핵심 가치 전달).

### Incremental Delivery
1. Setup → Foundational → US1(수집+최신화) → 검증/데모.
2. US2(변화 분류) 추가 → 검증/데모.
3. US3(Cron+여러 거장) 추가 → 검증/데모.
4. Polish(품질 게이트·전체 검증).

---

## Notes
- [P] = 다른 파일·무의존. sync13fHoldings.ts 핵심 로직은 route.ts(T015)가 모듈로 공유해야 중복 없음.
- CUSIP 매핑 실패 종목은 `ticker = null`, `issuer_name` 유지 — 화면에 "Unknown(CUSIP)" 표시(FR-002 폴백).
- `classifyChange` 단위 테스트(T011)는 계산 변경 포함이므로 TDD 적용 권장.
- 각 태스크·논리 그룹 후 커밋. 체크포인트에서 스토리 독립 검증.
- 총 20 태스크: Setup 1, Foundational 3, US1 6, US2 4, US3 3, Polish 3.
