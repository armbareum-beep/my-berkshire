# Phase 1 Data Model: 컴퍼니(CEO) 레이어

## 신규 테이블: `members`

가족 장부(지주회사) 안의 한 사람(CEO)의 계좌 묶음 = 하나의 컴퍼니.

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `holding_id` | uuid | NOT NULL, FK→`holdings(id)` ON DELETE CASCADE | 소속 가족 장부 |
| `name` | text | NOT NULL | 컴퍼니/CEO 표시명(예: "민준", 화면에서 "민준 컴퍼니") |
| `emoji` | text | NULL | 아바타용(선택). null이면 이름 글자 폴백 |
| `included` | boolean | NOT NULL, default `true` | false면 연결(합산) 계산에서 제외(토글) |
| `sort_order` | int | NOT NULL, default 0 | 표시 순서 |
| `created_at` | timestamptz | NOT NULL, default `now()` | |

- 인덱스: `members_holding_id_idx (holding_id)`.
- RLS(`accounts`와 동일 패턴) 4종: select/insert/update/delete 모두
  `holding_id in (select id from holdings where user_id = auth.uid())`.

### Validation / 규칙
- `name`: 트림 후 비어있지 않음(서버 액션 검증).
- holding당 컴퍼니 최소 1개 유지 — 마지막 컴퍼니 삭제 금지(서버 액션).
- `included=false`가 모든 컴퍼니에 적용되어도 오류 아님(합산 0, 빈 상태 안내).

## 변경 테이블: `accounts`

| 변경 | 내용 |
|---|---|
| 신규 컬럼 | `member_id uuid NULL references members(id) ON DELETE SET NULL` |
| 인덱스 | `accounts_member_id_idx (member_id)` |
| 의미 | `member_id IS NULL` = **기본 컴퍼니('본인')** 로 취급(미지정). |

`ON DELETE SET NULL`: 컴퍼니 삭제 시 그 계좌들은 보존되고 미지정으로 떨어진다(FR-005,
Edge Case: 데이터 손실 0).

## 관계

```
auth.users 1──N holdings 1──N members 1──N accounts 1──N events
                       └────────────────────┘
                holdings 1──N accounts (member_id NULL 허용 = 기본 컴퍼니)
```

- `positions` 뷰(파생): 변경 불필요. 이미 `holding_id, account_id, symbol` 그룹. 컴퍼니
  집계는 `account.member_id`로 앱 레벨 그룹핑.

## 마이그레이션 단계 (`<ts>_account_members.sql`)

1. `create table members (...)` + 인덱스.
2. `alter table accounts add column member_id ...` + 인덱스.
3. RLS enable + 정책 4종(members).
4. **백필**: holding마다 '본인' 컴퍼니 insert → 그 holding 계좌 `member_id` 일괄 연결.
5. **트리거 교체**: `create or replace function create_default_account()` —
   holding insert 후 '본인' 컴퍼니 생성 → 그 id로 'main' 계좌 생성(member_id 연결).
6. 타입 재생성/동기화: `src/lib/supabase/database.types.ts`에 `members` Row/Insert/Update,
   `accounts.Row.member_id: string | null` 반영.

## 앱 레벨 타입 (`src/lib/members.ts`)

```ts
export interface Member {
  id: string;
  name: string;
  emoji: string | null;
  included: boolean;
  sortOrder: number;
}

export interface MemberGroup {
  member: Member;
  accounts: AccountGroup[];   // lib/accounts.ts 재사용(memberId로 그룹핑)
  value: number;              // 보유 종목 평가액 합(표시통화)
  costBasis: number;          // 평단확인 보유 원가 합(표시통화)
  changeRate: number | null;  // 평단 대비 등락 = gain/costBasis. 보유 없으면 null
  gain: number | null;        // 평가차익 합(표시통화). 보유 없으면 null("보유 없음")
}
```

> **구현 결정(R2 확정)**: 컴퍼니별 수익률은 **평단 대비 수익률**(gain/costBasis)을 쓴다 —
> 계좌·종목 화면과 동일 지표라 일관되고, 컴퍼니별 설립자본 데이터 없이도 정확·정직(가산
> 가능). 그룹 전체의 설립이후 XIRR은 별개 헤드라인(getPortfolio). computeReturn 을 컴퍼니
> 단위로 재호출하지 않음(설립자본 안분 문제 회피).

`AccountGroup`(기존)에 `memberId: string | null` + `costBasis: number`(컴퍼니 재집계용) 필드
추가(`lib/accounts.ts`).

## 불변식 (헌장 V 정합)

- 컴퍼니별 평가액 합(전원 포함) = 그룹 합산 평가액(SC-004).
- `events`는 유일 원장 — 컴퍼니는 그룹핑 메타일 뿐, 어떤 보유도 이중 계상하지 않음.
- 토글은 **표시/합산 범위**만 바꾸며 원장 데이터는 불변.

## 가정

- 컴퍼니별 `founded_at`은 그룹 설립일로 통일(별도 컴퍼니 설립일 없음) — 단순·일관(R2).
- 현금은 그룹 금고 레벨 유지, 컴퍼니별 현금 분리 없음(v1). 토글은 종목(주식) 흐름 기준.
