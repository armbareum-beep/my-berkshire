"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveHolding,
  setActiveHoldingCookie,
} from "@/lib/holdings";

export async function switchCompany(holdingId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: holding } = await supabase
    .from("holdings")
    .select("id")
    .eq("id", holdingId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!holding) throw new Error("전환할 회사를 찾을 수 없습니다.");

  await setActiveHoldingCookie(holding.id);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function renameActiveCompany(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("회사명을 입력하세요.");
  if (name.length > 40) throw new Error("회사명은 40자 이내로 입력하세요.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const holding = await getActiveHolding(supabase);
  if (!holding) throw new Error("회사를 찾을 수 없습니다.");

  const { error } = await supabase
    .from("holdings")
    .update({ name })
    .eq("id", holding.id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/company");
  revalidatePath("/dashboard");
}
