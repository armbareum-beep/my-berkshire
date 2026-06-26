# Phase 1 Data Model: 토스식 계좌 만들기

> **스키마 변경 없음.** 본 기능은 표시 전용이며 `accounts`·`events` 테이블, RLS, `createAccount` 액션을
> 일절 건드리지 않는다. 아래는 새로 추가하는 **코드 상수(표시 메타데이터)**와 기존 엔티티의 재사용 관계다.

## 신규 표시 상수 (src/lib/config/tax.ts)

### ACCOUNT_TYPE_DESCRIPTION
- 형태: `Record<AccountType, string>` — 종류별 한 줄 절세 설명.
- 제약(검증):
  - 모든 `AccountType`(GENERAL·ISA·PENSION·IRP·OVERSEAS) 키가 존재해야 한다(누락 0).
  - 문구의 수치는 같은 파일 `TAX_CONFIG`/`TAX_CREDIT_CONFIG`/`PENSION_GROUP_CREDIT_LIMIT`와 정합(FR-003).
- 값: research.md R2 표 참조.

### ACCOUNT_TYPE_EMOJI
- 형태: `Record<AccountType, string>` — 종류별 아이콘 이모지(EmojiIcon MAP 키).
- 제약(검증):
  - 모든 `AccountType` 키 존재.
  - 각 값은 `EmojiIcon`의 MAP에 존재하는 키여야 한다(폴백 텍스트로 떨어지지 않게). 현재 선택: 🏦·🛡️·💰·🏛️·🌍.
- 값: research.md R3 표 참조.

## 기존 엔티티(재사용, 불변)

### AccountType (tax.ts)
- 열거: `"GENERAL" | "ISA" | "PENSION" | "IRP" | "OVERSEAS"`. 라벨 `ACCOUNT_TYPE_LABEL`, 순서 `ACCOUNT_TYPES`.
- 본 기능은 이 집합을 그대로 순회해 카드를 그린다(신규 종류 없음).

### account (accounts 테이블)
- 필드(불변): `id, holding_id, member_id, name, account_type, broker, commission_rate, created_at`.
- 생성 경로: `createAccount(name, type, commissionRate?, broker?, memberId?)` — 시그니처·동작 불변.

## 상태(클라이언트 전용, 비영속)

### CreateAccountSection.open: boolean
- `false`(기본): "계좌 만들기" 버튼만 표시.
- `true`: 폼(`AccountManager`) 표시.
- 전이: 버튼 클릭 → `true`. 추가 성공(`onAdded`) 또는 닫기 → `false`. 새로고침 시 `false`로 초기화(영속 안 함).

### AccountTypePicker.value: AccountType (부모 `AccountManager`가 보유)
- 기존 `type` 상태를 그대로 사용. 카드 탭 → `onChange(t)`로 갱신. 선택값이 `createAccount`의 `type` 인자.
