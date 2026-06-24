# Implementation Plan: 레버리지 금융비용 수익률 반영

**Branch**: `012-leverage-financing-cost` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/012-leverage-financing-cost/spec.md`

## Summary

레버리지 자산의 수익률 부풀림을 제거한다. 대출 이자를 **그 돈으로 산 자산의 수입에 짝지어** 차감한다(담보대출→부동산 임대료, 마진→주식). 추정 이자는 **저장 행 없이 조회 시 계산식으로 파생**(`잔액×이율×경과개월/12`, 기점=대출 차입일)되어 매달 수기 입력이 0이다. 추정과 현실의 오차는 사용자가 원할 때 **보정 체크포인트**(실제 납부액=비용, 또는 자본 투입=분모)로 스냅한다. 부동산 이자·보정은 011의 **부동산 사업부 자체 원장 경로 안에서 닫혀** 주식 XIRR/`events`를 건드리지 않는다.

기술 접근: 011의 `computeRealEstateDivision`에 금융비용 인자를 추가하고, 순수 함수 `accruedInterest`/`weightedAvgRate`로 파생 이자를 계산한다. 보정은 division-level 신규 테이블 하나에 저장. 마진↔주식(P3)은 `events` 이중계상 위험 때문에 본 플랜에서 설계만 남기고 구현은 후속으로 둔다.

## Technical Context

**Language/Version**: TypeScript 5.x, Next.js 16.2.9(App Router, 이 repo 변형 — `node_modules/next/dist/docs/` 우선), React 19
**Primary Dependencies**: Supabase(`@supabase/supabase-js`, ssr), Tailwind v4, 신규 외부 의존 없음
**Storage**: Supabase Postgres + RLS. 신규 테이블 1개(보정 체크포인트), 기존 `liabilities`·`manual_assets`·`manual_asset_income` 재사용
**Testing**: Vitest(`npm test` = `vitest run`). 계산 변경 단위테스트 `src/lib/finance/*.test.ts`
**Target Platform**: 모바일 단일·라이트 단일 웹앱(다크모드 비대상)
**Project Type**: Web application (Next.js App Router + Supabase)
**Performance Goals**: 화면 렌더 체감 즉시. 파생 이자는 O(대출수) 단순 산술 — 무시 가능
**Constraints**: 기능통화 ₩ 저장, 표시 환산은 화면. 모든 서버 접근 RLS·ownership 스코프
**Scale/Scope**: 가족 장부(사용자당 holding 1개). 대출 수 한 자릿수, 부동산 수 한 자릿수

## Constitution Check

*GATE: Phase 0 전 통과 필수. Phase 1 설계 후 재확인.*

| 원칙 | 평가 | 통과 |
|---|---|---|
| **I. 스타일 중립** | 점수·보상 장치 없음. 거래 빈도 보상 없음. | ✅ |
| **II. 정직한 게이미피케이션** | 추정 이자는 "추정"으로 명시 표기(가짜 숫자 아님). 미입력 대출=이자 0(중립). 임의 목표 생성 없음. | ✅ |
| **III. 엔진 정확·화면 단순** | 이자·보정 계산은 순수 함수 엔진, UI는 결과만 표시. 복잡(자본 vs 비용)은 보정 입력에만 노출(점진적 공개). | ✅ |
| **IV. 토스급 절제** | 신규 화면 면적 최소, 추정 표기는 보조 톤(앰버/회색), 등락색 미사용. | ✅ |
| **V. 단일 진실원천·정합** | **핵심.** 부동산 이자·보정은 011 자체 원장 경로에서만 닫힘 → `events` 이중계상 0, 주식 XIRR 불변(FR-009/SC-005). 마진↔주식은 `events` 단일원장 충돌 위험 → P3 설계만, 구현 보류. 금액 ₩ 저장. | ✅ (마진 보류로 위반 회피) |

**결과**: 위반 없음. 마진(P3)은 단일원장 원칙을 지키기 위해 의도적으로 본 플랜 구현 범위에서 제외(아래 Complexity Tracking 불요 — 정당화가 아니라 범위 축소).

## Project Structure

### Documentation (this feature)

```text
specs/012-leverage-financing-cost/
├── plan.md              # 본 파일
├── research.md          # Phase 0 — 파생 모델·짝짓기·정합 결정
├── data-model.md        # Phase 1 — 엔티티·테이블·계산 함수 시그니처
├── quickstart.md        # Phase 1 — 검증 시나리오
├── contracts/
│   └── finance-functions.md   # 순수 함수·서버액션 계약
└── tasks.md             # /speckit.tasks 출력(본 명령 비생성)
```

### Source Code (repository root)

```text
src/lib/finance/
├── liabilities.ts          # [수정] mortgageLiabilities·weightedAvgRate·accruedInterest 추가, annualInterest 역할 주석 갱신
├── financing.ts            # [신규] divisionFinancingCost(파생 이자+보정 합성), monthsBetween
├── financing.test.ts       # [신규] 파생 이자·보정·기점·엣지 단위테스트
├── realAssets.ts           # [수정] computeRealEstateDivision/computeDivisions에 financing 인자 추가(하위호환)
└── realAssets.test.ts      # [수정] 이자 차감 케이스 추가

src/lib/
├── liabilities.ts          # [기존] loadLiabilities 재사용
└── financingReconciliation.ts  # [신규] 보정 체크포인트 로더/쓰기 헬퍼

src/app/real-estate/
├── page.tsx                # [수정] 사업부 집계에 financing 주입, 가중평균·추정이자 표시
└── actions.ts              # [신규 또는 networth/actions에 추가] 보정 추가/삭제 서버액션

src/components/networth/
├── RealEstateDivisionCard.tsx   # [수정] 이자 차감 net·추정 배지·가중평균율 표시
└── FinancingReconcileForm.tsx   # [신규] 보정 입력(자본/비용 선택, 기본=비용)

supabase/migrations/
└── 20260626NNNNNN_financing_reconciliation.sql  # [신규] 보정 체크포인트 테이블 + RLS

src/lib/supabase/database.types.ts  # [수정] 타입 동기화(신규 테이블)
```

**Structure Decision**: 011이 만든 부동산 사업부 경로(`src/lib/finance/realAssets.ts` 집계 + `manual_asset_income` 자체 원장 + `real-estate/page.tsx`)를 그대로 확장한다. 신규 계산은 `src/lib/finance/financing.ts`에 순수 함수로 격리해 단위테스트(원칙 III). 보정만 division-level 신규 테이블로 저장하고, 추정 이자는 저장하지 않는다(Clarification: 파생).

## Complexity Tracking

> Constitution Check 위반 없음 — 작성 불요.
