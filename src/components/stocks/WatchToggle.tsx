"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { toggleWatch } from "@/app/stocks/watchlistActions";

/** 관심종목 별표 토글 — 미보유 종목도 저장해 시세 추적. */
export function WatchToggle({
  symbol,
  watched,
  name,
}: {
  symbol: string;
  watched: boolean;
  name?: string;
}) {
  const router = useRouter();
  const [on, setOn] = useState(watched);
  const [pending, start] = useTransition();

  function toggle() {
    const prev = on;
    setOn(!prev); // 낙관적
    start(async () => {
      const res = await toggleWatch(symbol, prev, name);
      if (!res.ok) {
        setOn(prev);
        toast.error(res.error);
        return;
      }
      toast.success(prev ? "관심종목에서 뺐어요" : "관심종목에 담았어요");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-label={on ? "관심종목 해제" : "관심종목 추가"}
      className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm font-medium"
    >
      {/* 관심 ★ 는 선택 상태(시세 아님) → 액션색 primary. 등락 빨강 금지(§색 규칙). */}
      <span style={{ color: on ? "var(--primary)" : "var(--muted-foreground)" }}>
        {on ? "★" : "☆"}
      </span>
      관심
    </button>
  );
}
