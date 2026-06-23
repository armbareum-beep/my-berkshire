# Quickstart: 간편모드 UI 업그레이드 구현·검증

## 변경 파일 (3)

1. **`src/app/dashboard/page.tsx`** (헤더, ~278-305행)
   - 좌측 `<div>` 최상단에 ENUF 워드마크 추가:
     ```tsx
     <span className="text-lg font-extrabold tracking-tight text-foreground">ENUF</span>
     ```
   - 그 아래 기존 회사명 Link·설립일 단락 유지. 워드마크가 상위 위계로 읽히게 정렬.

2. **`src/components/dashboard/AccountGroups.tsx`** (잎 행, ~88-118행)
   - 값 컬럼(`<span className="ml-auto flex flex-col items-end">`)을 값+화살표 묶음으로 감싸고 `ml-auto`를 묶음으로 이동:
     ```tsx
     <span className="ml-auto flex items-center gap-2">
       <span className="flex flex-col items-end"> …기존 값/수익률… </span>
       <span className="text-muted-foreground">›</span>
     </span>
     ```
   - 이름 셀(`<span className="flex flex-col">`)에 `min-w-0` 추가, 이름에 `truncate` 적용(긴 이름 방어).

3. **`src/components/holdings/HoldingsBrowser.tsx`** (flat 행, ~138-167행)
   - 동일하게 값 컬럼 뒤 `›` 추가(이미 `min-w-0`/`truncate` 있음).
   - flat Link(141행)에 `scroll={false}` 추가 → 시트 진입 동작 통일.

## 검증

```bash
# 1) 타입·린트 (변경 파일 한정으로 확인)
npx tsc --noEmit
npx eslint src/app/dashboard/page.tsx src/components/dashboard/AccountGroups.tsx src/components/holdings/HoldingsBrowser.tsx
```

수동/시각 확인(`run` 또는 `verify` 스킬):
- [ ] 대시보드 홈 좌상단에 **ENUF 워드마크** 보임(심볼 없음, 잉크색).
- [ ] 워드마크 아래 회사명·설립일 위계가 자연스러움.
- [ ] 보유 카드 각 행 우측에 `›` 보이고, 평가금액과 겹치지 않음.
- [ ] 계좌별/전체 종목 **양쪽 모드** 모두 화살표 표시.
- [ ] 행 탭 → 상세 시트(@sheet) 오픈, 스크롤 점프 없음.
- [ ] 정렬·접이식 회귀 없음. 360px 폭에서 헤더 겹침 없음.

## 범위 밖(후속)

- 모든 화면 공통 헤더로 워드마크 확대 적용.
- 키움식 "국내/상품/현금" 자산군 토글, 큰글씨 모드, 총액 카드 펼치기 등(이번 기능 아님).
