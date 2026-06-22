# Quickstart — 거래내역 정밀도 복원 E2E 검증

## 적용 순서
1. 마이그레이션 적용(순서 엄수): `events_source_snapshot`(CHECK 완화) → `holdings_founding_declared`.
   - 로컬: `supabase migration up` (또는 프로젝트 절차). 타입 재생성: `supabase gen types ...` 또는 `database.types.ts` 수동 미러.
2. 코드 배포 후 `npx tsc --noEmit` · `npx eslint`(변경 파일) · `npx next build` 클린.
3. 단위테스트: `realized.test.ts` 실행.

## 시나리오 검증
1. **스냅샷 마킹**: 신규 온보딩(보유 종목 입력) → `events`에서 그 BUY+DEPOSIT의 `source='snapshot'` 확인.
2. **정합 교체(US1)**: 스냅샷 50주 종목에 실제 매수들로 순 50주 입력 → "입력 50 ↔ 보유 50 ✓" → 교체 실행 → 스냅샷 2행 `deleted_at` set, 보유 50주 불변, 자산 평가액 불변.
3. **불일치 거부(US1-2)**: 실제 30주만 입력 후 교체 시도 → 거부 + "입력 30 ↔ 보유 50" 안내, 스냅샷 활성 유지(`deleted_at is null`).
4. **중복 방지(US1-3)**: 아무 연도 화면을 열어도 기존 매수·매도 전체가 보임.
5. **회사 나이/설립(US2)**: 2019 매수 입력 → `founded_at`=2019, 트랙레코드 기간·`/dashboard`·`/returns` 반영.
6. **정밀도 미터(US2)**: 5종목 중 2종목 T1 → 미터 40%, 미복원은 "스냅샷" 중립 표기.
7. **설립 확정·자동 해제(US2-3,4)**: 설립 확정 → 미터 100% + `SuccessOverlay`. 이후 더 이른 거래 입력 → `founding_declared=false`로 자동 해제 + 안내, `founded_at` 후퇴.
8. **잠금 정직성(SC-005)**: 지표 잠금 상태에서 가짜 수치 없음(가림 + 해제 조건).
9. **실현손익(US3)**: 미보유 종목 왕복(BUY→SELL 동수) 입력 → 실현손익 카드 잠금 해제, 값이 `realizedGainKRW`와 일치.
10. **레거시**: 스냅샷 마커 없는 기존 회사 `/import` → 크래시 없음, 중립 카피, 연도 카드 동작.

## DB 확인 쿼리(예시)
- 스냅샷: `select type, source, deleted_at from events where symbol=$1 and account_id in (...)`.
- 정합: 활성 순수량(`sum(BUY)-sum(SELL)` where `deleted_at is null`)이 보유와 일치.
- 설립일: `select founded_at, founding_declared from holdings where id=$1`.
