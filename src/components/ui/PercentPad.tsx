"use client";

import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { NumberPad } from "@/components/ui/NumberPad";
import { pct } from "@/lib/format";

/**
 * 비중을 넣는 칸 — **탭하면 키패드 시트가 올라온다.**
 *
 * ## 왜 작은 입력칸을 걷어냈나
 *
 * 목표비중 줄마다 `<input type="number">` 가 4.5rem 짜리로 붙어 있었다. 모바일에서
 * 그걸 정확히 누르기도 어렵고, 누르면 OS 키보드가 화면 절반을 덮으면서 방금 고치던 줄이
 * 가려졌다. 사용자 요청: *"누르면 숫자 입력하는 모달 뜨면 좋겠어."*
 *
 * 이 앱은 같은 문제를 거래 입력에서 이미 풀어 뒀다 — `components/ui/NumberPad.tsx` 의
 * 하단 시트 키패드다. 새 부품을 만들지 않고 그걸 그대로 쓴다. 숫자를 넣는 곳이 앱 안에서
 * 한 가지 몸짓으로 통일된다.
 *
 * ## 닫으면 저장한다
 *
 * 시트는 `확인`·배경 탭·ESC 로 닫히고 **어느 쪽이든 저장한다**(값이 실제로 바뀌었을 때만).
 * 취소 버튼을 따로 두지 않은 건 레일의 금액 입력과 같은 규칙이라서다 — 대신 묶음 저장은
 * 되돌리기 토스트가 받쳐 준다.
 */
export function PercentPad({
  /** 지금 값 0~1. */
  value,
  /** 무엇의 비중인지 — 시트 제목이 된다. */
  label,
  /** 시트 안에 띄울 보조 문구(예: "지금 52%"). */
  hint,
  disabled,
  /** 새 값 0~1. 값이 바뀌었을 때만 부른다. */
  onCommit,
}: {
  value: number;
  label: string;
  hint?: string;
  disabled?: boolean;
  onCommit: (next: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");

  const show = () => {
    // 0.4 → "40", 0.125 → "12.5". 소수점 뒤 0 은 떨어뜨린다(+ 를 붙이는 이유).
    setRaw(String(+(value * 100).toFixed(1)));
    setOpen(true);
  };

  const commit = () => {
    setOpen(false);
    const v = raw.trim();
    const next = v === "" ? 0 : Number(v);
    if (!Number.isFinite(next) || next < 0 || next > 100) {
      toast.error("0~100 사이의 숫자를 넣어주세요.");
      return;
    }
    if (Math.abs(next / 100 - value) < 1e-9) return;
    onCommit(next / 100);
  };

  return (
    <>
      <button
        type="button"
        onClick={show}
        disabled={disabled}
        aria-label={`${label} 목표비중 ${pct(value)} — 눌러서 고치기`}
        className={cn(
          "h-11 min-w-[4.75rem] shrink-0 rounded-xl border border-input bg-card px-3",
          "text-right text-base font-bold tabular-nums transition active:scale-[0.97]",
          disabled && "opacity-50",
        )}
      >
        {pct(value)}
      </button>

      {open && (
        <NumberPad
          value={raw}
          onChange={setRaw}
          onClose={commit}
          suffix="%"
          decimal
          title={`${label} 목표비중`}
          hint={
            hint ? (
              <p className="text-xs text-muted-foreground">{hint}</p>
            ) : undefined
          }
        />
      )}
    </>
  );
}
