@AGENTS.md

## Active Technologies
- TypeScript, Next.js(App Router, 이 repo 변형 — `node_modules/next/dist/docs/` 가이드 우선) + 기존 Supabase·Tailwind. 신규 외부 의존 없음(KIS는 fetch). 마스터 파일 unzip 필요(국내 .mst.zip / 해외 .cod.zip) (003-kis-market-data)
- Supabase Postgres — 신규 테이블 `kis_security_master`(검색 인덱스). 토큰은 모듈 메모리 캐시 (003-kis-market-data)

## Recent Changes
- 003-kis-market-data: Added TypeScript, Next.js(App Router, 이 repo 변형 — `node_modules/next/dist/docs/` 가이드 우선) + 기존 Supabase·Tailwind. 신규 외부 의존 없음(KIS는 fetch). 마스터 파일 unzip 필요(국내 .mst.zip / 해외 .cod.zip)

## DB 마이그레이션
- 프로덕션 Supabase 프로젝트 ref: `cfzairdystqguatvcggc` (arcana 조직). Claude Code 환경변수에 `SUPABASE_ACCESS_TOKEN`·`SUPABASE_DB_PASSWORD`가 설정되어 있다(새 세션에만 주입됨).
- `supabase/migrations/`에 파일을 추가한 마이그레이션은 **사용자 확인을 받은 뒤** supabase CLI(`npx supabase link --project-ref cfzairdystqguatvcggc` → `npx supabase db push`) 또는 Supabase Management API로 적용한다. 적용 후 information_schema로 검증한다.
- 적용 전 반드시 이 앱의 테이블(예: `holdings`, `ranking_scores`) 존재를 확인해 대상 프로젝트가 맞는지 검증한다. 같은 계정의 다른 프로젝트(Grapplay-production `vbfxwlhngyvafskyukxa`)는 이 앱의 DB가 아니다.
