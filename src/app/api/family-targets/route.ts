import { validatePortfolio, validTargets } from "@/lib/family/model";
import { authorized, database, json, sameOrigin } from "@/lib/family/server";

export const runtime = "nodejs";
/** The only write: replaces the four target weights. Holdings, cash and flows stay read-only. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "요청 출처를 확인해 주세요." }, 403);
  if (!await authorized()) return json({ error: "비밀번호를 입력해 주세요." }, 401);
  try {
    const text = await request.text();
    if (text.length > 1024) return json({ error: "요청이 너무 큽니다." }, 413);
    const body = JSON.parse(text);
    if (!validTargets(body?.targets) || typeof body.revision !== "string" || !body.revision) return json({ error: "목표비중 합계를 100%로 맞춰 주세요." }, 400);
    const targets = (body.targets as number[]).map(n => Math.round(n * 100) / 100);
    if (!validTargets(targets)) return json({ error: "목표비중 합계를 100%로 맞춰 주세요." }, 400);
    const db = database();
    const { data: row, error } = await db.from("family_vault").select("data,revision").eq("id", "family").single();
    if (error || !row) throw error;
    if (row.revision !== body.revision) return json({ error: "다른 기기에서 자료가 바뀌었어요. 새로 불러온 뒤 다시 저장해 주세요." }, 409);
    const next = validatePortfolio({ ...row.data, targets, targetsBasis: "nav" });
    const revision = crypto.randomUUID(), updated_at = new Date().toISOString();
    const { data: saved, error: writeError } = await db.from("family_vault").update({ data: next, revision, updated_at }).eq("id", "family").eq("revision", body.revision).select("revision");
    if (writeError) throw writeError;
    if (!saved?.length) return json({ error: "다른 기기에서 자료가 바뀌었어요. 새로 불러온 뒤 다시 저장해 주세요." }, 409);
    return json({ targets, revision, updated_at });
  } catch { return json({ error: "목표비중을 저장하지 못했어요. 잠시 후 다시 시도해 주세요." }, 503); }
}
