"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const SWIPE_CLOSE_PX = 100;

/**
 * 드랍시트 — 클라이언트 상태 기반(URL 변경 없음).
 * Sheet.tsx(인터셉터 라우트 기반)와 동일한 디자인 언어: 핸들·X버튼·스와이프·스크롤락·sheet-in 애니.
 */
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
  const [dragY, setDragY] = useState(0);
  const startYRef = useRef<number | null>(null);
  const dragYRef = useRef(0);

  useEffect(() => setMounted(true), []);

  // 열려있을 때 body 스크롤 락
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const close = useCallback(() => {
    setDragY(0);
    onClose();
  }, [onClose]);

  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  function onTouchStart(e: React.TouchEvent) {
    startYRef.current = e.touches[0].clientY;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startYRef.current == null) return;
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta > 0) {
      dragYRef.current = delta;
      setDragY(delta);
    }
  }
  function onTouchEnd() {
    if (dragYRef.current > SWIPE_CLOSE_PX) close();
    else setDragY(0);
    dragYRef.current = 0;
    startYRef.current = null;
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* 배경 — 탭하면 닫힘 */}
      <button type="button" aria-label="닫기" tabIndex={-1} onClick={close} className="absolute inset-0 bg-black/40" />
      {/* 시트 패널 — 최대 90dvh, 아래에서 슬라이드 업 */}
      <div
        className="relative mx-auto flex w-full max-w-[480px] flex-col rounded-t-2xl bg-background shadow-[0_-8px_30px_rgba(0,0,0,0.12)] max-h-[90dvh] animate-[sheet-in_220ms_ease-out_forwards]"
        style={{ translate: dragY ? `0 ${dragY}px` : undefined }}
      >
        {/* 핸들 + X 버튼 — 스와이프 캡처 영역 */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="relative shrink-0 touch-none pt-2"
        >
          <div className="mx-auto h-1 w-10 rounded-full bg-border" />
          <button
            type="button"
            onClick={close}
            aria-label="닫기"
            className="absolute right-3 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-muted-foreground"
          >
            <X size={18} />
          </button>
        </div>
        {title && (
          <p className="shrink-0 px-5 pb-1 pt-3 text-xl font-bold">{title}</p>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
