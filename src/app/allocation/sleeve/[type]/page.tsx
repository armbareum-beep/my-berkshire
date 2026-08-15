import { redirect } from "next/navigation";

/**
 * 유형 구성 상세는 드릴다운의 **유형 계층**이 그대로 대체한다
 * (`/allocation/financial/[type]`, `docs/allocation-drilldown-v1.md`).
 *
 * 이 화면으로 오는 링크는 코드 어디에도 남아 있지 않았다. 북마크만 살려두고 비운다 —
 * 같은 일을 하는 화면을 둘 두면 둘이 서로 다른 숫자를 보여주기 시작한다.
 *
 * `?country=` 는 새 구조의 국가 묶음(`?by=country&pick=`)으로 옮겨 태운다.
 */
export default async function SleeveRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ country?: string }>;
}) {
  const [{ type }, sp] = await Promise.all([params, searchParams]);
  const base = `/allocation/financial/${type}`;
  redirect(
    sp.country
      ? `${base}?by=country&pick=${encodeURIComponent(decodeURIComponent(sp.country))}`
      : base,
  );
}
