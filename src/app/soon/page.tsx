import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";

/**
 * fast-follow 목적지 플레이스홀더 — 죽은 버튼 금지(레일 5-1).
 * 사이트맵의 아직 안 만든 화면들이 여기로 연결된다. ?t= 로 제목 전달.
 */
export default async function SoonPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-2xl font-extrabold tracking-tight">{t ?? "곧 공개됩니다"}</p>
        <p className="mt-2 text-sm text-muted-foreground">곧 공개됩니다.</p>
      </div>
    </main>
  );
}
