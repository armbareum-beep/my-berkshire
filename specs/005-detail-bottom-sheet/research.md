# Phase 0 Research: 상세 바텀시트(드롭시트)

**Feature**: 005-detail-bottom-sheet
**Date**: 2026-06-22

핵심 기술 질문은 하나다: **서버 렌더된 기존 상세 라우트를, 홈/목록을 그대로 마운트한 채 "아래에서 올라오는 닫을 수 있는 시트"로 보여주는 방법.** 아래 결정들이 그 답이다.

---

## D1. 라우팅 메커니즘 — Intercepting Routes + Parallel Routes(`@sheet` 슬롯)

- **Decision**: 루트 `app/layout.tsx`에 단일 병렬 슬롯 `@sheet`를 추가하고, 그 안에서 대상 라우트를 `(.)` 매처로 **가로채기(intercept)** 한다. 클라이언트 소프트 내비게이션(앱 안의 `<Link>` 탭)은 시트로 열리고, 새로고침/딥링크/하드 내비게이션은 기존 전체 페이지로 열린다.
- **Rationale**:
  - 이 패턴이 정확히 FR들을 충족한다 — 시트는 **기존 라우트(서버 컴포넌트)를 그대로** 렌더하므로 FR-005(전체 내용 그대로)·FR-006(종목/지수 모두) 무료 충족. 딥링크/공유 URL은 하드 내비게이션이라 전체 페이지(FR-008). `router.back()`이 시트만 닫음(FR-002). 그 아래 `children`(홈/목록)은 리렌더되지 않아 스크롤·검색·필터 상태 보존(FR-003·SC-002).
  - 이 repo의 Next 변형(Next 16 계열)은 표준 parallel/intercepting routes를 그대로 지원함을 `node_modules/next/dist/docs`에서 확인.
- **매처 레벨**: `@sheet`는 슬롯(세그먼트 아님)이라 대상 라우트는 루트 세그먼트 기준 **같은 레벨** → `@sheet/(.)stocks/[symbol]/page.tsx`처럼 `(.)`를 쓴다(인터셉트 문서의 "@modal은 세그먼트가 아니라 한 레벨 위" 규칙).
- **Alternatives considered**:
  - *순수 클라이언트 오버레이 + History API*: 기존 상세는 서버 컴포넌트(Supabase RLS·DART·Yahoo)라 클라에서 그대로 못 그림. 콘텐츠를 별도 fetch/재구현해야 해 FR-005와 충돌. 기각.
  - *라우트별 로컬 인터셉트(`(..)`)*: 진입점이 홈·검색·보유·구성 등 여러 곳이라 라우트마다 중복 정의 필요. 루트 단일 `@sheet`가 모든 앱 내 내비게이션을 한 곳에서 가로채 단순(헌장 III). 기각.

---

## D2. v16 필수사항 — 모든 병렬 슬롯에 `default.js`

- **Decision**: `app/@sheet/default.tsx`가 `null`을 반환한다. 빌드 시 이게 없으면 **빌드 실패**(v16 변경점). 하드 내비게이션/새로고침 시 매칭 안 되는 `@sheet`는 `default`(=null)로 떨어져 시트가 안 뜬다 → FR-008 보장.
- **children 슬롯**: 모든 URL이 실제 page를 가지므로 `children`은 항상 매칭된다. 그래도 빌드가 `app/default.tsx`를 요구하면 추가(검증 단계에서 `next build`로 확인).
- **Source**: version-16 업그레이드 문서 "Parallel Routes `default.js` requirement".

---

## D3. 시트가 열린 채 비대상(작업형) 라우트로 이동하면 — catch-all로 슬롯 비우기

- **Decision**: `app/@sheet/[...catchAll]/page.tsx`(또는 default)가 `null`을 반환한다.
- **Rationale**: 병렬 라우트는 "현재 URL과 매칭 안 되는 슬롯의 직전 활성 상태를 소프트 내비게이션 후에도 **유지**"한다. 시트를 연 상태에서 작업형 페이지(`/transactions` 등 인터셉터 없음)로 이동하면 시트가 남는 버그가 생긴다. catch-all이 null을 매칭시켜 시트를 닫는다(US3 시나리오 2). parallel-routes 문서의 "close modal with catch-all" 패턴 그대로.

---

## D4. 콘텐츠 ↔ 페이지 크롬 분리(BackButton·BottomTabBar)

- **문제**: 기존 상세/섹션 page들은 `BackButton`·`BottomTabBar`를 직접 렌더한다. 시트 안에서는 이 크롬이 중복·부적절(시트엔 X가 따로 있음).
- **Decision (권장)**: 각 대상 라우트를 **(a) 내용 컴포넌트(`*Content`, 크롬 없음)** 와 **(b) 전체 페이지 셸(크롬 + Content)** 로 분리한다. 전체 페이지 = 셸 + Content + 크롬; 시트 인터셉터 = `<Sheet><Content/></Sheet>`. 내용 로직·계산은 한 곳(Content)에만 있어 단일 원천 유지(헌장 III·V).
- **점진 적용**: 우선순위가 높은 라우트부터 분리(아래 D7 단계). 분리 비용이 큰 라우트는 **임시 폴백**으로 인터셉터에서 전체 page를 렌더하되 시트 스코프 CSS로 `[data-app-chrome]`(BottomTabBar/BackButton)을 숨긴다. 단, 폴백은 헌장 IV(절제) 관점에서 임시이며, 정식은 Content 분리.
- **Alternatives considered**: 페이지가 "시트 안인지"를 prop으로 받아 크롬을 끄기 — 서버 컴포넌트 트리에 prop 전파가 번거롭고 Content 분리가 더 명료. 기각(단, 인터셉터가 Content에 `inSheet` 의미를 주는 건 Content 분리의 일부).

---

## D5. 시트 셸 컴포넌트 — 닫기 4종·스크롤 락·모션

- **Decision**: 클라이언트 컴포넌트 `<Sheet>`가 다음을 담당.
  - **열림 모션**: `translateY(100%) → 0` CSS transform + `transition`(≤250ms, ease-out). 면적 그라데이션·과한 애니메이션 금지(헌장 IV). 가능하면 `prefers-reduced-motion` 존중.
  - **닫기 4종(FR-002)**: ① X 버튼 ② 디밍된 배경(backdrop) 탭 ③ 아래로 스와이프(터치 드래그 임계값 초과 시) ④ 브라우저 back. ①②③은 닫기 애니메이션 후 `router.back()` 호출(히스토리 정합). ④는 인터셉트가 만든 히스토리 엔트리 덕에 자동으로 시트만 닫힘.
  - **스크롤 락(FR-004)**: 시트 열림 동안 배경 스크롤 차단(`body`/컨테이너 `overflow:hidden` 또는 `overscroll-contain`). 시트 내부만 스크롤.
  - **레이아웃**: 앱이 이미 `max-w-[480px]` 중앙 컬럼이므로 시트도 그 컬럼 폭에 맞춰 `position:fixed; inset-x` 480 컬럼 정렬, 하단 고정, 상단 일부 여백(peek). 모바일·데스크톱 동일(FR-005a).
- **Rationale**: 닫기 동작을 모두 `router.back()`으로 수렴시켜 히스토리·URL 정합을 단일화(SC-005: 의도치 않은 앱 이탈 0).
- **모션 옵션**: React 19.2 `ViewTransition`도 가능하나, 단순 CSS transform이 절제 원칙·예측가능성에서 우위. CSS 채택.

---

## D6. 스크롤 점프 방지

- **Decision**: 시트를 여는 진입 `<Link>`에 `scroll={false}`를 지정하고, 시트는 `position:fixed`로 배경 위에 떠서 배경 스크롤을 건드리지 않게 한다.
- **Rationale**: Next 16은 더 이상 `scroll-behavior`를 강제 오버라이드하지 않음(version-16 문서). 인터셉트 내비게이션 시 배경이 top으로 튀지 않도록 `scroll={false}`로 못박고, fixed 시트로 배경 보존(SC-002).

---

## D7. 적용 범위와 단계(스펙 우선순위 매핑)

조회형(시트) 대상 라우트와 작업형(전체 페이지 유지) 경계:

| 구분 | 라우트 | 처리 |
|---|---|---|
| 조회형(시트) | `/stocks/[symbol]`, `/index/[symbol]` | 인터셉터 + Content 분리 (US2, P1) |
| 조회형(시트) | `/report`, `/networth`, `/lookthrough`, `/disclosures`, `/company` | 인터셉터 + Content 분리 (US1, P1) |
| 조회형(시트) | `/holdings`, `/dividends`, `/annual-report` | 인터셉터 (US1 확장, P2) |
| 작업형(전체) | `/transactions`, `/rebalance`(+`[tag]`), `/import`, `/accounts`(+`[id]`) | **인터셉터 없음**. catch-all이 시트 비움 (US3, P1) |
| 전체 보기/딥링크 | 위 모든 전체 라우트 | 하드 내비게이션으로 전체 페이지 (US4, P3) |

- **"전체 보기"(FR-007)**: 시트 안 링크는 **하드 내비게이션**(`<a href>` 또는 풀 리로드)이어야 한다. 일반 `<Link>`면 다시 인터셉트되어 시트로 열린다.

---

## D8. 검증 전략

- **타입/린트**: 변경 파일 `npx tsc --noEmit`·ESLint 클린(헌장 게이트).
- **빌드 게이트**: `next build`로 병렬 슬롯 `default.js` 누락 여부 확정(빌드 실패로 드러남).
- **수동 검증(verify/run 스킬)**: 홈에서 리포트/공시/순자산 시트 열기·X·배경탭·스와이프·뒤로가기 4종 닫기, 닫은 뒤 스크롤 보존, 종목 시트, 작업형은 전체 페이지로 이동, 딥링크 새로고침 시 전체 페이지.
- **회귀**: 기존 상세 페이지(딥링크)·계산 결과 불변 확인.

---

## 미해결/위험

- **R1**: 콘텐츠 분리 작업량이 라우트별로 다름 — Content 분리가 큰 페이지는 D4 임시 CSS 폴백으로 단계 출시.
- **R2**: 시트 안에서 또 다른 조회형 링크를 탭할 때(FR-010 내용 교체) — 인터셉터가 새 URL로 교체되며 같은 `<Sheet>` 안에 새 Content가 들어오는지 verify에서 확인. 필요시 `<Sheet>`를 슬롯 레이아웃(`@sheet/layout.tsx`)으로 올려 유지.
- **R3**: 스와이프-투-디스미스 제스처는 라이브러리 없이 구현(신규 외부 의존 금지). 터치 이벤트 기반 최소 구현.
