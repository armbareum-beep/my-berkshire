# ENUF — 디자인 시스템 레퍼런스 v3 (구현 및 개선 기준)

> **이 문서는 "어떻게 만들어졌나"의 단일 기준**이다. 비전·원칙은 [design-strategy-v1.md](./design-strategy-v1.md)(토스/뱅크샐러드식 모던), 시각 목업은 [mockups/](./mockups/)가 기준. 이 문서는 **실제 코드에 구현된 토큰·프리미티브·모션·패턴**을 파일 경로와 함께 정리한다. 새 화면은 여기 있는 프리미티브를 재사용하고, 새로 만들기 전에 이 목록부터 확인한다.
>
> 한 줄 요약: **옅은 회색 위 흰 카드(그림자로 분리) · 큰 굵은 숫자 · 브랜드색 로고 · 이모지 없는 lucide 라인 아이콘 + 3D 일러스트 · 색은 변화·액션에만 · 금액은 계산기 키패드 · 거래/설립은 한 화면 한 질문 위저드 · 마이크로 인터랙션 모션.**

---

## 1. 디자인 토큰 — [src/app/globals.css](../src/app/globals.css)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--background` | `#F2F4F6` | 페이지 배경(쿨그레이) |
| `--card` | `#FFFFFF` | 카드 표면 |
| `--foreground` | `#191F28` | 본문(잉크 블랙) |
| `--muted-foreground` | `#8B95A1` | 보조 텍스트 |
| `--secondary` | `#F2F4F6` | 회색 pill·트랙·칩(배경과 동색 → 흰 카드 위에서만 대비) |
| `--border` | `#E5E8EB` | 구분선·입력 테두리 |
| `--primary` | `#3182F6` | 메인 액션·링크(토스 블루) |
| `--accent` / `--accent-foreground` | `#EAF2FE` / `#3182F6` | 정보 틴트 면 |
| `--rise` / `--fall` | `#F04452` / `#3182F6` | 등락(한국식 상승=빨강/하락=파랑) — **시세 변화에만** |
| `--warn` / `--warn-tint` | `#F59E0B` / `#FFFBEB` | 경고(단정 아닌 "확인거리"). 등락색과 충돌 회피 |
| `--shadow-card-sm` | `0 2px 8px rgba(0,0,0,.04)` | 기본 카드 분리용 섀도우 |
| `--shadow-card-md` | `0 8px 24px rgba(0,0,0,.08)` | 바텀시트, 드롭다운 등 중간 레이어용 |
| `--shadow-card-lg` | `0 16px 32px rgba(0,0,0,.12)` | 모달, 팝업 등 최상위 레이어용 |
| `--radius` | `0.875rem` | 기본(라운드 크게 → 토스 무드). `rounded-2xl`이 카드 표준 |

- 모든 숫자 `tabular-nums`(body `font-feature-settings:"tnum"`). 폰트는 **Pretendard 단일**.
- 타이포그래피 디테일: 큰 폰트(`text-2xl` 이상)는 자간을 좁혀 단단한 인상을 준다 (`letter-spacing: -0.02em` 혹은 `tracking-tight`).
- 라이트 단일 테마 (추후 다크 테마 지원 대비 가능하도록 토큰 구조 유지).

**⚠️ "온통 회색" 함정:** `--secondary`와 `--background`가 같은 `#F2F4F6`이다. 회색 pill/입력을 **흰 카드 없이** 페이지에 바로 올리면 배경에 묻힌다. 폼·블록은 항상 `bg-card shadow-card-sm` 위에 올린다.

---

## 2. 색 규칙 (절대)
1. 화면 대부분은 흑·백·회색. **색은 "변화(등락)"와 "단 하나의 액션(파랑)"에만.**
2. 등락 빨강/파랑(`--rise`/`--fall`)은 **시세 변화에만**. 위험·경고를 파랑으로 칠하지 않는다 → 경고는 앰버(`--warn`).
3. 브랜드색 로고는 예외적으로 허용(§4) — **회사당 고유색 1개**라 "카테고리 무지개"와 다르다.
4. 그라데이션·면적 채움 차트 금지. 도넛은 토널 팔레트([donutPalette.ts](../src/components/dashboard/donutPalette.ts)).

---

## 3. 프리미티브 카탈로그 (재사용 — 새로 만들기 전 확인)

### 카드·행·레이아웃
- **[ui/SectionCard.tsx](../src/components/ui/SectionCard.tsx)** — 표준 카드(`rounded-2xl bg-card shadow-card`, title/href/action/footer). (레거시 `dashboard/cards.tsx`의 `CardShell`은 이걸 감싼 deprecated 래퍼, shadcn `ui/card.tsx`는 미사용.)
- **[ui/StockRow.tsx](../src/components/ui/StockRow.tsx)** — §4-1 종목 행: `[Avatar] 종목명/티커 ··· 값/등락%`. 종목이 나오는 모든 곳 공통.
- **[ui/SegmentedTabs.tsx](../src/components/ui/SegmentedTabs.tsx)** — 회색 컨테이너 + 흰 활성 탭(색 아닌 그림자로 활성).
- **[ui/WeightBar.tsx](../src/components/ui/WeightBar.tsx)** — 트랙 + 단색 채움 비중 막대.

### 아바타·아이콘
- **[ui/Avatar.tsx](../src/components/ui/Avatar.tsx)** + **[lib/finance/brandColor.ts](../src/lib/finance/brandColor.ts)** — 브랜드색 원형(§4). `symbol`(없으면 `name`)으로 색 결정.
- **[transactions/eventIcons.tsx](../src/components/transactions/eventIcons.tsx)** — `IconChip`(모노톤 lucide 라인 칩 sm/lg) + `EVENT_ICON`(매수/매도/배당/증자/인출/환전).
- **[ui/EmojiIcon.tsx](../src/components/ui/EmojiIcon.tsx)** — 데이터층에 남은 이모지 문자열을 lucide/색점으로 렌더(§5).

### 숫자·입력
- **[ui/Keypad.tsx](../src/components/ui/Keypad.tsx)** — 계산기 키패드 프리미티브(`applyKey`·3×4 그리드). 시트·인라인 공유.
- **[ui/NumberPad.tsx](../src/components/ui/NumberPad.tsx)** — `NumberPad`(바텀시트) + `NumberPadField`(탭하면 시트 뜨는 입력칸). 금액 입력 표준(§6).
- **[ui/CountUp.tsx](../src/components/ui/CountUp.tsx)** — 히어로 숫자 0→값 카운트업. **함수 prop 금지**(서버 호환) — `format` 문자열 키 + `currency`.

### 모션·로딩
- **[app/template.tsx](../src/app/template.tsx)** — 라우트 전환 페이드업(§8).
- **[ui/PageSkeleton.tsx](../src/components/ui/PageSkeleton.tsx)** — 각 라우트 `loading.tsx`가 쓰는 즉시 내비 스켈레톤(17개 라우트).

---

## 4. 브랜드색 로고 — [lib/finance/brandColor.ts](../src/lib/finance/brandColor.ts)
회색 이니셜의 휑함을 없애는 핵심(목업의 생동감 ≈80%가 여기서). 2단:
1. **큐레이트** — 주요 종목·증권사·미국주·코인은 실제 브랜드색(삼성 `#1428A0`, 네이버 `#03C75A`, 카카오 옐로, 애플·테슬라·BTC…). 심볼·이름 둘 다 매칭.
2. **폴백** — 미등록은 심볼/이름 해시 → 채도 낮춘 HSL 중간톤(무지개 방지). 글자색은 배경 명도로 자동(흰/잉크).

> **핵심 구분:** 이건 거래종류에 임의 색을 칠하는 "6색 카테고리"(촌스러움)와 다르다. **회사당 고유색 1개(=그 회사의 색)**라 핀테크처럼 보인다. 적용: `Avatar`/`SymbolAvatar` → StockRow·검색·대시보드·계좌 등 자동 전파.

---

## 5. 아이콘 및 비주얼 규율 — 이모지 금지 및 3D 에셋 권장
**이모지를 기능 아이콘으로 쓰지 않는다**(아마추어 신호). 전부 lucide-react 라인 아이콘 또는 정교한 비주얼 에셋을 사용한다.
- **아이콘 스타일:** Lucide 아이콘의 획(stroke) 두께는 `1.5px~1.75px`로 얇게 통일하고, 뒤에 연한 파스텔톤 브랜드 틴트 배경 칩(명도 10% 미만)을 매칭하여 시각적 단조로움을 피한다.
- **이모지 대체 3D 에셋:** 온보딩, 완료 화면 등 사용자의 주목이 필요하거나 감성적 반응이 필요한 곳에는 이모지 대신 **Claymorphism 스타일의 매트한 3D 일러스트(동전, 자산, 증서 등)**를 사용한다. (Spline 또는 3D 피그마 플러그인을 활용하여 톤을 일치시킴).
- UI 리터럴 이모지 → 직접 lucide(`Search`·`AlertTriangle`·`Lightbulb`·`Building2`…).
- 데이터층 아이콘 문자열(`lib/finance/homeSignal`·`lib/celebration`·`lib/style`의 `icon`/`emoji` 필드)은 프로듀서는 그대로 두고 **표시 측에서 [EmojiIcon](../src/components/ui/EmojiIcon.tsx)**으로 렌더(매핑 1곳, 미매핑은 폴백). 심각도 점은 컬러 도트로 대체.
- 검증: `src` 전체에서 사용자 노출 이모지 0(남은 건 주석·EmojiIcon 매핑 키·미렌더 데이터뿐).

---

## 6. 숫자 입력 — 맥락에 맞는 도구
- **두드러진 금액/단가/수량** → 계산기 키패드(`NumberPadField`): 거래 위저드, 온보딩 등기, 부채(잔액·이율), 실물자산(평가·취득가). 큰 숫자 + 3×4 키패드(토스 송금 무드).
- **컴팩트 인라인 비율/가중치**(할인율·성장률·리밸런싱 목표·수수료율) → **네이티브 input 유지**. 저장 버튼 옆 좁은 칸이라 바텀시트 키패드는 과함.
- **날짜** → 네이티브 `type=date` 유지(편의·접근성).
- 값은 항상 **문자열**로 관리 → `QuickAdd`·`Number()`·기존 상태와 호환.

---

## 7. 거래·설립 위저드 — 한 화면 한 질문
긴 폼 대신 **단계별 위저드**(목업 [transaction-flow-mockup.html](./mockups/transaction-flow-mockup.html)). **로직 불변** — 서버 액션(`recordEvent`/`recordBuys`/`foundCompany`)·검증·페이로드는 그대로, UI 표현만 재배치.

- **[wizard/StepShell.tsx](../src/components/transactions/wizard/StepShell.tsx)** — ‹뒤로 + 진행 점(dots) + 종류 라벨 · 큰 질문 + 보조설명 · 본문 · 하단 CTA.
- **[wizard/steps.tsx](../src/components/transactions/wizard/steps.tsx)** — `AmountBody`(큰 숫자 + 인라인 키패드 + 빠른더하기 + FX 힌트), `CurrencyChips`.
- **[wizard/SuccessOverlay.tsx](../src/components/transactions/wizard/SuccessOverlay.tsx)** — 체결 도장 ✓(튕김) + 메시지 + 계속.
- **[wizard/TxnWizard.tsx](../src/components/transactions/wizard/TxnWizard.tsx)** — 매도·배당·증자·인출·환전 스텝 엔진(상태 + 이벤트별 스텝 목록 + skip 규칙).
- **[wizard/BuyWizard.tsx](../src/components/transactions/wizard/BuyWizard.tsx)** — 매수: 종목→단가→수량→"담기" 루프 + 장바구니(자금출처·날짜) → 한 번에 체결.
- 라우팅: **[TransactionFlow.tsx](../src/components/transactions/TransactionFlow.tsx)** = 허브("무엇을 기록할까요?") + 대출·실물자산 인라인 폼 + 위저드 라우팅(`BUY`→BuyWizard, 그 외→TxnWizard).
- **스텝 skip:** 챌린지/라이브는 단가·날짜 생략(시세 강제·오늘 고정), 딥링크로 채워진 스텝 생략.
- **온보딩** [OnboardingRail.tsx](../src/app/onboarding/OnboardingRail.tsx) — 설립 레일(J0~J2)에 진행 점 + 키패드 + "설립 인가" 도장 애니메이션 + 설립자본 카운트업.

---

## 8. 모션 시스템 — [globals.css](../src/app/globals.css) 키프레임 + [CountUp](../src/components/ui/CountUp.tsx) + 마이크로 인터랙션
절제·빠르게. 전부 CSS 및 경량 Lottie 애니메이션(외부 대형 모션 라이브러리 지양). **`prefers-reduced-motion`이면 전부 무효.**

| 유틸 / 컴포넌트 | 효과 | 적용 |
|---|---|---|
| `.animate-page-in` | 라우트 전환 페이드업(0.28s) | `app/template.tsx`(전 페이지) |
| `.animate-stamp` | 도장 찍힘(scale+rotate 튕김) | 체결/설립 성공 |
| `.animate-fade-in` | 페이드(0.3s) | 성공 오버레이·증서 카드 |
| `.stagger > *` | 자식 순차 떠오름(nth-child 지연, ~8개) | 리스트(예: ActivityList) |
| `CountUp` | 숫자 0→값 ease-out(700ms) | 히어로/섹션 숫자(순자산·수익·점수…) |
| `active:scale-[0.98~0.99]` | 누름 반응 | 탭 가능한 카드·행·버튼 |
| `Lottie/SVG Micro` | 미세 튕김, 체크 드로잉, 폭죽 등 | 송금 완료, 자산 추가 완료 등 사용자 행동 피드백 |

---

## 9. 화면 분류 & 하단 탭
- **평시(resting)** = 하단 탭바 노출: 대시보드·자산·연혁·현금·자산배분·리밸런싱·계좌·종목·검색 등. 탭: 홈·검색·기록(＋)·연혁([BottomTabBar.tsx](../src/components/dashboard/BottomTabBar.tsx), lucide 아이콘).
- **여정 중(journey)** = 탭바 없음(이탈 방지): 로그인·온보딩·**거래 입력**(/transactions·/acquire). 자체 ‹뒤로만.
- **모바일 단일 레이아웃**(max-width ~480px 중앙 고정). 데스크탑 전용 레이아웃 없음.

---

## 10. "구림" 방지 체크리스트
1. 흰 카드가 깊이감에 맞는 그림자로 떠 있나? (회색 블록이 회색 배경에 묻혔으면 실패)
2. 폰트 Pretendard 하나, 위계는 굵기·크기·자간(큰 서체일수록 tight)으로 조절했나?
3. 색이 변화·액션에만? (면으로 칠했으면 실패) 브랜드색 로고는 예외(회사당 1색).
4. **이모지가 그대로 쓰였나?** (있으면 실패 → 3D 에셋 또는 틴트 칩 아이콘으로 대체 확인)
5. 금액 입력이 키패드인가? (두드러진 금액인데 작은 네이티브 input이면 재검토)
6. 모션 피드백(마이크로 인터랙션)이 자연스럽게 적용되었나?
7. 토스/뱅크샐러드 옆에 놓아도 같은 급인가?

---

## 부록 — 이번 리디자인 변경 이력(2026-06)
- **Phase 1** 거래 위저드(매도·배당·증자·인출·환전) — StepShell·키패드·체결 도장.
- **Phase 2** 매수 위저드(BuyWizard, "또 담기" 장바구니) — MultiBuyForm·구 폼 제거.
- **Phase 3** 온보딩 위저드化 — 진행 점·키패드·설립 도장·카운트업.
- **Phase 4** 이모지 박멸 — UI 리터럴 + 데이터층(EmojiIcon).
- **Phase 5** 키패드 통일 — 부채·실물자산(두드러진 금액). 컴팩트 비율은 네이티브 유지.
- **Phase 6** 모션 시스템 — 페이지 전환·리스트 등장·계좌 브랜드 아바타·카운트업.
- **Phase 7** 디자인 시스템 v3 고도화 — 그림자 세분화(sm/md/lg), 이모지 대체 3D 에셋 권장 가이드, 라인 아이콘 틴트 배경 칩, 마이크로 인터랙션(Lottie) 도입.

선행 작업(P0~P4, 별도): 프리미티브 6종, 등락색 교정, 차트 그라데이션 제거, 도넛 토널화, 카드·행 통일, 브랜드색 로고.
