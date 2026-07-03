"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { dismissHomeSignal } from "@/app/dashboard/signalActions";
import { EmojiIcon } from "@/components/ui/EmojiIcon";
import type { HomeSignal } from "@/lib/finance/homeSignal";

/**
 * 홈 재방문 후크 배너 — 토스식 알림 큐.
 * 우선순위 [0]을 보여주고, "확인(✕)"하면 즉시 다음 신호로(낙관적). 본문 탭은 이동 + 확인.
 * 디스미스 영속화는 서버 액션에 위임 — 새로고침해도 안 돌아옴.
 */
export function HomeSignalBanner({ signals }: { signals: HomeSignal[] }) {
  const [idx, setIdx] = useState(0);
  const [, start] = useTransition();
  const sig = signals[idx];
  if (!sig) return null;

  const persist = (key: string) =>
    start(async () => {
      await dismissHomeSignal(key);
    });

  const warn = sig.tone === "warn";
  return (
    <div
      className={
        "flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium " +
        // 경고는 앰버(--warn) 틴트, 정보는 옅은 파랑 틴트(--accent). 하락 파랑(--fall) 금지.
        (warn ? "bg-warn-tint text-warn" : "bg-accent text-accent-foreground")
      }
    >
      <Link
        href={sig.href}
        onClick={() => persist(sig.key)}
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        <EmojiIcon emoji={sig.icon} size={16} />
        <span className="truncate">{sig.text}</span>
        <span className="ml-auto shrink-0">›</span>
      </Link>
      <button
        type="button"
        aria-label="확인"
        onClick={() => {
          persist(sig.key);
          setIdx((i) => i + 1); // 낙관적으로 즉시 다음
        }}
        className="touch-target shrink-0 rounded-full px-1.5 leading-none opacity-60 transition active:scale-90"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
