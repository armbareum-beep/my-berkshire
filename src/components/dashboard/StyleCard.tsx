import Link from "next/link";
import { EmojiIcon } from "@/components/ui/EmojiIcon";
import type { StyleResult } from "@/lib/style";

/** 운용 스타일 진단 카드 — 아키타입 + 다차원 프로파일 막대 + (과매매)경고. */
export function StyleCard({ style }: { style: StyleResult }) {
  if (style.insufficient) {
    return (
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <p className="text-sm font-semibold">운용 스타일</p>
        <p className="mt-2 text-sm text-muted-foreground">{style.tagline}</p>
      </section>
    );
  }

  return (
    <Link
      href="/style"
      className="block rounded-2xl bg-card p-5 shadow-card transition active:scale-[0.99]"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">운용 스타일 · 규율 점수</p>
        <span className="text-muted-foreground">›</span>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <EmojiIcon emoji={style.emoji} size={30} className="text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-lg font-extrabold tracking-tight">{style.label}</p>
          <p className="text-sm text-muted-foreground">{style.tagline}</p>
        </div>
        {style.score != null && style.grade != null && (
          <div className="ml-auto shrink-0 text-right">
            <p className="text-2xl font-extrabold tabular-nums">{style.score}</p>
            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <EmojiIcon emoji={style.grade.emoji} size={13} />
              {style.grade.label}
            </p>
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-muted-foreground tabular-nums">
        {style.summary}
      </p>

      {style.secondaryStyles.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          보조 성향 · {style.secondaryStyles.map((item) => item.label).join(" · ")}
        </p>
      )}

      {/* 다차원 프로파일 막대 */}
      <ul className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
        {style.dimensions.map((dim) => (
          <li key={dim.key} className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-xs text-muted-foreground">
              {dim.label}
            </span>
            <span className="h-1.5 flex-1 rounded-full bg-secondary">
              <span
                className="block h-1.5 rounded-full bg-primary"
                style={{ width: `${Math.round(dim.score * 100)}%` }}
              />
            </span>
            <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums">
              {dim.display}
            </span>
          </li>
        ))}
      </ul>

      {style.warning && (
        <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs text-accent-foreground">
          <EmojiIcon emoji="⚠️" size={14} />
          {style.warning}
        </p>
      )}
    </Link>
  );
}
