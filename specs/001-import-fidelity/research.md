# Phase 0 Research — 거래내역 정밀도 복원

코드베이스 탐색으로 확정한 결정과 근거. (NEEDS CLARIFICATION 없음)

## D1. 스냅샷 식별 — `source:"snapshot"` 마킹
- **Decision**: 온보딩 합성 BUY+DEPOSIT에 `events.source="snapshot"`을 부여해 실제 입력과 구분.
- **근거**: 교체(소프트 삭제) 대상을 정확히 찾으려면 마커가 필요. 온보딩은 현재 `source` 미지정 → 기본 `'manual'`이라 실제 수동 입력과 구분 불가(`src/app/onboarding/actions.ts:206-228`).
- **제약**: `events_source_valid CHECK (source in ('manual','auto'))` 존재(`supabase/migrations/20260615150000_events_source.sql:5-6`) → **CHECK를 먼저 완화**해야 insert 통과.
- **Alternatives**: `completed_years`에 sentinel(거부: 여러 곳 필터 깨짐) · 별도 플래그 컬럼(거부: 과설계).

## D2. 백필 = 교체(정합), 추가 아님
- **Decision**: 종목별 실제 매매 입력 후 `realNet===held`일 때만 스냅샷 소프트 삭제(현금 중립: 스냅샷 BUY↔DEPOSIT 동시 삭제).
- **근거**: 스냅샷 위에 역사를 더하면 이중 계상(예: 50+50=100주). 불변식 "실제 순수량=보유"가 정직한 결승선이자 자동 중복 방지.
- **Alternatives**: 추가+dedupe(거부: 신뢰 불가) · 온보딩부터 전체 역사(거부: 진입장벽).

## D3. 실현손익 = 평균원가법
- **Decision**: 신규 `realizedGainKRW(events, symbol)` — 평균원가 이동, SELL 시 `qty*price - fee - qty*avgCost` 누적.
- **근거**: 앱이 이미 평단(평균원가) 스냅샷 모델 → 일관·단순·스타일 중립. 기존 finance에 실현손익 계산 **없음**(`src/lib/finance/*` 확인).
- **Alternatives**: FIFO(거부: 더 복잡, 평단 모델과 불일치).

## D4. 설립 확정 저장 = `holdings.founding_declared boolean`
- **Decision**: 신규 boolean 컬럼.
- **근거**: 파생 불가한 유일 상태(나이·정합은 파생됨). 명시적·되돌림 가능.
- **Alternatives**: 파생(불가) · `completed_years` 오버로드(거부: 취약).

## D5. `founded_at` 자동 이동 = 직접 입력에도 백스톱
- **Decision**: `recordEvent`/`recordBuys`가 insert 성공 후 `date < founded_at`이면 `founded_at=date`(뒤로만). CSV-confirm 패턴 복제(`src/app/api/import/confirm/route.ts:54-61`).
- **근거**: 현재 직접 입력은 `founded_at`을 안 건드려, 과거 매수를 넣어도 설립일이 오늘에 머무는 버그. XIRR·연혁 정확성의 전제.
- **Alternatives**: 삭제 시 앞으로 이동(거부: 정직성/복잡도 — 약간의 과대표기 허용).

## D6. 게이미피케이션 단위 = 종목 정밀도 티어
- **Decision**: T0 스냅샷 / T1 복원·정합 / T2 매도완료(선택). 미터=T1 비율, 나이=`daysSince(founded_at)`.
- **근거**: 사용자 멘탈모델(보유=과거 매수−매도의 꼬리)과 일치. 동적 설립일을 보상(트랙레코드↑)으로 전환.

## D7. 레거시 회사(스냅샷 마커 없음)
- **Decision**: 일괄 백필 금지(실제 manual과 구분 불가 → 오염 위험). 스냅샷 0건이면 교체 affordance 숨기고 일반 입력 + 중립 카피.

## 재사용 자산(검증)
- `src/components/ui/WeightBar.tsx` `WeightBar({weight,fillClassName})`.
- `src/app/import/page.tsx`는 이미 `getPortfolio` 호출 → `portfolio.positions`·`portfolio.result`(`ReturnResult`) 무료 사용.
- `src/lib/finance/valuation.ts` `netQuantities`; `src/lib/finance/xirr.ts` `daysSince`; `src/lib/date.ts` `todayKST`.
- `src/components/transactions/wizard/SuccessOverlay.tsx`; `src/lib/format.ts` `signedPct`.
- 소프트 삭제 패턴 `src/app/transactions/actions.ts` `deleteEvent`(`deleted_at`); `activeEventRows`(`src/lib/portfolio.ts`).
- 입력 UI 재사용 `src/components/import/QuickEntryForm.tsx`(EditTradeModal 포함).
