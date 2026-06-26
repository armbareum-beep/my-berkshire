# Quickstart: 컴퍼니(CEO) 레이어 — 적용·검증

## 적용 순서 (헌장: 마이그레이션 먼저)

1. **마이그레이션 작성·적용**: `supabase/migrations/<ts>_account_members.sql`
   (members 테이블·`accounts.member_id`·RLS 4종·트리거 교체·백필). 로컬 stack 또는
   Supabase MCP `apply_migration`.
2. **타입 동기화**: `src/lib/supabase/database.types.ts`에 members + `accounts.member_id`.
   (MCP `generate_typescript_types` 또는 수동.)
3. **lib**: `members.ts`(신규), `accounts.ts`·`portfolio.ts`(필터) 구현.
4. **서버 액션**: `company/actions.ts`(컴퍼니 CRUD·토글), `accounts/actions.ts`(memberId).
5. **UI**: `company/page.tsx`+`MemberManager`/`MemberRow`, `HoldingStructureTree`,
   `AccountManager`/`AccountRow`, `AccountGroups`.
6. **게이트**: `npx tsc --noEmit`·`npx eslint` 클린. 컴퍼니별 수익률 단위테스트
   (`src/lib/members.test.ts`) — 합 정합·빈 컴퍼니 null.

## 검증 (Acceptance 매핑)

| # | 시나리오 | 기대 |
|---|---|---|
| V1 (US1) | 마이그레이션 후 DB 점검(`execute_sql`) | holding마다 '본인' 컴퍼니 1개 + 전 계좌 `member_id` 연결. 기존 화면 동일(SC-002). |
| V2 (US1) | 신규 온보딩으로 회사 생성 | 트리거가 '본인' 컴퍼니 + 'main' 계좌(member 연결) 자동 생성. |
| V3 (US1) | 회사 페이지에서 '아빠'·'엄마' 컴퍼니 추가 → 계좌 배정 | 지배구조도 `지주회사 → 컴퍼니 → 계좌 → 자회사` 4단. 자산 화면도 컴퍼니로 묶임. |
| V4 (US1) | 컴퍼니 1개만 있는 상태 확인 | 컴퍼니 층 미표시, 계좌 선택 드롭다운 숨김(SC-002). |
| V5 (US2) | 아빠/엄마 각자 보유·거래 입력 후 회사 페이지 | 컴퍼니별 평가액·수익률 개별 표기. 보유 없는 컴퍼니는 "보유 없음". |
| V6 (US2) | 전원 포함 상태 합 검증 | Σ 컴퍼니 평가액 = 그룹 합산 평가액(SC-004). |
| V7 (US3) | '아이 컴퍼니' 토글 해제 | 홈/순자산/연결 수익률이 아이 계좌 제외하고 재계산. 다시 켜면 복원(SC-003). |
| V8 (US3) | 한 컴퍼니만 남기고 모두 제외 | 남은 컴퍼니만의 수치가 합산 자리에 표시. 전부 제외 시 빈 상태 안내(오류 아님). |
| V9 (회귀) | 전원 포함 = 기존과 동일 | 대시보드·수익률 수치 변동 0(SC-005). |
| V10 (Edge) | 계좌 달린 컴퍼니 삭제 | 계좌 보존·미지정으로 이동(데이터 손실 0). 마지막 컴퍼니 삭제는 거부. |

## 실제 구동 확인 (run/verify 스킬)
- 모바일 480px 뷰에서 컴퍼니 트리·토글·CEO 실적 렌더 확인(스크린샷).
- 토글 on/off 시 홈 순자산/수익률 즉시 갱신, 디자인 절제(칩·등락색만) 준수.

## 롤백
- 마이그레이션 역순: `accounts.member_id` 드롭 → `members` 드롭 → 트리거 원복.
  `member_id`는 nullable이라 드롭해도 계좌·이벤트 데이터 무손실.
