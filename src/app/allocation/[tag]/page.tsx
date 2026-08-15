import { redirect, notFound } from "next/navigation";

/**
 * 렌즈 탭(유형/국가/산업)은 드릴다운으로 바뀌었다 — 탭을 옆으로 고르는 대신 계층을
 * 아래로 판다(`docs/allocation-drilldown-v1.md`). 옛 링크를 새 자리로 보낸다.
 *
 * 국가·산업 렌즈는 이제 **한 유형 안에서** 고른다. 예전엔 전 자산을 국가로 갈랐지만,
 * 그러면 "미국 주식"과 "미국 ETF"가 한 칸에 섞여 무엇을 보는 중인지 흐려졌다.
 */
const MAP: Record<string, string> = {
  type: "/allocation/financial",
  country: "/allocation/financial/%EC%A3%BC%EC%8B%9D?by=country",
  sector: "/allocation/financial/%EC%A3%BC%EC%8B%9D?by=sector",
};

export default async function AllocationTagRedirect({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const to = MAP[tag];
  if (!to) notFound();
  redirect(to);
}
