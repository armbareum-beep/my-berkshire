import Link from "next/link";
import { Search } from "lucide-react";

/** 404 — 존재하지 않는 경로·종목. 루트 레이아웃(480px 셸) 안에서 렌더된다. */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <Search size={28} />
      </span>
      <h1 className="mt-2 text-xl font-bold">페이지를 찾을 수 없어요</h1>
      <p className="text-sm text-muted-foreground">
        주소가 바뀌었거나 없는 페이지예요.
      </p>
      <Link
        href="/"
        className="mt-4 inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
      >
        홈으로
      </Link>
    </main>
  );
}
