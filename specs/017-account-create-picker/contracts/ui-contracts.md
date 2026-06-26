# Phase 1 UI Contracts: 토스식 계좌 만들기

웹앱 UI 기능 — 외부 API/네트워크 계약 없음. 아래는 컴포넌트 간 props·동작 계약이다.
서버 액션 `createAccount`는 **시그니처·동작 불변**으로 재사용한다.

## C1. AccountTypePicker (신규)

```ts
function AccountTypePicker(props: {
  value: AccountType;                 // 현재 선택된 종류
  onChange: (t: AccountType) => void; // 카드 탭 시 호출
  className?: string;
}): JSX.Element
```

**계약**:
- `ACCOUNT_TYPES` 순서대로 5개 카드 렌더. 각 카드 = `EmojiIcon(ACCOUNT_TYPE_EMOJI[t])` + `ACCOUNT_TYPE_LABEL[t]`(굵게)
  + `ACCOUNT_TYPE_DESCRIPTION[t]`(회색 한 줄).
- `t === value`인 카드는 선택 강조(테두리/배경) + 우측 체크 표시. 강조에 쓰는 색은 브랜드색 1곳으로 제한(원칙 IV).
- 카드 탭 → `onChange(t)`. 키보드 접근 가능(`role`/`aria-checked` 라디오 시맨틱 권장).
- 순수 표시 — 자체 네트워크/저장 없음.

## C2. CreateAccountSection (신규)

```ts
function CreateAccountSection(props: {
  members?: MemberOption[];  // AccountManager로 그대로 전달
}): JSX.Element
```

**계약**:
- 초기 상태 `open=false` → "계좌 만들기" 버튼(전체폭 CTA)만 렌더(폼 비노출 — FR-005).
- 버튼 클릭 → `open=true` → `<AccountManager members onAdded={() => setOpen(false)} />`와 닫기 어포던스 렌더(FR-006).
- 추가 성공 또는 닫기 → `open=false`로 복귀(FR-007). 입력값은 폐기(부분 저장 없음).
- 계좌 0개여도 버튼은 항상 렌더(FR-008).

## C3. AccountManager (수정)

```ts
function AccountManager(props: {
  members?: MemberOption[];
  onAdded?: () => void;   // [신규] 추가 성공 시 호출(섹션 접기용). 없으면 기존처럼 폼 유지.
}): JSX.Element
```

**계약(변경점만)**:
- 종류 선택 영역(현 알약 토글)을 `<AccountTypePicker value={type} onChange={setType} />`로 교체.
- `add()` 성공 시 기존 동작(상태 초기화 + `router.refresh()`) 후 `onAdded?.()` 호출.
- `createAccount(name, type, rate?, broker, memberId|null)` 호출은 불변 — 저장 결과 동일(FR-009).

## C4. accounts/page.tsx (수정)

**계약**:
- 하단 `<AccountManager members={members} />`(현 153행)를 `<CreateAccountSection members={members} />`로 교체.
- 그 외(목록·수수료 카드·데이터 조회)는 불변.
