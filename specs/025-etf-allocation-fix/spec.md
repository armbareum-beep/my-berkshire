# 025 · ETF 자산구성 국가별 드릴다운 + 오분류 수정

## 상태
구현 완료 · PR #31 머지 (2026-06-28)

## 문제
- 자산구성 카드에서 ETF 섹션을 열어도 개별 종목명만 나오고 국가별 비중이 보이지 않았음
- 한국 ETF(KODEX 등)가 해외 ETF로 잘못 분류되어 국가 집계가 틀렸음
- Supabase `securities` 테이블의 stale country 데이터가 원인

## 해결
- ETF 섹션은 개별 종목 대신 기초자산 국가별로 집계해서 표시
- 한국 ETF 판별 로직 추가 (`securities.ts` — KRX 상장 ETF는 KR로 강제)
- `allocation.ts` grouping 로직 단순화, `dashboard.ts`에 ETF country tag 전달
- `cards.tsx` AllocationCard ETF 섹션 국가별 드릴다운 렌더링

## 변경 파일
- `src/components/dashboard/cards.tsx`
- `src/lib/allocation.ts`
- `src/lib/dashboard.ts`
- `src/lib/securities.ts`
