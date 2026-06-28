# 026 · 홈화면 보유종목 정렬 필터 + UI 정리

## 상태
구현 완료 · PR #32 머지 (2026-06-28)

## 변경 내용

### 카드 제목·링크 정리
- "보유 계좌" → "보유 종목" 카드 제목 변경
- 계좌 관리·목표비중 리밸런싱 푸터 링크 제거 (카드 클릭으로 진입 가능)
- 카드 전체 링크 → 타이틀 우측 `›`만 링크 (버튼 클릭 시 바텀시트 열림 버그 방지)
- 자산 구성 카드도 동일 패턴 적용 (`SectionCard` + `action` prop)

### 보유종목 정렬
- `ConsolidatedHoldings` 클라이언트 컴포넌트로 전환
- 정렬 칩 3개: 평가액(기본) · 수익금 · 수익률
- 재클릭 시 asc/desc 토글, null 값은 항상 뒤로
- 서버 컴포넌트(`HoldingsStreamed`)에서 `flattenHoldings()` 호출 후 결과만 클라이언트에 전달 (`next/headers` 체인 차단)

## 변경 파일
- `src/app/dashboard/page.tsx`
- `src/components/dashboard/ConsolidatedHoldings.tsx`
- `src/components/dashboard/cards.tsx`
