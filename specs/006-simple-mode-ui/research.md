# Phase 0 Research: 간편모드 UI 업그레이드

스펙에 NEEDS CLARIFICATION이 남아있지 않으므로(워드마크 단독 확정), 본 문서는 두 가지 설계 결정과 기존 코드 정합을 정리한다.

## Decision 1 — ENUF 워드마크의 시각 형태

**Decision**: "ENUF"를 **잉크색(`--foreground` #191f28) 타이포 워드마크**로 표시한다. 별도 그림 심볼/아이콘 없음(사용자 확정). 헤더 좌상단에서 워드마크가 상위 브랜드, 그 아래 회사명(`{holding.name} ›`)·설립일을 하위 정보로 둔다.

**Rationale**:
- 사용자가 "로고는 그냥 ENUF 글자만"으로 명시 → 심볼 제작·축소표시 이슈 없음.
- 헌법 IV(토스급 절제): 화면당 솔리드 브랜드 색면은 1개로 제한. 대시보드는 이미 하단탭 액션·CTA에서 primary(파랑)를 쓰므로, 워드마크는 **색면이 아닌 잉크 타이포**로 만들어 두 번째 브랜드 색 블록을 만들지 않는다. 그라데이션·배경칩 금지.
- 위계: 워드마크 `text-lg font-extrabold tracking-tight`, 회사명은 기존 `text-sm font-medium text-muted-foreground` 유지 → "브랜드 > 회사정보" 자연 위계.

**Alternatives considered**:
- primary 색 워드마크/배경칩: 헌법 IV의 "브랜드 색면 1개" 한도 초과 위험 → 기각.
- 심볼+워드마크: 사용자가 글자만 원함 → 기각.

## Decision 2 — 행 상세 진입 화살표(›) 패턴

**Decision**: 보유 행 우측 끝, 평가금액/수익률 컬럼 **뒤에** `›` 글리프를 추가한다. 색은 `text-muted-foreground`, 기존 계좌 summary 행의 `›`(AccountGroups.tsx:72-74)와 동일 톤. 값 컬럼과 화살표를 `flex items-center`로 묶고 그 묶음에 `ml-auto`를 줘 우측 정렬을 유지한다.

**Rationale**:
- 헌법 IV: muted 글리프라 색 추가 없음. 이미 앱 안에서 쓰는 `›` 패턴 재사용 → 시각 일관성.
- FR-006(진입 가능 행에만): 보유 행은 전부 `/stocks/[symbol]`로 진입 가능(현금 등 비종목은 이 목록에 없음) → 모든 행에 화살표가 곧 "전부 진입 가능"과 일치.
- 기존 Link 래퍼(행 전체가 탭 타깃)는 그대로 → 탭 영역 회귀 없음.

**Alternatives considered**:
- 행 전체 배경 hover 강조만: 모바일 터치엔 hover가 약함 → 화살표가 더 명확.
- 아이콘 라이브러리 ChevronRight(lucide): 기존 코드가 텍스트 `›`를 쓰므로 통일 위해 텍스트 글리프 채택(번들·정렬 단순).

## 기존 코드 정합 메모

- **보유 행 렌더는 2곳**: `AccountGroups.tsx`(계좌별, 대시보드 홈 카드 + /networth 공용) 88-118, `HoldingsBrowser.tsx`(전체 종목 flat 분기) 138-167. 양쪽 동일 패턴 적용 필요.
- **`scroll={false}` 불일치**: `AccountGroups`의 Link는 `scroll={false}`로 시트가 스크롤 점프 없이 열림. `HoldingsBrowser` flat Link는 누락(141행). 화살표 작업과 함께 `scroll={false}`를 더해 시트 진입 동작을 통일한다(소규모 부수 개선, FR-005 품질).
- **시트 진입**: `/stocks/[symbol]` → `@sheet/(.)stocks/[symbol]` 인터셉트(005). 라우팅 변경 불필요, 링크 그대로 사용.
- **truncate**: flat 모드는 이미 `min-w-0` + `truncate`로 긴 이름 처리됨(145-150). 계좌별 모드 행은 truncate 미적용 — 화살표 추가로 우측 공간이 줄므로, 이름 셀에 `min-w-0` + `truncate`를 함께 적용해 엣지케이스(긴 종목명) 침범 방지.

## 미해결 항목

없음. 모든 기술 컨텍스트 확정.
