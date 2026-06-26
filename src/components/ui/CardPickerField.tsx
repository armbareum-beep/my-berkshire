"use client";

import { useState } from "react";
import { CardPicker } from "@/components/ui/CardPicker";
import { EmojiIcon } from "@/components/ui/EmojiIcon";
import { cn } from "@/lib/utils";

/**
 * 단계형(점진 공개) 카드 선택 — 토스식 "고르면 다음이 펼쳐지는" 흐름용.
 *   · 아직 안 고름(value=null) 또는 다시 고르는 중 → 전체 카드 목록(CardPicker).
 *   · 골랐으면 → 한 줄 요약으로 접히고 우측 "변경"으로 다시 펼 수 있다.
 * 호출 측은 value!==null 일 때만 다음 입력(이름·금액 등)을 노출하면 단계형이 된다.
 */
export function CardPickerField<T extends string>({
  value,
  onChange,
  items,
  getLabel,
  getDescription,
  getEmoji,
  ariaLabel,
  className,
}: {
  value: T | null;
  onChange: (t: T) => void;
  items: readonly T[];
  getLabel: (t: T) => string;
  getDescription: (t: T) => string;
  getEmoji?: (t: T) => string;
  ariaLabel?: string;
  className?: string;
}) {
  const [reselect, setReselect] = useState(false);

  if (value === null || reselect) {
    return (
      <CardPicker
        value={value}
        onChange={(t) => {
          onChange(t);
          setReselect(false);
        }}
        items={items}
        getLabel={getLabel}
        getDescription={getDescription}
        getEmoji={getEmoji}
        ariaLabel={ariaLabel}
        className={className}
      />
    );
  }

  const emoji = getEmoji?.(value);
  return (
    <button
      type="button"
      onClick={() => setReselect(true)}
      aria-label={`${getLabel(value)} 선택됨 — 변경`}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border border-primary bg-primary/5 px-4 py-3 text-left transition active:scale-[0.99]",
        className,
      )}
    >
      {emoji && (
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
          aria-hidden
        >
          <EmojiIcon emoji={emoji} size={20} />
        </span>
      )}
      <span className="flex min-w-0 flex-col">
        <span className="font-bold">{getLabel(value)}</span>
        <span className="truncate text-sm text-muted-foreground">
          {getDescription(value)}
        </span>
      </span>
      <span className="ml-auto shrink-0 text-sm font-semibold text-primary">변경</span>
    </button>
  );
}
