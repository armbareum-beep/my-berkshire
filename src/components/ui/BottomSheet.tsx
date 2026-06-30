"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[85dvh] flex-col rounded-t-2xl bg-background shadow-2xl">
        <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-foreground/20" />
        {title && (
          <p className="shrink-0 px-5 pb-2 pt-3 text-xl font-bold">{title}</p>
        )}
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
