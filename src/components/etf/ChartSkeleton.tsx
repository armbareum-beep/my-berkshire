export function ChartSkeleton({
  embedded = false,
}: {
  /** true면 카드 래퍼 없이 렌더 — 다른 카드 내부에 삽입할 때. */
  embedded?: boolean;
}) {
  return (
    <div
      className={embedded ? undefined : "rounded-2xl bg-card p-5 shadow-card"}
      aria-busy="true"
    >
      <div className="mb-5 h-8 w-full animate-pulse rounded-xl bg-secondary" />
      <div className="mx-auto h-44 w-44 animate-pulse rounded-full bg-secondary" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-4 w-full animate-pulse rounded bg-secondary" />
        ))}
      </div>
    </div>
  );
}
