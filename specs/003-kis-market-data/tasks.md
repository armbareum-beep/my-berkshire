# Tasks: 한국투자증권(KIS) 시세·검색 데이터 소스 연동

**Input**: `/specs/003-kis-market-data/` (plan.md, spec.md, research.md, data-model.md, contracts/)
**Tests**: 헌법 게이트("계산 변경엔 단위테스트")에 따라 `normalize.ts` 순수함수 단위테스트만 포함. 그 외 테스트는 생략.
**Organization**: 사용자 스토리별 단계. US1(한글검색)은 토큰·시세 불필요 → 독립 MVP.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (공유 기반)

- [x] T001 [P] `src/lib/finance/source.ts` 생성 — `financeSource(): "yahoo"|"kis"`(env `FINANCE_SOURCE`, 기본 `yahoo`), 타입 export.
- [x] T002 [P] `src/lib/finance/kis/` 디렉터리 생성(US1은 `masterParse.ts`; 시세 `normalize.ts`는 US2에서).
- [x] T003 `.env.local`의 `KIS_APP_KEY`·`KIS_APP_SECRET`·`KIS_BASE_URL`(실전) 로드 + 토큰 발급 sanity 검증(HTTP 200).

**Checkpoint**: 플래그·디렉터리 준비. 기본 `yahoo`라 기존 동작 불변.

---

## Phase 2: Foundational (모든 스토리 선행)

**⚠️ 완료 전 스토리 작업 불가**

- [x] T004 `supabase/migrations/20260623010000_kis_security_master.sql` — 테이블 + 인덱스(name_ko, market) + RLS(인증자 read). **원격 적용 완료(db push)**.
- [x] T005 `src/lib/supabase/database.types.ts`에 `kis_security_master` 타입 반영(수기).
- [x] T006 [P] `src/lib/finance/kis/masterParse.ts` — 순수 파서 `parseDomesticMaster`·`parseOverseasMaster`(US1 범위). 시세 normalize는 US2.

**Checkpoint**: 스키마·정규화 골격 준비.

---

## Phase 3: User Story 1 - 한글 종목검색 (P1) 🎯 MVP

**Goal**: 검색창에서 한글 종목명("삼성전자")으로 종목을 찾는다. (토큰·시세 불필요 — 공개 종목마스터만)
**Independent Test**: `FINANCE_SOURCE=kis`에서 "삼성전자"→005930 결과.

- [x] T007 [US1] `scripts/syncKisMaster.ts` — 국내·해외 다운로드→zip해제(내장 zlib)→cp949→파싱→upsert. `npm run sync:kis-master` 실행 = **16,010종목(KR 3,567 / US 12,443) 적재**.
- [x] T008 [P] [US1] `src/lib/finance/kis/masterParse.test.ts` — 고정폭/탭 fixture 검증(6/6 통과).
- [x] T009 [US1] `src/lib/finance/kisMaster.ts` — `searchKisMaster(q)` ILIKE 매칭 → `SymbolSearchResult[]`.
- [x] T010 [US1] `src/app/api/search/route.ts` — `financeSource()==="kis"`면 `searchKisMaster` 사용, 응답 shape 동일.
- [x] T011 [US1] 적재 후 검증: "삼성전자"→005930, "에코프로"→086520, "애플"→AAPL, 코드/영문 검색 정상(SC-001 충족).

**Checkpoint**: 한글검색 동작(MVP). 시세는 아직 야후라도 무방.

---

## Phase 4: User Story 2 - 공식 시세·환율 (P2)

**Goal**: 국내·미국 현재가·환율·과거시세를 KIS로.
**Independent Test**: `/api/quote?symbols=005930,AAPL` 값이 KIS와 일치, ₩환산은 `t_rate`.

- [x] T012 [US2] `src/lib/finance/kis/client.ts` — `kisToken()`(모듈 캐시, 만료 60초 전 갱신, 동시발급 합류)·`kisFetch<T>(path,{trId,params})`(Bearer+appkey/secret 헤더, 서버전용).
- [x] T013 [P] [US2] `kis/normalize.ts`(+test) — 국내(`stck_prpr/stck_sdpr`)·해외(`last/base`)·FX(`t_rate`) 정규화. 12/12 통과.
- [x] T014 [US2] `src/lib/finance/prices.ts` — `getPrices`에 KIS 분기: 국내 `inquire-price`(FHKST01010100), 해외 `price`(HHDFS00000300, EXCD NAS→NYS→AMS 후보). shape 불변. 시세전용은 야후. KIS 실패 시 야후 폴백.
- [x] T015 [US2] `src/lib/finance/fx.ts` — `getFxToKrw`/`getUsdKrw`에 KIS 분기: 해외 `price-detail`(HHDFS76200200) `t_rate`. KRW=1, 비USD/실패는 야후.
- [ ] T016 [US2] **이번 패스 보류** — `getDailyKrwCloses`/`getYearEndCloses`(과거차트)는 야후 유지. 사유: KIS 일봉은 100행/호출 페이지네이션 필요(복잡도↑), 현재가·환율 win 우선. 후속.
- [x] T017 [US2] 통합 검증: KIS 모드 `getKrwPrices(["005930","AAPL"])` → 005930=353,500₩, AAPL=458,938₩($298.01×1540.01), usdKrw=1540.01 ✅.

**Checkpoint**: 시세·환율·차트 KIS 동작.

---

## Phase 5: User Story 3 - 안전한 소스 전환·폴백 (P3)

**Goal**: 설정 하나로 yahoo↔kis 전환, KIS 실패 시 안전 폴백, 회귀 0.
**Independent Test**: `FINANCE_SOURCE` 토글로 동작 전환, KIS 강제실패 시 크래시 없음.

- [x] T018 [US3] 실패 처리 일원화: prices KIS 실패→야후 폴백(try/catch), 비적격 심볼(지수·환율·코인)→야후, fx 비USD/실패→야후, search 실패→`[]`. throw 미전파.
- [x] T019 [US3] 회귀 확인: 강제 `yahoo` 모드 `getKrwPrices(["005930","AAPL"])` 정상(005930=353,500, available:true) — 기존 경로 불변(SC-003).
- [x] T020 [US3] KIS 키 서버 전용 확인 — finance 라이브러리 import하는 'use client' 컴포넌트 0건(FR-010).

**Checkpoint**: 전 스토리 독립 동작 + 안전장치.

---

## Phase 6: Polish & Cross-Cutting

- [x] T021 [P] 품질게이트: 내 파일 tsc 0에러, eslint 클린, 단위테스트 12/12. (저장소 기존 에러 findKrxPerBld·playwright 스크립트는 무관)
- [x] T022 [P] `scripts/registerKisMasterTask.ps1` + `runKisMasterSync.ps1`(매일 08:30 동기화) + `npm run register:kis-master-task`.
- [x] T023 [P] 문서 갱신: `docs/api-design-spec-v1.md`·`toss-migration-spec-v1.md` + 메모리 `symbol-search-architecture`에 KIS 구현 반영.
- [x] T024 검증: 검색·현재가·환율 통합 확인(과거차트 T016은 야후 유지·후속).

---

## Dependencies & Execution Order

- **Setup(P1) → Foundational(P2) → 스토리(P3+)**.
- **US1(한글검색)**: T004~T006 후 진행. **토큰·시세 불필요 → 단독 MVP·배포 가능**.
- **US2(시세)**: T012(토큰 클라이언트) 선행 → T014~T016. EXCD는 US1 마스터(T007) 의존(해외 시세).
- **US3(전환·폴백)**: US1·US2 분기 위에 폴백·회귀.
- **Polish**: 전 스토리 후.

### Parallel Opportunities
- T001·T002 [P], T006·T008 [P], T013 [P], Polish T021~T023 [P].

## Implementation Strategy
1. Setup+Foundational → 기반.
2. **US1(한글검색) → 독립 검증 → 여기서 멈춰도 가치(야후 한계 해소).**
3. US2(시세/환율) → 검증.
4. US3(전환·폴백·회귀) → 검증.
- 각 스토리 후 커밋·검증. `FINANCE_SOURCE=yahoo` 기본이라 미완성 단계도 프로덕션 안전.

## Notes
- 종목마스터(T007)는 공개 다운로드 → KIS 토큰 불필요(US1 독립성의 핵심).
- 시세전용 심볼(지수·환율·코인)은 KIS 미대상 → 야후 경로 유지.
- 해외 무료 15분 지연 — 본인/베타 허용(공개 시 §라이선스 별도, `docs/api-design-spec-v1.md` §10).
