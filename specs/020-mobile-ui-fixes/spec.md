# Feature Specification: 모바일 UI 오버플로 수정

**Feature Branch**: `020-mobile-ui-fixes`  
**Created**: 2026-06-28  
**Status**: Shipped ✅  
**Merged**: 2026-06-28 (PR #26)

## 배경 (Why)

320px~375px 좁은 모바일 화면에서 두 곳이 카드 밖으로 넘쳤다:

1. **총자산 카드** — 숫자(CountUp) + 환전토글(₩/$)이 한 줄에 `flex items-center`로 묶여 있어, 큰 숫자(8자리 이상)에서 토글이 카드 밖으로 밀려남.
2. **계좌 수정버튼** — AccountRow 금액 칸이 `shrink-0 whitespace-nowrap`이라 좁은 화면에서 수정 버튼이 카드 우측 밖으로 밀려남.

---

## 구현 요약

### 이슈 1 — 총자산 환전토글 오버플로 (`cards.tsx`)

- 숫자+토글 행에 `flex-wrap` 추가 → 좁으면 토글이 다음 줄로 내려감
- 숫자 크기 반응형: `text-3xl sm:text-4xl` (320px에선 3xl)

### 이슈 2 — 계좌 수정버튼 오버플로

**AccountRow.tsx**
- 금액 영역 `shrink-0` 제거 → `min-w-0 shrink` + 숫자 `truncate`
- 수정 버튼은 `shrink-0` 유지(항상 보임)

**AccountGroups.tsx** (홈화면 계좌 요약 행)
- 동일 패턴: 금액 `min-w-0 shrink truncate`, 화살표(›)만 `shrink-0`

---

## 주요 변경 파일

| 파일 | 변경 내용 |
|------|---------|
| `src/components/dashboard/cards.tsx` | 총자산 행 `flex-wrap`, 폰트 반응형 |
| `src/components/accounts/AccountRow.tsx` | 금액 shrink 허용, 버튼 고정 |
| `src/components/dashboard/AccountGroups.tsx` | 계좌 요약 행 동일 패턴 |

---

## 설계 결정

- **flex-wrap 선택 이유**: 토글을 두 번째 줄로 내리는 게 숫자를 줄이거나 폰트를 줄이는 것보다 가독성이 좋음. 토글은 보조 액션이라 두 번째 줄이 자연스러움.
- **truncate 선택 이유**: 계좌명이 길면 금액을 `...`으로 자르는 게 버튼 밀림보다 낫다. 계좌 금액은 탭해서 상세 보기 가능하므로 생략해도 UX 손실 없음.

---

## 테스트 기준

- 375px 미만 화면: 총자산 카드 — 환전토글이 카드 안에 있음
- 375px 미만 화면: 계좌 카드 — 수정 버튼이 카드 안에 있음
