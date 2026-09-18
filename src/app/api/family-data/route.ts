import { randomUUID } from "node:crypto";
import { authorized, database, json, sameOrigin } from "@/lib/family/server";
import { validatePortfolio } from "@/lib/family/model";

export const runtime = "nodejs";
export async function GET() {
  if (!await authorized()) return json({ error: "비밀번호를 입력해 주세요." }, 401);
  try {
    const { data, error } = await database().from("family_vault").select("data,revision,updated_at").eq("id", "family").single();
    if (error) throw error;
    return json(data);
  } catch { return json({ error: "온라인 자료를 불러오지 못했어요. 다시 시도해 주세요." }, 503); }
}
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return json({ error: "요청 출처를 확인해 주세요." }, 403);
  if (!await authorized()) return json({ error: "로그인이 만료됐어요. 다시 접속해 주세요." }, 401);
  try {
    const raw = await request.text();
    if (raw.length > 2_000_000) return json({ error: "자료는 2MB 이하로 저장해 주세요." }, 413);
    const body = JSON.parse(raw);
    if (typeof body.revision !== "string" || !/^[a-f0-9-]{36}$/.test(body.revision)) return json({ error: "자료 버전을 확인해 주세요." }, 400);
    const portfolio = validatePortfolio(body.data);
    const revision = randomUUID(), updated_at = new Date().toISOString();
    const { data, error } = await database().from("family_vault").update({ data: portfolio, revision, updated_at }).eq("id", "family").eq("revision", body.revision).select("revision,updated_at");
    if (error) return json({ error: "서버에 저장하지 못했어요. 연결을 확인해 주세요." }, 503);
    if (!data?.length) return json({ error: "다른 기기에서 자료가 바뀌었어요. 최신 자료를 불러온 뒤 다시 수정해 주세요." }, 409);
    return json({ revision, updated_at });
  } catch { return json({ error: "저장할 자료의 형식을 확인해 주세요." }, 400); }
}
