# Phase 0 Research: 토스식 계좌 만들기

## R1. 진입 게이팅 방식 — 인라인 디스클로저 vs 바텀시트 라우트

- **Decision**: 새 라우트 없는 **클라이언트 인라인 디스클로저**. 어카운트 페이지 하단에 `CreateAccountSection`
  (클라이언트)을 두고, 기본은 "계좌 만들기" 버튼만 표시. 누르면 폼(`AccountManager`)을 펼치고, 추가 성공
  또는 닫기 시 다시 버튼으로 접는다.
- **Rationale**:
  - 스펙 FR-005~007("처음엔 숨김 → 누르면 폼 → 완료/닫기 시 목록 복귀")을 새 라우트·데이터 재조회 없이 충족.
  - `AccountManager`는 이미 클라이언트 컴포넌트이고 `members`를 prop으로 받으므로(015), 서버 데이터를
    중복 조회할 필요 없이 그대로 감싸면 된다.
  - 토스급 절제(원칙 IV): 페이지 진입 시 폼이 사라져 더 단순. 추가 화면 전환·애니메이션 없이 정돈.
- **Alternatives considered**:
  - `@sheet/(.)` 인터셉터 바텀시트: 토스와 가장 비슷하나 라우트·`members` 재조회·시트 컴포넌트 추가가 필요해
    이 변경의 가치 대비 과함. 추후 "사업부 통합 피커"로 확장할 때 시트로 승격 고려(범위 밖).
  - 별도 `/accounts/new` 풀페이지: 왕복 내비게이션이 무겁고 목록↔폼 컨텍스트가 끊김.

## R2. 종류별 한 줄 절세 설명 문구 (tax.ts 규칙과 정합)

- **Decision**: `ACCOUNT_TYPE_DESCRIPTION: Record<AccountType, string>`를 `tax.ts`에 추가. 값은 같은 파일의
  `TAX_CONFIG`·`TAX_CREDIT_CONFIG` 수치와 일치시킨다(FR-003).

  | 종류 | 문구(초안) | 근거 상수 |
  |------|-----------|-----------|
  | GENERAL | 배당 15.4% 과세 · 자유로운 입출금 | `TAX_CONFIG.GENERAL.dividendTaxRate=0.154` |
  | ISA | 배당 비과세 · 연 2,000만원 납입한도 | `dividendTaxRate=0`, `TAX_CREDIT_CONFIG.ISA.annualLimit=20,000,000` |
  | PENSION | 세액공제 13.2% · 연 600만원 한도 | `TAX_CREDIT_CONFIG.PENSION.creditRate=0.132`, `creditLimit=6,000,000` |
  | IRP | 세액공제 · 연금저축 합산 900만원 한도 | `PENSION_GROUP_CREDIT_LIMIT=9,000,000` |
  | OVERSEAS | 해외주식 거래 · 배당 15.4% 과세 | `TAX_CONFIG.OVERSEAS.dividendTaxRate=0.154` |

- **Rationale**: 단일 출처(원칙 V) — 문구를 세제 상수 옆에 둬 값이 바뀌면 한곳에서 같이 고친다. 정직(원칙 II) —
  실제 규칙 기반, 임의 숫자 없음.
- **Alternatives considered**: 컴포넌트에 문구 하드코딩 → 세율 변경 시 화면-실제 괴리 위험으로 기각.

## R3. 종류별 아이콘 — EmojiIcon 매핑 재사용

- **Decision**: `ACCOUNT_TYPE_EMOJI: Record<AccountType, string>`를 `tax.ts`에 추가하고, 피커에서
  `<EmojiIcon emoji={...} />`로 렌더. `EmojiIcon`의 기존 MAP에 이미 존재하는 키만 사용.

  | 종류 | 이모지 | lucide(EmojiIcon MAP) |
  |------|--------|------------------------|
  | GENERAL | 🏦 | Building2 |
  | ISA | 🛡️ | Shield(비과세 보호) |
  | PENSION | 💰 | Coins(연금 적립) |
  | IRP | 🏛️ | Landmark |
  | OVERSEAS | 🌍 | Globe |

- **Rationale**: `EmojiIcon.tsx` MAP에 🏦·🛡️·💰·🏛️·🌍 모두 존재(확인 완료) → 신규 아이콘 import·매핑 불필요.
  라인 아이콘이라 토스 톤(원칙 IV)과 일관.
- **Alternatives considered**: 종목 로고용 `Avatar`/`LogoImage` 재사용 → 로고 후보 URL이 없어 부적합. 원본 이모지
  직접 렌더 → 색 이모지가 디자인 톤과 충돌(EmojiIcon이 이미 박멸 대상으로 처리).

## R4. 행 UI 패턴

- **Decision**: `StockRow`의 "아이콘 + 제목(굵게) + 부제(회색) + 우측 슬롯" 레이아웃을 차용한 **전용 선택 행**을
  `AccountTypePicker` 내부에 둔다(클릭=선택, 우측에 선택 시 체크). `StockRow` 자체는 `Avatar`/`href` 전제라 직접
  재사용 대신 같은 클래스 구조를 따른다.
- **Rationale**: 시각적 일관성 확보하면서 선택(라디오) 시맨틱·아이콘 슬롯을 맞춤 제어. 추가 의존 없음.
- **Alternatives considered**: `StockRow` 직접 사용 → Avatar 강제·우측 등락블록 전제로 부적합.

## 미해결(NEEDS CLARIFICATION) — 없음

스펙·헌장·기존 코드로 모든 선택이 합리적 기본값으로 해소됨.
