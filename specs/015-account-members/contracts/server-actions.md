# Contract: 서버 액션 (컴퍼니 CRUD·토글·계좌 배정)

모든 액션은 `"use server"`, 로그인·ownership(RLS + holding 소속) 검증, 결과
`{ ok: true } | { ok: false; error: string }`. 성공 시 관련 경로 `revalidatePath`.
기존 `src/app/accounts/actions.ts` 패턴 준수.

## 컴퍼니 액션 (`src/app/company/actions.ts`)

### `createMember(name, emoji?)`
- 입력: `name: string`(필수, 트림 후 비어있지 않음), `emoji?: string | null`.
- 동작: 활성 holding 확인 → `members` insert(`sort_order` = 현재 최대+1, `included=true`).
- 검증: 빈 이름 거부.
- revalidate: `/company`, `/accounts`, `/dashboard`, `/networth`.

### `updateMember(id, name, emoji?)`
- 컴퍼니 이름/이모지 수정. RLS가 본인 holding 소속만 허용.
- revalidate: `/company`, `/accounts`, `/dashboard`, `/networth`.

### `deleteMember(id)`
- 가드: holding의 컴퍼니가 1개뿐이면 거부("마지막 컴퍼니는 삭제할 수 없습니다.").
- 동작: `members` 삭제 → FK `on delete set null`로 그 계좌들 `member_id` 자동 null(미지정).
- revalidate: `/company`, `/accounts`, `/dashboard`, `/networth`.

### `setMemberIncluded(id, included)`
- 입력: `included: boolean`. `members.included` 갱신(합산 토글).
- 가드: 단일 컴퍼니뿐이면 토글 무의미 — UI에서 숨기되 액션은 멱등 허용.
- revalidate: `/company`, `/dashboard`, `/networth`, `/allocation`(연결 지표 영향 경로).

### `reorderMembers(orderedIds)` *(선택, P3)*
- `sort_order` 일괄 갱신. 없으면 생성순 사용.

## 계좌 액션 (`src/app/accounts/actions.ts` 변경)

### `createAccount(name, accountType, commissionRate?, broker?, memberId?)`
- **추가 인자** `memberId?: string | null`. insert에 `member_id` 포함(null 허용=기본 컴퍼니).
- 검증: `memberId` 제공 시 그 컴퍼니가 같은 holding 소속인지 RLS로 보장(외부 id 방어).

### `updateAccount(id, name, accountType, commissionRate, broker?, memberId?)`
- **추가 인자** `memberId?: string | null`. update에 `member_id` 반영(계좌의 컴퍼니 이동).

> 하위호환: `memberId` 생략 시 기존 동작(미지정=기본 컴퍼니). 기존 호출부 무수정 동작.

## 오류 메시지(한국어, 기존 톤)
- "로그인이 필요합니다." / "회사를 찾을 수 없습니다." / "컴퍼니 이름을 입력하세요." /
  "마지막 컴퍼니는 삭제할 수 없습니다."
