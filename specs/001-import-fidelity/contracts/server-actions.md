# Phase 1 Contracts — 내부 인터페이스 (서버 액션 · 엔진 함수)

웹앱 내부 계약. 모든 서버 액션은 `"use server"`, auth + ownership(사용자 소유 holding) 검증, 성공 시 `revalidatePath`.

## reconcilePosition(holdingId, symbol) — `src/app/import/actions.ts`
종목의 실제 입력이 보유와 정합하면 임시 스냅샷을 실제 내역으로 교체.
- **입력**: `holdingId: string`, `symbol: string`
- **전제**: 사용자가 그 종목 실제 매매를 이미 입력함.
- **동작**: 활성 이벤트 로드 → `held`(전체 순수량)·`realNet`(비-snapshot 순수량) 계산 → 정합이면 스냅샷 BUY + 짝 DEPOSIT `deleted_at` set.
- **반환**:
  - 성공 `{ ok: true }`
  - 불일치 `{ ok: false, error: string, held: number, realNet: number }` (삭제 없음)
- **불변식**: 성공 시 보유 수량·현금 불변, 그 종목 `source='snapshot'` 활성행 0.
- **revalidate**: `/import`, `/dashboard`, `/activity`.

## declareFounding(holdingId, declared) — `src/app/import/actions.ts`
설립 확정(첫 거래 선언) 토글.
- **입력**: `holdingId: string`, `declared: boolean`
- **동작**: `holdings.founding_declared = declared`.
- **반환**: `{ ok: true } | { ok: false, error }`
- **주의**: `founded_at`은 건드리지 않음(이미 가장 이른 기록). 선언은 봉인만.
- **revalidate**: `/import`, `/dashboard`.

## (확장) recordEvent / recordBuys — `src/app/transactions/actions.ts`
기존 시그니처 유지. **신규 후행조건**:
- insert 성공 후 `mode==="ledger" && date < holding.founded_at`이면 `founded_at=date`(뒤로만).
- 위 조건이면서 `founding_declared===true`이면 `founding_declared=false`로 자동 해제하고 결과 `note`에 안내.

## realizedGainKRW(events, symbol) — `src/lib/finance/realized.ts`
평균원가 실현손익(₩).
- **입력**: `events: InvestmentEvent[]`(활성, 단일 종목 또는 전체), `symbol: string`
- **출력**: `number` (₩, 실현 손익 누적)
- **알고리즘**: 날짜 오름차순. BUY: `avgCost=(avgCost*q + price*qty + fee)/(q+qty)`, `q+=qty`. SELL: `realized += qty*price - fee - qty*avgCost`, `q-=qty`. 반환 `realized`.
- **순수 함수**(부작용 없음), 단위테스트 `realized.test.ts`.

## 페이지 → 클라이언트 props (직렬화 계약) — `src/app/import/page.tsx` → `PositionFidelity`
원시값/평면 객체만:
```
positions: { symbol, name, held, realNet, tier: 'T0'|'T1'|'T2', reconciled: boolean }[]
trust: number            // 0..1
companyAgeDays: number
foundedAt: string
foundingDeclared: boolean
metricsUnlocked: { cumulative: boolean, realized: boolean }
preview: { status: string, xirr: number|null, cumulativeReturn: number|null, realizedKrw: number|null }
```
`portfolio`/`result` 객체·Supabase 클라이언트·Date 전달 금지.
