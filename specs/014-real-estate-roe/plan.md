# Implementation Plan: 부동산 사업부 실투자금 수익률·순자산·LTV

**Branch**: `014-real-estate-roe` | **Date**: 2026-06-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/014-real-estate-roe/spec.md`

## Summary

부동산 사업부의 기존 자산수익률(`gain / 취득원가`, 레버리지 무시)에 더해, 대출(spec 012)을 알고 있으므로 **실투자금 수익률**(`gain / 실투자금`)·**순자산**(평가액−대출)·**LTV**를 파생해 `/real-estate` 상세 화면에 노출한다. 전부 기존 데이터에서 조회 시 계산하는 **표시 전용** 기능 — DB·스키마·주식 XIRR·누적수익률 합산 불변. 기존 헬퍼(`leverageRatio`=LTV, `netWorth`=순자산, [liabilities.ts](../../src/lib/finance/liabilities.ts))를 재사용하고, `DivisionFinancingCost`에 `debt`(담보대출 잔액 합) 한 필드만 더해 집계 함수에서 새 지표를 만든다.

## Technical Context

**Language/Version**: TypeScript (Next.js 이 repo 변형, App Router)  
**Primary Dependencies**: 기존 Supabase·Tailwind. 신규 외부 의존 **없음**  
**Storage**: 변경 없음 — 기존 `manual_assets`·`liabilities`·`financing_reconciliation` 재사용. 신규 컬럼/테이블/마이그레이션 **없음**  
**Testing**: Vitest(`*.test.ts`) — 기존 `src/lib/finance/{realAssets,financing,liabilities}.test.ts` 패턴  
**Target Platform**: 모바일 웹(라이트 단일)  
**Project Type**: web application (Next.js 단일 프로젝트)  
**Performance Goals**: 순수 파생 계산(O(자산+대출)), 체감 영향 없음  
**Constraints**: 표시 전용 — 계산 엔진 정확(원칙 III), 화면은 기존 톤 유지(원칙 IV)  
**Scale/Scope**: lib 2파일 + UI 1컴포넌트. 가족 장부 단일 holding

## Constitution Check

*GATE: Phase 0 전 통과 필수. Phase 1 후 재확인.*

- **I. 스타일 중립**: ✅ 부동산 레버리지 지표는 매매 스타일과 무관. 거주용·차익형 모두 포함(spec FR-009).
- **II. 정직한 게이미피케이션**: ✅ 실제 입력(취득가·대출·평가액)에서만 파생. 실투자금≤0·평가액0이면 가짜 숫자 대신 "—"(spec FR-008). 대출잔액=원차입액 근사는 Assumptions에 명시.
- **III. 엔진 정확·화면 단순**: ✅ 계산은 lib(`realAssets.ts`)에서, UI는 결과만 표시. 대출 없으면 지표 묶음 숨김(점진적 공개).
- **IV. 토스급 절제**: ✅ 홈 카드 불변(FR-007). 상세 화면에 작은 stat strip만. 등락색은 손익에만.
- **V. 단일 진실원천·정합**: ✅ `events` 미변경. 이자 이중계상 방지(이미 차감된 gain 사용, FR-004). 기존 `leverageRatio`/`netWorth` 재사용(중복 로직 금지).

**결과**: 위반 없음. Complexity Tracking 불필요.

## Project Structure

### Documentation (this feature)

```text
specs/014-real-estate-roe/
├── plan.md              # 이 파일
├── research.md          # Phase 0 — 결정 기록(미해결 항목 없음)
├── data-model.md        # Phase 1 — 파생 지표 정의
├── quickstart.md        # Phase 1 — 수동 검증 시나리오
├── contracts/
│   └── ui.md            # Phase 1 — 상세 화면 표시 계약
└── checklists/
    └── requirements.md  # /speckit.specify 산출(통과)
```

### Source Code (repository root)

```text
src/lib/finance/
├── financing.ts         # [수정] DivisionFinancingCost 에 debt 추가
├── financing.test.ts    # [수정] debt 합산 케이스
├── realAssets.ts        # [수정] RealEstateDivision 에 실투자금 수익률·순자산·LTV
├── realAssets.test.ts   # [수정] 신규 지표 케이스
└── liabilities.ts       # [재사용] leverageRatio·netWorth (변경 없음)

src/components/networth/
└── ManualAssetsSection.tsx  # [수정] REAL_ESTATE 사업부 헤더 아래 지표 strip
```

**Structure Decision**: 기존 Next.js 단일 프로젝트 구조 유지. 계산은 `src/lib/finance/`, 표시는 `src/components/networth/`. 신규 디렉터리·DB 변경 없음.

## 구현 개요 (How)

### 1. `financing.ts` — `debt` 필드 추가
- `DivisionFinancingCost` 인터페이스에 `debt: number`(담보대출 잔액 합) 추가.
- `divisionFinancingCost()` 반환에 `debt: totalLiabilities(liabilities)`([liabilities.ts:49](../../src/lib/finance/liabilities.ts#L49) 재사용. `liabilities`는 이미 `mortgageLiabilities` 필터 결과).

### 2. `realAssets.ts` — 사업부 집계에 신규 지표
- `RealEstateDivision`에 추가: `debt`, `ownCapital: number | null`(실투자금=cost−debt), `ownCapitalReturn: number | null`(실투자금 수익률=gain/ownCapital), `marketValue`(보유 평가액 합), `netEquity`(순자산), `ltv: number | null`.
- `computeRealEstateDivision()`:
  - 루프에서 `continue`(취득가 없음) **전에** `marketValue += !isSold(a) ? a.currentValue : 0` 누적 — 취득가 없는 보유자산도 순자산엔 잡힘(spec 엣지).
  - `debt = financing?.debt ?? 0`.
  - `ownCapital = cost - debt`; `ownCapitalReturn = ownCapital > 0 ? gain / ownCapital : null`(FR-008).
  - `netEquity = netWorth(marketValue, debt)`; `ltv = marketValue > 0 ? leverageRatio(marketValue, debt) : null`([liabilities.ts](../../src/lib/finance/liabilities.ts) 재사용).
- 비-부동산 사업부: financing 미주입 → debt 0 → ownCapital=cost, ownCapitalReturn=ret, ltv=0/null. UI에서 debt>0 게이트로 미노출(회귀 안전).

### 3. `ManualAssetsSection.tsx` — 상세 화면 표시
- 사업부 헤더([ManualAssetsSection.tsx:166](../../src/components/networth/ManualAssetsSection.tsx#L166)) 아래, `d.key === "REAL_ESTATE" && d.totals.debt > 0`일 때 stat strip 추가:
  - **자산수익률** `signedPct(ret)` · **실투자금 수익률** `signedPct(ownCapitalReturn)`(나란히) · **순자산** `money(cv(netEquity))` · **LTV** `pct(ltv)`.
  - 산출불가면 "—". 색은 `changeColor`. 포맷은 기존 `signedPct`·`pct`·`money`([format.ts](../../src/lib/format.ts)) 재사용.
  - 기존 대출 추정이자 표시(자산별 `loansByAsset`)와 톤 일치.

## Complexity Tracking

> 위반 없음 — 비움.
