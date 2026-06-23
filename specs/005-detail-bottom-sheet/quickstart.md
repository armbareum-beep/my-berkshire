# Quickstart: 상세 바텀시트 구현·검증

**Feature**: 005-detail-bottom-sheet

## 구현 순서(권장)

1. **시트 셸**: `src/components/ui/Sheet.tsx` 작성 — contracts/sheet-component.md 계약(SH-1~8). 닫기 4종·스크롤락·슬라이드.
2. **슬롯 골격**: `app/layout.tsx`에 `sheet` prop 추가 + `app/@sheet/default.tsx`(null) + `app/@sheet/[...catchAll]/page.tsx`(null). 여기서 `next build` 한 번 — 슬롯 default 요구사항 확정.
3. **P1 조회형 — 종목/지수(US2)**: `stocks/[symbol]`·`index/[symbol]`에서 크롬 없는 `*Content` 추출 → 전체 페이지 = 셸+Content, 인터셉터 `@sheet/(.)stocks/[symbol]` = `<Sheet fullHref><Content/></Sheet>`.
4. **P1 조회형 — 홈 섹션(US1)**: report·networth·lookthrough·disclosures·company 동일 패턴.
5. **P1 경계(US3)**: 작업형(transactions·rebalance·import·accounts)에 인터셉터를 두지 **않음**을 확인. catch-all이 시트를 비우는지 verify.
6. **P2 확장**: holdings·dividends·annual-report 인터셉터.
7. **P3(US4)**: "전체 보기" 하드 내비 링크, 딥링크 새로고침 시 전체 페이지 확인.
8. 진입 `<Link>`에 `scroll={false}` 적용.

> 콘텐츠 분리 비용이 큰 라우트는 임시로 인터셉터에서 전체 page를 렌더 + 시트 스코프 CSS로 `BottomTabBar`/`BackButton` 숨김(research D4). 정식은 Content 분리.

## 검증 체크리스트(verify/run 스킬)

- [ ] 홈 스크롤 후 리포트 섹션 탭 → 시트 슬라이드 인(≤0.3s 표시 시작) · 페이지 이동 없음 — SC-001, US1-1
- [ ] X / 배경탭 / 아래 스와이프 / 브라우저 back 4종으로 닫힘 — FR-002, SC-005
- [ ] 닫은 뒤 홈이 같은 스크롤 위치 · 재요청 없음 — FR-003, SC-002
- [ ] 시트 내용이 길면 시트 내부만 스크롤, 배경 고정 — FR-004
- [ ] 보유/검색에서 종목 탭 → 상세 시트, 닫으면 목록·검색어 유지 — US2
- [ ] 공시/순자산/투시/연혁 시트 정상 — US1
- [ ] 작업형(거래기록·리밸런싱·가져오기·계좌관리) 탭 → 시트 아닌 **전체 페이지** — US3-1
- [ ] 조회형 시트 안 작업 링크 탭 → 시트 닫히고 작업 페이지 — US3-2
- [ ] 시트 "전체 보기" → 전체 페이지 / `/stocks/AAPL` 직접 진입·새로고침 → 전체 페이지 — US4, FR-008
- [ ] 시트 열린 채 다른 종목 탭 → 같은 시트 내용 교체 — FR-010
- [ ] 로딩/실패 시 시트는 정상, 내부에 기존 안내 — FR-009

## 품질 게이트

```bash
npx tsc --noEmit          # 변경 파일 타입 클린
npx eslint <changed>      # 린트 클린
next build                # 병렬 슬롯 default.js 누락 = 빌드 실패로 검출
```

## 주의

- 신규 외부 의존 추가 금지(스와이프 직접 구현).
- 기존 상세 페이지·계산 결과 불변(회귀 확인).
- 애니메이션 절제(헌장 IV): 단일 슬라이드 ≤250ms, 그라데이션 금지.
