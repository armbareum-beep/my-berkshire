import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

/**
 * 서버(서버 컴포넌트·라우트 핸들러·서버 액션)에서 쓰는 Supabase 클라이언트.
 * Next App Router 쿠키 기반 세션을 읽고 갱신한다.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // 서버 컴포넌트에서 호출되면 set 이 불가능할 수 있다(미들웨어에서 갱신).
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // 무시: 미들웨어가 세션 갱신을 담당.
          }
        },
      },
    },
  );
}
