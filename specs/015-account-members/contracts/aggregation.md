# Contract: 집계·표시 함수

## `loadMemberGroups(supabase, opts)` — 신규 (`src/lib/members.ts`)

컴퍼니별 계좌 묶음 + 평가액 + 평단 대비 수익률(CEO 실적)을 한 번에. (구현은 순수 집계
`aggregateMemberGroups(members, groups)`로 분리 — DB 비의존 단위테스트 대상.)

```ts
function loadMemberGroups(
  supabase: SupabaseClient<Database>,
  opts: {
    holdingId: string;
    prices: Record<string, number>;   // ₩ (portfolio.prices 재사용)
    names: Record<string, string>;
    factor: number;                   // ₩ → 표시통화
  },
): Promise<MemberGroup[]>

// 뷰 편의 로더(시세·이름·factor 자동 적재) — CompanyStructure/CompanyMembers 공용:
function loadMemberGroupsView(supabase, holdingId, displayCcy): Promise<MemberGroup[]>
```

- 동작:
  1. `members`(holding, sort_order→생성순) + `loadAccountGroups`(member_id 포함) 로드.
  2. `aggregateMemberGroups`로 `member_id`별 묶어 value·costBasis·gain 합산.
  3. 컴퍼니 수익률 = **평단 대비**(changeRate = gain/costBasis). 평단확인 보유 없으면
     gain·changeRate = null("보유 없음"). computeReturn 재호출 안 함(R2 확정).
- 보장: 전원 포함 시 Σ MemberGroup.value = 그룹 합산 평가액(SC-004). `member_id=null`
  계좌는 기본 컴퍼니(정렬 첫 컴퍼니)에 귀속.

## `getPortfolio` 변경 (`src/lib/portfolio.ts`)

```ts
// 이벤트 select 에 accounts.member_id 추가:
//   "... accounts!inner(holding_id, member_id)"
// included 컴퍼니 id 집합 조회 후 JS 필터:
//   const included = new Set(memberRows.filter(m => m.included).map(m => m.id));
//   const scoped = active.filter(r =>
//     r.member_id == null || included.has(r.member_id));   // null = 기본 컴퍼니 포함
//   → computeReturn 은 scoped 로.
```

- 계약: **모든 컴퍼니 included=true면 기존과 100% 동일 결과**(회귀 0, SC-005).
- 영향: `getPortfolio` 소비처(dashboard·networth·allocation·returns 등) 전부 토글 자동 반영.
- 미적용 대상: `manual_assets`·`liabilities`(holding 레벨) — 토글과 무관(FR-011).

## `AccountGroup` 확장 (`src/lib/accounts.ts`)

- `accounts` select에 `member_id` 추가.
- `AccountGroup`에 `memberId: string | null` 필드 추가. 기존 필드·계산 불변.

## UI 표시 계약

- **HoldingStructureTree**: 입력을 `MemberGroup[]`로. `지주회사 → 컴퍼니 → 계좌 → 자회사`
  4단. 컴퍼니 1개면 컴퍼니 노드 생략(계좌부터). 라벨 문구 "지주회사 → 컴퍼니 → 계좌 →
  자회사"로 갱신.
- **회사 페이지(MemberRow)**: 컴퍼니명·CEO·아바타, 평가액, 수익률(`result` 없으면 "보유
  없음"), **포함 토글 스위치**. 컴퍼니 1개면 토글 숨김.
- **AccountGroups(대시보드)**: 최소안 — 계좌 summary에 컴퍼니 칩 1줄. 컴퍼니 1개면 칩 생략.
- **AccountManager/AccountRow**: 컴퍼니 ≥2개일 때만 컴퍼니 선택 드롭다운 노출.
