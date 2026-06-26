import { createClient } from "@/lib/supabase/server";
import { loadMemberGroupsView } from "@/lib/members";
import { MemberManager } from "@/components/company/MemberManager";
import { MemberRow } from "@/components/company/MemberRow";

/**
 * 컴퍼니(CEO) 관리 + 실적. 컴퍼니별 보유 평가액·평단 대비 수익률을 중립 병렬로 표기하고
 * (순위·점수 없음), 합산 포함 토글·추가/수정/삭제를 제공. 시세 적재 무거워 Suspense 분리.
 */
export async function CompanyMembers({
  holdingId,
  displayCcy,
}: {
  holdingId: string;
  displayCcy: "KRW" | "USD";
}) {
  const supabase = await createClient();
  const groups = await loadMemberGroupsView(supabase, holdingId, displayCcy);
  const showToggle = groups.length > 1;

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {groups.map((g) => (
          <MemberRow
            key={g.member.id}
            member={{
              id: g.member.id,
              name: g.member.name,
              emoji: g.member.emoji,
              included: g.member.included,
              value: g.value,
              changeRate: g.changeRate,
              gain: g.gain,
              accountCount: g.accounts.length,
            }}
            currency={displayCcy}
            showToggle={showToggle}
          />
        ))}
      </ul>
      <MemberManager />
    </div>
  );
}
