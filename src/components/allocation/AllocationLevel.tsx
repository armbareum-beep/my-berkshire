import Link from "next/link";
import { Donut } from "@/components/dashboard/Donut";
import { donutColor } from "@/components/dashboard/donutPalette";
import { money, pct, type Currency } from "@/lib/format";
import { RowTargetInput } from "./RowTargetInput";
import type { GroupPick, GroupScope } from "@/app/allocate/actions";

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
 * ## 목표도 같은 분모를 쓴다
 *
 * 한때 목표비중만 "증권 전체 대비"였다. 그래서 주식 안으로 들어가면 목록 비중은 합이
 * 100% 인데 목표는 48% 같은 숫자였다 — 사용자 지적: *"아직도 종목 내에서 100%가
 * 아니잖아."* 화면 하나에 분모가 둘이면 어느 쪽 기준인지 매 줄 헷갈린다.
 *
 * 이제 **목표도 이 계층 안에서** 센다. 합계를 머리에 한 줄로 띄워 그 사실을 보여준다 —
 * 100% 가 아니면 얼마가 비었는지도 거기서 읽힌다. 저장은 여전히 평면 절대값 하나이고,
 * 변환은 `lib/targetLens.ts:setWithinGroup` 이 한다.
 */
export interface LevelRow {
  key: string;
  label: string;
  value: number;
  /** **이 계층 안에서의** 비중 0~1. 합이 1이 된다. */
  weight: number;
  /** **이 계층 안에서의** 목표비중 0~1 — 목록 비중과 같은 분모. 안 정했으면 생략. */
  target?: number;
  /** 한 단계 더 내려가는 곳. 없으면 잎이라 누를 수 없다. */
  href?: string;
  /** 라벨 옆 작은 꼬리표(미보유 등). */
  badge?: string;
  /**
   * 종목 줄이면 심볼. 있으면 그 줄에서 종목 페이지로 갈 수 있다.
   */
  symbol?: string;
  /**
   * 이 줄이 가리키는 것 — 있으면 **그 자리에서 목표를 고칠 수 있다.** 기존 보유를
   * 리밸런싱하는 게 이 화면의 일이라 편집이 줄 밖으로 나가면 안 된다.
   *
   * 종목 줄뿐 아니라 **묶음 줄도** 민다(주식 안의 "미국"·"반도체"). 그건 1단계 국가
   * 탭의 "미국"(증권 전체)과 다른 질문이라 여기서 못 밀 이유가 없다 — 사용자 지적:
   * *"주식이랑 ETF 안에서 국가별·산업별은 왜 비중조절 못 하게 되어 있지?"*
   *
   * 못 미는 줄은 **기타·미분류**뿐이다(`isUntaggedLabel`) — 구성이 유동적이라 묶음으로
   * 밀면 엉뚱한 종목이 딸려간다. 그런 줄은 `pick` 을 안 준다.
   */
  pick?: GroupPick;
  /** 못 미는 줄에 이유를 한 줄로 — 칸이 없는데 설명도 없으면 고장으로 읽힌다. */
  note?: string;
}

export function AllocationLevel({
  title,
  /** 이 계층이 전체 자산에서 차지하는 몫 — 드릴다운의 나침반. */
  parentNote,
  value,
  currency,
  rows,
  scope,
  children,
  emptyText = "아직 담긴 게 없어요.",
}: {
  title: string;
  parentNote?: string;
  value: number;
  currency: Currency;
  rows: LevelRow[];
  /**
   * 이 화면이 보고 있는 묶음 — 종목 줄의 목표 입력이 어느 100% 안인지 정한다.
   * 없으면 줄에 입력칸을 달지 않는다(묶음 줄만 있는 화면).
   */
  scope?: GroupScope;
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

  // 목표 합 — 이 계층 안에서 100% 가 되는지 한눈에 보이는 자리.
  const targetTotal = rows.reduce((s, r) => s + (r.target ?? 0), 0);

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

          {targetTotal > 0 && (
            <div className="flex items-baseline justify-between px-1">
              <p className="text-xs text-muted-foreground">
                목표 합 <b className="text-foreground">{pct(targetTotal)}</b>
              </p>
              {Math.abs(targetTotal - 1) >= 0.005 && (
                <p className="text-xs text-muted-foreground">
                  {targetTotal < 1
                    ? `${pct(1 - targetTotal)} 안 정했어요`
                    : `${pct(targetTotal - 1)} 넘었어요`}
                </p>
              )}
            </div>
          )}

          <ul className="flex flex-col gap-2">
            {rows.map((r, i) => {
              // 고칠 수 있는 줄은 **줄 전체를 링크로 감싸지 않는다** — 키패드를 누를 때마다
              // 화면이 넘어간다. 대신 이름만 링크가 되고 오른쪽 알약이 편집을 맡는다.
              const editable = Boolean(r.pick && scope);
              return (
              <li key={r.key}>
                <RowShell href={editable ? undefined : r.href}>
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: donutColor(i) }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {editable && r.href ? (
                        <Link
                          href={r.href}
                          className="flex min-w-0 items-center gap-1 text-sm font-semibold"
                        >
                          <span className="truncate">{r.label}</span>
                          <span className="shrink-0 text-foreground/40">›</span>
                        </Link>
                      ) : (
                        <span className="truncate text-sm font-semibold">
                          {r.label}
                        </span>
                      )}
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
                    {r.note && (
                      <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                        {r.note}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums">
                    {money(r.value, currency)}
                  </span>
                  {editable && r.pick && scope ? (
                    <RowTargetInput
                      pick={r.pick}
                      label={r.label}
                      target={r.target ?? 0}
                      scope={scope}
                      hint={`${title} 안에서 지금 ${pct(r.weight)} · ${money(r.value, currency)}`}
                    />
                  ) : (
                    r.href && (
                      <span className="shrink-0 text-foreground/40">›</span>
                    )
                  )}
                </RowShell>
              </li>
              );
            })}
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
