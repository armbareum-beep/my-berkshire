# Quickstart — 033 검증 절차

## 자동 게이트 (커밋마다)

```bash
npm run typecheck   # tsc --noEmit 클린
npm run lint        # eslint 에러 0
npm test            # vitest — 신규 drawdown.test.ts 6케이스 포함 전체 통과
npm run build       # 라우트 빌드 회귀 확인
```

### 신규 단위테스트 (drawdown.test.ts — 합성 시리즈)

1. V자 회복(−15%, 무매도) → 에피소드 1건 `passed=true`, `bucket=10`
2. 도중 매도(−25% 창 안 SELL) → `passed=false`
3. 인출 가짜 하락(큰 WITHDRAWAL) → 에피소드 미발생
4. 미회복 진행 중 → `recoveryDate=null`, 산출 0건
5. 다중 에피소드(통과 1 + 실격 1) → 마일스톤 정확히 1건
6. 초기 소액 가드(value < 1만원) → 체인 미시작

추가: `plan.ts` `planCompletionDate`(완수/미완수/부분체결), `styleHistory` score/gradeLabel 왕복 + v1 하위호환.

## 수동 검증 (dev 서버, 스토리별)

| # | 절차 | 기대 결과 (스펙 근거) |
|---|---|---|
| US1 | −10%↓ 후 회복 이력(무매도) 계정으로 홈 열기 | 축하 배너 1회 "−N% 구간, 한 주도 팔지 않고 통과했어요" → 확인 후 재등장 없음 (FR-004) |
| US1 | /timeline 열기 | 회복일에 "−N% 하락 구간을 매도 없이 통과" 항목 (FR-005) |
| US1 | 하락 구간에 SELL 있는 계정 | 축하·연혁 0건 (FR-003) |
| US2 | 1년 넘은 계정 /timeline | "설립 1주년"(·2주년…) 표시 (FR-007) |
| US2 | 계획 완수 후 새 계획 저장 → /timeline | "자본배분 계획 완수" 완수일 표시 (FR-008) |
| US3 | 등급 상승 계정: /growth 방문(스냅샷 기록) → 홈 | "규율 등급이 올랐어요" 1회, 같은 분기 재방문 시 중복 없음 (FR-009) |
| US4 | /growth | 복리 무중단 카드 표시, 수치 = /report 상세와 일치 (FR-010, SC-005) |
| US5 | /report·/annual-report | "회장님" 호칭 확인 + `grep -rn "주주" <대상 4파일>` 0건 (FR-011, SC-007) |

성능(SC-006): 홈 첫 페인트가 축하 판정을 기다리지 않는지 — 네트워크 스로틀 상태에서 히어로 카드가 배너보다 먼저 그려지는 것 확인.

## 배포 순서

1. `supabase/migrations/<ts>_holdings_archived_plans.sql` 적용(Supabase MCP `apply_migration`) → `database.types.ts` 재생성(-o 옵션) — **코드 배포 전에**
2. 코드 커밋·푸시(자동 배포)
3. 프로덕션에서 US4·US5 즉시 확인(데이터 무관 항목), US1~US3은 해당 이력 있는 계정으로
