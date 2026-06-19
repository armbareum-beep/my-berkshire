"use client";

/**
 * 위저드 한 스텝의 공통 레이아웃(목업 거래 플로우 .top/.q/.qsub/.foot 대응).
 *   상단: ‹ 뒤로 + 진행 점(dots) + 종류 라벨
 *   본문: 큰 질문 + 보조설명 + content(flex-1)
 *   하단: CTA(footer)
 */
export function StepShell({
  kind,
  total,
  current,
  onBack,
  title,
  subtitle,
  children,
  footer,
}: {
  kind: string;
  total: number;
  current: number;
  onBack: () => void;
  title: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col p-6 pb-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="이전"
          className="-ml-1 text-2xl leading-none text-muted-foreground"
        >
          ‹
        </button>
        <div className="flex flex-1 justify-center gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={
                "h-2 rounded-full transition-all " +
                (i === current ? "w-5 bg-foreground" : "w-2 bg-border")
              }
            />
          ))}
        </div>
        <span className="text-sm font-bold text-primary">{kind}</span>
      </div>

      <div className="mt-4">
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle != null && (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>

      <div className="mt-5 flex flex-1 flex-col">{children}</div>

      {footer && <div className="mt-4">{footer}</div>}
    </main>
  );
}
