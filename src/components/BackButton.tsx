"use client";

import { useRouter } from "next/navigation";

/** 좌상단 ‹ — 스택 복귀(레일 뒤로가기 원칙). */
export function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="-ml-1 mb-2 w-fit cursor-pointer text-2xl text-muted-foreground"
      aria-label="뒤로"
    >
      ‹
    </button>
  );
}
