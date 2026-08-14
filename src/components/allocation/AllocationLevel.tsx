import Link from "next/link";
import { Donut } from "@/components/dashboard/Donut";
import { donutColor } from "@/components/dashboard/donutPalette";
import { money, pct, type Currency } from "@/lib/format";

/**
 * 자산배분 **한 계층** — 드릴다운의 화면 한 장.
 *
 * ## 왜 탭이 아니라 계층인가
 *
 * 렌즈 탭 넷(종목/유형/국가/산업)을 한 화면에 나란히 두고 기준 토글과 묶음 조정까지 얹으니
 * 복잡도가 다시 올라갔다. 사용자 피드백: *"단계별로 쉽게 갔으면 좋겠어. 전체 자산 →
 * 금융자산 → 주식 선택해서 주식에 관한 거 다 볼 수 있게."*
 *
 * 그래서 **한 화면은 한 계층만** 본다. 아래로 파고들 뿐 옆으로 고르지 않는다.
 *
 * ```text
 *   전체 자산 → 금융자산 → 주식 → (종목 / 국가 / 산업)
 * ```
 *
 * ## 기준 토글이 사라진 이유
 *
 * 드릴다운에서는 **지금 보는 계층이 곧 분모**다. 금융자산 화면의 100%는 금융자산이고,
 * 주식 화면의 100%는 주식이다. "전체 대비냐 이 안에서냐"를 물을 필요가 없어진다 —
 * 대신 상단에 `전체 자산의 42%` 한 줄로 부모 맥락을 늘 붙여둔다.
 *
 * 목표비중은 저장 기준이 따로다(**금융자산+현금 대비**, `lib/targetLens.ts`). 행마다 기준을
 * 붙이면 글자가 늘어 다시 복잡해지므로, **화면당 한 번** 아래 각주로 밝힌다.
 */
export interface LevelRow {
  key: string;
  label: string;
  value: number;
  /** **이 계층 안에서의** 비중 0~1. 합이 1이 된다. */
  weight: number;
  /** 전체 자산 대비 목표비중 0~1. 안 정했으면 생략. */
  target?: number;
  /** 한 단계 더 내려가는 곳. 없으면 잎이라 누를 수 없다. */
  href?: string;
  /** 라벨 옆 작은 꼬리표(미보유 등). */
  badge?: string;
}

export function AllocationLevel({
  title,
  /** 이 계층이 전체 자산에서 차지하는 몫 — 드릴다운의 나침반. */
  parentNote,
  value,
  currency,
  rows,
  children,
  emptyText = "아직 담긴 게 없어요.",
}: {
  title: string;
  parentNote?: string;
  value: number;
  currency: Currency;
  rows: LevelRow[];
  /** 헤더와 도넛 사이에 끼울 것(목표 조정 카드 등). */
  children?: React.ReactNode;
  emptyText?: string;
}) {
  // 도넛은 평가액이 있는 것만 — 0짜리는 조각이 없는데 범례만 차지한다.
  // recharts 는 넘긴 weight 합을 100%로 다시 정규화하므로 이 계층 비중을 그대로 넘긴다.
  const priced = rows.filter((r) => r.value > 0);
  const top = priced.slice(0, 8);
  const restValue = priced.slice(8).reduce((s, r) => s + r.value, 0);
  const restWeight = priced.slice(8).reduce((s, r) => s + r.weight, 0);
  const slices = [
    ...top.map((r) => ({ label: r.label, weight: r.weight, value: r.value })),
    ...(restValue > 0
      ? [{ label: "기타", weight: restWeight, value: restValue }]
      : []),
  ];

  return (
    <>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-1 text-3xl font-extrabold tabular-nums">
          {money(value, currency)}
        </p>
        {parentNote && (
          <p className="mt-1 text-sm text-muted-foreground">{parentNote}</p>
        )}
      </div>

      {children}

      {rows.length === 0 ? (
        <div className="rounded-2xl bg-card p-6 text-center shadow-card">
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        </div>
      ) : (
        <>
          {slices.length > 0 && (
            <section className="flex items-center gap-5 rounded-2xl bg-card p-5 shadow-card">
              <Donut slices={slices} currency={currency} />
              <ul className="flex min-w-0 flex-1 flex-col gap-2">
                {slices.slice(0, 5).map((s, i) => (
                  <li key={s.label} className="flex items-center gap-2 text-sm">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: donutColor(i) }}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {s.label}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {pct(s.weight)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ul className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <li key={r.key}>
                <RowShell href={r.href}>
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: donutColor(i) }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">
                        {r.label}
                      </span>
                      {r.badge && (
                        <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {r.badge}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
                      {pct(r.weight)}
                      {r.target != null && r.target > 0 && (
                        <span className="ml-1.5">· 목표 {pct(r.target)}</span>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums">
                    {money(r.value, currency)}
                  </span>
                  {r.href && (
                    <span className="shrink-0 text-foreground/40">›</span>
                  )}
                </RowShell>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/** 내려갈 곳이 있으면 링크, 없으면 그냥 줄. 누를 수 없는 걸 누르게 만들지 않는다. */
function RowShell({
  href,
  children,
}: {
  href?: string;
  children: React.ReactNode;
}) {
  const cls =
    "flex w-full items-center gap-3 rounded-2xl bg-card p-4 text-left shadow-card";
  return href ? (
    <Link href={href} className={`${cls} transition active:scale-[0.99]`}>
      {children}
    </Link>
  ) : (
    <div className={cls}>{children}</div>
  );
}
