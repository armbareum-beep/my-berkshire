import { createClient } from "@/lib/supabase/server";
import { loadMemberGroupsView } from "@/lib/members";
import { HoldingStructureTree } from "@/components/structure/HoldingStructureTree";
import type { Database } from "@/lib/supabase/database.types";

type Holding = Database["public"]["Tables"]["holdings"]["Row"];

/**
 * 단일 지주회사 지배구조 트리(지주 → 컴퍼니 → 계좌 → 자회사). 컴퍼니 1개면 컴퍼니 층
 * 생략. 무거운 부분(시세·이름·집계)이라 Suspense 경계로 분리.
 */
export async function CompanyStructure({
  holding,
  displayCcy,
}: {
  holding: Holding;
  displayCcy: "KRW" | "USD";
}) {
  const supabase = await createClient();
  const memberGroups = await loadMemberGroupsView(
    supabase,
    holding.id,
    displayCcy,
  );

  return (
    <HoldingStructureTree
      holding={holding}
      memberGroups={memberGroups}
      currency={displayCcy}
      active
    />
  );
}
