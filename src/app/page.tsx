import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPrimaryHolding } from "@/lib/holdings";

/**
 * 루트 라우터 — 레일 0-1.
 * 비로그인 → /login (미들웨어가 처리하지만 안전망), Holding 있음 → 대시보드, 없음 → 온보딩.
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const holding = await getPrimaryHolding(supabase);
  redirect(holding ? "/dashboard" : "/onboarding");
}
