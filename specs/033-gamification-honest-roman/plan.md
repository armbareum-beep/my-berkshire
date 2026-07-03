# Implementation Plan: 게이미피케이션 강화 — 드로다운 인내·연혁 영구화·등급업 축하

**Branch**: `033-gamification-honest-roman` | **Date**: 2026-07-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/033-gamification-honest-roman/spec.md` + 구현 선행 검토본 [design-notes.md](./design-notes.md)

## Summary

하락→회복 구간을 매도 없이 통과한 "인내"를 판정하는 순수 엔진(드로다운 에피소드)을 신설해 홈 축하·회사 연혁에 배선하고(P1), 증발하던 축하(설립 N주년·계획 완수)를 연혁에 영구화하며(P2), 규율 등급 상승 축하(P2)·복리 무중단 카운터 상시 노출(P3)·"회장님" 호칭(P4)을 얹는다. 기술 접근: 기존 가치 시계열 캐시를 재사용하는 **흐름조정 TWR 체인**으로 에피소드를 **결정적 재계산**(저장 없음), DB 변경은 `holdings.archived_plans` jsonb 컬럼 1개뿐. 상세 설계는 design-notes.md(코드 대조 선행 검토 완료).

## Technical Context

**Language/Version**: TypeScript (strict), Next.js App Router — 이 repo 변형(`node_modules/next/dist/docs/` 가이드 우선)
**Primary Dependencies**: 기존 스택만 — Supabase(@supabase/ssr), Tailwind, lucide-react. **신규 외부 의존 0**
**Storage**: Supabase Postgres — 신규 컬럼 `holdings.archived_plans jsonb not null default '[]'` 1개. 신규 테이블 0 (드로다운·주년·완수일은 결정적 재계산, 등급 기록은 기존 `calculation_snapshots` style-history 재사용)
**Testing**: vitest (`*.test.ts`) — 드로다운 엔진 합성 시리즈 6케이스, plan 완수일 판정, styleHistory 스냅샷 왕복
**Target Platform**: 모바일 웹 단일(라이트 단일), Vercel 배포
**Project Type**: web-app (Next.js 서버 컴포넌트 중심 + Supabase)
**Performance Goals**: 홈 첫 페인트 비차단(SC-006) — 드로다운·등급업 판정은 `HomeSignalsStreamed`(Suspense 경계) 안에서만 수행. 드로다운 재계산은 캐시된 종가 재사용으로 네트워크 fetch 0, 순수 CPU 수 ms
**Constraints**: CELEBRATION_DENYLIST 불변(FR-012), 보류 영역(cfoComment/buildComment·compoundingStreak 내부 로직) 무수정(FR-013), styleHistory `VERSION="v1"` 유지(과거 스냅샷 호환)
**Scale/Scope**: 신규 파일 4(엔진·테스트·로더·카드) + 수정 13파일 + 마이그레이션 1 — design-notes.md 파일 목록 참조

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* — **v1.3.0 기준 평가**

| 원칙 | 판정 | 근거 |
|---|---|---|
| I. 스타일 중립 | ✅ PASS | 드로다운 인내=무매도 행동(스타일 무관), 등급업=규율 점수(저비용·저레버리지·계획준수)만. 거래 빈도·회전율을 보상하는 장치 없음. FR-012로 명문화 |
| II. 정직한 게이미피케이션 | ✅ PASS | 축하는 시장 결과가 아니라 행동/시간만: 드로다운 축하 대상은 "낙폭"이 아니라 "안 판 결정"(헌장 II의 "행동/시간 축하" 조항에 정합). 미회복 구간 침묵(FR-006), 가짜 숫자 없음(전부 원천 재계산, FR-014), 빈 상태 중립 톤(US4-2). CELEBRATION_DENYLIST 불변 |
| III. 엔진 정확·화면 단순 | ✅ PASS | 판정은 순수 엔진(`drawdown.ts`)+단위테스트, UI는 엔진 결과만 표시. 흐름조정 TWR로 입출금 왜곡 제거(명세 기반 정확성). 화면 추가는 카드 1장·연혁 항목·배너뿐 |
| IV. 토스급 디자인 절제 | ✅ PASS | 신규 화면 없음 — 기존 배너·연혁·카드 패턴 재사용. 등락색 규칙 불변(축하는 기존 tone 체계) |
| V. 단일 진실원천·정합 | ✅ PASS | `events`가 유일 원장 유지 — 에피소드·완수일·주년은 원장에서 파생(저장 안 함). `archived_plans`는 거래가 아니라 "계획 문서" 이력 보관이므로 이중 계상 아님 |
| 품질 게이트 | ✅ 계획 반영 | 계산 변경 → `drawdown.test.ts` 신설·`styleHistory.test.ts` 확장. DB 변경 → `supabase/migrations/` + 타입 재생성. 마이그레이션 순서: 컬럼(default 포함)을 코드보다 먼저 적용 |

**Post-Phase 1 재평가 (2026-07-03)**: 데이터 모델 확정 후에도 위반 없음 — 신규 저장은 `archived_plans` 1개뿐이고 나머지는 파생 계산. Complexity Tracking 해당 없음.

## Project Structure

### Documentation (this feature)

```text
specs/033-gamification-honest-roman/
├── spec.md              # 요구사항 (완료)
├── design-notes.md      # 구현 선행 검토본 (완료 — plan의 상세 부록)
├── plan.md              # 이 파일
├── research.md          # Phase 0 — 설계 결정·근거·대안
├── data-model.md        # Phase 1 — 엔티티·마이그레이션·상태 전이
├── quickstart.md        # Phase 1 — 검증 절차
├── checklists/requirements.md
└── tasks.md             # /speckit.tasks 산출 (이 커맨드에선 생성 안 함)
```

contracts/ 없음 — 외부 노출 인터페이스(API·CLI) 신설이 없는 앱 내부 기능(내부 함수 시그니처는 design-notes.md에 명세).

### Source Code (repository root)

```text
src/lib/finance/
├── drawdown.ts              # 신규 — 에피소드 판정 순수 엔진
├── drawdown.test.ts         # 신규 — 합성 시리즈 6케이스
├── milestones.ts            # 수정 — drawdownMilestones + journeyMilestones 확장
src/lib/
├── drawdownEpisodes.ts      # 신규 — 캐시 재사용 로더(fetch 0)
├── celebration.ts           # 수정 — drawdownPassages·gradeUp opts
├── plan.ts                  # 수정 — planCompletionDate
├── style.ts                 # 수정 — gradeRank export
├── styleHistory.ts          # 수정 — score/gradeLabel 필드·loadLatestStyleSnapshot (VERSION v1 유지)
src/app/
├── rebalance/actions.ts     # 수정 — 계획 교체/삭제 시 archived_plans 보관
├── growth/page.tsx          # 수정 — CompoundingStreakCard·연혁 merge·after(saveStyleSnapshot)
├── timeline/page.tsx        # 수정 — 드로다운·주년·완수 연혁 merge
├── dashboard/page.tsx       # 수정 — HomeSignalsStreamed에 축하 배선
├── report/ReportContent.tsx · annual-report/page.tsx   # 수정 — 카피만
src/components/
├── growth/CompoundingStreakCard.tsx   # 신규
├── report/QuarterReportView.tsx · AnnualReportView.tsx # 수정 — 카피만
supabase/migrations/
└── <적용시점>_holdings_archived_plans.sql              # 신규 컬럼 1개
src/lib/supabase/database.types.ts                      # 재생성
```

**Structure Decision**: 기존 단일 Next.js 앱 구조 그대로 — 순수 계산은 `src/lib/finance/`, 로더는 `src/lib/`, 화면은 `src/app/`+`src/components/` 관례를 따른다. 신규 디렉토리 없음.

## Complexity Tracking

> Constitution Check 위반 없음 — 해당 사항 없음.
