# UI Contract: `<Sheet>` 드롭시트 셸

**File**: `src/components/ui/Sheet.tsx` (client component)

기존 상세 콘텐츠를 감싸 "아래에서 올라오는 닫을 수 있는 시트"로 만드는 셸. 인터셉터 page가 `<Sheet><XxxContent/></Sheet>` 형태로 사용한다.

## Props

```ts
interface SheetProps {
  children: React.ReactNode;   // 시트 안에 표시할 기존 상세 Content(크롬 없음)
  title?: string;              // 접근성 라벨(aria-label). 없으면 일반 "상세" 라벨
  fullHref?: string;           // "전체 보기" 대상 전체 페이지 URL(FR-007). 있으면 하드 내비 링크 노출
}
```

## 동작 계약

| ID | 요구 | 매핑 |
|---|---|---|
| SH-1 | 마운트 시 `translateY(100%)→0` 슬라이드 인(≤250ms, ease-out). `prefers-reduced-motion`이면 모션 생략 | FR-011, 헌장 IV |
| SH-2 | 닫기 트리거 4종 — ① X 버튼 ② 배경(backdrop) 탭 ③ 아래로 스와이프(임계값 초과) ④ 브라우저 back | FR-002 |
| SH-3 | ①②③은 닫힘 애니메이션 후 `router.back()` 호출. ④는 자동(인터셉트 히스토리 엔트리) | FR-002, SC-005 |
| SH-4 | 열림 동안 배경 스크롤 잠금(배경 `overflow:hidden`/`overscroll-contain`). 시트 내부만 스크롤 | FR-004 |
| SH-5 | 콘텐츠가 길면 시트 내부 스크롤로 전부 열람 가능 | FR-005 |
| SH-6 | `position:fixed`, 앱의 `max-w-[480px]` 중앙 컬럼 폭에 정렬, 하단 고정·상단 peek 여백. 모바일·데스크톱 동일 | FR-005a |
| SH-7 | `fullHref` 제공 시 "전체 보기" 링크 노출 — **하드 내비게이션**(`<a href>`)로 전체 페이지 이동 | FR-007 |
| SH-8 | 로딩/실패는 children(기존 Content)의 책임. Sheet 셸 자체는 열림/닫힘을 막지 않음 | FR-009 |

## 접근성

- 역할: `role="dialog"`, `aria-modal="true"`, `aria-label`(title).
- 포커스: 열림 시 시트로 포커스 이동, 닫힘 시 트리거로 복귀(가능 범위).
- X 버튼은 `aria-label="닫기"`.

## 비목표

- 스와이프 라이브러리 도입 금지(터치 이벤트 직접 구현). 신규 외부 의존 없음.
- 데스크톱 전용 모달/사이드패널 분기 금지(단일 하단 시트).
