# Phase 1 Data Model: 계좌 카드 UI 개선

**DB 스키마 변경 없음.** 이 기능은 기존 `accounts` 컬럼(`account_type`, `broker`)을 화면에 노출할 뿐이다. 아래는 화면에 데이터를 흘리기 위한 **타입/프롭** 변경만 기술한다.

## 변경 타입

### `AccountOption` (src/components/transactions/TransactionFlow.tsx)

위저드 계좌 선택에 로고를 표시하기 위해 `broker` 추가.

| 필드 | 타입 | 상태 | 비고 |
|------|------|------|------|
| `id` | `string` | 기존 | |
| `name` | `string` | 기존 | |
| `accountType` | `AccountType` | 기존 | 분류 배지 출처 |
| `commissionRate` | `number` | 기존 | |
| `broker` | `string \| null` | **신규** | 증권사 id, null이면 아바타 폴백 |

**공급처**: src/app/transactions/page.tsx — `accounts` select에 `broker` 컬럼 추가, 매핑에 `broker: a.broker ?? null`.

### `AccountGroup` (src/lib/accounts.ts) — 변경 없음

`accountType: AccountType`(:26)·`broker: string | null`(:30) **이미 존재**. 홈 보유 계좌는 추가 데이터 없이 표시만 추가.

## 신규 컴포넌트 계약 (UI prop contract)

### `AccountPicker` (src/components/transactions/wizard/AccountPicker.tsx, 신규)

| Prop | 타입 | 의미 |
|------|------|------|
| `accounts` | `AccountOption[]` | 표시할 계좌 목록(페이지 로드 순서) |
| `selectedId` | `string \| null` | 현재 선택된 계좌 id |
| `onSelect` | `(id: string) => void` | 카드 탭 시 호출. 호출측에서 부수효과 수행 |

**불변식**
- 카드 1개 = 계좌 1개, 세로 리스트(스크롤로 전부 노출).
- `broker`가 truthy면 `BrokerChip`, 아니면 `Avatar`(이름 폴백).
- `selectedId === a.id`인 카드만 선택 스타일(`ring-2 ring-primary`).
- 표시 정보: 로고 + 이름(truncate) + `ACCOUNT_TYPE_LABEL[accountType]` 배지. **평가액·수익률 비표시**(범위 밖).

## 표시 규칙 (오버플로 불변식 — 3 화면 공통)

- 가변 텍스트 컬럼: `flex min-w-0 flex-1 flex-col`, 이름 span `truncate`.
- 금액 컬럼: `ml-auto ... shrink-0`(+ accounts 행은 `whitespace-nowrap`).
- 결과: 금액은 절대 카드 밖으로 나가지 않고, 공간 부족 시 이름이 `…`로 잘린다(SC-002).
