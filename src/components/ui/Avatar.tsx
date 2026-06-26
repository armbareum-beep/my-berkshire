"use client";

import { cn } from "@/lib/utils";
import { brandLogoLabel } from "@/lib/finance/brandColor";
import { assetImage } from "@/lib/finance/assetImage";
import { LogoImage } from "@/components/ui/LogoImage";

const SIZE = {
  sm: "h-7 w-7 text-[9px]",
  md: "h-9 w-9 text-[10px]",
  lg: "h-10 w-10 text-[11px]",
} as const;

export function Avatar({
  name,
  symbol,
  size = "lg",
  className,
}: {
  name: string;
  symbol?: string;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  // 후보 URL을 앞에서부터 시도(LogoImage). 다 떨어지면 이니셜+색 폴백. symbol 변경 시 인덱스 리셋.
  const { srcs, fit } = assetImage(symbol, name);
  const key = symbol ?? name;
  const { bg, fg, label } = brandLogoLabel(symbol, name);
  const textClass = label.length === 1 ? "text-base font-bold" : "font-bold leading-none";

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary",
        SIZE[size],
        className,
      )}
    >
      <LogoImage
        srcs={srcs}
        alt={name}
        fit={fit}
        resetKey={key}
        fallback={
          <span
            className="flex h-full w-full items-center justify-center"
            style={{ backgroundColor: bg, color: fg }}
          >
            <span className={textClass}>{label}</span>
          </span>
        }
      />
    </span>
  );
}
