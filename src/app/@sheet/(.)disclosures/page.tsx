import { Sheet } from "@/components/ui/Sheet";
import { DisclosuresContent, type DisclosureFilter } from "@/app/disclosures/DisclosuresContent";

/** 홈 "내 사업부 소식" 탭 시 바텀시트로 인터셉트. 딥링크/새로고침은 전체 페이지(/disclosures). */
export default async function DisclosuresSheet({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: rawFilter } = await searchParams;
  const filter: DisclosureFilter =
    rawFilter === "reference" || rawFilter === "all" ? rawFilter : "important";

  return (
    <Sheet title="내 사업부 공시">
      <DisclosuresContent filter={filter} />
    </Sheet>
  );
}
