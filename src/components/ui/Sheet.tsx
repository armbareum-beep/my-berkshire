"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

/**
 * 드롭시트(바텀시트) 셸 — 인터셉터 page가 `<Sheet><XxxContent/></Sheet>`로 감싸 쓴다.
 * 화면 끝까지 올라와 페이지처럼 보이고, X·아래로 스와이프·브라우저 back 으로 닫힌다.
 *
 * - `document.body` 로 **portal** — 라우트 전환 래퍼(.animate-page-in)의 transform 이
 *   position:fixed 를 가두는 문제를 회피.
 * - 진입 슬라이드(CSS sheet-in)는 **배경에서 처음 열 때만** 재생. 시트↔시트 이동(드릴/뒤로)은
 *   직전 시트가 막 언마운트된 직후라 슬라이드를 생략 → "이미 떠 있던 시트"처럼 내용만 교체.
 * - 닫기는 즉시 `router.back()` (한 단계 뒤로) — 드릴다운에서 한 칸씩 복귀.
 */
const SWIPE_CLOSE_PX = 100;
// 현재 마운트된 시트 수(모듈 싱글턴). 새 시트가 뜰 때 이미 시트가 있으면 = 시트↔시트 이동(드릴/뒤로)
// → 진입 슬라이드 생략. 네비게이션 시 새 시트가 옛 시트보다 먼저 마운트되므로 카운터가 신뢰 가능.
let activeSheetCount = 0;

export function Sheet({
  children,
  title = "상세",
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const router = useRouter();
  const [dragY, setDragY] = useState(0); // 스와이프 추적(아래로만)
  const [mounted, setMounted] = useState(false);
  // 이미 다른 시트가 떠 있는 중이면(=시트↔시트 이동) 진입 슬라이드 생략. 첫 마운트 시 1회 판정.
  const [skipEntry] = useState(() => activeSheetCount > 0);
  const closingRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startYRef = useRef<number | null>(null);
  const dragYRef = useRef(0);

  // 포털 마운트 — SSR 에는 document 가 없으므로 클라이언트 마운트 후에만.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  // 활성 시트 카운트 — 마운트 시 +1, 언마운트 시 −1.
  useEffect(() => {
    activeSheetCount++;
    return () => {
      activeSheetCount = Math.max(0, activeSheetCount - 1);
    };
  }, []);

  // 배경 스크롤 락(FR-004) — 시트 내부만 스크롤
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // closeTimerRef 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    router.back(); // 한 단계 뒤로(드릴다운 복귀 또는 배경으로). 별도 슬라이드 아웃 없음.
    // navigation이 실패해도 500ms 후 재시도 허용 (closingRef 영구 잠금 방지)
    closeTimerRef.current = setTimeout(() => { closingRef.current = false; }, 500);
  }, [router]);

  // ESC 닫기(접근성)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  // 스와이프 — 핸들/헤더 영역에서만(내용 스크롤과 충돌 방지)
  function onTouchStart(e: React.TouchEvent) {
    startYRef.current = e.touches[0].clientY;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startYRef.current == null) return;
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta > 0) {
      dragYRef.current = delta; // ref는 동기 즉시 반영 — onTouchEnd stale state 방지
      setDragY(delta);
    }
  }
  function onTouchEnd() {
    if (dragYRef.current > SWIPE_CLOSE_PX) {
      close();
    } else {
      setDragY(0);
    }
    dragYRef.current = 0;
    startYRef.current = null;
  }

  if (!mounted) return null;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50">
      {/* 배경 — 탭하면 닫힘(전체 높이라 보통은 가려짐). */}
      <button
        type="button"
        aria-label="닫기"
        tabIndex={-1}
        onClick={close}
        className="absolute inset-0 bg-black/40"
      />
      {/* 시트 패널 — 480px 컬럼 폭, 화면 전체 높이. 첫 진입만 CSS 슬라이드, 드래그는 translate 합성. */}
      <div
        className={`absolute inset-0 mx-auto flex w-full max-w-[480px] flex-col bg-background shadow-[0_-8px_30px_rgba(0,0,0,0.12)] motion-reduce:animate-none ${
          skipEntry ? "" : "animate-[sheet-in_220ms_ease-out_forwards]"
        }`}
        style={{ translate: dragY ? `0 ${dragY}px` : undefined }}
      >
        {/* 핸들 + 닫기 — 스와이프 캡처 영역(touch-none으로 스크롤 흡수) */}
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
            className="touch-target absolute right-3 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-muted-foreground"
          >
            <X size={18} />
          </button>
        </div>
        {/* 내용 — 시트 내부 스크롤. min-h-0: flex 자식이 줄어들어야 overflow-y-auto 작동.
            Suspense: 서버 Content 로딩 중에도 시트 프레임은 즉시 표시(SC-001). */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-6 pt-3">
          <Suspense fallback={<SheetLoading />}>{children}</Suspense>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** 시트 내용 로딩 스켈레톤 — 서버 Content 스트리밍 대기 동안. */
function SheetLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="h-7 w-44 animate-pulse rounded bg-border" />
      <div className="h-24 w-full animate-pulse rounded-2xl bg-card shadow-card" />
      <div className="h-40 w-full animate-pulse rounded-2xl bg-card shadow-card" />
    </div>
  );
}
