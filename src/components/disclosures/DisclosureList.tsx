import { EmojiIcon } from "@/components/ui/EmojiIcon";
import type { Disclosure, HintTone } from "@/lib/finance/dart";

/** 해석 힌트 톤 → 색. 등락 빨강/파랑은 시세에만 — 경고=앰버(--warn), 긍정/정보=잉크·무채색. */
function hintColor(tone: HintTone): string {
  if (tone === "warn") return "var(--warn)";
  if (tone === "good") return "var(--foreground)";
  return "var(--muted-foreground)";
}

/**
 * 공시 목록(제목·날짜·해석힌트💡·DART 원문 링크). 종목 상세·전체보기 공용.
 * showCorp=true 면 회사명도(여러 종목 집계 시).
 */
export function DisclosureList({
  items,
  showCorp = false,
}: {
  items: Disclosure[];
  showCorp?: boolean;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((d) => (
        <li key={d.rceptNo}>
          <a
            href={d.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col"
          >
            <span className="flex items-center gap-3">
              <span className="min-w-0 truncate text-sm font-medium">
                {d.title}
              </span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                {d.date}
              </span>
            </span>
            {showCorp && (
              <span className="text-xs text-muted-foreground">{d.corpName}</span>
            )}
            {d.hint && (
              <span
                className="mt-0.5 inline-flex items-start gap-1 text-xs"
                style={{ color: hintColor(d.hint.tone) }}
              >
                <EmojiIcon emoji="💡" size={13} className="mt-0.5" />
                <span>{d.hint.text}</span>
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}
