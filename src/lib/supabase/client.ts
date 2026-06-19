import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * 브라우저(클라이언트 컴포넌트)에서 쓰는 Supabase 클라이언트.
 * 연결값은 .env.local 의 공개 키를 사용한다(하드코딩 금지).
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
