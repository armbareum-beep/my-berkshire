/**
 * KIS 종목마스터 동기화 — PC 로컬 실행용 thin wrapper(schtasks 폴백).
 *
 * 실제 로직(다운로드·파싱·upsert)은 src/lib/finance/kis/masterSync.ts 로 이동해
 * 서버 cron(api/cron/sync-kis-master)과 공유한다. 이 스크립트는 서비스롤 클라이언트를
 * 만들어 그 코어를 호출하는 진입점만 유지 — schtasks 가 살아있는 동안의 폴백 경로.
 *
 *   npm run sync:kis-master
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import type { Database } from "../src/lib/supabase/database.types";
import { syncKisMaster } from "../src/lib/finance/kis/masterSync";

loadEnvConfig(process.cwd());

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required in .env.local`);
  return value;
}

async function main() {
  const supabase = createClient<Database>(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { rows, kr } = await syncKisMaster(supabase);
  console.log(`Synced ${rows} KIS securities (KR ${kr}, US ${rows - kr}).`);
}

main().catch((error) => {
  console.error("KIS master sync failed:", error);
  process.exitCode = 1;
});
