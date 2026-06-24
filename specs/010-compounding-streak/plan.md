# Implementation Plan: 복리 유지 지표 (Compounding Streak)

**Branch**: `010-compounding-streak` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-compounding-streak/spec.md`

## Summary

`events`에서 자본 흐름(DEPOSIT/WITHDRAWAL)만 추려, **소비성 자본인출 없이 복리를 지켜온 연속 기간**(복리 무중단 streak)을 결정적으로 계산하는 순수 함수를 추가한다. 끊김은 자본이 지주회사(복리 기계) 밖으로 나가 소비되는 WITHDRAWAL에만 적용하며, **현금 보유·계좌 간 이동·배당 인출·매매는 끊김이 아니다**(현금=기계 안의 대기 자본, 멍거 제1원칙). 결과를 대시보드 페이로드에 실어 히어로에 한 줄("복리 무중단 N개월", 최근 투입 시 🔥), 상세는 분기 결산에 노출한다. 동시에 사용자 화면의 CAGR 노출을 제거해 비율은 XIRR("연 수익률") 하나로 통일한다. 새 테이블·새 의존성·새 라우트 없음 — 기존 파생 계산 패턴(`returns.ts`, `dashboard.ts`)을 따른다. `cashWeight`는 끊김 판정에 쓰지 않는다.

## Technical Context

**Language/Version**: TypeScript (기존 repo 설정)  
**Primary Dependencies**: Next.js(이 repo 변형 — `node_modules/next/dist/docs/` 가이드 우선), 신규 외부 의존 **없음**  
**Storage**: Supabase Postgres — **스키마 변경 없음**. streak은 `events`에서 파생 계산(저장 안 함)  
**Testing**: Vitest (`src/lib/finance/*.test.ts` 패턴, `describe/it/expect`)  
**Target Platform**: 모바일 단일·라이트 단일 웹앱  
**Project Type**: Web (Next.js App Router 변형)  
**Performance Goals**: streak 계산은 이벤트 1회 순회 O(n) — 대시보드 조립에 무시할 수준  
**Constraints**: 기능통화 KRW, 날짜는 `todayKST()`/`YYYY-MM-DD` 문자열, 시세 무관(파생은 자본 흐름·날짜만)  
**Scale/Scope**: 사용자당 단일 holding, 이벤트 수백~수천 건 규모

## Constitution Check

*GATE: Phase 0 전 통과 필수. Phase 1 설계 후 재확인.*

| 원칙 | 판정 | 근거 |
|------|------|------|
| I. 스타일 중립 | ✅ Pass | 회전율·매매빈도 보상 없음. 종목 교체는 streak 무관(FR-010). 보편 규율(자본 유지)만 평가. |
| II. 정직한 게이미피케이션 | ✅ Pass | 성과(시세)가 아닌 행동·시간 축하(FR-009). 빈 장부엔 임의 시작일 안 만듦(FR-006). 가짜 숫자 없음 — 전부 이벤트 파생. |
| III. 엔진 정확·화면 단순 | ✅ Pass | 순수 함수로 정확 계산 + 단위테스트. 히어로는 한 줄, 깊이는 결산으로 점진 공개(FR-004/007). UI는 엔진 결과만 표시. |
| IV. 토스급 절제 | ✅ Pass | 무채색 텍스트 한 줄, 🔥는 기존 `reportStreak` 배지와 동일 어휘로 절제 사용. 등락색(빨강/파랑) 미사용. |
| V. 단일 진실원천 | ✅ Pass | `events` 단일 원장에서 파생. 새 테이블·이중 계상 없음. 외화는 기존 ₩환산 규칙 그대로. |

**위반 없음** → Complexity Tracking 불필요.

추가 게이트(품질):
- 변경 파일 `npx tsc --noEmit` · `npx eslint` 클린
- 계산 로직(`compoundingStreak.ts`)에 Vitest 단위테스트 동반
- DB/마이그레이션 변경 없음 → 타입 재생성 불필요

## Project Structure

### Documentation (this feature)

```text
specs/010-compounding-streak/
├── plan.md              # 이 파일
├── research.md          # Phase 0 — 끊김 규칙·표시 단위·CAGR 제거 범위 결정 기록
├── data-model.md        # Phase 1 — CapitalFlow / CompoundingStreak 파생 모델
├── quickstart.md        # Phase 1 — 수동 검증 시나리오
└── tasks.md             # /speckit.tasks 출력 (이 명령에선 생성 안 함)
```
*contracts/ 없음 — 외부 인터페이스 없는 내부 UI 기능(파생 계산 + 컴포넌트 표시).*

### Source Code (repository root)

```text
src/lib/finance/
├── compoundingStreak.ts        # [신규] 순수 함수: events → CompoundingStreak 상태
├── compoundingStreak.test.ts   # [신규] Vitest 단위테스트
├── valuation.ts                # [참조] EventType, totalDeposits/Withdrawals (재사용)
├── returns.ts                  # [수정] 사용자 노출 CAGR 제거(계산 로직은 잔존 가능)
└── periodReturns.ts            # [참조] cagr 계산 위치(내부 유지)

src/lib/
├── dashboard.ts                # [수정] DashboardData에 compoundingStreak 필드 추가·계산 호출
└── date.ts                     # [참조] todayKST()

src/components/dashboard/
└── cards.tsx                   # [수정] HeroValuationCard(104-219)에 복리 유지 한 줄 추가

src/components/report/
└── QuarterReportView.tsx       # [수정] reportStreak 배지 옆에 복리 유지 상세 추가

src/components/returns/
└── PeriodReturns.tsx           # [수정] 사용자 노출 CAGR 행 제거(:59 부근)

src/app/returns/
└── page.tsx                    # [수정] PeriodView로 넘기던 cagr prop 정리(:98 부근)
```

**Structure Decision**: 기존 단일 웹앱 구조 유지. 계산은 `src/lib/finance/`의 순수 함수 패턴(`xirr.ts`, `returns.ts`처럼)으로 격리하고, `dashboard.ts`가 조립, 컴포넌트는 표시만. 이는 원칙 III(엔진/표면 분리)와 기존 코드 관례를 그대로 따른다.

## Complexity Tracking

> Constitution Check 위반 없음 — 작성 불필요.
