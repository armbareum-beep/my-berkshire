# 029 · 드롭시트 X 버튼 닫기 버그 수정

## 상태
구현 완료 · PR #35 머지 (2026-06-28)

## 문제
드롭시트가 올라온 후 X 버튼을 눌러도 닫히지 않는 경우가 간헐적으로 발생.

## 원인

### 버그 1: `closingRef` 영구 잠금
`close()`가 호출되면 `closingRef.current = true`로 설정되고 **절대 `false`로 되돌리지 않는다**.
`router.back()`이 실패(히스토리 없음, Next.js 라우터 캐시 등)해서 시트가 언마운트되지 않으면
`closingRef`가 잠긴 채 남아 이후 X 클릭이 전부 무시됨.

### 버그 2: 스와이프 stale state
`onTouchEnd`가 React state(`dragY`)를 읽는데, 빠른 스와이프 시 `onTouchMove`의 `setDragY()` 업데이트가
아직 커밋되기 전에 `onTouchEnd`가 실행돼 `dragY = 0`(이전 렌더 값)을 읽어 스와이프로 닫히지 않음.

## 변경 내용

- `closeTimerRef` 추가: `close()` 호출 500ms 후 `closingRef`를 자동 리셋 — navigation 실패 시 재시도 허용
- 언마운트 시 `closeTimerRef` 타이머 정리
- `dragYRef` 추가: `onTouchMove`에서 ref·state 동시 업데이트, `onTouchEnd`는 ref 기준으로 판정

## 변경 파일
- `src/components/ui/Sheet.tsx`
