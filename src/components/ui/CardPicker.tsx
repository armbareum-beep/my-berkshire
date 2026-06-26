"use client";

import { Check } from "lucide-react";
import { EmojiIcon } from "@/components/ui/EmojiIcon";
import { cn } from "@/lib/utils";

/**
 * 토스식 카드 선택 — 아이콘 + 굵은 이름 + 한 줄 설명 + 선택 체크의 세로 라디오 리스트.
 * 도메인 무관 범용. 옵션 집합과 라벨/설명/아이콘 접근자만 주입한다.
 * 강조색은 브랜드색 1곳(선택)으로 제한(디자인 절제).
 */
export function CardPicker<T extends string>({
  value,
  onChange,
  items,
  getLabel,
  getDescription,
  getEmoji,
  ariaLabel,
  className,
}: {
  /** null이면 아무 카드도 선택되지 않은 상태(아직 안 고름). */
  value: T | null;
  onChange: (t: T) => void;
  items: readonly T[];
  getLabel: (t: T) => string;
  getDescription: (t: T) => string;
  /** 없으면 아이콘 원을 그리지 않는다. */
  getEmoji?: (t: T) => string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("flex flex-col gap-2", className)}>
      {items.map((t) => {
        const selected = t === value;
        const emoji = getEmoji?.(t);
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(t)}
            className={cn(
              "flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition active:scale-[0.99]",
              selected
                ? "border-primary bg-primary/5"
                : "border-transparent bg-secondary",
            )}
          >
            {emoji && (
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                  selected ? "bg-primary/10 text-primary" : "bg-card text-muted-foreground",
                )}
                aria-hidden
              >
                <EmojiIcon emoji={emoji} size={20} />
              </span>
            )}
            <span className="flex min-w-0 flex-col">
              <span className="font-bold">{getLabel(t)}</span>
              <span className="truncate text-sm text-muted-foreground">
                {getDescription(t)}
              </span>
            </span>
            {selected && (
              <span
                className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                aria-hidden
              >
                <Check size={16} strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
