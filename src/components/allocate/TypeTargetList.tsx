"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { setGroupTarget, restoreTargets } from "@/app/allocate/actions";
import { money, pct, type Currency } from "@/lib/format";

export interface TypeTargetRow {
  /** 자산유형(주식·ETF·코인·원자재) 또는 현금. */
  label: string;
  value: number;
  /** 투자자산 대비 현재 비중 0~1. */
  current: number;
  /** 투자자산 대비 목표 0~1. */
  target: number;
  /** 현금은 "목표를 안 채운 나머지"라 직접 못 정한다(§16.2). */
  readOnly?: boolean;
}

/**
 * 목표 비중 — 레일 **1단계**.
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
 * ## 여기서는 유형까지만
 *
 * 주식 안의 종목별·국가별까지 이 칸에서 다루면 레일이 다시 무거워진다. **유형 네 줄**만
 * 정하고, 더 파고들 사람은 `자세히`로 계층 화면에 간다(`/allocation`).
 *
 * 저장은 `setGroupTarget` — 묶음 목표를 구성 종목에 **비례로** 나눠 평면에 쓴다
 * (`lib/targetLens.ts`). 한 번에 여러 종목이 바뀌므로 되돌리기를 같이 낸다.
 */
export function TypeTargetList({
  rows,
  currency,
}: {
  rows: TypeTargetRow[];
  currency: Currency;
}) {
  const total = rows.reduce((s, r) => s + r.target, 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between px-1">
        <p className="text-sm font-semibold">투자자산 100%를 나눠요</p>
        <p className="text-xs tabular-nums text-muted-foreground">
          합계 {pct(total)}
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <TypeRow key={r.label} row={r} currency={currency} />
        ))}
      </ul>

      <Link
        href="/allocation"
        className="mt-1 text-center text-xs font-medium text-muted-foreground underline"
      >
        종목·국가·산업까지 자세히 보기
      </Link>
    </div>
  );
}

function TypeRow({ row, currency }: { row: TypeTargetRow; currency: Currency }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [raw, setRaw] = useState(String(+(row.target * 100).toFixed(1)));

  const gap = row.target - row.current;

  function save() {
    const v = raw.trim();
    const next = v === "" ? 0 : Number(v);
    if (!Number.isFinite(next) || next < 0 || next > 100) {
      toast.error("0~100 사이의 숫자를 넣어주세요.");
      setRaw(String(+(row.target * 100).toFixed(1)));
      return;
    }
    if (Math.abs(next / 100 - row.target) < 1e-9) return;

    start(async () => {
      const res = await setGroupTarget("assetType", row.label, next / 100);
      if (!res.ok) {
        toast.error(res.error);
        setRaw(String(+(row.target * 100).toFixed(1)));
        return;
      }
      const { previous } = res;
      toast.success(`${row.label} 목표 ${pct(next / 100)}`, {
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
        <p className="text-sm font-semibold">{row.label}</p>
        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
          지금 {pct(row.current)} · {money(row.value, currency)}
          {Math.abs(gap) >= 0.0001 && (
            <span className="ml-1">
              · {gap > 0 ? `${pct(gap)} 부족` : `${pct(-gap)} 초과`}
            </span>
          )}
        </p>
      </div>
      {row.readOnly ? (
        <p className="shrink-0 text-sm font-bold tabular-nums text-muted-foreground">
          {pct(row.target)}
        </p>
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          <Input
            type="number"
            inputMode="decimal"
            step="any"
            value={raw}
            disabled={pending}
            onChange={(e) => setRaw(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            aria-label={`${row.label} 목표비중 (%)`}
            className="h-9 w-[4.5rem] text-right tabular-nums"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      )}
    </li>
  );
}
