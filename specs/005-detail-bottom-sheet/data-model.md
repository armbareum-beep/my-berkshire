# Phase 1 Data Model: 상세 바텀시트

**Feature**: 005-detail-bottom-sheet

## 데이터 엔티티

**없음.** 이 기능은 새로운 영속 데이터·테이블·마이그레이션을 도입하지 않는다. 시트는 기존 종목/지수/섹션 상세를 **표현만 다르게** 보여줄 뿐, 데이터 소스(Supabase `events`·계좌·DART·Yahoo)와 계산 엔진은 변경하지 않는다. 헌장 V(단일 진실원천) 그대로 유지.

## 상태 모델(라우팅 상태)

영속 데이터 대신, 기능의 "상태"는 **URL + 병렬 슬롯 활성 상태**로 표현된다.

| 상태 | URL | `children` 슬롯 | `@sheet` 슬롯 |
|---|---|---|---|
| 홈 (시트 닫힘) | `/dashboard` | 대시보드 | `default.tsx` → null |
| 시트 열림(소프트 내비) | `/report` 등 | 대시보드(유지) | `(.)report` → `<Sheet>` |
| 딥링크/새로고침(하드 내비) | `/report` 등 | 전체 페이지 | `default.tsx` → null |
| 작업형 이동 | `/transactions` 등 | 작업 페이지 | `[...catchAll]` → null |

상태 전이:
- **열기**: 앱 안 `<Link href="/report">` 소프트 내비 → `@sheet`가 `(.)report` 인터셉트.
- **닫기(4종)**: X·배경탭·스와이프·뒤로가기 → `router.back()` → URL 복귀, `@sheet`는 직전 슬롯 상태에서 비워짐.
- **내용 교체(FR-010)**: 시트 열린 채 다른 조회형 `<Link>` 탭 → `@sheet`가 새 인터셉트로 교체(같은 시트 셸 안 Content 교체).
- **전체 보기(FR-007)**: 시트 안 하드 내비 링크 → 인터셉트 없이 전체 페이지.

## 분류 규칙(조회형 vs 작업형) — FR-001b

| 속성 | 조회형(시트) | 작업형(전체 페이지) |
|---|---|---|
| 사용자 의도 | 보고 닫음 | 입력·편집·다단계 진행 |
| 인터셉터 존재 | 있음(`@sheet/(.)route`) | 없음 |
| 예시 | report, networth, lookthrough, disclosures, company, holdings, dividends, annual-report, stocks/[symbol], index/[symbol] | transactions, rebalance(+[tag]), import, accounts(+[id]) |

신규 라우트 추가 시 이 표 기준으로 인터셉터 추가 여부를 판단한다.
