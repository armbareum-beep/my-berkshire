# Implementation Plan: 부동산 사업부 (Real Estate Division)

**Branch**: `011-real-estate-division` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-real-estate-division/spec.md`

## Summary

수기자산을 "수익 내는 사업부"로 승격한다. `manual_assets`에 **취득 부대비용·평가 출처·평가일·매도(가·일·비용)** 컬럼을 더하고, **임대수익 원장**(`manual_asset_income`) 신규 테이블을 추가한다(주식 `events`와 완전 분리 — 헌장 V). 부동산 사업부 수익률 = 실현(임대 + 매도차익, 비용 차감 후) + 미실현(평가차익), 분모는 실질취득가. 세금·비용은 **거래당 단일 합산 필드**(주식 `feeAndTax` 패턴). 010의 `manualAssetsCostBasis`·`computeBusinessReturns`·`BusinessReturnsCard`를 확장하고, 홈 자산 순서를 **보유계좌 → 주식 자산구성 → 부동산 사업부 → 현금**으로 재배치한다. 시세 자동연동 없음(전부 수기).

## Technical Context

**Language/Version**: TypeScript (기존)  
**Primary Dependencies**: Next.js(이 repo 변형 — `node_modules/next/dist/docs/` 우선), Supabase. 신규 외부 의존 **없음**  
**Storage**: Supabase Postgres — **스키마 변경 있음**: `manual_assets` 컬럼 추가 + `manual_asset_income` 신규 테이블(둘 다 RLS). `database.types.ts` 재생성 필요  
**Testing**: Vitest (`src/lib/finance/*.test.ts`) — 순수 계산 함수 단위테스트  
**Target Platform**: 모바일 단일·라이트 단일 웹앱  
**Project Type**: Web (Next.js App Router 변형)  
**Performance Goals**: 자산·임대 수십~수백 건, 파생 계산 O(n) — 무시할 수준  
**Constraints**: 기능통화 KRW(₩ 저장, factor 환산), 평가 전부 수기, 임대/매도는 events 미연동  
**Scale/Scope**: 사용자당 단일 holding, 부동산 자산 소수

## Constitution Check

*GATE: Phase 0 전 통과. Phase 1 후 재확인.*

| 원칙 | 판정 | 근거 |
|------|------|------|
| I. 스타일 중립 | ✅ Pass | 부동산 보유 여부·종류 재단 없음. 회전 보상 없음. |
| II. 정직 | ✅ Pass | 추정 평가에 출처·갱신일 표기(FR-005), 입력 안전장치(FR-006), 빈 사업부 미표시(FR-008), 비용 모르면 0(가짜 추정 금지). |
| III. 엔진 정확·화면 단순 | ✅ Pass | 실현/미실현 분리 순수 함수 + 테스트. 비용은 거래당 1필드(입력 단순). 사업부 카드로 점진 노출. |
| IV. 토스급 절제 | ✅ Pass | 홈에 부동산 사업부 카드 1개 추가 — 무채색·기존 카드 톤. 카드 수 증가 주의(보유계좌·구성·부동산·현금 4개). |
| V. 단일 진실원천 | ✅ Pass | 임대/매도는 수기자산 서브시스템 자체 원장. 주식 `events`·투입원금·복리무중단·XIRR 불변(FR-003). 이중계상 금지. |

**위반 없음** → Complexity Tracking 불필요.

추가 게이트(품질·헌장 워크플로):
- **마이그레이션 순서**: 스키마/RLS를 먼저 배포 → 그 컬럼을 쓰는 코드 배포(헌장 Additional Constraints). `database.types.ts` 재생성·동기화.
- 변경 파일 `npx tsc --noEmit`·`npx eslint` 클린. 계산 변경(realAssets·businessReturns)에 Vitest 단위테스트.

## Project Structure

### Documentation (this feature)

```text
specs/011-real-estate-division/
├── plan.md          # 이 파일
├── research.md      # Phase 0 — 데이터 모델·비용 회계·매도 상태 결정
├── data-model.md    # Phase 1 — 스키마 변경 + 파생 계산 모델
├── quickstart.md    # Phase 1 — 단위테스트 + 수동 검증
└── tasks.md         # /speckit.tasks 출력
```
*contracts/ 없음 — 외부 API 없는 내부 기능(서버 액션 + DB + 컴포넌트). 액션 시그니처는 data-model.md에.*

### Source Code (repository root)

```text
supabase/migrations/
└── <ts>_real_estate_division.sql   # [신규] manual_assets 컬럼 추가 + manual_asset_income 테이블 + RLS

src/lib/supabase/
└── database.types.ts               # [재생성] 스키마 반영

src/lib/finance/
├── realAssets.ts                   # [수정] ManualAsset 확장(취득비용·출처·평가일·매도) + ManualAssetIncome 타입
│                                   #        + 파생: effectiveCost·실현/미실현·computeRealEstateDivision
├── realAssets.test.ts              # [신규] 부동산 사업부 계산 테스트
├── businessReturns.ts              # [수정] 부동산 division에 실현(임대+매도)·미실현 반영
└── businessReturns.test.ts         # [수정] 실현/미실현/비용 케이스 추가

src/lib/
└── realAssets.ts                   # [수정] 로더: 새 컬럼 매핑 + 임대 원장 로드(loadManualAssets/loadManualAssetIncome)

src/app/networth/
└── actions.ts                      # [수정] ManualAssetInput 확장 + addManualAssetIncome·sellManualAsset·delete income

src/components/networth/
├── ManualAssetForm.tsx             # [수정] 취득비용·평가출처·평가일 필드 + 매입가>현재가 안전장치
├── ManualAssetsSection.tsx         # [수정] 실현/미실현·매도·출처 표시 + 임대수익/매도 입력 진입
└── BusinessReturnsCard.tsx         # [수정] 부동산 division 실현/미실현 분해 표시

src/app/dashboard/
└── page.tsx                        # [수정] HoldingsStreamed 순서 재배치 + 홈 부동산 사업부 카드
```

**Structure Decision**: 기존 수기자산 서브시스템(주식 `events`와 분리)을 확장. 계산은 `src/lib/finance/`(순수 함수 + 테스트), 영속은 Supabase(RLS), 표시는 컴포넌트. 010의 사업부 계산·카드를 재사용·확장해 중복을 피한다.

## Complexity Tracking

> Constitution Check 위반 없음 — 작성 불필요.
