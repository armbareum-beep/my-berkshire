# Quickstart: 레버리지 금융비용 검증

전제: 011(부동산 사업부)이 적용된 상태. 브랜치 `012-leverage-financing-cost`.

## 1. 마이그레이션 적용

```bash
# financing_reconciliation 테이블 + RLS
# supabase/migrations/20260626NNNNNN_financing_reconciliation.sql
# (로컬) supabase db push  /  (원격) 마이그레이션 배포 — 코드보다 먼저(헌장: 제약 선배포)
```
적용 후 `src/lib/supabase/database.types.ts` 재생성/동기화.

## 2. 단위테스트 (엔진)

```bash
npm test -- financing realAssets liabilities
```
통과 기대(contracts §D):
- 1억@3% 1개월 → 추정이자 ≈ 25만
- 1억@3%+5천@4% → 가중평균 ≈ 3.33%, 월 ≈ 41,667
- 대출 0개 → 사업부 집계가 011과 동일(회귀)
- interest_actual 보정 후 → 보정일 이후만 추정
- capital 보정 → cost↑·realized 불변
- asOf < 기점 → 추정 0
- 공실 → realized 음수

## 3. 화면 수동 검증 (`/run` 또는 `/verify`)

1. **부동산 + 담보대출 등록**: 부동산 자산(취득가 有) 1건, `MORTGAGE` 대출 1억@3% 등록.
2. **사업부 카드 확인**: 부동산 사업부에 "추정 이자"(배지)·가중평균율·월 추정이 표시되고, 순수익이 임대료에서 이자만큼 깎였는지.
3. **임대수입 입력**: 임대 100만/운영비 10만 입력 → net = 임대−운영비−추정이자로 표시.
4. **보정(비용)**: 실제 납부 이자 입력 → 추정 누계와의 차이가 보정 1줄로 기록되고 그 시점 이후만 다시 추정.
5. **보정(자본)**: "내 돈 추가" 보정 → 분모(취득원가)만 증가, 수익(분자) 불변.
6. **대출 0 회귀**: 대출 삭제 시 사업부 수치가 011과 동일하게 복귀.

## 4. 정합·회귀 확인 (핵심)

- **주식 XIRR 불변(SC-005)**: 대시보드 주식 XIRR/누적수익률이 본 기능 전후 동일한지(부동산 이자는 `events` 미기록).
- **이중계상 0**: `events` 테이블에 이자/보정 행이 생기지 않았는지.
- `npx tsc --noEmit` · `npx eslint` 클린(변경 파일).

## 5. 범위 밖(후속)

- 마진(MARGIN) 이자 → 주식 수익률 드래그(P3): `events` 단일원장 정합 방식 결정 후 별도 기능.
- 부동산별 개별 ROE(1:1 대출 연결): 비범위.
