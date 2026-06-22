# Implementation Plan: 거래내역 정밀도 복원 (연혁 복원 게이미피케이션)

**Branch**: `001-import-fidelity` | **Date**: 2026-06-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-import-fidelity/spec.md`

## Summary

온보딩 현재보유 스냅샷을 베이스라인으로 두고, `/import`에서 종목별로 실제 매매를 입력해 합성 스냅샷을 **교체·정합**(순수량=보유)한다. 정합이 맞을 때만 스냅샷을 소프트 삭제해 이중 계상을 막는다. 회사 나이(설립일=가장 이른 기록, 뒤로만 이동)·정밀도 미터(복원 종목 비율)·잠금 지표 프리뷰·"설립 확정"으로 동기를 부여한다. 매도완료 종목 왕복 입력은 선택이며 평균원가 실현손익을 잠금 해제한다.

## Technical Context

**Language/Version**: TypeScript, Next.js(이 repo 변형 — `node_modules/next/dist/docs/` 가이드 우선), React Server/Client Components
**Primary Dependencies**: Supabase(Postgres + RLS), Tailwind, 기존 finance 엔진(`src/lib/finance/*`)
**Storage**: Supabase `events`(거래 원장), `holdings`(회사), `accounts`, `securities`
**Testing**: 단위테스트(`*.test.ts`, 기존 `xirr.test.ts` 스타일), `npx tsc --noEmit`, `npx eslint`, `npx next build`, 실제 구동 검증(`run`/`verify` 스킬)
**Target Platform**: 모바일 단일·라이트 단일 PWA(웹)
**Project Type**: Web application (Next.js app router)
**Performance Goals**: import 페이지 추가 쿼리 0(기존 `getPortfolio` 재사용); 인터랙션 즉시 반영(`router.refresh`)
**Constraints**: 기능통화 KRW, 장부(ledger) 모드 한정, RLS 사용자 스코프, RSC 직렬화(원시값만 클라이언트로)
**Scale/Scope**: 개인 포트폴리오(종목 수십 단위), 화면 1개(`/import`) + 서버 액션 2개 + 신규 컴포넌트 1개 + 엔진 함수 1개 + 마이그레이션 2개

## Constitution Check

*GATE: Phase 0 전 통과, Phase 1 후 재확인.*

- **I. 스타일 중립**: 미터=복원 종목 비율, 회사 나이=기간. 거래 빈도·스타일 점수화 없음. ✅
- **II. 정직한 게이미피케이션**: 미터=입력량(성과 아님), 잠금 자리 가짜숫자 금지, "미입력/스냅샷" 중립 톤, 설립 시점은 사용자 선언. ✅
- **III. 엔진 정확·화면 단순**: 정합 불변식으로 원장 정확, UI는 결과만 표시. 매도완료는 점진 공개(선택 티어). ✅
- **IV. 토스급 절제**: `WeightBar` 단색 미터, 브랜드색 액센트 ≤1, `blur-sm` 잠금, `SuccessOverlay` 절제 축하. ✅
- **V. 단일 진실원천·정합**: `events` 단일 원장, 스냅샷↔실제 교체(추가 금지), 순수량=보유 불변식, `founded_at` 뒤로만 이동, KRW 환산 저장. ✅

위반 없음 → Complexity Tracking 비움.

## Project Structure

### Documentation (this feature)

```text
specs/001-import-fidelity/
├── spec.md          # 완료
├── plan.md          # 이 파일
├── research.md      # Phase 0 (결정·근거)
├── data-model.md    # Phase 1 (엔티티·불변식·상태전이)
├── quickstart.md    # Phase 1 (E2E 검증 절차)
├── contracts/
│   └── server-actions.md   # 내부 인터페이스 계약(서버 액션·엔진 함수)
└── checklists/requirements.md   # 완료(전 항목 통과)
```

### Source Code (repository root)

```text
supabase/migrations/
├── <ts>_events_source_snapshot.sql     # [신규] source CHECK에 'snapshot' 허용 (먼저 배포)
└── <ts>_holdings_founding_declared.sql # [신규] founding_declared boolean

src/app/onboarding/actions.ts           # [수정] 합성 BUY+DEPOSIT에 source:"snapshot"
src/app/transactions/actions.ts         # [수정] founded_at 백스톱 + 설립확정 자동해제
src/app/import/actions.ts               # [수정] reconcilePosition, declareFounding 추가
src/app/import/page.tsx                 # [수정] 포지션 티어·정밀도·나이·프리뷰 계산(직렬화 props)
src/components/import/PositionFidelity.tsx  # [신규] 포지션 정밀도 섹션 UI
src/components/import/YearProgress.tsx  # [유지] 입력 표면(필요 시 symbol 스코프)
src/lib/finance/realized.ts             # [신규] 평균원가 실현손익
src/lib/finance/realized.test.ts        # [신규] 단위테스트
src/lib/supabase/database.types.ts      # [수정] holdings.founding_declared 미러
```

**Structure Decision**: 기존 Next.js app router 구조 유지. `/import`에 포지션 중심 정밀도 섹션(`PositionFidelity`)을 연도 카드(`YearProgress`) 위에 추가하고, 입력은 기존 `QuickEntryForm` 재사용. 데이터 정합은 서버 액션(`reconcilePosition`)으로 강제.

## 구현 단계 (실행 순서 — tasks.md 근거)

### Step 0 — `founded_at` 백스톱 + 설립확정 자동해제 (`src/app/transactions/actions.ts`)
`Ctx.holding`에 `foundedAt`·`foundingDeclared` 노출(`getActiveHolding` 전체 row). `recordEvent`/`recordBuys` insert 성공 직후: `mode==="ledger" && date < foundedAt`면 `founded_at=date`(뒤로만), 동시에 `founding_declared`면 해제 + note. 전 ledger 이벤트 타입 적용. 기존 revalidate 유지.

### Step 1 — 마이그레이션 (먼저 배포)
1a. `events_source_valid` 제약을 `('manual','auto','snapshot')`로 완화(기존: `20260615150000_events_source.sql`). **Step 2보다 선행.**
1b. `holdings.founding_declared boolean not null default false`.
1c. 레거시 일괄 백필 금지(실제 manual과 구분 불가) → Step 5에서 graceful.

### Step 2 — 온보딩 스냅샷 마킹 (`src/app/onboarding/actions.ts`)
합성 DEPOSIT+BUY 두 행에 `source:"snapshot"` 추가(1a 배포 후).

### Step 3 — 타입 미러 (`src/lib/supabase/database.types.ts`)
`founding_declared` 추가(또는 타입 재생성). 적용 전 방어적 캐스팅.

### Step 4 — 서버 액션 (`src/app/import/actions.ts`, `toggleYearComplete` 패턴)
- `reconcilePosition(holdingId, symbol)`: auth+ownership → 활성 이벤트 로드 → `held`=전체 순수량, `realNet`=비-snapshot 순수량 → 보유 `realNet===held` 또는 매도완료 `0===0`만 통과 → 스냅샷 BUY+짝 DEPOSIT 소프트 삭제(현금 중립) → revalidate. 불일치는 `{held,realNet}` 반환(삭제 없음).
- `declareFounding(holdingId, declared)`: `founding_declared` 갱신 + revalidate.

### Step 5 — import 페이지 계산 (`src/app/import/page.tsx`)
활성 이벤트 select에 `source,account_id` 추가. `portfolio.positions`로 `H`, 행 그룹으로 `realNet`·스냅샷 유무 → `positions[]`(티어 포함)·`trust`·`companyAgeDays`·`metricsUnlocked`·`foundingDeclared` 계산. 레거시(스냅샷 0) graceful. **원시값만** 전달.

### Step 6 — `PositionFidelity` (신규 컴포넌트)
나이 헤더 + `WeightBar` 정밀도 미터 + 종목 행(티어 뱃지·"입력↔보유"·복원/교체) + 매도완료 선택(실현손익 잠금) + 잠금 프리뷰(`blur-sm`) + 설립 확정 CTA(`SuccessOverlay`). `QuickEntryForm` 재사용.

### Step 7 — 실현손익 (`src/lib/finance/realized.ts` + 테스트)
평균원가 `realizedGainKRW(events, symbol)`. T2에서만 노출.

### Step 8 — `YearProgress` 유지
입력 표면으로 존속.

## Complexity Tracking

> 위반 없음 — 비움.
