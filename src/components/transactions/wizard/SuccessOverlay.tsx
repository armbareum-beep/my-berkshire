"use client";

import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { useMounted } from "@/components/ui/useMounted";

/**
 * 체결 성공 오버레이(목업 거래 플로우) — 도장 ✓ 가 튕기며 찍히고, 메시지 + 계속.
 * 기존 sonner 토스트 대신 "기록됐다"는 만족 모먼트를 준다.
 */
export function SuccessOverlay({
  title,
  sub,
  onContinue,
}: {
  title: string;
  sub?: string;
  onContinue: () => void;
}) {
  const mounted = useMounted();
  if (!mounted) return null;

  return createPortal(
    <div className="animate-fade-in fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
      <div className="flex w-full max-w-[480px] flex-col items-center gap-4 px-10 text-center">
      <span className="animate-stamp flex h-24 w-24 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_24px_rgba(49,130,246,0.35)]">
        <Check size={52} strokeWidth={3} aria-hidden />
      </span>
      <h2 className="mt-1 text-2xl font-extrabold tracking-tight">{title}</h2>
      {sub && <p className="text-muted-foreground">{sub}</p>}
      <button
        type="button"
        onClick={onContinue}
        className="mt-3 h-12 w-full max-w-[240px] rounded-xl bg-primary text-base font-semibold text-primary-foreground transition active:scale-[0.99]"
      >
        계속
      </button>
      </div>
    </div>,
    document.body,
  );
}
