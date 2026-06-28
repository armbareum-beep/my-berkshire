# Quickstart: 마이버크셔 ETF 투자자 뷰

## 검증 방법

1. ETF만 보유한 계좌 상태에서 `/growth` 진입 → ETF 현황 카드 활성, 기업 스냅샷 잠금 확인
2. 개별주만 보유한 계좌에서 `/growth` 진입 → 기업 스냅샷 활성, ETF 현황 잠금 확인
3. 둘 다 보유한 계좌에서 `/growth` 진입 → 두 카드 모두 활성 확인
4. 아무것도 없는 신규 계좌 → 두 카드 모두 잠금 확인

## 로컬 개발 진입점

- growth page: `src/app/growth/page.tsx`
- 신규 ETF 스냅샷 카드: `src/components/growth/EtfSnapshotCard.tsx`
- 신규 잠금 카드: `src/components/growth/LockedCard.tsx`

## 타입 체크 & 린트
```
npx tsc --noEmit
npx eslint src/app/growth/page.tsx src/components/growth/
```
