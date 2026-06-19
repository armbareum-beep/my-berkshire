"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveHolding } from "@/lib/holdings";

export async function markDisclosuresRead(keys: string[]): Promise<void> {
  const unique = [
    ...new Set(keys.filter((key) => key.startsWith("disc:")).slice(0, 200)),
  ];
  if (unique.length === 0) return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const holding = await getActiveHolding(supabase);
  if (!holding) return;
  await supabase.from("home_signal_dismissals").upsert(
    unique.map((signalKey) => ({
      holding_id: holding.id,
      signal_key: signalKey,
    })),
    { onConflict: "holding_id,signal_key" },
  );
  revalidatePath("/dashboard");
  revalidatePath("/disclosures");
}
