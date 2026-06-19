"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * 자산 가리기 — 금액을 블러 처리하는 프라이버시 모드(공유·공공장소용).
 * 토글은 client(쿠키 영속), 마스킹은 **CSS**(부모 `.amounts-hidden` → `.amt` 블러)라
 * 서버 렌더 금액도 함께 가려진다(컴포넌트별 분기 불필요). 초기값은 서버에서 쿠키로 전달(깜빡임 방지).
 */
const MaskCtx = createContext<{ masked: boolean; toggle: () => void }>({
  masked: false,
  toggle: () => {},
});

export function useMask() {
  return useContext(MaskCtx);
}

export const MASK_COOKIE = "mask_amts";

export function MaskProvider({
  initialMasked = false,
  children,
}: {
  initialMasked?: boolean;
  children: ReactNode;
}) {
  const [masked, setMasked] = useState(initialMasked);
  const toggle = useCallback(() => {
    setMasked((m) => {
      const next = !m;
      document.cookie = `${MASK_COOKIE}=${next ? "1" : "0"};path=/;max-age=${
        60 * 60 * 24 * 365
      };samesite=lax`;
      return next;
    });
  }, []);
  return (
    <MaskCtx.Provider value={{ masked, toggle }}>
      <div className={masked ? "amounts-hidden" : undefined}>{children}</div>
    </MaskCtx.Provider>
  );
}

/** 눈 토글 버튼 — 헤더 등에 둔다. MaskProvider 안에서만 동작. */
export function MaskToggle({ className }: { className?: string }) {
  const { masked, toggle } = useMask();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={masked ? "금액 표시" : "금액 가리기"}
      className={
        className ??
        "flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-muted-foreground transition active:scale-90"
      }
    >
      {masked ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  );
}
