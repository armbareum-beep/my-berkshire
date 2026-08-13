import { redirect } from "next/navigation";

/**
 * 국가별·산업별 **목표비중 편집**은 은퇴했다(`docs/allocate-redesign-v1.md` Phase 5).
 *
 * 평면 목표비중(스펙 §13.2)은 종목당 숫자 하나라, 그 위에 카테고리 목표를 따로 두면
 * 같은 것을 두 곳에서 정하게 되어 다시 2층이 된다.
 *
 * 대신 같은 축의 **조회**(`/allocation/[tag]` 도넛)로 보낸다 — 국가·산업 쏠림을 보는
 * 목적은 그대로 살아 있다. 알 수 없는 태그는 유형별로 떨어뜨린다.
 */
const VIEWABLE = new Set(["country", "sector", "type"]);

export default async function RebalanceTagRedirectPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  redirect(`/allocation/${VIEWABLE.has(tag) ? tag : "type"}`);
}
