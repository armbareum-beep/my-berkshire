# Implementation Plan: 상세 바텀시트(드롭시트) — 체감 속도 개선

**Branch**: `005-detail-bottom-sheet` | **Date**: 2026-06-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-detail-bottom-sheet/spec.md`

## Summary

홈(대시보드)의 **정보 조회형 섹션**과 종목/지수 상세를, 전체 페이지 이동 대신 **아래에서 올라오는 닫을 수 있는 시트**로 보여준다. 기술 접근은 Next(이 repo의 16 계열 변형)의 **Intercepting Routes + Parallel Routes** — 루트 레이아웃에 단일 `@sheet` 슬롯을 두고 대상 라우트를 `(.)`로 가로채, 앱 안의 소프트 내비게이션은 시트로, 딥링크/새로고침은 기존 전체 페이지로 분기한다. 시트는 기존 서버 라우트를 그대로 렌더하므로 콘텐츠가 100% 재사용되고(FR-005), 그 아래 홈/목록은 마운트 유지되어 스크롤·검색 상태가 보존된다(FR-003). 닫기 4종은 모두 `router.back()`으로 수렴시킨다.

## Technical Context

**Language/Version**: TypeScript 5+, Next.js(이 repo의 16 계열 변형 — `node_modules/next/dist/docs/` 우선), React 19.2(canary)
**Primary Dependencies**: Next App Router(parallel/intercepting routes), Tailwind, 기존 Supabase. **신규 외부 의존 없음**(스와이프 제스처도 직접 구현)
**Storage**: 변경 없음(신규 테이블·마이그레이션 없음). 기존 상세 데이터 소스(Supabase·DART·Yahoo) 재사용
**Testing**: `npx tsc --noEmit`·ESLint 게이트, `next build`(슬롯 default.js 검증), verify/run 스킬로 수동 동작 검증
**Target Platform**: 모바일 웹 우선(앱은 `max-w-[480px]` 중앙 단일 컬럼, 라이트 단일). 데스크톱도 동일 시트(FR-005a)
**Project Type**: Web app (Next App Router, 단일 프로젝트)
**Performance Goals**: 시트 표시 시작 ≤0.3s(SC-001), 닫기 후 배경 재요청 0회(SC-002)
**Constraints**: 신규 외부 의존 금지, 기존 URL 계약·데이터/차단 규칙 보존, 헌장 IV(애니메이션 절제)
**Scale/Scope**: 인터셉트 대상 조회형 라우트 ~10개(stocks·index·report·networth·lookthrough·disclosures·company·holdings·dividends·annual-report), 작업형 4개는 인터셉터 없이 전체 페이지 유지

## Constitution Check

*GATE: Phase 0 전 통과 필수. Phase 1 설계 후 재확인.*

| 원칙 | 평가 | 결과 |
|---|---|---|
| I. 스타일 중립 | 점수·보상 로직 없음. 표현 방식만 변경 | ✅ 해당 없음 |
| II. 정직한 게이미피케이션 | 가짜 숫자·임의 목표 도입 없음 | ✅ 해당 없음 |
| III. 엔진 정확·화면 단순 | 계산·데이터 로직 불변(기존 Content 재사용). 화면은 더 단순(peek 시트). 콘텐츠를 단일 Content 컴포넌트로 두어 원천 1개 유지 | ✅ 부합 |
| IV. 토스급 절제 | 시트=디밍 배경 위 흰 카드 슬라이드, 단일 모션 ≤250ms, 그라데이션·과한 모션 금지, `docs/mockups/*` 톤 유지 | ✅ 가이드 준수로 통과 |
| V. 단일 진실원천 | 데이터·이벤트 원장 변경 없음. 표시 경로만 추가 | ✅ 부합 |

**스택 불변식**: Next 변형 가이드(`node_modules/next/dist/docs/`) 확인 완료(parallel·intercepting·v16 default.js·scroll-behavior). 모바일 단일 컬럼·라이트 단일 유지. **위반 없음 → Complexity Tracking 비움.**

**Post-Design 재확인(Phase 1 후)**: 설계가 위 평가를 바꾸지 않음. Content 분리는 오히려 단일 원천(III·V)을 강화. ✅

## Project Structure

### Documentation (this feature)

```text
specs/005-detail-bottom-sheet/
├── plan.md              # 이 파일
├── research.md          # Phase 0 — 라우팅·v16·크롬분리·시트셸 결정
├── data-model.md        # Phase 1 — 데이터 엔티티 없음, 라우트/슬롯 구조 기술
├── quickstart.md        # Phase 1 — 적용·검증 가이드
├── contracts/
│   ├── sheet-component.md   # <Sheet> UI 계약(props·닫기·접근성)
│   └── route-structure.md   # @sheet 슬롯·인터셉터·default/catch-all 계약
└── tasks.md             # /speckit.tasks 출력 (이 명령에서 생성 안 함)
```

### Source Code (repository root)

```text
src/app/
├── layout.tsx                         # [수정] @sheet 슬롯 prop 추가·렌더
├── @sheet/
│   ├── default.tsx                    # [신규] null (v16 필수, 하드내비 시 시트 없음)
│   ├── [...catchAll]/page.tsx         # [신규] null (작업형 이동 시 시트 비움)
│   ├── (.)stocks/[symbol]/page.tsx    # [신규] <Sheet><StockDetailContent/></Sheet>
│   ├── (.)index/[symbol]/page.tsx     # [신규] 지수 상세 시트
│   ├── (.)report/page.tsx             # [신규] 분기 리포트 시트
│   ├── (.)networth/page.tsx           # [신규] 순자산 시트
│   ├── (.)lookthrough/page.tsx        # [신규] 투시(사업부 실적) 시트
│   ├── (.)disclosures/page.tsx        # [신규] 공시 시트
│   ├── (.)company/page.tsx            # [신규] 연혁 시트
│   ├── (.)holdings/page.tsx           # [신규] 보유 현황 시트 (P2)
│   ├── (.)dividends/page.tsx          # [신규] 배당 일정 시트 (P2)
│   └── (.)annual-report/page.tsx      # [신규] 연간 리포트 시트 (P2)
│
├── stocks/[symbol]/page.tsx           # [리팩터] 셸 + <StockDetailContent/> + 크롬
├── index/[symbol]/page.tsx            # [리팩터] 셸 + Content
├── report/page.tsx, networth/page.tsx, lookthrough/page.tsx,
├── disclosures/page.tsx, company/page.tsx ...  # [리팩터] Content 분리(단계적)
│
└── (작업형: transactions, rebalance, import, accounts — 변경 없음)

src/components/
├── ui/Sheet.tsx                       # [신규] 드롭시트 셸(배경·슬라이드·X·스와이프·스크롤락)
└── stocks/StockDetailContent.tsx 등   # [신규/이동] 크롬 없는 내용 컴포넌트(라우트에서 추출)
```

**Structure Decision**: 단일 Next App Router 프로젝트. 신규 폴더는 루트 병렬 슬롯 `src/app/@sheet/`와 시트 셸 `src/components/ui/Sheet.tsx`. 각 조회형 라우트는 "셸 + Content" 로 분리해 전체 페이지와 시트가 동일 Content를 공유한다. 작업형 라우트는 손대지 않으며, 인터셉터를 두지 않는 것만으로 전체 페이지 동작이 유지된다.

## Complexity Tracking

> 헌장 위반 없음 — 비움.
