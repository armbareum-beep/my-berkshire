import { currencyMeta } from "@/lib/finance/currencies";

/**
 * 통화 국기 — 로컬 SVG(public/flags/{cc}.svg).
 * 국기 이모지(🇰🇷)는 Windows 등에서 "KR" 글자로 깨지므로 이미지로 렌더.
 */
export function Flag({
  code,
  className = "h-4 w-[22px] shrink-0 rounded-[3px] object-cover",
}: {
  code: string;
  className?: string;
}) {
  const { cc, name } = currencyMeta(code);
  if (!cc)
    return (
      <span className="text-xs font-semibold text-muted-foreground">
        {code}
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 작은 정적 국기, next/image 불필요
    <img src={`/flags/${cc}.svg`} alt={name} className={className} />
  );
}
