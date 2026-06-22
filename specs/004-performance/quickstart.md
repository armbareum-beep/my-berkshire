# Quickstart: 성능 개선 측정·검증

추측 금지, 측정 우선. 각 단계 전후로 **동일 측정**을 반복하고 SC 목표 달성 시 다음 단계 중단.

## 0. 측정 준비 (임시, 머지 전 제거)

- **서버 구간 타이밍**: 주요 page의 핵심 `await` 구간을 `performance.now()` 차이로 로깅.
  대상: `/dashboard`, `/stocks/[symbol]`, `/company`, `/activity`, 검색 라우트.
- **외부 API 호출 카운트**: KIS·Yahoo·DART fetch 래퍼에 `count++`와 소요시간 로그.
- **측정 환경**: 가능하면 **배포본(Vercel) + 실데이터** 기준(로컬 dev는 콜드스타트·HMR로 왜곡).
  로컬로 잴 땐 `next build && next start`로 프로덕션 빌드 측정.

## 1. 인덱스 검증 (1A)

```sql
-- 검색이 트라이그램 GIN을 타는지
explain analyze
select * from kis_security_master
where name_ko ilike '%삼성%' limit 45;
-- → Bitmap Index Scan on kis_security_master_name_ko_trgm (Seq Scan 아님)

-- symbol 필터가 인덱스를 타는지
explain analyze select * from events where symbol = '005930';
-- → Index Scan using events_symbol_idx
```

UI: 검색창에 "삼성전자"/"에코프로" 입력 → 응답 P50 측정(**목표 < 300ms**), 결과 순서·내용이
인덱스 전과 동일한지(회귀 없음) 확인.

## 2. 종목 상세 검증 (1B·1D)

- 보유 국내(005930)·미국(AAPL) 종목 상세 overview 진입:
  - 첫 콘텐츠(가격·이름) **< 1.5s**, 재무/추이는 Suspense fallback 후 채워짐.
  - 외부 호출 로그로 **DART fsDiv 호출이 순차 10~20회 → 병렬 1라운드**로 줄었는지(SC-004).
  - `?view=analysis`·`?view=records` 등 모든 탭에서 값이 이전과 동일(회귀).

## 3. 대시보드·회사·활동 (1C·1D·1E)

- `/dashboard`·`/company`·`/activity` 로드 시 첫 콘텐츠 < 1.5s.
- 요청당 `loadSecurityMeta`/`getPortfolio` **실제 쿼리 1회**인지 로그로 확인(SC-005).
- `/company`: 헤더·회사목록 먼저, 계좌그룹은 이어서 채워짐.

## 4. 회귀(필수) — 모든 단계 후

```bash
npx tsc --noEmit          # 타입 클린
npx eslint <changed>      # 린트 클린
npm test                  # *.test.ts (계산 엔진 출력 불변)
```

- `FINANCE_SOURCE=yahoo` ↔ `kis` 양쪽에서 화면·수치 동일.
- 임시 측정 로그 **전부 제거** 후 최종 커밋(FR-008).

## 5. 게이트 판정

| 결과 | 조치 |
|---|---|
| SC-001~003 달성 | **종료**. 2·3단계 보류(과최적화 방지). |
| 검색/DB는 OK인데 상세가 외부 API로 여전히 느림 | **2단계**(시세 TTL·timeout) 착수. |
| 무거운 계산(룩스루) 화면이 2단계 후에도 느림 | **3단계**(스냅샷 사전계산) 착수. |

## 6. 롤백

- 인덱스: `drop index ...`로 즉시 복구(데이터 영향 없음).
- 코드: 병렬화·캐시·Suspense는 동작 동치라 단순 revert로 복구.
