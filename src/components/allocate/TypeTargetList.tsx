"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PercentPad } from "@/components/ui/PercentPad";
import {
  setGroupTarget,
  normalizeTargetsAction,
  restoreTargets,
} from "@/app/allocate/actions";
import type { TagKey } from "@/lib/allocation";
import { money, pct, type Currency } from "@/lib/format";
import { Donut } from "@/components/dashboard/Donut";
import { donutColor } from "@/components/dashboard/donutPalette";

export interface TypeTargetRow {
  /** 묶음 이름 — 유형(주식·ETF…) / 국가 / 산업. **현금은 없다.** */
  label: string;
  value: number;
  /** 배분 대상 증권 대비 현재 비중 0~1. */
  current: number;
  /** 배분 대상 증권 대비 목표 0~1. */
  target: number;
  /**
   * 직접 못 정하는 줄 — **기타·미분류**뿐이다. 구성이 유동적이라 묶음으로 밀면 엉뚱한
   * 종목이 딸려간다.
   */
  readOnly?: boolean;
  /** 못 정하는 줄에 이유를 한 줄로. */
  note?: string;
  /** 이 줄을 누르면 갈 곳 — 그 묶음 안(종목 목록). */
  href?: string;
}

/**
 * 목표 비중 — 레일 **1단계**의 목록 한 장.
 *
 * 같은 목록을 세 렌즈가 함께 쓴다(`TargetLensPanel`). 어느 렌즈든 **여기서 바로 고친다** —
 * 저장은 `setGroupTarget(lens, label, …)` 로 가고, 축은 `lens` prop 으로 받는다.
 *
 * ## 왜 레일 안으로 들어왔나
 *
 * 목표 정하기 / 금액 넣기 / 배분 설정이 각각 다른 화면이었다. 사용자 지적:
 * *"내 자산배분 목표정하기, 금액 넣는 곳, 배분설정 3가지 층을 합할 수 없냐."*
 *
 * 셋은 **원래 한 흐름**이다 — 얼마나 들고 갈지 정하고(목표), 얼마를 넣을지 정하고(금액),
 * 나눈다(배분). 화면을 갈라놓으니 순서가 사라지고 "설정"이라는 별개의 일처럼 보였다.
 *
 * 그래서 레일의 첫 칸으로 들여왔다. 여기서 정하는 합이 곧 100% 이고, 그게 그대로 뒤
 * 단계의 배분 기준이 된다.
 *
 * ## 현금은 이 목록에 없다
 *
 * 분모는 **배분 대상 증권**이다. 현금을 한 줄로 끼워 두면 분모가 커져 현금 비중이 실제보다
 * 부풀려 보였고(사용자 지적), 무엇보다 엔진(`planAllocation` 의 `portfolioValue`)은 처음부터
 * 증권만으로 나누고 있어서 화면과 저장이 어긋났다. 얼마를 현금으로 둘지는 **2단계(넣을
 * 금액)** 가 정한다.
 *
 * ## 그래프와 조절이 한 자리다
 *
 * 숫자로 조절하는 곳과 그래프로 보는 곳이 따로 있으면 같은 일을 두 화면에서 하게 된다.
 * 사용자 지적: *"전체 비중조절하는거랑 그래프로 비중조절하는거 통합해줘."*
 * 그래서 도넛을 이 칸에 같이 둔다 — 고치면 바로 그림이 바뀐다.
 *
 * ## 줄을 누르면 그 안으로 들어간다
 *
 * 묶음 비중은 여기서 정하고, 더 파고드는 건 **그 줄을 눌러서** 간다 — 주식을 누르면 주식
 * 안(종목·국가·산업), 미국을 누르면 미국 종목, 현금을 누르면 통화별. 사용자 지적:
 * *"처음 자산 나누고 거기서 주식이나 ETF 현금 누르면 바로 이동시키면 되잖아."*
 *
 * 맞다. 목록 아래에 `자세히 보기` 링크를 따로 두면 **같은 목적지로 가는 길이 둘**이 되고,
 * 줄을 눌러도 아무 일이 안 일어나 어디로 가야 할지 다시 찾게 된다.
 *
 * ## 새 종목은 여기서 더하지 않는다
 *
 * 검색으로 새 기업을 넣는 버튼이 있었는데 뺐다 — *"새로운거 말고 기존꺼만 리밸런싱 하는게
 * 좋겠어."* 이 화면은 **이미 가진 것의 비중을 다시 맞추는** 자리다. 새로 사는 건 기록(거래)
 * 쪽 일이다.
 *
 * 저장은 `setGroupTarget` — 묶음 목표를 구성 종목에 **비례로** 나눠 평면에 쓴다
 * (`lib/targetLens.ts`). 한 번에 여러 종목이 바뀌므로 되돌리기를 같이 낸다.
 */
export function TypeTargetList({
  rows,
  currency,
  heading = "증권 100%를 나눠요",
  lens = "assetType",
}: {
  rows: TypeTargetRow[];
  currency: Currency;
  /** 렌즈마다 주어가 다르다 — 유형은 "나눠요", 국가·산업은 "이렇게 갈려 있어요". */
  heading?: string;
  /**
   * 저장할 때 어느 축의 묶음인지. 하드코딩해두면 국가 줄을 고쳤는데 **유형 묶음이
   * 조용히** 바뀐다. 그래서 축을 값으로 받는다.
   */
  lens?: TagKey;
}) {
  const total = rows.reduce((s, r) => s + r.target, 0);
  // 도넛은 평가액이 있는 것만 — 0짜리는 조각이 없는데 범례만 차지한다.
  // recharts 는 weight 합을 100%로 재정규화하므로 이 화면 기준 비중을 그대로 넘긴다.
  const slices = rows
    .filter((r) => r.value > 0)
    .map((r) => ({ label: r.label, weight: r.current, value: r.value }));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between px-1">
        <p className="text-sm font-semibold">{heading}</p>
        <p className="text-xs tabular-nums text-muted-foreground">
          합계 {pct(total)}
        </p>
      </div>

      {/* 그래프와 조절을 한 자리에 — 고치면 바로 이 그림이 바뀐다. */}
      {slices.length > 0 && (
        <section className="flex items-center gap-5 rounded-2xl bg-card p-5 shadow-card">
          <Donut slices={slices} currency={currency} />
          <ul className="flex min-w-0 flex-1 flex-col gap-2">
            {slices.slice(0, 5).map((sl, i) => {
              const row = rows.find((r) => r.label === sl.label)!;
              return (
                <li key={sl.label} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: donutColor(i) }}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {sl.label}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {pct(sl.weight)}
                    {row.target > 0 && (
                      <span className="ml-1 text-[11px]">
                        / 목표 {pct(row.target)}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <TypeRow key={r.label} row={r} currency={currency} lens={lens} />
        ))}
      </ul>

      {Math.abs(total - 1) >= 0.005 && <FillToFull total={total} />}
    </div>
  );
}

/**
 * 합이 100% 가 아닐 때의 손잡이.
 *
 * 축 고정을 켜면 어느 묶음을 밀어도 상계가 일어나 **합이 안 변한다**. 예전엔 현금 줄이
 * 합을 바꾸는 자리였는데, 현금을 목록에서 빼면서 그 손잡이도 같이 사라졌다. 그래서
 * 합이 어긋났을 때만 이 줄이 나온다.
 *
 * 누르면 전 종목이 같은 비율로 움직여 합만 100% 가 된다 — 세 축의 상대 모양은 그대로다.
 * 자동으로 하지 않는 이유는 `capToOne` 때와 같다: 사용자가 시킨 적 없는 값을 조용히
 * 만들지 않는다.
 */
function FillToFull({ total }: { total: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const short = total < 1;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-3">
      <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
        {short ? (
          <>
            합이 {pct(total)}예요 — 남은 <b>{pct(1 - total)}</b>만큼은 안 사고
            현금으로 남습니다.
          </>
        ) : (
          <>합이 {pct(total)}예요 — 100%를 넘겼습니다.</>
        )}
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await normalizeTargetsAction();
            if (!res.ok) {
              toast.error(res.error);
              return;
            }
            const { previous } = res;
            toast.success("합을 100%로 맞췄어요", {
              action: {
                label: "되돌리기",
                onClick: () =>
                  start(async () => {
                    const back = await restoreTargets(previous);
                    if (!back.ok) {
                      toast.error(back.error);
                      return;
                    }
                    router.refresh();
                  }),
              },
            });
            router.refresh();
          })
        }
        className="h-9 shrink-0 rounded-xl bg-secondary px-3 text-xs font-semibold transition active:scale-[0.97] disabled:opacity-50"
      >
        100%로 맞추기
      </button>
    </div>
  );
}

function TypeRow({
  row,
  currency,
  lens,
}: {
  row: TypeTargetRow;
  currency: Currency;
  lens: TagKey;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const gap = row.target - row.current;

  function save(next: number) {
    start(async () => {
      const res = await setGroupTarget(lens, row.label, next);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { previous, shortfall, lockedLabel } = res;
      // 고정이 깨졌으면 말한다 — 조용히 넘어가면 사용자가 안 건드린 축이 움직인 걸 모른다.
      const broke =
        shortfall > 0.0001 && lockedLabel
          ? ` · ${lockedLabel}도 ${pct(shortfall)} 움직였어요`
          : "";
      toast.success(`${row.label} 목표 ${pct(next)}${broke}`, {
        action: {
          label: "되돌리기",
          onClick: () =>
            start(async () => {
              const back = await restoreTargets(previous);
              if (!back.ok) {
                toast.error(back.error);
                return;
              }
              router.refresh();
            }),
        },
      });
      router.refresh();
    });
  }

  return (
    <li className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-card">
      <div className="min-w-0 flex-1">
        {row.href ? (
          <Link
            href={row.href}
            className="flex items-center gap-1 text-sm font-semibold"
          >
            <span className="truncate">{row.label}</span>
            <span className="shrink-0 text-foreground/40">›</span>
          </Link>
        ) : (
          <p className="text-sm font-semibold">{row.label}</p>
        )}
        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
          지금 {pct(row.current)} · {money(row.value, currency)}
          {Math.abs(gap) >= 0.0001 && (
            <span className="ml-1">
              · {gap > 0 ? `${pct(gap)} 부족` : `${pct(-gap)} 초과`}
            </span>
          )}
        </p>
        {/* 못 정하는 줄에는 이유를 붙인다 — 칸이 없는데 설명도 없으면 고장으로 읽힌다. */}
        {row.readOnly && row.note && (
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {row.note}
          </p>
        )}
      </div>
      {row.readOnly ? (
        <p className="shrink-0 text-sm font-bold tabular-nums text-muted-foreground">
          {pct(row.target)}
        </p>
      ) : (
        <PercentPad
          value={row.target}
          label={row.label}
          hint={`지금 ${pct(row.current)} · ${money(row.value, currency)}`}
          disabled={pending}
          onCommit={save}
        />
      )}
    </li>
  );
}
