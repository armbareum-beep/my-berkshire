import Link from "next/link";
import { money, pct, type Currency } from "@/lib/format";
import type { TagSlice } from "@/lib/allocation";

/** 태그별(국가/유형) 비중 카드 — 라벨·비중·막대·금액. href 있으면 상세로 이동. */
export function BreakdownCard({
  title,
  slices,
  currency,
  href,
}: {
  title: string;
  slices: TagSlice[];
  currency: Currency;
  href?: string;
}) {
  if (slices.length === 0) return null;
  const cls = "block rounded-2xl bg-card p-5 shadow-card";
  const inner = (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">{title}</p>
        {href && <span className="text-muted-foreground">›</span>}
      </div>
      <ul className="flex flex-col gap-3">
        {slices.map((s) => (
          <li key={s.label}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{s.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {pct(s.weight)} · {money(s.value, currency)}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-secondary">
              <div
                className="h-1.5 rounded-full bg-primary"
                style={{ width: `${Math.min(100, Math.round(s.weight * 100))}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </>
  );

  return href ? (
    <Link href={href} className={cls + " transition active:scale-[0.99]"}>
      {inner}
    </Link>
  ) : (
    <section className={cls}>{inner}</section>
  );
}
