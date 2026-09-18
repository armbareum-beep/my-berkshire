import { authorized, database, json } from "@/lib/family/server";

export const runtime = "nodejs";
export async function GET() {
  if (!await authorized()) return json({ error: "비밀번호를 입력해 주세요." }, 401);
  try {
    const { data, error } = await database().from("family_vault").select("data,revision,updated_at").eq("id", "family").single();
    if (error) throw error;
    return json(data);
  } catch { return json({ error: "온라인 자료를 불러오지 못했어요. 다시 시도해 주세요." }, 503); }
}
