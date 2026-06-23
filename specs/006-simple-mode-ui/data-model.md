# Phase 1 Data Model: 간편모드 UI 업그레이드

**신규 엔티티 없음.** 본 기능은 순수 표현(presentation) 계층 변경으로 데이터 모델·DB 스키마·서버 데이터 형태를 일절 바꾸지 않는다.

## 사용(읽기)하는 기존 데이터

| 출처 | 필드 | 용도 |
|------|------|------|
| `holding` (대시보드) | `name`, `founded_at`, `mode` | 헤더 — 워드마크 아래 하위 정보(기존 그대로) |
| `AccountGroup` / `AccountHolding` (`lib/accounts`) | `symbol`, `name`, `quantity`, `value`, `changeRate`, `gain` | 보유 행 — 화살표는 이 데이터에 의존하지 않고 행마다 정적으로 추가 |

- 신규 컬럼/마이그레이션/타입 재생성 없음.
- 워드마크 텍스트 "ENUF"는 상수(앱 이름, `layout.tsx` metadata.title과 일치)로 데이터가 아니다.
