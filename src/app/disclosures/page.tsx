import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { DisclosuresContent, type DisclosureFilter } from "./DisclosuresContent";

/** 내 지분 공시 — 전체 페이지 셸. 본문은 DisclosuresContent(바텀시트와 공유). */
export default async function DisclosuresPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter: rawFilter } = await searchParams;
  const filter: DisclosureFilter =
    rawFilter === "reference" || rawFilter === "all" ? rawFilter : "important";

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <DisclosuresContent filter={filter} />
    </main>
  );
}
