/**
 * 컴퍼니(CEO) 레이어 집계 — 가족 한 사람의 계좌 묶음 = 하나의 컴퍼니.
 * 계층: holdings(지주회사) → members(컴퍼니/CEO) → accounts(계좌) → events(자회사/종목).
 *
 * 컴퍼니별 수익률은 **평단 대비 수익률**(평가차익/원가)을 쓴다 — 계좌·종목 화면과 동일
 * 지표라 일관되고, 컴퍼니별 설립자본 데이터 없이도 정확·정직하다(가산 가능). 그룹 전체의
 * 설립이후 XIRR은 별개 헤드라인 지표로 유지(getPortfolio).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { loadAccountGroups, type AccountGroup } from "./accounts";
import { getKrwPrices } from "./finance/prices";
import { loadSecurityNames } from "./securities";

export interface Member {
  id: string;
  name: string;
  emoji: string | null;
  /** false면 연결(합산) 계산에서 제외(회사 페이지 토글). */
  included: boolean;
  sortOrder: number;
}

export interface MemberGroup {
  member: Member;
  accounts: AccountGroup[];
  /** 보유 종목 평가액 합(표시 통화). */
  value: number;
  /** 평단확인 보유 원가 합(표시 통화). */
  costBasis: number;
  /** 평단 대비 등락(소수) = gain / costBasis. 원가 0이면 null. */
  changeRate: number | null;
  /** 평가차익 합(표시 통화). 평단확인 보유 없으면 null("보유 없음"). */
  gain: number | null;
}

/**
 * 순수 집계 — 컴퍼니(members)와 계좌그룹(AccountGroup[])을 member_id로 묶어 합산.
 * member_id가 null인 계좌는 기본 컴퍼니(정렬 첫 컴퍼니='본인')에 귀속.
 * 수익률(평단 대비)은 비율이라 평균 불가 → 가산 가능한 gain·costBasis로 재계산.
 * (DB 비의존 — 단위테스트 대상.)
 */
export function aggregateMemberGroups(
  members: Member[],
  groups: AccountGroup[],
): MemberGroup[] {
  if (members.length === 0) return [];
  const defaultMemberId = members[0].id; // 정렬상 첫 컴퍼니 = 기본

  return members.map((member) => {
    const accounts = groups.filter(
      (g) => (g.memberId ?? defaultMemberId) === member.id,
    );
    const value = accounts.reduce((s, a) => s + a.value, 0);
    const costBasis = accounts.reduce((s, a) => s + a.costBasis, 0);
    // 평단확인 보유가 있어야 차익·등락이 의미를 가짐(없으면 "보유 없음").
    const hasCost = costBasis > 0;
    const gain = hasCost ? accounts.reduce((s, a) => s + (a.gain ?? 0), 0) : null;
    const changeRate = hasCost && gain !== null ? gain / costBasis : null;
    return { member, accounts, value, costBasis, changeRate, gain };
  });
}

/**
 * 컴퍼니별 그룹 로드 — 계좌(AccountGroup)를 member_id로 묶고 평가액·원가·차익을 합산.
 * prices 는 ₩, factor 로 표시 통화 환산(loadAccountGroups 재사용 — 새 쿼리 없음).
 */
export async function loadMemberGroups(
  supabase: SupabaseClient<Database>,
  opts: {
    holdingId: string;
    prices: Record<string, number>; // ₩
    names: Record<string, string>;
    factor: number; // ₩ → 표시통화
  },
): Promise<MemberGroup[]> {
  const { holdingId, prices, names, factor } = opts;

  const [memberResult, groups] = await Promise.all([
    supabase
      .from("members")
      .select("id, name, emoji, included, sort_order")
      .eq("holding_id", holdingId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    loadAccountGroups(supabase, { holdingId, prices, names, factor }),
  ]);

  const members: Member[] = (memberResult.data ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    emoji: m.emoji,
    included: m.included,
    sortOrder: m.sort_order,
  }));

  return aggregateMemberGroups(members, groups);
}

/**
 * 연결(합산) 뷰의 보유계좌 목록에서 **included=false 컴퍼니의 계좌를 제외**.
 * 홈·순자산·보유종목처럼 "합산 관점" 화면용 — 헤드라인(getPortfolio)과 일관되게.
 * 전원 포함(또는 컴퍼니 없음)이면 그대로 반환(회귀 0). member_id=null은 기본 컴퍼니로 판정.
 * (계좌 관리·계좌 상세는 전부 보여야 하므로 이 필터를 쓰지 않는다.)
 */
export async function filterIncludedAccountGroups<T extends { memberId: string | null }>(
  supabase: SupabaseClient<Database>,
  holdingId: string,
  groups: T[],
): Promise<T[]> {
  const { data } = await supabase
    .from("members")
    .select("id, included, sort_order, created_at")
    .eq("holding_id", holdingId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  const members = data ?? [];
  if (members.length === 0 || members.every((m) => m.included)) return groups;
  const defaultMemberId = members[0].id;
  const includedIds = new Set(
    members.filter((m) => m.included).map((m) => m.id),
  );
  return groups.filter((g) => includedIds.has(g.memberId ?? defaultMemberId));
}

/**
 * 뷰 편의 로더 — 종목 시세·이름·환산계수를 채워 loadMemberGroups 호출.
 * CompanyStructure(트리)·CompanyMembers(관리)에서 공통 사용. CompanyStructure 의
 * 시세 적재 로직과 동일.
 */
export async function loadMemberGroupsView(
  supabase: SupabaseClient<Database>,
  holdingId: string,
  displayCcy: "KRW" | "USD",
): Promise<MemberGroup[]> {
  const { data: accountRefs } = await supabase
    .from("accounts")
    .select("id")
    .eq("holding_id", holdingId);
  const accountIds = (accountRefs ?? []).map((a) => a.id);
  const { data: eventRefs } = accountIds.length
    ? await supabase.from("events").select("symbol").in("account_id", accountIds)
    : { data: [] };
  const symbols = [
    ...new Set(
      (eventRefs ?? [])
        .map((e) => e.symbol)
        .filter((s): s is string => !!s),
    ),
  ];
  const [{ prices, usdKrw }, names] = await Promise.all([
    getKrwPrices(symbols),
    loadSecurityNames(supabase, symbols),
  ]);
  const useUsd = displayCcy === "USD" && !!usdKrw;
  const factor = useUsd ? 1 / (usdKrw as number) : 1;
  return loadMemberGroups(supabase, { holdingId, prices, names, factor });
}
